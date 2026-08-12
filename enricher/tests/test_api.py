"""API contract of the sidecar: auth, catalogue, dispatch, validation."""

from __future__ import annotations

import time

from app import config, main, registry
from app.enrichers import crtsh, cve, dig
from app.schemas import EnrichResponse


def test_health_sans_auth(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_enrichers_exige_le_token(client):
    assert client.get("/enrichers").status_code == 401
    assert client.get("/enrichers", headers={"Authorization": "Bearer faux"}).status_code == 401


def test_catalogue(client, auth):
    res = client.get("/enrichers", headers=auth)
    assert res.status_code == 200
    ids = {e["id"] for e in res.json()}
    assert "dig" in ids
    dig_info = next(e for e in res.json() if e["id"] == "dig")
    assert "domain-name" in dig_info["accepts"]


def test_enrich_type_refuse(client, auth):
    res = client.post(
        "/enrich",
        headers=auth,
        json={"enricher": "dig", "type": "malware", "value": "X-Agent"},
    )
    assert res.status_code == 422


def test_enrich_enricher_inconnu(client, auth):
    res = client.post(
        "/enrich",
        headers=auth,
        json={"enricher": "nope", "type": "domain-name", "value": "evil.example"},
    )
    assert res.status_code == 404


def test_enrich_bout_en_bout_mocke(client, auth, monkeypatch):
    monkeypatch.setattr(
        dig, "run_tool",
        lambda args, timeout=15: "203.0.113.5\n" if args[-1] == "A" else "",
    )
    res = client.post(
        "/enrich",
        headers=auth,
        json={"enricher": "dig", "type": "domain-name", "value": "evil.example"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["enricher"] == "dig"
    assert any(c["name"] == "203.0.113.5" for c in body["candidates"])
    assert body["relations"][0]["rel_type"] == "resolves-to"


def test_erreur_outil_502(client, auth, monkeypatch):
    def boom(stix_type, value):
        from app.tools import ToolError

        raise ToolError("binaire introuvable : dig")

    monkeypatch.setitem(registry._REGISTRY, "dig", (dig.INFO, boom))
    res = client.post(
        "/enrich",
        headers=auth,
        json={"enricher": "dig", "type": "domain-name", "value": "evil.example"},
    )
    assert res.status_code == 502
    monkeypatch.setitem(registry._REGISTRY, "dig", (dig.INFO, dig.enrich))


def test_source_saturee_503_avec_message(client, auth, monkeypatch):
    # #124: when the remote source is down, the analyst must read that the
    # problem comes from it - otherwise they hunt the fault in their config
    def indisponible(stix_type, value):
        from app.tools import SourceUnavailable

        raise SourceUnavailable("crt.sh n'a pas répondu : réessayez.")

    monkeypatch.setitem(registry._REGISTRY, "crtsh", (crtsh.INFO, indisponible))
    res = client.post(
        "/enrich",
        headers=auth,
        json={"enricher": "crtsh", "type": "domain-name", "value": "evil.example"},
    )
    assert res.status_code == 503
    assert "crt.sh" in res.json()["detail"]


def _espion_ttl(monkeypatch) -> list[float]:
    """Captures the lifetime asked for on each cache write."""
    ttls: list[float] = []
    vrai_store = main._store_in_cache

    def espion(key, expiry, result):
        ttls.append(expiry - time.monotonic())
        vrai_store(key, expiry, result)

    monkeypatch.setattr(main, "_store_in_cache", espion)
    return ttls


def test_resultat_non_vide_garde_le_ttl_long(client, auth, monkeypatch):
    # a crt.sh answer costs up to 40 s: we keep it for an hour
    monkeypatch.setattr(crtsh, "_fetch", lambda _: [{"name_value": "a.evil.example"}])
    ttls = _espion_ttl(monkeypatch)
    body = {"enricher": "crtsh", "type": "domain-name", "value": "evil.example"}
    assert client.post("/enrich", headers=auth, json=body).status_code == 200
    assert ttls and ttls[0] > config.CACHE_TTL_SECONDS


def test_un_resultat_en_notes_seules_garde_aussi_le_ttl_long(client, auth, monkeypatch):
    # the CVE case (#175): it returns ONLY notes, never candidates. Going by
    # candidates alone would always give it the short TTL, while it is the
    # enricher that needs the cache most (CIRCL quota counted per IP).
    monkeypatch.setattr(cve, "_fetch", lambda _: {"summary": "Dirty Pipe", "cvss": 7.8})
    ttls = _espion_ttl(monkeypatch)
    body = {"enricher": "cve", "type": "vulnerability", "value": "CVE-2022-0847"}
    res = client.post("/enrich", headers=auth, json=body)
    assert res.status_code == 200
    assert res.json()["candidates"] == [] and res.json()["notes"]
    assert ttls and ttls[0] > config.CACHE_TTL_SECONDS


def test_une_reponse_totalement_vide_reste_sur_le_ttl_court(client, auth, monkeypatch):
    # neither candidate nor note: we want to be able to replay soon
    monkeypatch.setitem(
        registry._REGISTRY,
        "crtsh",
        (crtsh.INFO, lambda t, v: EnrichResponse(enricher="crtsh", candidates=[], relations=[])),
    )
    ttls = _espion_ttl(monkeypatch)
    body = {"enricher": "crtsh", "type": "domain-name", "value": "evil.example"}
    assert client.post("/enrich", headers=auth, json=body).status_code == 200
    assert ttls and ttls[0] <= config.CACHE_TTL_SECONDS
