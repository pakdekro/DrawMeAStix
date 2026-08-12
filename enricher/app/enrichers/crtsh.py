"""crt.sh enricher - subdomains and certificates via Certificate Transparency (#124).

domain-name → the names seen in the CT logs for that domain. Each subdomain
becomes a `domain-name` candidate; the certificate metadata (count, issuers,
span of the observed dates) goes out as a note.

No relation returned: as for subfinder (#64), there is no honest STIX 2.1 SRO
between a domain and its subdomain. We do not invent a semantically false
link (#82).

**Slow source, accepted as such.** crt.sh alternates answers in ~40 s,
immediate 502s and complete silence; that is its normal regime, not an
incident. Hence the budgeted retries of http_get_json, a one-hour cache on
the sidecar side (config.CACHE_TTL_OVERRIDES) and a failure message that
tells the analyst outright that the source is saturated, so they do not go
hunting for the fault on their own side.
"""

from __future__ import annotations

from typing import Any

from app.config import CRTSH_MAX_RESULTS, logger
from app.schemas import SOURCE_REF, Candidate, EnricherInfo, EnrichResponse, Note
from app.tools import RETRYABLE_STATUS, http_get_json, is_domain, validate_selector

INFO = EnricherInfo(
    id="crtsh",
    label="Certificates (crt.sh)",
    description=(
        "Subdomains and certificates seen in Certificate Transparency logs. "
        "Public source, often saturated: the answer may take a minute."
    ),
    accepts=["domain-name"],
)

# `%.domain` is crt.sh's LIKE pattern: it brings back the certificates that
# carry a name under this domain. The exact form (`?q=domain`) returns a 404
# even when certificates do exist - measured, not assumed.
API_URL = "https://crt.sh/?q=%25.{domain}&output=json&exclude=expired"

# crt.sh diverts the 404: under load it returns one for a domain that does
# have certificates (measured on github.com, a 404 framed by two 48 KB
# answers). Having no result is said differently, with an HTTP 200 and an
# empty list. So we replay the 404s: announcing "no certificate" on a hiccup
# of the source would be a silent false negative, far worse than an
# unavailability message.
_RETRY_STATUS = RETRYABLE_STATUS | {404}

# A shared certificate (CDN, hosting provider) carries names unrelated to the
# target. We report them without flooding the triage tray: past this
# threshold, the note gives no more than the count.
SIBLINGS_LISTED_MAX = 10


def _fetch(domain: str) -> list[dict[str, Any]]:
    payload = http_get_json(
        API_URL.format(domain=domain), source="crt.sh", retry_status=_RETRY_STATUS
    )
    return payload if isinstance(payload, list) else []


def _names(rows: list[dict[str, Any]]) -> set[str]:
    """Usable DNS names from every certificate, deduplicated."""
    found: set[str] = set()
    for row in rows:
        raw = f"{row.get('name_value', '')}\n{row.get('common_name', '')}"
        for line in raw.splitlines():
            name = line.strip().rstrip(".").lower()
            # a wildcard certificate attests to no precise subdomain: we keep
            # the base it covers
            name = name.removeprefix("*.")
            # SANs can carry e-mail addresses, or a CN in free text
            # ("AS207960 Test Intermediate - example.com"): filtered out
            if name and "@" not in name and is_domain(name):
                found.add(name)
    return found


def _issuers(rows: list[dict[str, Any]]) -> list[str]:
    """Distinct issuers, in order of appearance, plain name only."""
    seen: list[str] = []
    for row in rows:
        issuer = str(row.get("issuer_name", "")).strip()
        # "C=US, O=Let's Encrypt, CN=YE1" → "Let's Encrypt"
        org = next(
            (
                part.split("=", 1)[1].strip()
                for part in issuer.split(",")
                if part.strip().startswith("O=")
            ),
            issuer,
        )
        if org and org not in seen:
            seen.append(org)
    return seen


def _summary(domain: str, rows: list[dict[str, Any]], siblings: list[str]) -> str:
    parts = [f"crt.sh - {len(rows)} unexpired certificate(s)"]

    issuers = _issuers(rows)
    if issuers:
        shown = ", ".join(issuers[:3])
        parts.append(f"issuer(s): {shown}" + (" …" if len(issuers) > 3 else ""))

    # the certificate dates place the infrastructure in time: a domain whose
    # first certificate is from yesterday does not read as a long-standing one
    dates = sorted(str(r.get("not_before", "")) for r in rows if r.get("not_before"))
    if dates:
        parts.append(f"from {dates[0][:10]} to {dates[-1][:10]}")

    summary = " · ".join(parts)
    if siblings:
        listed = ", ".join(siblings[:SIBLINGS_LISTED_MAX])
        hidden = len(siblings) - SIBLINGS_LISTED_MAX
        more = f" (+{hidden} more)" if hidden > 0 else ""
        summary += (
            f"\nOther domains sharing a certificate with {domain}: {listed}{more}"
        )
    return summary


def enrich(stix_type: str, value: str) -> EnrichResponse:
    selector = validate_selector(stix_type, value)
    rows = _fetch(selector)

    if not rows:
        return EnrichResponse(
            enricher=INFO.id,
            candidates=[],
            relations=[],
            notes=[
                Note(
                    target_ref=SOURCE_REF,
                    content=f"crt.sh - no unexpired certificate known for {selector}.",
                )
            ],
        )

    suffix = f".{selector}"
    subdomains, siblings = [], []
    for name in sorted(_names(rows)):
        if name == selector:
            continue  # the enriched node itself: it is not its own candidate
        (subdomains if name.endswith(suffix) else siblings).append(name)

    if len(subdomains) > CRTSH_MAX_RESULTS:
        # same cap as subfinder: bounds the triage tray and the RAM. We log
        # the number dropped, never the names ("zero log").
        logger.warning(
            "crt.sh: %d subdomains found, truncated to %d",
            len(subdomains),
            CRTSH_MAX_RESULTS,
        )
        subdomains = subdomains[:CRTSH_MAX_RESULTS]

    candidates = [
        Candidate(ref=f"c{i}", stix_type="domain-name", name=name)
        for i, name in enumerate(subdomains)
    ]
    return EnrichResponse(
        enricher=INFO.id,
        candidates=candidates,
        relations=[],
        notes=[Note(target_ref=SOURCE_REF, content=_summary(selector, rows, siblings))],
    )
