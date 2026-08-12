"""asnmap enricher (via Team Cymru whois): parsing, AS candidate, prefix note."""

from __future__ import annotations

import pytest

from app.enrichers import asnmap
from app.schemas import SOURCE_REF
from app.tools import ToolError

CYMRU_V = (
    "AS      | IP               | BGP Prefix          | CC | Registry | Allocated  | AS Name\n"
    "13335   | 1.1.1.1          | 1.1.1.0/24          | AU | apnic    | 2011-08-11 | CLOUDFLARENET - Cloudflare, Inc., US\n"
)
CYMRU_NA = (
    "AS      | IP           | BGP Prefix | CC | Registry | Allocated | AS Name\n"
    "NA      | 192.0.2.1    | NA         |    | other    |           | NA\n"
)


def _fake(monkeypatch, text):
    monkeypatch.setattr(asnmap, "run_tool", lambda args, timeout=15: text)


def test_ip_vers_asn(monkeypatch):
    _fake(monkeypatch, CYMRU_V)
    res = asnmap.enrich("ipv4-addr", "1.1.1.1")

    assert [c.stix_type for c in res.candidates] == ["autonomous-system"]
    asobj = res.candidates[0]
    assert asobj.name == "AS13335"
    assert asobj.properties["number"] == 13335
    assert "Cloudflare" in asobj.properties["as_name"]

    # the enriched IP belongs-to the AS
    rel = res.relations[0]
    assert rel.source_ref == SOURCE_REF
    assert rel.rel_type == "belongs-to"
    assert rel.target_ref == asobj.ref

    # BGP prefix and AS label carried as notes on the source node
    joined = "\n".join(n.content for n in res.notes)
    assert all(n.target_ref == SOURCE_REF for n in res.notes)
    assert "1.1.1.0/24" in joined
    assert "APNIC" in joined


def test_ip_non_annoncee(monkeypatch):
    _fake(monkeypatch, CYMRU_NA)
    res = asnmap.enrich("ipv4-addr", "192.0.2.1")
    assert res.candidates == []
    assert res.relations == []
    assert res.notes == []


def test_dedoublonne_asn(monkeypatch):
    # two prefixes for the same AS: a single AS candidate, both prefixes in a note
    doubled = CYMRU_V + "13335   | 1.1.1.1 | 1.0.0.0/24 | AU | apnic | 2011-08-11 | CLOUDFLARENET\n"
    _fake(monkeypatch, doubled)
    res = asnmap.enrich("ipv4-addr", "1.1.1.1")
    assert len(res.candidates) == 1
    joined = "\n".join(n.content for n in res.notes)
    assert "1.1.1.0/24" in joined and "1.0.0.0/24" in joined


def test_selecteur_invalide_rejete_avant_spawn():
    with pytest.raises(ToolError):
        asnmap.enrich("ipv4-addr", "999.1.1.1")
