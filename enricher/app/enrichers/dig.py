"""dig enricher - DNS discovery (#63).

domain-name → A/AAAA (resolution), MX/NS (related domains); DNS records
are all `resolves-to` links in STIX 2.1, so the record type is carried by
the description of the relationship.
ipv4/ipv6-addr → reverse PTR (the domain tied to the IP).

We lean on the `dig` binary (product choice: known, auditable tool), not on
a web resolver - dig gives MX/NS/reverse from a single tool.
"""

from __future__ import annotations

from app.schemas import SOURCE_REF, Candidate, EnricherInfo, EnrichResponse, Relation
from app.tools import is_domain, is_ip, run_tool, validate_selector

INFO = EnricherInfo(
    id="dig",
    label="DNS (dig)",
    description="DNS resolution: A/AAAA, MX, NS, and reverse PTR on an IP.",
    accepts=["domain-name", "ipv4-addr", "ipv6-addr"],
)

# records queried for a domain: (dig record type, target STIX type)
_FORWARD_RECORDS = [
    ("A", "ipv4-addr"),
    ("AAAA", "ipv6-addr"),
    ("MX", "domain-name"),
    ("NS", "domain-name"),
]


def _short(name: str, record: str) -> list[str]:
    out = run_tool(["dig", "+short", name, record])
    return [line.strip() for line in out.splitlines() if line.strip()]


def _clean_host(value: str) -> str:
    # MX: "10 mail.example.com." → "mail.example.com"; otherwise trailing dot
    parts = value.split()
    host = parts[-1] if parts else value
    return host.rstrip(".").lower()


def enrich(stix_type: str, value: str) -> EnrichResponse:
    selector = validate_selector(stix_type, value)
    candidates: list[Candidate] = []
    relations: list[Relation] = []
    seen: dict[str, str] = {}

    def add(stix: str, name: str) -> str:
        key = f"{stix}|{name}"
        if key in seen:
            return seen[key]
        ref = f"c{len(candidates)}"
        seen[key] = ref
        candidates.append(Candidate(ref=ref, stix_type=stix, name=name))
        return ref

    if stix_type in ("ipv4-addr", "ipv6-addr"):
        # reverse: the PTR domain "resolves-to" the enriched IP
        for ptr in run_tool(["dig", "+short", "-x", selector]).splitlines():
            host = _clean_host(ptr)
            # is_domain on the OUTPUT, not only on the input: the content of
            # a PTR is chosen by whoever controls the reverse zone, so it is
            # hostile data just like an imported bundle. Without this filter,
            # dig's display output lands as is in Candidate.name and then in
            # the exported STIX bundle. crtsh.py already does this check, dig
            # did not.
            if not host or not is_domain(host):
                continue
            ref = add("domain-name", host)
            relations.append(
                Relation(source_ref=ref, rel_type="resolves-to", target_ref=SOURCE_REF,
                         description="PTR")
            )
        return EnrichResponse(enricher="dig", candidates=candidates, relations=relations)

    for record, target_type in _FORWARD_RECORDS:
        for raw in _short(selector, record):
            if target_type in ("ipv4-addr", "ipv6-addr"):
                if not is_ip(raw):  # an A query can also return CNAMEs
                    continue
                name = raw
            else:
                # Same reason as for the PTR: MX/NS targets are written by
                # the holder of the zone being queried.
                name = _clean_host(raw)
                if not name or name == selector or not is_domain(name):
                    continue
            ref = add(target_type, name)
            relations.append(
                Relation(source_ref=SOURCE_REF, rel_type="resolves-to", target_ref=ref,
                         description=record)
            )
    return EnrichResponse(enricher="dig", candidates=candidates, relations=relations)
