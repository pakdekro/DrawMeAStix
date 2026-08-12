"""Roundtrip on the golden fixture shared with the TypeScript port.

The golden bundle (frontend/src/stix/golden-bundle.json) is deliberately
richer than the fixtures of the other tests: indicator, file hashes+name,
named autonomous-system, MITRE attack-pattern, dated relation. It exposed
three roundtrip bugs invisible anywhere else (pattern_type fed back in,
file_name/as_name/x_mitre_id lost on import, ANY-precision timestamps
and the layout extension taking part in the file's ID).
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.db import SCHEMA
from app.stix_core.bundle import build_bundle
from app.stix_core.importer import import_bundle

GOLDEN = Path(__file__).resolve().parents[2] / "frontend" / "src" / "stix" / "golden-bundle.json"


@pytest.fixture()
def golden() -> dict:
    return json.loads(GOLDEN.read_text(encoding="utf-8"))


def test_roundtrip_fingerprint_stable(golden):
    for export in golden["exports"]:
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        db.executescript(SCHEMA)
        iid, report = import_bundle(db, export["bundle"])
        _, fingerprint, _ = build_bundle(db, iid, SimpleNamespace(**export["opts"]))
        assert fingerprint == export["fingerprint"], export["opts"]


def test_file_id_independant_du_layout(golden):
    """Moving a file node must not change its STIX ID."""
    export = golden["exports"][0]
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    iid, _ = import_bundle(db, export["bundle"])
    db.execute(
        "UPDATE entities SET position_x = position_x + 500 WHERE stix_type = 'file'"
    )
    _, fingerprint, _ = build_bundle(db, iid, SimpleNamespace(**export["opts"]))
    assert fingerprint == export["fingerprint"]
