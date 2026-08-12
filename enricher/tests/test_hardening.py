"""Regressions from the security audit (July 2026).

Each test is named after the problem it stops from coming back. They are
grouped here rather than scattered because they all describe one thing:
what the sidecar refuses to do with hostile input.
"""

from __future__ import annotations

import subprocess

import pytest

from app import config, main, schemas
from app.enrichers import dig, subfinder
from app.tools import ToolError, is_domain, is_ip, run_tool, validate_selector

# ── IPv6 scope id: bypassing validation ─────────────────────────────────
# ipaddress.ip_address() accepts "fe80::1%<anything>". CPython only refuses a
# scope that is empty or contains '%', so spaces, semicolons, newlines and
# padding made it all the way to argv.

@pytest.mark.parametrize(
    "value",
    [
        "fe80::1%x\nbegin\nverbose\n1.1.1.1\nend",  # whois protocol injection
        "fe80::1%; ls",
        "fe80::1%" + "A" * 100_000,                 # E2BIG at exec
        "fe80::1%eth0",                             # legitimate scope: refused too
    ],
)
def test_scope_id_ipv6_rejete(value):
    assert is_ip(value) is False
    with pytest.raises(ToolError):
        validate_selector("ipv6-addr", value)


def test_str_de_ip_address_conserve_le_scope():
    """Locks down WHY is_ip checks scope_id.

    The reflex is to "normalise" with str(ip_address(v)), which fixes
    NOTHING: str() re-emits the scope. If this test ever breaks, CPython has
    changed behaviour and is_ip can be simplified.
    """
    import ipaddress

    assert str(ipaddress.ip_address("fe80::1%; ls")) == "fe80::1%; ls"


def test_ip_normalisee_en_forme_canonique():
    # an address written any which way -> a single form in argv, hence a
    # single cache entry
    assert validate_selector("ipv6-addr", "2001:0DB8::0001") == "2001:db8::1"
    assert validate_selector("ipv4-addr", " 1.1.1.1 ") == "1.1.1.1"


# ── Unicode case folding: uncaught 500s ─────────────────────────────────
# re.IGNORECASE on a str pattern folds the whole of Unicode, so [a-z] matched
# U+017F (ſ) and U+212A (K), and \d the Arabic-Indic digits. Those values went
# out into an outgoing URL -> UnicodeEncodeError -> 500.

# Explicit escapes: written literally, these characters get normalised to
# ASCII by an editor or a formatting tool, and the test becomes a test of the
# ordinary case without anyone noticing.
@pytest.mark.parametrize(
    "value",
    [
        "exa\u017fmple.com",   # U+017F LONG S      -> folds onto 's'
        "\u212a.com",          # U+212A KELVIN SIGN -> folds onto 'k'
        "examp\u0131e.com",    # U+0131 DOTLESS I   -> folds onto 'i'
    ],
)
def test_domaine_non_ascii_rejete(value):
    assert is_domain(value) is False


def test_le_sosie_ascii_reste_accepte():
    # counter-check of the previous test: what gets rejected really is the
    # Unicode, not the letter
    assert is_domain("K.com") is True  # ASCII K


def test_cve_en_chiffres_non_ascii_rejetee():
    with pytest.raises(ToolError):
        validate_selector("vulnerability", "CVE-٢٠٢٣-١٢٣٤")


def test_domaine_ascii_toujours_accepte():
    # the hardening must not break the ordinary case
    assert is_domain("example.com") is True
    assert is_domain("sub.domain.co.uk") is True
    assert validate_selector("domain-name", "EXAMPLE.COM") == "example.com"


# ── The selector must never reach the logs ──────────────────────────────

def test_selecteur_absent_du_message_derreur():
    """config.py promises "no selector logged"; main.py logs the exception.

    The selector has to be INVALID for the raise to happen: a well-formed
    domain, confidential or not, is accepted and produces no message at all.
    """
    with pytest.raises(ToolError) as exc:
        validate_selector("domain-name", "client-confidentiel_pas un domaine")
    assert "client-confidentiel" not in str(exc.value)


def test_stderr_absent_du_message_derreur(monkeypatch):
    # dig and whois echo the requested name back in stderr
    def fake_run(*a, **k):
        return subprocess.CompletedProcess(
            a[0], 1, stdout="", stderr="dig: couldn't get address for 'cible-sensible.example'"
        )

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(ToolError) as exc:
        run_tool(["dig", "+short", "example.com"])
    assert "cible-sensible" not in str(exc.value)


def test_oserror_devient_une_toolerror(monkeypatch):
    # E2BIG and friends used to come out as a bare 500
    def boom(*a, **k):
        raise OSError(7, "Argument list too long")

    monkeypatch.setattr(subprocess, "run", boom)
    with pytest.raises(ToolError):
        run_tool(["dig", "+short", "example.com"])


# ── Tool output = hostile data ──────────────────────────────────────────
# The content of a PTR, an MX or an NS is written by whoever owns the zone.

def test_ptr_hostile_non_candidate(monkeypatch):
    monkeypatch.setattr(
        dig, "run_tool",
        lambda *a, **k: "<img src=x onerror=alert(1)>.\nlegit.example.\n",
    )
    res = dig.enrich("ipv4-addr", "1.1.1.1")
    assert [c.name for c in res.candidates] == ["legit.example"]


def test_mx_hostile_non_candidate(monkeypatch):
    def fake(args, **k):
        return "10 ../../etc/passwd\n20 mail.legit.example.\n" if "MX" in args else ""

    monkeypatch.setattr(dig, "run_tool", fake)
    res = dig.enrich("domain-name", "example.com")
    assert [c.name for c in res.candidates] == ["mail.legit.example"]


def test_sortie_subfinder_hostile_non_candidate(monkeypatch):
    monkeypatch.setattr(
        subfinder, "run_tool",
        lambda *a, **k: "a b c\nok.example.com\n$(whoami).example.com\n",
    )
    res = subfinder.enrich("domain-name", "example.com")
    assert [c.name for c in res.candidates] == ["ok.example.com"]


# ── Length caps: guaranteed without a reverse proxy ──────────────────────

def test_valeur_trop_longue_refusee(client, auth):
    res = client.post(
        "/enrich",
        headers=auth,
        json={"enricher": "dig", "type": "domain-name", "value": "a" * 5000},
    )
    assert res.status_code == 422


def test_enricher_trop_long_refuse(client, auth):
    res = client.post(
        "/enrich",
        headers=auth,
        json={"enricher": "x" * 5000, "type": "domain-name", "value": "example.com"},
    )
    assert res.status_code == 422
    # and the refused name is not reflected back whole in the response
    assert "x" * 5000 not in res.text


def test_plafonds_couvrent_les_cas_legitimes():
    # an FQDN caps at 253 characters, it has to get through
    fqdn = ".".join(["a" * 61] * 4)[:253].rstrip(".")
    assert len(fqdn) <= schemas.MAX_VALUE_LEN


# ── Unauthenticated API surface ─────────────────────────────────────────

@pytest.mark.parametrize("route", ["/docs", "/redoc", "/openapi.json"])
def test_documentation_non_exposee(client, route):
    """These routes cannot carry dependencies=[Auth]: we turn them off."""
    assert client.get(route).status_code == 404


def test_health_reste_ouvert_et_muet(client):
    res = client.get("/health")
    assert res.status_code == 200
    # no version, no hostname: just the status
    assert res.json() == {"status": "ok"}


# ── Empty token in the environment ──────────────────────────────────────

def test_token_vide_compte_comme_absent(monkeypatch):
    """docker-compose.yml ships STIXIT_ENRICHER_TOKEN=${ENRICHER_TOKEN:-}.

    Present but empty: the old `not in os.environ` test was therefore wrong
    and the startup warning never fired, leaving the analyst with a service
    locked behind a token they had no way of knowing.
    """
    import importlib

    monkeypatch.setenv("STIXIT_ENRICHER_TOKEN", "")
    reloaded = importlib.reload(config)
    try:
        assert reloaded._token_generated is True
        assert reloaded.expected_token()
    finally:
        monkeypatch.delenv("STIXIT_ENRICHER_TOKEN", raising=False)
        importlib.reload(config)
        importlib.reload(main)
