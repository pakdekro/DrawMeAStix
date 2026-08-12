"""Entry point of Draw Me A STIX's passive enrichment sidecar.

Two useful routes: GET /enrichers (catalogue) and POST /enrich (execution).
Bearer token auth, strict CORS, in-memory cache with a short TTL. Passive and
discovery only - reputation lives in OpenCTI.
"""

from __future__ import annotations

import hmac
import os
import time
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config, registry
from app.schemas import EnricherInfo, EnrichRequest, EnrichResponse
from app.tools import SourceUnavailable, ToolError

config.log_startup()

# docs/redoc/openapi disabled: those three routes CANNOT be placed behind
# `dependencies=[Auth]` (FastAPI mounts them outside the application router),
# so they were answering 200 without a token on the public deployment. They
# grant no access, but they hand out the exact request schemas of /enrich -
# and above all /docs and /redoc load Swagger from cdn.jsdelivr.net and Google
# fonts, that is third-party script executed on OUR origin. The spec stays
# available locally (STIXIT_ENRICHER_DOCS=1).
_docs_enabled = os.environ.get("STIXIT_ENRICHER_DOCS", "").strip() == "1"

app = FastAPI(
    title="Draw Me A STIX - enricher",
    version="0.1.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.allowed_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(RequestValidationError)
def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 without echoing back the input that was refused.

    FastAPI's default handler puts the rejected value in the `input` field of
    every error. Two reasons to drop it:
      - amplification: a rejected body comes back bigger than it left, and
        this path is reachable BEFORE auth (FastAPI decodes the JSON before
        running the dependencies, so `dependencies=[Auth]` does not cover
        it);
      - the value is a selector, so investigation data, and it was ending up
        copied into an HTTP response.
    The type and location of the error are enough to fix a call.
    """
    return JSONResponse(
        status_code=422,
        content={
            "detail": [
                {"type": e.get("type"), "loc": e.get("loc"), "msg": e.get("msg")}
                for e in exc.errors()
            ]
        },
    )


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    expected = config.expected_token()
    provided = ""
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    if not provided or not _constant_eq(provided, expected):
        raise HTTPException(401, "missing or invalid token")


def _constant_eq(a: str, b: str) -> bool:
    # compare the bytes: compare_digest raises a TypeError (→ 500) on non-ASCII
    # str, and an exotic token must not surface as a server error
    return hmac.compare_digest(a.encode(), b.encode())


Auth = Depends(require_token)

# In-memory cache: (enricher, type, value) → (expiry, response)
_cache: dict[tuple[str, str, str], tuple[float, EnrichResponse]] = {}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/enrichers", dependencies=[Auth])
def list_enrichers() -> list[EnricherInfo]:
    return registry.catalog()


@app.post("/enrich", dependencies=[Auth])
def enrich(req: EnrichRequest) -> EnrichResponse:
    entry = registry.get(req.enricher)
    if entry is None:
        raise HTTPException(404, f"unknown enricher: {req.enricher}")
    info, fn = entry
    if req.type not in info.accepts:
        raise HTTPException(
            422,
            f'"{req.enricher}" does not accept type {req.type}'
            f" (expected: {', '.join(info.accepts)})",
        )

    key = (req.enricher, req.type, req.value.strip().lower())
    now = time.monotonic()
    cached = _cache.get(key)
    if cached and cached[0] > now:
        return cached[1]

    try:
        result = fn(req.type, req.value)
    except SourceUnavailable as exc:
        # remote source saturated (#124): the message is written for the
        # analyst and describes only the state of the source, nothing of the
        # host. 503 rather than 502: nothing is broken, it needs a retry.
        config.logger.info("enricher %s : source indisponible (%s)", req.enricher, exc)
        raise HTTPException(503, str(exc)) from exc
    except ToolError as exc:
        # the detail (the tool's stderr) goes to the server logs, not to the
        # client: avoids leaking internal paths and versions
        config.logger.warning("enricher %s failed: %s", req.enricher, exc)
        raise HTTPException(502, "enrichment unavailable") from exc

    # An empty answer does not deserve the long TTL: we want to be able to
    # replay it soon. But "not empty" does not mean "candidates" - the CVE one
    # returns nothing but notes (#175), it would otherwise always have had the
    # short TTL, exactly the enricher that needs the cache most.
    has_result = bool(result.candidates or result.notes)
    ttl = config.cache_ttl(req.enricher) if has_result else config.CACHE_TTL_SECONDS
    _store_in_cache(key, now + ttl, result)
    return result


def _store_in_cache(key: tuple[str, str, str], expiry: float, result: EnrichResponse) -> None:
    """Writes to the cache, purging expired entries and bounding the size."""
    now = time.monotonic()
    for k in [k for k, (exp, _) in _cache.items() if exp <= now]:
        del _cache[k]
    while len(_cache) >= config.CACHE_MAX_ENTRIES:
        _cache.pop(next(iter(_cache)))  # the oldest (dicts keep insertion order)
    _cache[key] = (expiry, result)
