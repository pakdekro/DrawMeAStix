"""asnmap enricher - IP ↔ ASN ↔ BGP prefix (#65).

ipv4/ipv6-addr → the ASN (autonomous-system, `belongs-to` relationship) the
IP belongs to, and the BGP prefix covering it, carried as a note.

ProjectDiscovery's `asnmap` binary now routes through their cloud API (PDCP
key required) - incompatible with the sidecar's "binaries, not APIs"
principle. So we query Team Cymru's IP→ASN whois service (whois.cymru.com),
which asks for no key and returns ASN + prefix + name + registry on a single
line. The `whois` binary is already in the image.
"""

from __future__ import annotations

from app.schemas import SOURCE_REF, Candidate, EnricherInfo, EnrichResponse, Note, Relation
from app.tools import run_tool, validate_selector

INFO = EnricherInfo(
    id="asnmap",
    label="ASN (Team Cymru)",
    description="ASN, BGP prefix and network operator of an IP (Team Cymru whois).",
    accepts=["ipv4-addr", "ipv6-addr"],
)

_CYMRU_HOST = "whois.cymru.com"


def _rows(output: str) -> list[dict[str, str]]:
    """Parse Team Cymru's verbose output (fields separated by "|")."""
    rows: list[dict[str, str]] = []
    for line in output.splitlines():
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 7:
            continue
        # the header row starts with "AS" (the column label)
        if parts[0].lower() in ("as", "as number"):
            continue
        rows.append(
            {
                "asn": parts[0],
                "prefix": parts[2],
                "registry": parts[4],
                "allocated": parts[5],
                "name": parts[6],
            }
        )
    return rows


def enrich(stix_type: str, value: str) -> EnrichResponse:
    selector = validate_selector(stix_type, value)
    # "-v": verbose mode (prefix, registry, date, name); the leading space is
    # part of the Team Cymru query convention
    output = run_tool(["whois", "-h", _CYMRU_HOST, f" -v {selector}"])

    candidates: list[Candidate] = []
    relations: list[Relation] = []
    notes: list[Note] = []
    seen_asn: dict[str, str] = {}
    prefixes: list[str] = []

    for row in _rows(output):
        asn = row["asn"]
        # IP not announced: Team Cymru returns "NA", nothing to attach
        if not asn.isdigit():
            continue
        if row["prefix"] and row["prefix"] not in prefixes:
            prefixes.append(row["prefix"])
        if asn in seen_asn:
            continue
        ref = f"c{len(candidates)}"
        seen_asn[asn] = ref
        candidates.append(
            Candidate(
                ref=ref,
                stix_type="autonomous-system",
                name=f"AS{asn}",
                properties={"number": int(asn), "as_name": row["name"]},
            )
        )
        relations.append(
            Relation(source_ref=SOURCE_REF, rel_type="belongs-to", target_ref=ref)
        )
        registry = row["registry"].upper()
        allocated = f", allocated {row['allocated']}" if row["allocated"] else ""
        notes.append(
            Note(
                target_ref=SOURCE_REF,
                content=f"AS{asn} - {row['name']} (registry {registry}{allocated}).",
            )
        )

    if prefixes:
        notes.append(
            Note(
                target_ref=SOURCE_REF,
                content=f"BGP prefix(es) covering the IP: {', '.join(prefixes)}.",
            )
        )

    return EnrichResponse(
        enricher="asnmap", candidates=candidates, relations=relations, notes=notes
    )
