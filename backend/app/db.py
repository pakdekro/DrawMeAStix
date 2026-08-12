"""SQLite schema and helpers of the Draw Me A STIX core.

Since the local-first pivot, runtime storage lives in the browser
(IndexedDB, on the frontend side). This module now only provides what the
STIX library and the golden vector generators need: the schema (to build
in-memory SQLite databases in tests and scripts) and the id/timestamp
factories shared with the importer.
"""

from __future__ import annotations

import datetime
import uuid

SCHEMA = """
CREATE TABLE IF NOT EXISTS investigations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
    id               TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
    stix_type        TEXT NOT NULL,
    name             TEXT NOT NULL,
    properties       TEXT NOT NULL DEFAULT '{}',
    status           TEXT NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('candidate', 'confirmed')),
    source           TEXT NOT NULL DEFAULT 'manual',
    position_x       REAL NOT NULL DEFAULT 0,
    position_y       REAL NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entities_investigation ON entities(investigation_id);

CREATE TABLE IF NOT EXISTS relationships (
    id               TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
    source_id        TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_id        TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    rel_type         TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    start_time       TEXT,
    stop_time        TEXT,
    created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_relationships_investigation
    ON relationships(investigation_id);

CREATE TABLE IF NOT EXISTS notes (
    id               TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
    entity_id        TEXT REFERENCES entities(id) ON DELETE CASCADE,
    kind             TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'opinion')),
    content          TEXT NOT NULL,
    opinion_value    TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_investigation ON notes(investigation_id);
"""


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> str:
    # STIX format (Z suffix): the stix2 lib rejects a +00:00 suffix
    return (
        datetime.datetime.now(datetime.UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
