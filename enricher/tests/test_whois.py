"""Whois enricher: lenient parsing (ICANN gTLD & AFNIC), redaction, note."""

from __future__ import annotations

import pytest

from app.enrichers import whois
from app.schemas import SOURCE_REF
from app.tools import ToolError

GTLD = """\
   Domain Name: EXAMPLE.COM
   Registrar: MarkMonitor Inc.
   Registrar URL: http://www.markmonitor.com
   Updated Date: 2026-01-16T18:26:50Z
   Creation Date: 1995-08-14T04:00:00Z
   Registry Expiry Date: 2026-08-13T04:00:00Z
   Registrant Organization: Example Holdings LLC
"""

AFNIC = """\
status:                        ACTIVE
registrar:                     OVH
Expiry Date:                   2027-08-20T20:35:30Z
created:                       2023-08-20T20:35:30Z
last-update:                   2025-10-25T13:13:16Z
registrar:                     OVH
"""

REDACTED = """\
   Registrar: Gandi SAS
   Registrant Organization: REDACTED FOR PRIVACY
   Creation Date: 2020-01-01T00:00:00Z
"""


def _fake(monkeypatch, text):
    monkeypatch.setattr(whois, "run_tool", lambda args, timeout=15: text)


def test_gtld(monkeypatch):
    _fake(monkeypatch, GTLD)
    res = whois.enrich("domain-name", "example.com")
    assert res.candidates == [] and res.relations == []
    content = res.notes[0].content
    assert res.notes[0].target_ref == SOURCE_REF
    # "Registrar URL" must not pass for "Registrar" (keys match on equality)
    assert "Registrar: MarkMonitor Inc." in content
    assert "Organisation: Example Holdings LLC" in content
    assert "Created on: 1995-08-14" in content
    assert "Expires on: 2026-08-13" in content


def test_afnic(monkeypatch):
    _fake(monkeypatch, AFNIC)
    res = whois.enrich("domain-name", "exemple.fr")
    content = res.notes[0].content
    assert "Registrar: OVH" in content
    assert "Created on: 2023-08-20" in content
    assert "Expires on: 2027-08-20" in content


def test_champ_caviarde_ignore(monkeypatch):
    _fake(monkeypatch, REDACTED)
    content = whois.enrich("domain-name", "protege.example").notes[0].content
    assert "Registrar: Gandi SAS" in content
    assert "Organisation" not in content  # REDACTED FOR PRIVACY skipped


def test_aucun_champ(monkeypatch):
    _fake(monkeypatch, "No match for NOPE.EXAMPLE\n")
    content = whois.enrich("domain-name", "nope.example").notes[0].content
    assert "no usable field" in content


def test_selecteur_invalide_rejete_avant_spawn():
    with pytest.raises(ToolError):
        whois.enrich("domain-name", "pas; un domaine")
