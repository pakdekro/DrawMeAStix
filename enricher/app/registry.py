"""Enricher registry: catalogue exposed by GET /enrichers, and dispatch.

Adding an enricher = drop a module into app/enrichers/ (INFO + enrich) and
register it here.
"""

from __future__ import annotations

from collections.abc import Callable

from app.enrichers import asnmap, crtsh, cve, dig, subfinder, whois
from app.schemas import EnricherInfo, EnrichResponse

# id → (info, enrich function)
_REGISTRY: dict[str, tuple[EnricherInfo, Callable[[str, str], EnrichResponse]]] = {
    dig.INFO.id: (dig.INFO, dig.enrich),
    subfinder.INFO.id: (subfinder.INFO, subfinder.enrich),
    asnmap.INFO.id: (asnmap.INFO, asnmap.enrich),
    whois.INFO.id: (whois.INFO, whois.enrich),
    cve.INFO.id: (cve.INFO, cve.enrich),
    crtsh.INFO.id: (crtsh.INFO, crtsh.enrich),
}


def catalog() -> list[EnricherInfo]:
    return [info for info, _ in _REGISTRY.values()]


def get(enricher_id: str) -> tuple[EnricherInfo, Callable[[str, str], EnrichResponse]] | None:
    return _REGISTRY.get(enricher_id)
