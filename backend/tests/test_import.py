"""Import tests: Draw Me A STIX roundtrip and foreign bundles (direct calls)."""

import pytest

from app.stix_core.bundle import build_bundle
from app.stix_core.importer import import_bundle
from tests.support import export_opts, memory_db
from tests.test_export import _setup_investigation


def test_roundtrip_preserves_fingerprint(db):
    """THE product test: export → import → export = same fingerprint."""
    inv = _setup_investigation(db)
    first_bundle, first_fp, _ = inv.export(author_name="Mon CERT", tlp="amber")

    db2 = memory_db()
    iid2, report = import_bundle(db2, first_bundle)
    assert iid2 != inv.id
    row = db2.execute("SELECT name FROM investigations WHERE id = ?", (iid2,)).fetchone()
    assert row["name"] == "Opération Héron"
    assert report.entities == 3  # the candidate was never exported
    assert report.relationships == 2
    assert report.notes == 2
    # the author identity does not become an entity on the canvas
    assert report.skipped == {"identity (author)": 1}

    _, second_fp, _ = build_bundle(db2, iid2, export_opts(author_name="Mon CERT", tlp="amber"))
    assert second_fp == first_fp


def test_roundtrip_restores_positions(db):
    inv = _setup_investigation(db)
    bundle = inv.export()[0]

    db2 = memory_db()
    iid2, _ = import_bundle(db2, bundle)
    rows = db2.execute(
        "SELECT name, position_x, position_y FROM entities WHERE investigation_id = ?", (iid2,)
    ).fetchall()
    entities = {r["name"]: r for r in rows}
    assert entities["APT28"]["position_x"] == 100
    assert entities["APT28"]["position_y"] == 50


def test_import_foreign_bundle(db):
    """Foreign bundle: no layout extension, unknown objects, off-matrix relation."""
    bundle = {
        "type": "bundle",
        "id": "bundle--00000000-0000-4000-8000-000000000001",
        "objects": [
            {
                "type": "malware",
                "spec_version": "2.1",
                "id": "malware--00000000-0000-4000-8000-000000000002",
                "created": "2024-01-01T00:00:00.000Z",
                "modified": "2024-01-01T00:00:00.000Z",
                "name": "Emotet",
                "is_family": True,
            },
            {
                "type": "ipv4-addr",
                "id": "ipv4-addr--00000000-0000-4000-8000-000000000003",
                "value": "198.51.100.7",
            },
            {
                # relation our matrix does not allow: imported all the same
                "type": "relationship",
                "spec_version": "2.1",
                "id": "relationship--00000000-0000-4000-8000-000000000004",
                "created": "2024-01-01T00:00:00.000Z",
                "modified": "2024-01-01T00:00:00.000Z",
                "relationship_type": "communicates-with",
                "source_ref": "ipv4-addr--00000000-0000-4000-8000-000000000003",
                "target_ref": "malware--00000000-0000-4000-8000-000000000002",
            },
            {
                # type not handled in v1: counted in skipped
                "type": "course-of-action",
                "spec_version": "2.1",
                "id": "course-of-action--00000000-0000-4000-8000-000000000005",
                "created": "2024-01-01T00:00:00.000Z",
                "modified": "2024-01-01T00:00:00.000Z",
                "name": "Patch",
            },
        ],
    }
    iid, report = import_bundle(db, bundle, fallback_name="Bundle tiers")
    row = db.execute("SELECT name FROM investigations WHERE id = ?", (iid,)).fetchone()
    assert row["name"] == "Bundle tiers"
    assert report.entities == 2
    assert report.relationships == 1
    assert report.skipped == {"course-of-action": 1}

    entities = db.execute(
        "SELECT position_x, position_y FROM entities WHERE investigation_id = ?", (iid,)
    ).fetchall()
    # fallback grid: distinct positions
    positions = {(e["position_x"], e["position_y"]) for e in entities}
    assert len(positions) == 2
    rels = db.execute(
        "SELECT rel_type FROM relationships WHERE investigation_id = ?", (iid,)
    ).fetchall()
    assert rels[0]["rel_type"] == "communicates-with"


def test_import_rejects_non_bundle(db):
    with pytest.raises(ValueError):
        import_bundle(db, {"type": "malware"})
    with pytest.raises(ValueError):
        import_bundle(db, {"type": "bundle"})


def test_import_empty_bundle_warns(db):
    bundle = {"type": "bundle", "id": "bundle--00000000-0000-4000-8000-00000000000a",
              "objects": []}
    _, report = import_bundle(db, bundle)
    assert "no importable entity" in report.warnings[0]


def test_bundle_tiers_arrive_en_bac_de_triage(db):
    """#12: without our layout extension, entities land as candidates."""
    bundle = {
        "type": "bundle",
        "id": "bundle--11111111-1111-4111-8111-111111111111",
        "objects": [
            {
                "type": "malware",
                "spec_version": "2.1",
                "id": "malware--1fa27f3c-beda-59f1-b476-f8ad99cbdeff",
                "created": "2026-07-20T09:10:00.000Z",
                "modified": "2026-07-20T09:10:00.000Z",
                "name": "X-Agent",
                "is_family": True,
            }
        ],
    }
    iid, report = import_bundle(db, bundle)
    assert any("triage tray" in w for w in report.warnings)
    statuses = [
        r["status"]
        for r in db.execute(
            "SELECT status FROM entities WHERE investigation_id = ?", (iid,)
        ).fetchall()
    ]
    assert statuses == ["candidate"]
