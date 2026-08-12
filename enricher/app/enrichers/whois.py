"""Whois enricher - registrar, dates, organisation (#66).

domain-name (and IP) → key whois fields, carried as a **note** on the
enriched node: no new STIX entity (the registrar is not an object of the
investigation graph, it is an attribute of the domain).

Deliberate MVP (see #66): raw whois, formats vary from registry to registry.
We parse coarsely by key aliases, tolerant of the two big families (ICANN
style gTLD "Creation Date:", AFNIC/RIPE "created:"). Moving to RDAP
(structured JSON) stays possible later on this enricher alone if needed.
"""

from __future__ import annotations

from app.schemas import SOURCE_REF, EnricherInfo, EnrichResponse, Note
from app.tools import run_tool, validate_selector

INFO = EnricherInfo(
    id="whois",
    label="Whois",
    description="Registrar, dates and organisation of a domain (or an IP).",
    accepts=["domain-name", "ipv4-addr", "ipv6-addr"],
)

# (note label, accepted whois keys in lowercase - exact match).
# The order sets the display order; the first occurrence wins.
_FIELDS: list[tuple[str, list[str]]] = [
    ("Registrar", ["registrar", "sponsoring registrar"]),
    (
        "Organisation",
        [
            "registrant organization",
            "registrant organisation",
            "orgname",
            "org-name",
            "organisation",
            "organization",
            "netname",
        ],
    ),
    ("Created on", ["creation date", "created", "created on", "regdate", "registered on"]),
    (
        "Updated on",
        ["updated date", "last updated", "last-update", "last modified", "updated"],
    ),
    (
        "Expires on",
        [
            "registry expiry date",
            "registrar registration expiration date",
            "expiry date",
            "expiration date",
            "expires",
            "expires on",
            "paid-till",
        ],
    ),
]

# empty or redacted values, ignored (privacy / GDPR)
_REDACTED = ("redacted", "not disclosed", "data protected", "gdpr", "privacy", "n/a")


def _is_redacted(value: str) -> bool:
    low = value.lower()
    return not value or any(token in low for token in _REDACTED)


def _extract(output: str) -> list[tuple[str, str]]:
    found: dict[str, str] = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, _, raw = line.partition(":")
        key = key.strip().lower()
        value = raw.strip()
        if _is_redacted(value):
            continue
        for label, aliases in _FIELDS:
            if label in found:
                continue
            if key in aliases:
                found[label] = value
                break
    # emitted in _FIELDS order
    return [(label, found[label]) for label, _ in _FIELDS if label in found]


def enrich(stix_type: str, value: str) -> EnrichResponse:
    selector = validate_selector(stix_type, value)
    output = run_tool(["whois", selector])
    fields = _extract(output)

    notes: list[Note] = []
    if fields:
        body = " · ".join(f"{label}: {val}" for label, val in fields)
        notes.append(Note(target_ref=SOURCE_REF, content=f"whois - {body}"))
    else:
        notes.append(
            Note(
                target_ref=SOURCE_REF,
                content="whois - no usable field (protected domain or unrecognised format).",
            )
        )
    return EnrichResponse(enricher="whois", candidates=[], relations=[], notes=notes)
