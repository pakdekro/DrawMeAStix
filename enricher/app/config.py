"""Sidecar configuration: bearer token, CORS origins, cache.

The token is read from the environment (STIXIT_ENRICHER_TOKEN) at startup; if
it is absent, we generate one and log it for dev use - auth is still always
required. Nothing sensitive is written to disk.
"""

from __future__ import annotations

import logging
import os
import secrets

logger = logging.getLogger("enricher")

# Origins allowed to call the sidecar (the static app). Strict CORS: the
# browser refuses the answer for any origin outside the list.
DEFAULT_ORIGINS = "http://localhost:5173,http://localhost:4173,http://localhost:8000"


def allowed_origins() -> list[str]:
    raw = os.environ.get("STIXIT_ENRICHER_ORIGINS", DEFAULT_ORIGINS)
    return [o.strip() for o in raw.split(",") if o.strip()]


# The `or` treats a variable that is PRESENT BUT EMPTY as absent, which is the
# right behaviour (we want a usable token). The warning must therefore follow
# the same rule: testing `not in os.environ` let the empty case through in
# silence, and that is exactly what the shipped docker-compose produces
# (STIXIT_ENRICHER_TOKEN=${ENRICHER_TOKEN:-}). An analyst following the docs
# without setting ENRICHER_TOKEN then ended up with a service locked behind a
# random token that was never shown - fails closed, but mute.
_env_token = os.environ.get("STIXIT_ENRICHER_TOKEN", "").strip()
_token = _env_token or secrets.token_urlsafe(24)
_token_generated = not _env_token


def expected_token() -> str:
    return _token


def log_startup() -> None:
    if _token_generated:
        logger.warning(
            "No STIXIT_ENRICHER_TOKEN provided - session token generated: %s\n"
            "  (set STIXIT_ENRICHER_TOKEN for a stable token in production)",
            _token,
        )


# In-memory cache with a short TTL: avoids hammering the sources (crt.sh…)
# without persisting anything. Purely in RAM, lost on restart - compatible
# with "zero persistent log of selectors".
CACHE_TTL_SECONDS = int(os.environ.get("STIXIT_ENRICHER_CACHE_TTL", "300"))

# Longer TTL for slow or temperamental sources (#124): once crt.sh has finally
# answered, that answer is expensive - we keep it for an hour rather than
# replay a 40 second request. CT logs do not move by the minute, staleness is
# without consequence here.
CACHE_TTL_OVERRIDES = {
    "crtsh": int(os.environ.get("STIXIT_ENRICHER_CRTSH_CACHE_TTL", "3600")),
    # CIRCL counts its quota PER IP ADDRESS (20/min anonymously), so it is
    # shared with everything leaving by the same IP (#175). A CVE record
    # hardly ever changes: keeping it a long time is the real lever, far more
    # than retries - we simply stop asking again.
    "cve": int(os.environ.get("STIXIT_ENRICHER_CVE_CACHE_TTL", "86400")),
}


def cache_ttl(enricher_id: str) -> int:
    return CACHE_TTL_OVERRIDES.get(enricher_id, CACHE_TTL_SECONDS)

# Cap on the number of cache entries: bounds the RAM (expired entries are
# purged on every write; past the cap, the oldest one goes).
CACHE_MAX_ENTRIES = int(os.environ.get("STIXIT_ENRICHER_CACHE_MAX", "1000"))

# Hard timeout per tool call (a binary can drag on, or hang for good).
TOOL_TIMEOUT_SECONDS = int(os.environ.get("STIXIT_ENRICHER_TOOL_TIMEOUT", "15"))

# Cap on the subdomains returned by subfinder (#64): a chatty domain (cloud,
# CDN) has thousands of them - bounds the triage tray and the RAM.
SUBFINDER_MAX_RESULTS = int(os.environ.get("STIXIT_ENRICHER_SUBFINDER_MAX", "200"))

# --- Slow HTTP sources (#124) ----------------------------------------------
# crt.sh alternates answers in ~40 s, immediate 502s and complete silence.
# Hence two distinct durations: the timeout of ONE attempt must stay longer
# than a successful answer takes (otherwise we cut off a request that was
# about to land), and the total budget bounds the analyst's wait, retries
# included.
HTTP_TIMEOUT_SECONDS = int(os.environ.get("STIXIT_ENRICHER_HTTP_TIMEOUT", "45"))
HTTP_BUDGET_SECONDS = int(os.environ.get("STIXIT_ENRICHER_HTTP_BUDGET", "90"))
HTTP_MAX_ATTEMPTS = int(os.environ.get("STIXIT_ENRICHER_HTTP_ATTEMPTS", "4"))

# Cap on the names returned by crt.sh (#124): same reason as subfinder.
CRTSH_MAX_RESULTS = int(os.environ.get("STIXIT_ENRICHER_CRTSH_MAX", "200"))
