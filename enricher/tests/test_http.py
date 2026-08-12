"""HTTP layer for slow sources (#124): retries, budget, non-fatal 404.

This is the heart of our tolerance for crt.sh, which in normal operation
alternates between ~40 s answers, instant 502s and complete silence. The
tests replay those three regimes; none of them reaches the network.
"""

from __future__ import annotations

import io
import json
import urllib.error

import pytest

from app import tools
from app.tools import SourceUnavailable, http_get_json


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
        return False


def _ok(payload: object) -> _Resp:
    return _Resp(json.dumps(payload).encode())


def _http_error(code: int) -> urllib.error.HTTPError:
    return urllib.error.HTTPError("https://crt.sh/", code, "boom", {}, None)


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch: pytest.MonkeyPatch):
    """Backoff pauses are real in production, pure waiting in tests."""
    monkeypatch.setattr(tools.time, "sleep", lambda _: None)


def _sequence(monkeypatch: pytest.MonkeyPatch, outcomes: list) -> list[int]:
    """Queues urlopen's successive outcomes; returns the timeout of each call."""
    calls: list[int] = []

    def fake_urlopen(_req, timeout=None):
        calls.append(timeout)
        outcome = outcomes[len(calls) - 1]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(tools.urllib.request, "urlopen", fake_urlopen)
    return calls


def test_succes_du_premier_coup(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _sequence(monkeypatch, [_ok([{"id": 1}])])
    assert http_get_json("https://crt.sh/", source="crt.sh") == [{"id": 1}]
    assert len(calls) == 1


def test_502_puis_succes(monkeypatch: pytest.MonkeyPatch) -> None:
    # crt.sh's typical regime: instant 502s, then an actual answer
    calls = _sequence(
        monkeypatch, [_http_error(502), _http_error(503), _ok([{"id": 7}])]
    )
    assert http_get_json("https://crt.sh/", source="crt.sh") == [{"id": 7}]
    assert len(calls) == 3


def test_silence_reseau_rejoue(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _sequence(monkeypatch, [TimeoutError("timed out"), _ok([])])
    assert http_get_json("https://crt.sh/", source="crt.sh") == []
    assert len(calls) == 2


def test_motif_dechec_en_francais(monkeypatch: pytest.MonkeyPatch) -> None:
    # the reason ends up in front of the analyst: no Python class name
    _sequence(monkeypatch, [TimeoutError("timed out")])
    with pytest.raises(SourceUnavailable, match="timed out"):
        http_get_json("https://crt.sh/", source="crt.sh", attempts=1)

    _sequence(monkeypatch, [urllib.error.URLError("dns")])
    with pytest.raises(SourceUnavailable, match="connection failed"):
        http_get_json("https://crt.sh/", source="crt.sh", attempts=1)


def test_reponse_illisible_rejouee(monkeypatch: pytest.MonkeyPatch) -> None:
    # crt.sh sometimes serves an HTML error page under a 200
    calls = _sequence(monkeypatch, [_Resp(b"<html>oops</html>"), _ok([{"id": 3}])])
    assert http_get_json("https://crt.sh/", source="crt.sh") == [{"id": 3}]
    assert len(calls) == 2


def test_liste_vide_est_une_reponse(monkeypatch: pytest.MonkeyPatch) -> None:
    # "no result" is said with a 200 and an empty list: that is an answer,
    # we hand it back as is instead of retrying
    calls = _sequence(monkeypatch, [_ok([])])
    assert http_get_json("https://crt.sh/", source="crt.sh") == []
    assert len(calls) == 1


def test_statuts_rejouables_elargis(monkeypatch: pytest.MonkeyPatch) -> None:
    # crt.sh returns 404 under load on domains that do have certificates:
    # the caller can declare that code retryable
    calls = _sequence(monkeypatch, [_http_error(404), _ok([{"id": 1}])])
    res = http_get_json(
        "https://crt.sh/", source="crt.sh", retry_status=frozenset({404})
    )
    assert res == [{"id": 1}] and len(calls) == 2


def test_code_non_rejouable_echoue_tout_de_suite(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _sequence(monkeypatch, [_http_error(400)])
    with pytest.raises(SourceUnavailable, match="400"):
        http_get_json("https://crt.sh/", source="crt.sh")
    assert len(calls) == 1


def test_abandon_apres_le_dernier_essai(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _sequence(monkeypatch, [_http_error(502)] * 4)
    with pytest.raises(SourceUnavailable) as err:
        http_get_json("https://crt.sh/", source="crt.sh", attempts=4)
    assert len(calls) == 4
    # the message must point the analyst at the source, not at their config
    assert "crt.sh" in str(err.value) and "saturated" in str(err.value)


def test_budget_epuise_coupe_les_essais(monkeypatch: pytest.MonkeyPatch) -> None:
    horloge = iter([0.0, 0.0, 100.0, 100.0])
    monkeypatch.setattr(tools.time, "monotonic", lambda: next(horloge))
    calls = _sequence(monkeypatch, [_http_error(502)] * 4)

    with pytest.raises(SourceUnavailable):
        http_get_json("https://crt.sh/", source="crt.sh", budget=60, attempts=4)
    # second attempt never started: the budget was already spent
    assert len(calls) == 1


def test_timeout_reduit_au_budget_restant(monkeypatch: pytest.MonkeyPatch) -> None:
    horloge = iter([0.0, 0.0, 50.0, 50.0, 100.0])
    monkeypatch.setattr(tools.time, "monotonic", lambda: next(horloge))
    calls = _sequence(monkeypatch, [_http_error(502), _ok([])])

    http_get_json("https://crt.sh/", source="crt.sh", timeout=45, budget=60, attempts=4)
    # 45 s asked for on the first attempt, but only 10 s left on the second
    assert calls == [45, 10]


def test_quota_atteint_message_dedie(monkeypatch: pytest.MonkeyPatch) -> None:
    """A 429 is not told as a "saturated" source (#175).

    CIRCL's quota is counted PER IP ADDRESS: the analyst can hit it
    without having done anything, because another machine behind the
    same IP burned it. The message has to say so, otherwise they go
    looking for a mistake of their own that does not exist.
    """
    err = urllib.error.HTTPError("https://cve.circl.lu/", 429, "slow down", {"Retry-After": "22"}, None)
    _sequence(monkeypatch, [err] * 3)

    with pytest.raises(SourceUnavailable) as exc:
        http_get_json("https://cve.circl.lu/", source="CIRCL", attempts=3)

    message = str(exc.value)
    assert "rate limit" in message
    # the useful point: their 429 is cached 30 min on the exact URL, so
    # hammering the same CVE is pointless, another one will go through
    assert "caches that refusal" in message
    assert "another one" in message
    # and above all NOT the generic slow-source message
    assert "regularly saturated" not in message
