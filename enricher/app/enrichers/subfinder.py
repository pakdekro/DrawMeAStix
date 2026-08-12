"""Subfinder enricher - passive subdomain enumeration (#64).

domain-name → subdomains found passively (subfinder aggregates crt.sh,
passive DNS and other sources internally). Each subdomain is a separate
`domain-name` candidate.

No relation returned: STIX 2.1 has no proper SRO between a domain and its
subdomain (same discipline as #82 - we do not invent a semantically false
link). The subdomain lands in the triage tray on its own; the analyst links
it or enriches it in turn (dig → resolves-to an IP).
"""

from __future__ import annotations

from app.config import SUBFINDER_MAX_RESULTS, logger
from app.schemas import Candidate, EnricherInfo, EnrichResponse
from app.tools import is_domain, run_tool, validate_selector

INFO = EnricherInfo(
    id="subfinder",
    label="Subdomains (subfinder)",
    description="Passive subdomain enumeration (crt.sh, passive DNS…).",
    accepts=["domain-name"],
)


def enrich(stix_type: str, value: str) -> EnrichResponse:
    selector = validate_selector(stix_type, value)
    # -silent: one entry per line, no banner; -all would stay passive but is
    # far slower, so we keep the fast default sources
    lines = run_tool(["subfinder", "-d", selector, "-silent"]).splitlines()

    seen: set[str] = set()
    names: list[str] = []
    for line in lines:
        host = line.strip().rstrip(".").lower()
        # subfinder can return the apex itself: we do not candidate it again.
        # is_domain also filters the output: it comes from third-party sources
        # (CT logs, passive DNS) and ends up in the exported STIX bundle.
        if not host or host == selector or host in seen or not is_domain(host):
            continue
        seen.add(host)
        names.append(host)

    if len(names) > SUBFINDER_MAX_RESULTS:
        # hard cap: bounds the triage tray and the RAM. We log what gets
        # dropped (count only - not the selectors, see the "zero log" rule).
        logger.warning(
            "subfinder: %d subdomains found, truncated to %d",
            len(names),
            SUBFINDER_MAX_RESULTS,
        )
        names = names[:SUBFINDER_MAX_RESULTS]

    candidates = [
        Candidate(ref=f"c{i}", stix_type="domain-name", name=name)
        for i, name in enumerate(names)
    ]
    return EnrichResponse(enricher="subfinder", candidates=candidates, relations=[])
