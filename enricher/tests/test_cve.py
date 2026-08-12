"""CVE enricher: parsing of both CIRCL formats, selector, note."""

from __future__ import annotations

import pytest

from app.enrichers import cve
from app.schemas import SOURCE_REF
from app.tools import ToolError

CVELISTV5 = {
    "cveMetadata": {"cveId": "CVE-2024-3094", "datePublished": "2024-03-29T17:00:00Z"},
    "containers": {
        "cna": {
            "descriptions": [
                {"lang": "es", "value": "no gracias"},
                {"lang": "en", "value": "Malicious code was discovered in xz."},
            ],
            "metrics": [
                {"cvssV3_1": {"baseScore": 10.0, "baseSeverity": "CRITICAL"}},
            ],
        }
    },
}

CVE_SEARCH = {
    "id": "CVE-2024-3094",
    "summary": "Malicious code was discovered in xz.",
    "cvss": 10.0,
    "Published": "2024-03-29T17:00:00",
}


def test_format_cvelistv5(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cve, "_fetch", lambda _: CVELISTV5)
    res = cve.enrich("vulnerability", "cve-2024-3094")
    assert res.candidates == [] and res.relations == []
    (note,) = res.notes
    assert note.target_ref == SOURCE_REF
    assert "CVE-2024-3094 (source: CIRCL)" in note.content
    assert "Malicious code was discovered in xz." in note.content
    assert "CVSS: 10.0 (CRITICAL)" in note.content
    assert "Published on: 2024-03-29" in note.content


def test_format_cve_search(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cve, "_fetch", lambda _: CVE_SEARCH)
    (note,) = cve.enrich("vulnerability", "CVE-2024-3094").notes
    assert "Malicious code was discovered in xz." in note.content
    assert "CVSS: 10.0" in note.content


def test_reponse_sans_description(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cve, "_fetch", lambda _: {"id": "CVE-2024-3094"})
    (note,) = cve.enrich("vulnerability", "CVE-2024-3094").notes
    assert "without a usable description" in note.content


def test_selecteur_invalide() -> None:
    with pytest.raises(ToolError):
        cve.enrich("vulnerability", "Log4Shell")
    with pytest.raises(ToolError):
        cve.enrich("vulnerability", "CVE-24-1")
