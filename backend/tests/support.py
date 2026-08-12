"""Test helpers calling the STIX core directly (no HTTP layer).

Since the historical API was dropped, the tests build an investigation in an
in-memory SQLite database and call `build_bundle` / `import_bundle` directly
- same pattern as test_golden_roundtrip.
"""

from __future__ import annotations

import json
import sqlite3
from types import SimpleNamespace

from app.db import SCHEMA, new_id, now
from app.stix_core.bundle import build_bundle


def memory_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def export_opts(**overrides) -> SimpleNamespace:
    """Export options, same defaults as the old API (schemas.ExportOptions)."""
    defaults = {
        "container": "report",
        "tlp": "amber",
        "author_name": None,
        "author_class": "organization",
        "include_notes": True,
        "confidence": None,
    }
    return SimpleNamespace(**{**defaults, **overrides})


class Investigation:
    """Builds an investigation in the in-memory db and exports it directly."""

    def __init__(self, db: sqlite3.Connection, name: str = "Investigation", description: str = ""):
        self.db = db
        self.id = new_id()
        ts = now()
        db.execute(
            "INSERT INTO investigations VALUES (?, ?, ?, ?, ?)",
            (self.id, name, description, ts, ts),
        )

    def entity(
        self,
        stix_type: str,
        name: str,
        *,
        properties: dict | None = None,
        status: str = "confirmed",
        source: str = "manual",
        position_x: float = 0,
        position_y: float = 0,
    ) -> str:
        eid, ts = new_id(), now()
        self.db.execute(
            "INSERT INTO entities (id, investigation_id, stix_type, name, properties,"
            " status, source, position_x, position_y, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                eid, self.id, stix_type, name, json.dumps(properties or {}),
                status, source, position_x, position_y, ts, ts,
            ),
        )
        return eid

    def relationship(self, source_id: str, target_id: str, rel_type: str) -> str:
        rid, ts = new_id(), now()
        self.db.execute(
            "INSERT INTO relationships (id, investigation_id, source_id, target_id,"
            " rel_type, description, start_time, stop_time, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (rid, self.id, source_id, target_id, rel_type, "", None, None, ts),
        )
        return rid

    def note(
        self,
        content: str,
        *,
        entity_id: str | None = None,
        kind: str = "note",
        opinion_value: str | None = None,
    ) -> str:
        nid, ts = new_id(), now()
        self.db.execute(
            "INSERT INTO notes (id, investigation_id, entity_id, kind, content,"
            " opinion_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (nid, self.id, entity_id, kind, content, opinion_value, ts, ts),
        )
        return nid

    def rename(self, entity_id: str, name: str) -> None:
        self.db.execute(
            "UPDATE entities SET name = ?, updated_at = ? WHERE id = ?",
            (name, now(), entity_id),
        )

    def move(self, entity_id: str, x: float, y: float) -> None:
        self.db.execute(
            "UPDATE entities SET position_x = ?, position_y = ? WHERE id = ?",
            (x, y, entity_id),
        )

    def export(self, **opts):
        """Returns (bundle, fingerprint, warnings) - like build_bundle."""
        return build_bundle(self.db, self.id, export_opts(**opts))
