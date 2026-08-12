"""CVE enricher (#131) - official description of a vulnerability.

vulnerability (CVE-XXXX-YYYY) → **note** on the enriched node: description,
CVSS score, dates. No new STIX entity (the description is an attribute of
the CVE, not an object of the graph).

Source with no API key (project doctrine): CIRCL. The historical instance
cve.circl.lu now serves Vulnerability-Lookup, which answers in the cvelistv5
format; we also parse the old cve-search format (summary/cvss) to stay
compatible with an older self-hosted instance.
"""

from __future__ import annotations

from typing import Any

from app.schemas import SOURCE_REF, EnricherInfo, EnrichResponse, Note
from app.tools import SourceUnavailable, http_get_json, validate_selector

INFO = EnricherInfo(
    id="cve",
    label="CVE",
    description="Official description and severity of a CVE (CIRCL, no API key).",
    accepts=["vulnerability"],
)

API_URL = "https://cve.circl.lu/api/cve/{cve}"

# CIRCL caps at 20 requests per minute and answers 429 beyond that (#175).
# Short budget: unlike crt.sh, the source answers fast when it answers at
# all; insisting would not help, it would only add load.
HTTP_TIMEOUT_SECONDS = 15
HTTP_BUDGET_SECONDS = 25
HTTP_ATTEMPTS = 3


def _fetch(cve: str) -> dict[str, Any]:
    payload = http_get_json(
        API_URL.format(cve=cve),
        source="CIRCL",
        timeout=HTTP_TIMEOUT_SECONDS,
        budget=HTTP_BUDGET_SECONDS,
        attempts=HTTP_ATTEMPTS,
    )
    if not payload:
        raise SourceUnavailable(f"CVE unknown to CIRCL: {cve}")
    return payload


def _first_english(descriptions: list[dict[str, Any]]) -> str | None:
    for d in descriptions:
        if d.get("lang", "en").startswith("en") and d.get("value"):
            return str(d["value"])
    return None


def _parse(payload: dict[str, Any]) -> list[tuple[str, str]]:
    """Fields (label, value) in display order, depending on the format."""
    fields: list[tuple[str, str]] = []

    # cvelistv5 format (Vulnerability-Lookup)
    cna = (payload.get("containers") or {}).get("cna") or {}
    if cna:
        desc = _first_english(cna.get("descriptions") or [])
        if desc:
            fields.append(("Description", desc))
        for metric in cna.get("metrics") or []:
            cvss = next(
                (metric[k] for k in ("cvssV4_0", "cvssV3_1", "cvssV3_0") if k in metric),
                None,
            )
            if cvss and cvss.get("baseScore") is not None:
                severity = cvss.get("baseSeverity", "")
                score = f"{cvss['baseScore']}" + (f" ({severity})" if severity else "")
                fields.append(("CVSS", score))
                break
        meta = payload.get("cveMetadata") or {}
        if meta.get("datePublished"):
            fields.append(("Published on", str(meta["datePublished"])[:10]))
        return fields

    # old cve-search format (historical cve.circl.lu)
    if payload.get("summary"):
        fields.append(("Description", str(payload["summary"])))
    if payload.get("cvss") is not None:
        fields.append(("CVSS", str(payload["cvss"])))
    if payload.get("Published"):
        fields.append(("Published on", str(payload["Published"])[:10]))
    return fields


def enrich(stix_type: str, value: str) -> EnrichResponse:
    selector = validate_selector(stix_type, value)
    fields = _parse(_fetch(selector))

    if fields:
        body = "\n".join(f"{label}: {val}" for label, val in fields)
        content = f"{selector} (source: CIRCL)\n{body}"
    else:
        content = f"{selector}: CIRCL response without a usable description."
    return EnrichResponse(
        enricher=INFO.id,
        candidates=[],
        relations=[],
        notes=[Note(target_ref=SOURCE_REF, content=content)],
    )
