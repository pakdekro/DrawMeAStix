"""Subfinder enricher: parsing, dedup, apex filtering, cap (subfinder mocked)."""

from __future__ import annotations

import pytest

from app import config
from app.enrichers import subfinder
from app.tools import ToolError


def _fake_output(monkeypatch, text):
    monkeypatch.setattr(subfinder, "run_tool", lambda args, timeout=15: text)


def test_sous_domaines_en_candidats(monkeypatch):
    _fake_output(
        monkeypatch,
        "mail.evil.example\nvpn.evil.example.\nEVIL.EXAMPLE\napi.evil.example\n",
    )
    res = subfinder.enrich("domain-name", "evil.example")
    names = [c.name for c in res.candidates]

    # all domain-name, apex filtered out, trailing dot and case normalised
    assert all(c.stix_type == "domain-name" for c in res.candidates)
    assert "evil.example" not in names
    assert names == ["mail.evil.example", "vpn.evil.example", "api.evil.example"]
    # no relation invented towards the parent (#82)
    assert res.relations == []


def test_dedoublonnage(monkeypatch):
    _fake_output(monkeypatch, "a.evil.example\na.evil.example\nA.evil.example\n")
    res = subfinder.enrich("domain-name", "evil.example")
    assert [c.name for c in res.candidates] == ["a.evil.example"]


def test_plafond_tronque_et_journalise(monkeypatch, caplog):
    monkeypatch.setattr(config, "SUBFINDER_MAX_RESULTS", 3)
    monkeypatch.setattr(subfinder, "SUBFINDER_MAX_RESULTS", 3)
    _fake_output(
        monkeypatch,
        "".join(f"s{i}.evil.example\n" for i in range(10)),
    )
    with caplog.at_level("WARNING"):
        res = subfinder.enrich("domain-name", "evil.example")
    assert len(res.candidates) == 3
    assert "truncated" in caplog.text


def test_selecteur_invalide_rejete_avant_spawn():
    # the selector shape is validated before any spawn; the type gate
    # (subfinder only accepts domain-name) is enforced by the API, cf. test_api
    with pytest.raises(ToolError):
        subfinder.enrich("domain-name", "pas; un domaine")
