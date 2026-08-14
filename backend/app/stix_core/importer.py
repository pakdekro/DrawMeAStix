"""Import of a STIX 2.1 bundle into a new investigation.

Tolerant by design: a third-party bundle (another tool, an OpenCTI export)
carries unknown types, relationships our matrix would not allow, exotic
extensions - we import everything we know how to represent, we count the
rest in the import report, and we never strand the user on an error.

STIX timestamps (created/modified/published) are kept in the database:
an export → import → export roundtrip gives back the same version fingerprint.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.db import new_id, now
from app.stix_core.bundle import STIXIT_EXTENSION_ID, TOOL_IDENTITY_ID
from app.stix_core.relationships import SCO_TYPES, SDO_TYPES

# Fallback grid spacing, for bundles that carry no Draw Me A STIX layout.
_GRID_X, _GRID_Y, _GRID_COLS = 240, 140, 6


class ImportReport:
    def __init__(self) -> None:
        self.entities = 0
        self.candidates = 0
        self.relationships = 0
        self.notes = 0
        self.skipped: dict[str, int] = {}
        self.warnings: list[str] = []

    def skip(self, stix_type: str) -> None:
        self.skipped[stix_type] = self.skipped.get(stix_type, 0) + 1

    def as_dict(self) -> dict[str, Any]:
        return {
            "entities": self.entities,
            "relationships": self.relationships,
            "notes": self.notes,
            "skipped": self.skipped,
            "warnings": self.warnings,
        }


def _sco_name(obj: dict) -> str | None:
    if "value" in obj:
        return obj["value"]
    if obj["type"] == "file":
        hashes = obj.get("hashes", {})
        return obj.get("name") or next(iter(hashes.values()), None)
    if obj["type"] == "autonomous-system":
        return obj.get("name") or f"AS{obj.get('number', '?')}"
    # Observables whose readable half is not called `value`. The property
    # picked here is the one the builder reads back out of the node name, so
    # that an import → export roundtrip lands on the same identifier.
    if obj["type"] in ("mutex", "software"):
        return obj.get("name")
    if obj["type"] == "directory":
        return obj.get("path")
    if obj["type"] == "user-account":
        return obj.get("account_login") or obj.get("user_id") or obj.get("display_name")
    if obj["type"] == "x509-certificate":
        # The serial comes first: the builder only reads the name as a
        # fingerprint when nothing identifying was filled in.
        return obj.get("serial_number") or next(iter(obj.get("hashes", {}).values()), None)
    return None


# TLP marking-definitions from the spec: the only markings mapped back on import.
_TLP_BY_MARKING_ID = {
    "marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9": "clear",
    "marking-definition--34098fce-860f-48ae-8e50-ebd3cc5e41da": "green",
    "marking-definition--f88d31f6-486f-44da-b317-01333bde0b82": "amber",
    "marking-definition--5e57c739-391a-4eb3-b6be-7d15ca92d5ed": "red",
}


def _entity_properties(obj: dict) -> dict:
    """Properties to keep: everything but the meta handled elsewhere."""
    dropped = {
        "type", "id", "spec_version", "created", "modified", "name", "value",
        "created_by_ref", "object_marking_refs", "extensions", "object_refs",
        "granular_markings", "revoked", "defanged",
    }
    props = {k: v for k, v in obj.items() if k not in dropped}
    # object_marking_refs is meta (dropped), but a known TLP is mapped back
    # to a `tlp` prop: the roundtrip keeps the marking object by object.
    tlp = next(
        (
            _TLP_BY_MARKING_ID[ref]
            for ref in obj.get("object_marking_refs", [])
            if ref in _TLP_BY_MARKING_ID
        ),
        None,
    )
    if tlp:
        props["tlp"] = tlp
    if obj["type"] == "location" and "x_opencti_location_type" in props:
        props["location_type"] = props.pop("x_opencti_location_type")
    # The STIX `name` is meta (handled apart) but some types carry it in a
    # dedicated property on the builder side: without this re-mapping the
    # roundtrip loses the info and the deterministic ID changes.
    if obj["type"] == "file" and obj.get("name"):
        props["file_name"] = obj["name"]
    if obj["type"] == "autonomous-system" and obj.get("name"):
        props["as_name"] = obj["name"]
    # The readable half of these two lives in the entity name from here on.
    # Leaving a copy in the properties lets the two drift apart the moment the
    # node is renamed, and the builder reads the name, never the copy.
    if obj["type"] == "directory":
        props.pop("path", None)
    if obj["type"] == "user-account":
        props.pop("account_login", None)
    if obj["type"] == "attack-pattern" and not props.get("x_mitre_id"):
        mitre = next(
            (
                r.get("external_id")
                for r in obj.get("external_references", [])
                if r.get("source_name") == "mitre-attack" and r.get("external_id")
            ),
            None,
        )
        if mitre:
            props["x_mitre_id"] = mitre
    return props


def _layout(obj: dict, index: int) -> tuple[float, float, str]:
    ext = (obj.get("extensions") or {}).get(STIXIT_EXTENSION_ID)
    if ext:
        # "x"/"y": bundles produced before the rename to position_x/y
        return (
            ext.get("position_x", ext.get("x", 0)),
            ext.get("position_y", ext.get("y", 0)),
            ext.get("source", "import"),
        )
    return (index % _GRID_COLS) * _GRID_X, (index // _GRID_COLS) * _GRID_Y, "import"


def import_bundle(
    db: sqlite3.Connection, bundle: dict, fallback_name: str | None = None
) -> tuple[str, ImportReport]:
    """Create an investigation from a bundle. Returns (investigation_id, report)."""
    objects = bundle.get("objects")
    if not isinstance(objects, list) or bundle.get("type") != "bundle":
        raise ValueError("this file is not a STIX bundle (type=bundle, objects=[...])")

    report = ImportReport()
    ts = now()

    # Container: lends its name and its timestamps to the investigation
    container = next(
        (o for o in objects if o.get("type") in ("report", "grouping")), None
    )
    inv_name = (container or {}).get("name") or fallback_name or "Imported investigation"
    inv_created = (container or {}).get("published") or (container or {}).get("created") or ts
    inv_updated = (container or {}).get("modified") or ts
    inv_description = (container or {}).get("description") or ""

    iid = new_id()
    db.execute(
        "INSERT INTO investigations VALUES (?, ?, ?, ?, ?)",
        (iid, inv_name, inv_description, inv_created, inv_updated),
    )

    # "Author" identities (created_by_ref): meta, not entities of the canvas
    author_refs = {o.get("created_by_ref") for o in objects if o.get("created_by_ref")}

    stix_to_local: dict[str, str] = {}
    entity_index = 0
    for obj in objects:
        stix_type = obj.get("type")
        stix_id = obj.get("id")
        if not stix_type or not stix_id:
            report.warnings.append("object without type or id skipped")
            continue
        if stix_type in ("bundle", "report", "grouping", "marking-definition",
                         "relationship", "note", "opinion", "extension-definition",
                         "language-content"):
            continue  # handled elsewhere, or meta
        # Our own tool identity, the one that signs the extension
        # definition: plumbing, not an identity the analyst put there.
        # Counting it would show "identity (author) x2" to someone
        # who only filled in one.
        if stix_id == TOOL_IDENTITY_ID:
            continue
        if stix_type == "identity" and stix_id in author_refs:
            report.skip("identity (author)")
            continue
        if stix_type not in SDO_TYPES | SCO_TYPES:
            report.skip(stix_type)
            continue

        if stix_type in SCO_TYPES:
            name = _sco_name(obj)
            if not name:
                report.warnings.append(f"{stix_type} {stix_id} without a usable value, skipped")
                continue
        else:
            name = obj.get("name")
            if not name:
                name = obj.get("pattern", stix_id)

        x, y, source = _layout(obj, entity_index)
        entity_index += 1
        local = new_id()
        stix_to_local[stix_id] = local
        # Triage tray (#12): an entity from a third-party bundle (no layout
        # extension of ours, so never curated in the tool) lands as a
        # candidate - nothing reaches the canvas without the analyst's say.
        curated = bool((obj.get("extensions") or {}).get(STIXIT_EXTENSION_ID))
        db.execute(
            """INSERT INTO entities
               (id, investigation_id, stix_type, name, properties, status, source,
                position_x, position_y, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                local, iid, stix_type, name, json.dumps(_entity_properties(obj)),
                "confirmed" if curated else "candidate",
                source, x, y,
                obj.get("created", ts), obj.get("modified", ts),
            ),
        )
        report.entities += 1
        if not curated:
            report.candidates += 1

    for obj in objects:
        if obj.get("type") != "relationship":
            continue
        src = stix_to_local.get(obj.get("source_ref"))
        tgt = stix_to_local.get(obj.get("target_ref"))
        if src is None or tgt is None:
            report.warnings.append(
                f"relationship {obj.get('relationship_type')} skipped:"
                " one end was not imported"
            )
            continue
        # deliberately not checked against the matrix: we do not lose data
        # from a third-party bundle, the matrix only guides creation
        db.execute(
            """INSERT INTO relationships
               (id, investigation_id, source_id, target_id, rel_type, description,
                start_time, stop_time, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                new_id(), iid, src, tgt,
                obj.get("relationship_type", "related-to"),
                obj.get("description", ""),
                obj.get("start_time"), obj.get("stop_time"),
                obj.get("created", ts),
            ),
        )
        report.relationships += 1

    for obj in objects:
        if obj.get("type") not in ("note", "opinion"):
            continue
        refs = obj.get("object_refs") or []
        entity_ref = next((stix_to_local[r] for r in refs if r in stix_to_local), None)
        if obj["type"] == "opinion":
            content = obj.get("explanation") or obj.get("opinion", "")
            opinion_value = obj.get("opinion")
            kind = "opinion"
        else:
            content = obj.get("content", "")
            opinion_value = None
            kind = "note"
        if not content:
            report.warnings.append(f"{obj['type']} {obj.get('id')} without content, skipped")
            continue
        db.execute(
            """INSERT INTO notes
               (id, investigation_id, entity_id, kind, content, opinion_value,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                new_id(), iid, entity_ref, kind, content, opinion_value,
                obj.get("created", ts), obj.get("modified", ts),
            ),
        )
        report.notes += 1

    if report.entities == 0:
        report.warnings.append("no importable entity in this bundle")
    if report.candidates > 0:
        report.warnings.append(
            f"{report.candidates} entity/entities placed in the triage tray"
            " (third-party bundle, validate before exporting)"
        )

    return iid, report
