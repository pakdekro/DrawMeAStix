"""Generate the golden vector of the bundle builder for the TS port (#39).

Builds a fixture investigation in in-memory SQLite (frozen timestamps),
exports it through the reference Python builder with three sets of options,
and commits state + bundles + fingerprints into
frontend/src/stix/golden-bundle.json. The TypeScript builder must produce the
same objects (deep equality, bundle id excepted) and the same fingerprint.

Usage: cd backend && uv run python scripts/generate_golden_bundle.py
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

from app.db import SCHEMA
from app.stix_core.bundle import build_bundle

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "stix" / "golden-bundle.json"

SHA256 = "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f"

INVESTIGATION = (
    "inv-1",
    "Opération Héron",
    "Campagne d'hameçonnage ciblée - attribution à l'étude.",
    "2026-07-20T09:00:00.000Z",
    "2026-07-21T10:30:00.000Z",
)

# (id, stix_type, name, properties, status, source, x, y, created_at, updated_at)
ENTITIES = [
    # per-entity confidence: wins over the confidence chosen at export (#125)
    ("e1", "threat-actor", "APT28",
     {"aliases": ["Fancy Bear", "Sofacy"], "description": "Groupe étatique présumé.",
      "confidence": 85},
     "confirmed", "manual", 120.5, 80.0,
     "2026-07-20T09:05:00.000Z", "2026-07-20T09:06:00.000Z"),
    # per-entity tlp: its own marking, wins over the export TLP (#125)
    ("e2", "malware", "X-Agent", {"is_family": True, "tlp": "red"},
     "confirmed", "manual", 360.0, 80.25,
     "2026-07-20T09:10:00.000Z", "2026-07-20T09:10:00.000Z"),
    ("e3", "indicator", "Détection C2 Héron",
     {"pattern": "[ipv4-addr:value = '203.0.113.5']"},
     "confirmed", "manual", 600.0, 80.0,
     "2026-07-20T09:15:00.000Z", "2026-07-20T09:15:00.000Z"),
    # empty description + empty list: never exported (non-destructive interop)
    ("e4", "attack-pattern", "Spearphishing Attachment",
     {"x_mitre_id": "T1566.001", "description": "", "aliases": []},
     "confirmed", "manual", 120.0, 240.0,
     "2026-07-20T09:20:00.000Z", "2026-07-20T09:20:00.000Z"),
    ("e5", "identity", "Ministère cible", {"identity_class": "organization"},
     "confirmed", "manual", 360.0, 240.0,
     "2026-07-20T09:25:00.000Z", "2026-07-20T09:25:00.000Z"),
    ("e6", "location", "France", {"location_type": "Country", "country": "FR"},
     "confirmed", "manual", 600.0, 240.0,
     "2026-07-20T09:30:00.000Z", "2026-07-20T09:30:00.000Z"),
    ("e7", "vulnerability", "CVE-2024-3094", {},
     "confirmed", "manual", 840.0, 240.0,
     "2026-07-20T09:35:00.000Z", "2026-07-20T09:35:00.000Z"),
    ("e8", "ipv4-addr", "203.0.113.5", {},
     "confirmed", "manual", 120.0, 400.0,
     "2026-07-20T09:40:00.000Z", "2026-07-20T09:40:00.000Z"),
    ("e9", "domain-name", "evil.example", {},
     "confirmed", "manual", 360.0, 400.0,
     "2026-07-20T09:45:00.000Z", "2026-07-20T09:45:00.000Z"),
    ("e10", "file", "dropper.dll",
     {"hashes": {"SHA-256": SHA256}, "file_name": "dropper.dll"},
     "confirmed", "manual", 600.0, 400.0,
     "2026-07-20T09:50:00.000Z", "2026-07-20T09:50:00.000Z"),
    ("e11", "autonomous-system", "AS64496", {"number": 64496, "as_name": "EVIL-AS"},
     "confirmed", "manual", 840.0, 400.0,
     "2026-07-20T09:55:00.000Z", "2026-07-20T09:55:00.000Z"),
    ("e12", "tool", "Mimikatz", {},
     "candidate", "manual", 840.0, 80.0,
     "2026-07-20T10:00:00.000Z", "2026-07-20T10:00:00.000Z"),
    ("e13", "url", "https://evil.example/payload?id=1", {},
     "confirmed", "manual", 120.0, 560.0,
     "2026-07-20T10:05:00.000Z", "2026-07-20T10:05:00.000Z"),
    ("e14", "email-addr", "phish@evil.example", {},
     "confirmed", "import", 360.0, 560.0,
     "2026-07-20T10:10:00.000Z", "2026-07-20T10:10:00.000Z"),
]

# (id, source_id, target_id, rel_type, description, start_time, stop_time, created_at)
RELATIONSHIPS = [
    ("r1", "e1", "e2", "uses", "Outillage récurrent du groupe.", None, None,
     "2026-07-20T11:00:00.000Z"),
    ("r2", "e2", "e8", "communicates-with", "", None, None, "2026-07-20T11:05:00.000Z"),
    ("r3", "e3", "e8", "based-on", "", None, None, "2026-07-20T11:10:00.000Z"),
    ("r4", "e3", "e1", "indicates", "", "2026-07-01T00:00:00.000Z", "2026-07-15T00:00:00.000Z",
     "2026-07-20T11:15:00.000Z"),
    ("r5", "e1", "e12", "uses", "", None, None, "2026-07-20T11:20:00.000Z"),
    ("r6", "e9", "e8", "resolves-to", "", None, None, "2026-07-20T11:25:00.000Z"),
    ("r7", "e1", "e5", "targets", "", None, None, "2026-07-20T11:30:00.000Z"),
    ("r8", "e2", "e7", "exploits", "", None, None, "2026-07-20T11:35:00.000Z"),
]

# (id, entity_id, kind, content, opinion_value, created_at, updated_at)
NOTES = [
    ("n1", "e1", "note", "Attribution APT28 fondée sur l'infra partagée - à consolider.",
     None, "2026-07-20T12:00:00.000Z", "2026-07-20T12:00:00.000Z"),
    # SECOND-precision timestamp (no milliseconds): pins the note ID
    # computation to the millisecond serialised form, else the roundtrip breaks
    ("n2", None, "note", "Piste « fournisseur compromis » écartée le 20/07.",
     None, "2026-07-20T12:05:00Z", "2026-07-20T12:10:00Z"),
    ("n3", "e1", "opinion", "Recoupé par deux sources indépendantes.",
     "agree", "2026-07-20T12:15:00.000Z", "2026-07-20T12:15:00.000Z"),
]

EXPORTS = [
    {"container": "report", "tlp": "amber", "author_name": "CERT Pak",
     "author_class": "organization", "include_notes": True, "confidence": None},
    {"container": "grouping", "tlp": "none", "author_name": None,
     "author_class": "organization", "include_notes": False, "confidence": None},
    # export confidence: set everywhere except on e1, which carries its own (#125)
    {"container": "report", "tlp": "amber", "author_name": "CERT Pak",
     "author_class": "organization", "include_notes": True, "confidence": 75},
]


def main() -> None:
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    db.execute("INSERT INTO investigations VALUES (?, ?, ?, ?, ?)", INVESTIGATION)
    iid = INVESTIGATION[0]
    for e in ENTITIES:
        db.execute(
            "INSERT INTO entities VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (e[0], iid, e[1], e[2], json.dumps(e[3], ensure_ascii=False), *e[4:]),
        )
    for r in RELATIONSHIPS:
        db.execute(
            "INSERT INTO relationships VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (r[0], iid, *r[1:]),
        )
    for n in NOTES:
        db.execute("INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (n[0], iid, *n[1:]))

    state = {
        "investigation": dict(
            db.execute("SELECT * FROM investigations WHERE id = ?", (iid,)).fetchone()
        ),
        "entities": [dict(row) for row in db.execute("SELECT * FROM entities ORDER BY created_at")],
        "relationships": [
            dict(row) for row in db.execute("SELECT * FROM relationships ORDER BY created_at")
        ],
        "notes": [dict(row) for row in db.execute("SELECT * FROM notes ORDER BY created_at")],
    }

    exports = []
    for opts in EXPORTS:
        bundle, fp, warnings = build_bundle(db, iid, SimpleNamespace(**opts))
        exports.append({"opts": opts, "bundle": bundle, "fingerprint": fp, "warnings": warnings})

    payload = {
        "_comment": "Généré par generate_golden_bundle.py - ne pas éditer à la main.",
        "state": state,
        "exports": exports,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(exports)} exports golden -> {OUT}")


if __name__ == "__main__":
    main()
