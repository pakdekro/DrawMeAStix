"""crt.sh enricher: certificate parsing, subdomains / siblings split, cap."""

from __future__ import annotations

import urllib.error

import pytest

from app import config, tools
from app.enrichers import crtsh
from app.schemas import SOURCE_REF
from app.tools import SourceUnavailable, ToolError


def _row(names: str, issuer: str = "C=US, O=Let's Encrypt, CN=E5", **extra: object) -> dict:
    row = {
        "name_value": names,
        "common_name": names.splitlines()[0],
        "issuer_name": issuer,
        "not_before": "2026-05-31T21:39:00",
    }
    row.update(extra)
    return row


ROWS = [
    _row("*.evil.example\nevil.example"),
    _row("www.evil.example\nmail.evil.example"),
    _row("c2.evil.example", issuer="C=GB, O=Sectigo Limited, CN=Sectigo RSA"),
]


def test_sous_domaines_en_candidats(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crtsh, "_fetch", lambda _: ROWS)
    res = crtsh.enrich("domain-name", "evil.example")

    noms = {c.name for c in res.candidates}
    assert noms == {"www.evil.example", "mail.evil.example", "c2.evil.example"}
    assert all(c.stix_type == "domain-name" for c in res.candidates)
    # the enriched apex never candidates itself, not even seen via the wildcard
    assert "evil.example" not in noms
    # no SRO invented between a domain and its subdomain (#82)
    assert res.relations == []


def test_note_resume_les_certificats(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crtsh, "_fetch", lambda _: ROWS)
    (note,) = crtsh.enrich("domain-name", "evil.example").notes

    assert note.target_ref == SOURCE_REF
    assert "3 unexpired certificate(s)" in note.content
    # the issuer is cut down to its organisation, not the whole DN
    assert "Let's Encrypt" in note.content and "Sectigo Limited" in note.content
    assert "CN=E5" not in note.content
    assert "2026-05-31" in note.content


def test_noms_hors_domaine_signales_comme_voisins(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_row("www.evil.example\nautre-victime.example\nboutique.tiers.example")]
    monkeypatch.setattr(crtsh, "_fetch", lambda _: rows)
    res = crtsh.enrich("domain-name", "evil.example")

    # a shared certificate must not dump third-party domains into the triage
    # bin: they are reported in a note, not turned into candidates
    assert {c.name for c in res.candidates} == {"www.evil.example"}
    contenu = res.notes[0].content
    assert "autre-victime.example" in contenu and "boutique.tiers.example" in contenu


def test_entrees_non_dns_ignorees(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [_row("admin@evil.example\nAS207960 Test Intermediate - evil.example\nok.evil.example")]
    monkeypatch.setattr(crtsh, "_fetch", lambda _: rows)
    res = crtsh.enrich("domain-name", "evil.example")

    assert {c.name for c in res.candidates} == {"ok.evil.example"}


def test_plafond_de_candidats(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "CRTSH_MAX_RESULTS", 5)
    monkeypatch.setattr(crtsh, "CRTSH_MAX_RESULTS", 5)
    rows = [_row("\n".join(f"h{i}.evil.example" for i in range(50)))]
    monkeypatch.setattr(crtsh, "_fetch", lambda _: rows)

    assert len(crtsh.enrich("domain-name", "evil.example").candidates) == 5


def test_aucun_certificat(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(crtsh, "_fetch", lambda _: [])
    res = crtsh.enrich("domain-name", "evil.example")

    assert res.candidates == []
    assert "no unexpired certificate" in res.notes[0].content


def test_selecteur_invalide() -> None:
    with pytest.raises(ToolError):
        crtsh.enrich("domain-name", "pas un domaine")


def test_404_persistant_ne_se_lit_pas_comme_une_absence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Guard rail: a 404 from crt.sh does NOT mean "no certificate".

    Measured on github.com: one 404 framed by two 48 KB answers. Reading it
    as an absence of results would produce a silent false negative, exactly
    the kind an analyst cannot spot.
    """
    monkeypatch.setattr(tools.time, "sleep", lambda _: None)

    def toujours_404(_req, timeout=None):
        raise urllib.error.HTTPError("https://crt.sh/", 404, "nope", {}, None)

    monkeypatch.setattr(tools.urllib.request, "urlopen", toujours_404)

    with pytest.raises(SourceUnavailable):
        crtsh.enrich("domain-name", "evil.example")
