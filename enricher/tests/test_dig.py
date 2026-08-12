"""dig enricher: parsing and mapping to candidates/relations (dig mocked)."""

from __future__ import annotations

import pytest

from app.enrichers import dig
from app.schemas import SOURCE_REF
from app.tools import ToolError

# simulated `dig +short` outputs, keyed by (name, record type) and for -x
FIXTURES = {
    ("evil.example", "A"): "cdn.evil.example.\n203.0.113.5\n203.0.113.6\n",
    ("evil.example", "AAAA"): "2001:db8::1\n",
    ("evil.example", "MX"): "10 mail.evil.example.\n20 mail2.evil.example.\n",
    ("evil.example", "NS"): "ns1.hoster.example.\nns2.hoster.example.\n",
    "-x 203.0.113.5": "host-5.evil.example.\n",
}


@pytest.fixture()
def fake_dig(monkeypatch):
    def fake_run(args, timeout=15):
        if args[:2] == ["dig", "+short"] and args[2] == "-x":
            return FIXTURES.get(f"-x {args[3]}", "")
        if args[:2] == ["dig", "+short"]:
            return FIXTURES.get((args[2], args[3]), "")
        raise AssertionError(f"appel dig inattendu : {args}")

    monkeypatch.setattr(dig, "run_tool", fake_run)


def test_forward_domain(fake_dig):
    res = dig.enrich("domain-name", "evil.example")
    by_ref = {c.ref: c for c in res.candidates}

    # A/AAAA → IP; the intermediate CNAME is filtered out
    ips = {c.name for c in res.candidates if c.stix_type in ("ipv4-addr", "ipv6-addr")}
    assert ips == {"203.0.113.5", "203.0.113.6", "2001:db8::1"}

    # MX/NS → related domains
    domains = {c.name for c in res.candidates if c.stix_type == "domain-name"}
    assert "mail.evil.example" in domains
    assert "ns1.hoster.example" in domains

    # every relation leaves the enriched node as resolves-to, record in description
    assert all(r.rel_type == "resolves-to" for r in res.relations)
    a_rels = [r for r in res.relations if r.description == "A"]
    assert a_rels and all(r.source_ref == SOURCE_REF for r in a_rels)
    assert {by_ref[r.target_ref].stix_type for r in a_rels} == {"ipv4-addr"}


def test_reverse_ip(fake_dig):
    res = dig.enrich("ipv4-addr", "203.0.113.5")
    assert [c.stix_type for c in res.candidates] == ["domain-name"]
    assert res.candidates[0].name == "host-5.evil.example"
    # PTR: the domain resolves-to the enriched IP
    rel = res.relations[0]
    assert rel.source_ref == res.candidates[0].ref
    assert rel.target_ref == SOURCE_REF
    assert rel.description == "PTR"


def test_selector_invalide_rejete_avant_spawn():
    # no mock: a spawn here would hit the real dig - but validation must
    # raise well before that
    with pytest.raises(ToolError):
        dig.enrich("domain-name", "pas; un domaine")
    with pytest.raises(ToolError):
        dig.enrich("ipv4-addr", "999.1.1.1")


def test_dedoublonnage(monkeypatch):
    monkeypatch.setattr(
        dig, "run_tool",
        lambda args, timeout=15: "203.0.113.5\n203.0.113.5\n" if args[3] == "A" else "",
    )
    res = dig.enrich("domain-name", "evil.example")
    assert len([c for c in res.candidates if c.name == "203.0.113.5"]) == 1
