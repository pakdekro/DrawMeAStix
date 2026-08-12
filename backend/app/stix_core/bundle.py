"""Building the STIX 2.1 bundle of an investigation.

Principles:
- Deterministic OpenCTI-style IDs (stix_core.ids) for the SDO/SRO, the
  stix2 library's own spec-compliant IDs for the SCO → no duplicates on
  import, neither on the platform nor between two exports.
- Reproducible export: created/modified/published come from the timestamps
  in the database, never from the clock - two exports of the same state give
  the same bundle byte for byte, which is what makes the version fingerprint
  trustworthy.
- The canvas layout (positions, local id, source) rides in a per-object
  extension (STIXIT_EXTENSION_ID). OpenCTI keeps it without understanding
  it; the Draw Me A STIX import (#6) reads it to restore the canvas.
- Only `confirmed` entities are exported: the triage tray never leaks into
  the intel.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from typing import Any

import stix2
from stix2.canonicalization.Canonicalize import canonicalize
from stix2.utils import format_datetime, parse_into_datetime

from app.stix_core import ids

# Fixed UUID (picked once and for all) naming the Draw Me A STIX extension.
STIXIT_EXTENSION_ID = "extension-definition--4a3b8e1c-6f2d-4b9a-8c5e-1d2f3a4b5c6d"

# FROZEN timestamp of the extension definition: it describes the format, not
# the investigation. Setting it to the export time would change the file on
# every click, when two exports of the same state must give back the same
# bytes.
_EXTENSION_CREATED = "2024-11-15T09:00:00.000Z"

# `schema` is mandatory (OASIS schemas) and the spec accepts "either a URL
# or plain text explaining the definition". We pick the text: a URL would
# send a hosting address travelling in every bundle an analyst exports, and
# it could stop answering long afterwards.
_EXTENSION_SCHEMA_TEXT = (
    "Canvas layout only. Adds position_x and position_y (numbers), local_id "
    "and source (strings) to an object, recording where it sat on the Draw Me "
    "A STIX canvas and where it came from. Carries no intelligence: a consumer "
    "can ignore this extension without losing anything."
)


_TOOL_IDENTITY_NAME = "Draw Me A STIX"
_TOOL_IDENTITY_CLASS = "system"

# Identity of the TOOL, distinct from the analyst: the spec makes
# created_by_ref mandatory on extension-definition, and it is the software
# that defines this format, not the person filling the canvas. The id goes
# through the same deterministic computation as the other identities: two
# exports, two machines, two analysts produce the same one.
TOOL_IDENTITY_ID = ids.identity_id(_TOOL_IDENTITY_NAME, _TOOL_IDENTITY_CLASS)

# Plumbing objects: shipped with the bundle so it can be interpreted, but
# never counted as investigation content.
_TOOLING_IDS = frozenset({STIXIT_EXTENSION_ID, TOOL_IDENTITY_ID})


def _push_unique(objects: list[Any], seen_ids: set[str], obj: Any) -> bool:
    """Adds the object if it is new. False if it doubles an id already emitted."""
    if obj.id in seen_ids:
        return False
    seen_ids.add(obj.id)
    objects.append(obj)
    return True


def _tooling_objects() -> list[dict[str, Any]]:
    """Layout extension definition and its identity, to ship with the bundle.

    Without them a consumer gets, on every object, an `extensions` key
    pointing at an identifier it cannot resolve. The spec wants the
    definition to travel with the objects that use it; we put it at the head
    of the bundle, ahead of any object referencing it.
    """
    return [
        {
            "type": "identity",
            "spec_version": "2.1",
            "id": TOOL_IDENTITY_ID,
            "created": _EXTENSION_CREATED,
            "modified": _EXTENSION_CREATED,
            "name": _TOOL_IDENTITY_NAME,
            "identity_class": _TOOL_IDENTITY_CLASS,
        },
        {
            "type": "extension-definition",
            "spec_version": "2.1",
            "id": STIXIT_EXTENSION_ID,
            "created_by_ref": TOOL_IDENTITY_ID,
            "created": _EXTENSION_CREATED,
            "modified": _EXTENSION_CREATED,
            "name": "Draw Me A STIX layout",
            "description": "Node positions on the DMAS canvas (ignored by other tools).",
            "schema": _EXTENSION_SCHEMA_TEXT,
            "version": "1.0",
            "extension_types": ["property-extension"],
        },
    ]

TLP_MARKINGS = {
    "clear": stix2.TLP_WHITE,
    "white": stix2.TLP_WHITE,
    "green": stix2.TLP_GREEN,
    "amber": stix2.TLP_AMBER,
    "red": stix2.TLP_RED,
}

# Fixed emission order of the marking-definitions: the bundle stays identical
# whatever order the entities referencing them were created in.
_TLP_ORDER = (stix2.TLP_WHITE, stix2.TLP_GREEN, stix2.TLP_AMBER, stix2.TLP_RED)

# Property keys the builder consumes, not to be forwarded as such into the
# STIX object. pattern_type/valid_from: set by the builder itself, an
# imported indicator carries them in its properties (roundtrip).
# tlp/confidence: handled explicitly (per-object marking, precedence).
_INTERNAL_KEYS = {
    "id", "type", "spec_version", "created", "modified",
    "identity_class", "location_type", "x_mitre_id", "pattern",
    "pattern_type", "valid_from",
    "hashes", "file_name", "actor_kind", "country", "region",
    "latitude", "longitude", "published", "is_family", "number", "as_name",
    "tlp", "confidence",
}

# Mirror of TEMPORAL_PROPS on the TS side: the only props fields whose
# serialised shape matters, so the only ones to normalise.
_TEMPORAL_PROPS = frozenset({"first_seen", "last_seen", "valid_from", "valid_until"})


def _confidence(value: Any) -> int | None:
    """Valid STIX confidence (integer 0-100), else None: we emit nothing."""
    if value is None or isinstance(value, bool):
        return None
    try:
        conf = int(value)
    except (TypeError, ValueError):
        return None
    return conf if 0 <= conf <= 100 else None


def _is_blank(value: Any) -> bool:
    """An "empty" field is never exported: on the OpenCTI side it could wipe an
    existing value on merge without bringing anything (non destructive interop).
    """
    return value is None or value == "" or value == [] or value == {}


def _with_external_ref(extra: dict, source_name: str, external_id: str) -> list[dict]:
    """External references of the object + the builder's, no duplicate (roundtrip)."""
    refs = list(extra.get("external_references", []))
    if not any(
        r.get("source_name") == source_name and r.get("external_id") == external_id
        for r in refs
    ):
        refs.append({"source_name": source_name, "external_id": external_id})
    return refs


_DATE_ONLY = re.compile(r"\d{4}-\d{2}-\d{2}")


def _stix_time(value: str | None) -> str | None:
    """Normalises a timestamp the way stix2 will serialise it (ANY precision).

    Properties with no imposed precision (start_time, stop_time, published)
    lose their zero milliseconds on serialisation: any ID computed on them
    must be computed on the serialised form, otherwise the roundtrip
    export → import → export changes ID.
    """
    if value is None:
        return None
    # A day-only entry ("2026-03-14") is what an <input type=date> gives back.
    # `parse_into_datetime` refuses it, where the TS builder's `new Date()`
    # reads it as UTC midnight: without this normalisation the two builders
    # diverge, and on the Python side the export fails on a stix2 message that
    # does not name the cause.
    if _DATE_ONLY.fullmatch(value):
        value = f"{value}T00:00:00Z"
    return format_datetime(parse_into_datetime(value))


def _ms_time(value: str) -> str:
    """Normalises a timestamp to millisecond precision, as stix2 serialises
    created/modified. Note/opinion IDs are computed on it (and not on the raw
    form), otherwise a second-precision timestamp breaks the fingerprint
    roundtrip.
    """
    return format_datetime(parse_into_datetime(value, precision="millisecond"))


class ExportError(Exception):
    """Blocking export error, with the list of problems encountered."""

    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("; ".join(problems))


def _load(db: sqlite3.Connection, iid: str) -> tuple[sqlite3.Row, list, list, list]:
    inv = db.execute("SELECT * FROM investigations WHERE id = ?", (iid,)).fetchone()
    entities = db.execute(
        "SELECT * FROM entities WHERE investigation_id = ? AND status = 'confirmed'"
        " ORDER BY created_at",
        (iid,),
    ).fetchall()
    relationships = db.execute(
        "SELECT * FROM relationships WHERE investigation_id = ? ORDER BY created_at", (iid,)
    ).fetchall()
    notes = db.execute(
        "SELECT * FROM notes WHERE investigation_id = ? ORDER BY created_at", (iid,)
    ).fetchall()
    return inv, entities, relationships, notes


def _layout_extension(entity: sqlite3.Row) -> dict[str, Any]:
    # names >= 3 characters: the spec (§3.3) imposes 3-250 chars on custom
    # properties - "x"/"y" would be rejected by the OASIS schemas
    return {
        STIXIT_EXTENSION_ID: {
            "extension_type": "property-extension",
            "local_id": entity["id"],
            "position_x": entity["position_x"],
            "position_y": entity["position_y"],
            "source": entity["source"],
        }
    }


def _sdo_id(stix_type: str, name: str, props: dict) -> str:
    """Deterministic ID of a canvas entity (SCO/indicator excluded, handled apart)."""
    match stix_type:
        case "attack-pattern":
            return ids.attack_pattern_id(name, props.get("x_mitre_id"))
        case "campaign":
            return ids.campaign_id(name)
        case "identity":
            return ids.identity_id(name, props.get("identity_class", "organization"))
        case "infrastructure":
            return ids.infrastructure_id(name)
        case "intrusion-set":
            return ids.intrusion_set_id(name)
        case "location":
            return ids.location_id(
                name,
                props.get("location_type", "Country"),
                props.get("latitude"),
                props.get("longitude"),
            )
        case "malware":
            return ids.malware_id(name)
        case "threat-actor":
            if props.get("actor_kind") == "individual":
                return ids.threat_actor_individual_id(name)
            return ids.threat_actor_group_id(name)
        case "tool":
            return ids.tool_id(name)
        case "vulnerability":
            return ids.vulnerability_id(name)
    raise ValueError(f"unsupported type: {stix_type}")


_SCO_INTERNAL_KEYS = frozenset(
    {"value", "number", "as_name", "hashes", "file_name", "tlp", "confidence"}
)


def _custom_sco_props(props: dict) -> tuple[dict, list[str]]:
    """Properties of a third-party observable: re-emitted if `x_`, else reported.

    Only CUSTOM properties come back. A STIX property we do not model is
    often a reference (`resolves_to_refs`) pointing at identifiers absent
    from the bundle: re-emitting it would manufacture dangling references,
    worse than the loss we are fixing.
    """
    kept, dropped = {}, []
    for k, v in props.items():
        if k in _SCO_INTERNAL_KEYS or _is_blank(v):
            continue
        if k.startswith("x_"):
            kept[k] = v
        else:
            dropped.append(k)
    return kept, dropped


def _build_sco(entity: sqlite3.Row, props: dict, marking: str | None = None) -> Any:
    value = entity["name"].strip()
    ext = _layout_extension(entity)
    # `object_marking_refs` only: the 2.1 spec allows marking on a SCO, but
    # not `created_by_ref`.
    common: dict[str, Any] = {"extensions": ext, "allow_custom": True}
    if marking is not None:
        common["object_marking_refs"] = [marking]
    common.update(_custom_sco_props(props)[0])
    match entity["stix_type"]:
        case "ipv4-addr":
            return stix2.IPv4Address(value=value, **common)
        case "ipv6-addr":
            return stix2.IPv6Address(value=value, **common)
        case "domain-name":
            return stix2.DomainName(value=value, **common)
        case "url":
            return stix2.URL(value=value, **common)
        case "email-addr":
            return stix2.EmailAddress(value=value, **common)
        case "autonomous-system":
            number = props.get("number")
            if number is None:
                digits = "".join(c for c in value if c.isdigit())
                if not digits:
                    raise ExportError([f'autonomous-system "{value}": AS number not found'])
                number = int(digits)
            return stix2.AutonomousSystem(number=number, name=props.get("as_name"), **common)
        case "file":
            hashes = props.get("hashes") or {}
            file_name = props.get("file_name")
            if not hashes and not file_name:
                file_name = value
            return stix2.File(
                id=ids.file_id(hashes or None, file_name),
                name=file_name,
                hashes=hashes or None,
                **common,
            )
    raise ValueError(f"unsupported SCO: {entity['stix_type']}")


def _build_sdo(
    entity: sqlite3.Row,
    props: dict,
    common: dict[str, Any],
) -> Any:
    """Builds the stix2 SDO of a confirmed canvas entity."""
    stix_type = entity["stix_type"]
    name = entity["name"].strip()
    # The date fields accept a day-only entry ("2026-03-14") in the form; the
    # spec wants a timestamp. The TS builder normalised, this one did not: a
    # day-only date made stix2 raise ("must be a datetime object, date object,
    # or timestamp string in a recognizable format"). A divergence no golden
    # vector covered, the fixture carrying only full timestamps.
    extra = {
        k: (_stix_time(str(v)) if k in _TEMPORAL_PROPS else v)
        for k, v in props.items()
        if k not in _INTERNAL_KEYS and not _is_blank(v)
    }
    kwargs: dict[str, Any] = {
        "name": name,
        **extra,
        **common,
        "extensions": _layout_extension(entity),
        "allow_custom": True,
    }

    if stix_type == "indicator":
        pattern = (props.get("pattern") or "").strip()
        if not pattern:
            raise ExportError(
                [f'indicator "{name}": `pattern` property required for export']
            )
        # `valid_from` as entered by the analyst (#170), the creation date being
        # only a fallback. The TS builder already did it; here the entered value
        # was ignored, and no golden vector covered that case - so the oracle
        # could not flag the divergence.
        raw_valid_from = props.get("valid_from")
        valid_from = _stix_time(
            raw_valid_from
            if isinstance(raw_valid_from, str) and raw_valid_from.strip()
            else entity["created_at"]
        )
        indicator = stix2.Indicator(
            id=ids.indicator_id(pattern),
            pattern=pattern,
            pattern_type="stix",
            valid_from=valid_from,
            **kwargs,
        )
        # No explicit guard on `valid_until <= valid_from` here: stix2 already
        # imposes it at construction ("must be greater than"), and doubling it
        # would give code nothing ever reaches. The TS builder has no library to
        # do it in its place, so it carries the check itself, with a message
        # telling the analyst where the fallback date comes from.
        return indicator

    kwargs["id"] = _sdo_id(stix_type, name, props)
    match stix_type:
        case "attack-pattern":
            if props.get("x_mitre_id"):
                kwargs["external_references"] = _with_external_ref(
                    kwargs, "mitre-attack", props["x_mitre_id"]
                )
            return stix2.AttackPattern(**kwargs)
        case "campaign":
            return stix2.Campaign(**kwargs)
        case "identity":
            return stix2.Identity(
                identity_class=props.get("identity_class", "organization"), **kwargs
            )
        case "infrastructure":
            return stix2.Infrastructure(**kwargs)
        case "intrusion-set":
            return stix2.IntrusionSet(**kwargs)
        case "location":
            geo = {
                k: props[k]
                for k in (
                    "country",
                    "region",
                    "latitude",
                    "longitude",
                    "city",
                    "administrative_area",
                )
                if k in props and not _is_blank(props[k])
            }
            # The spec imposes at least ONE of these three forms. `city` and
            # `administrative_area` refine the place without satisfying it.
            situe = (
                "country" in geo
                or "region" in geo
                or ("latitude" in geo and "longitude" in geo)
            )
            if not situe:
                # We refuse rather than invent. The original fallback copied the
                # NAME into `region`, a normalised vocabulary: a city came back
                # out as a region of the world.
                raise ExportError(
                    [
                        f'location "{name}": give a country code, a region, or both '
                        "coordinates - the spec requires one of the three"
                    ]
                )
            return stix2.Location(
                x_opencti_location_type=props.get("location_type", "Country"), **geo, **kwargs
            )
        case "malware":
            return stix2.Malware(is_family=bool(props.get("is_family", False)), **kwargs)
        case "threat-actor":
            return stix2.ThreatActor(**kwargs)
        case "tool":
            return stix2.Tool(**kwargs)
        case "vulnerability":
            if name.upper().startswith("CVE-"):
                kwargs["external_references"] = _with_external_ref(
                    kwargs, "cve", name.upper()
                )
            return stix2.Vulnerability(**kwargs)
    raise ValueError(f"unsupported type: {stix_type}")


def build_bundle(db: sqlite3.Connection, iid: str, opts) -> tuple[dict, str, list[str]]:
    """Builds the bundle of an investigation.

    Returns (bundle_dict, fingerprint, warnings). Raises ExportError if some
    confirmed entities cannot be exported as they stand.
    """
    inv, entities, relationships, notes = _load(db, iid)
    warnings: list[str] = []
    problems: list[str] = []

    # The export TLP applies to the whole bundle; an entity can carry its own
    # (props["tlp"]) which wins for that entity alone. Every definition used is
    # embedded.
    used_marking_ids: set[str] = set()
    if opts.tlp != "none":
        used_marking_ids.add(TLP_MARKINGS[opts.tlp].id)

    author = None
    if opts.author_name:
        author = stix2.Identity(
            id=ids.identity_id(opts.author_name, opts.author_class),
            name=opts.author_name,
            identity_class=opts.author_class,
            created=inv["created_at"],
            modified=inv["created_at"],
        )

    common_base: dict[str, Any] = {}
    if author is not None:
        common_base["created_by_ref"] = author.id
    if opts.tlp != "none":
        common_base["object_marking_refs"] = [TLP_MARKINGS[opts.tlp].id]
    # Export confidence: applied to every object that does not already carry
    # one. It is what decides, on the OpenCTI side, whether this curation may
    # update an existing field (merge gated by confidence).
    default_confidence = _confidence(getattr(opts, "confidence", None))
    if default_confidence is not None:
        common_base["confidence"] = default_confidence

    # Entities
    objects: list[Any] = []
    # The identifiers are DETERMINISTIC: two distinct canvas nodes can perfectly
    # well land on the same one (two techniques carrying the same x_mitre_id,
    # two relationships of the same type between the same ends). Unchecked, the
    # bundle went out with two objects sharing an `id` and an `object_refs` that
    # repeated it. Neither the lint nor the OASIS validation can see it: the
    # second assertion vanished at ingestion.
    seen_ids: set[str] = set()
    local_to_stix: dict[str, str] = {}
    for entity in entities:
        props = json.loads(entity["properties"])
        try:
            # The entity's own marking, which wins over the export's.
            tlp = props.get("tlp")
            own_marking = None
            if tlp in TLP_MARKINGS:
                own_marking = TLP_MARKINGS[tlp].id
                used_marking_ids.add(own_marking)

            if entity["stix_type"] in ("ipv4-addr", "ipv6-addr", "domain-name", "url",
                                       "email-addr", "file", "autonomous-system"):
                # Observables carry their marking, and IT ALONE: the 2.1 spec
                # does not allow `created_by_ref` on a SCO.
                #
                # They used to carry none, on the grounds that the container
                # took care of it. Checked on OpenCTI (#210): a platform that
                # ingests objects one by one propagates nothing, and an IP
                # exported as TLP:RED arrived there unmarked.
                marking = own_marking
                if marking is None and opts.tlp in TLP_MARKINGS:
                    marking = TLP_MARKINGS[opts.tlp].id
                obj = _build_sco(entity, props, marking)
                # What we do not re-emit gets said: without this message, an
                # observable enriched elsewhere got poorer on every roundtrip
                # with nobody noticing.
                _, dropped_props = _custom_sco_props(props)
                if dropped_props:
                    warnings.append(
                        f'{entity["stix_type"]} "{entity["name"]}": '
                        f'{", ".join(dropped_props)} not re-exported (property not '
                        "modelled here; a reference would point outside this bundle)"
                    )
            else:
                entity_common = {
                    **common_base,
                    "created": entity["created_at"],
                    "modified": entity["updated_at"],
                }
                conf = _confidence(props.get("confidence"))
                if conf is not None:
                    entity_common["confidence"] = conf
                if own_marking is not None:
                    entity_common["object_marking_refs"] = [own_marking]
                obj = _build_sdo(entity, props, entity_common)
        except ExportError as exc:
            problems.extend(exc.problems)
            continue
        except Exception as exc:  # stix2 error: invalid property, etc.
            problems.append(f'{entity["stix_type"]} "{entity["name"]}": {exc}')
            continue
        # The mapping is recorded in ALL cases, even when the object is a
        # duplicate: the relationships leaving the second node must stay
        # valid.
        local_to_stix[entity["id"]] = obj.id
        if not _push_unique(objects, seen_ids, obj):
            warnings.append(
                f'{entity["stix_type"]} "{entity["name"]}" collapses onto an object '
                f"already exported ({obj.id}): identical STIX identity, so only the "
                "first one is written. Merge the two on the canvas to keep both "
                "descriptions."
            )

    if problems:
        raise ExportError(problems)

    # Relationships
    for rel in relationships:
        src = local_to_stix.get(rel["source_id"])
        tgt = local_to_stix.get(rel["target_id"])
        if src is None or tgt is None:
            warnings.append(
                f"relationship {rel['rel_type']} skipped: one end is not exported"
                " (candidate entity?)"
            )
            continue
        relationship = stix2.Relationship(
            id=ids.relationship_id(
                rel["rel_type"], src, tgt,
                _stix_time(rel["start_time"]), _stix_time(rel["stop_time"]),
            ),
            relationship_type=rel["rel_type"],
            source_ref=src,
            target_ref=tgt,
            description=rel["description"] or None,
            start_time=rel["start_time"],
            stop_time=rel["stop_time"],
            created=rel["created_at"],
            modified=rel["created_at"],
            allow_custom=True,
            **common_base,
        )
        if not _push_unique(objects, seen_ids, relationship):
            warnings.append(
                f'relationship "{rel["rel_type"]}" is a duplicate of one already '
                f"exported ({relationship.id}): same type, same ends, same time "
                "window. Only the first one is written, so its description is the "
                "one that travels."
            )

    # Container (built before the notes: an investigation note references it)
    note_objects: list[Any] = []
    if opts.container == "report":
        container_id = ids.report_id(inv["name"], _stix_time(inv["created_at"]))
    else:
        container_id = ids.grouping_id(inv["name"], "suspicious-activity")

    if opts.include_notes:
        for note in notes:
            refs = []
            if note["entity_id"] is not None:
                stix_ref = local_to_stix.get(note["entity_id"])
                if stix_ref is None:
                    warnings.append("note skipped: its entity is not exported")
                    continue
                refs = [stix_ref]
            else:
                refs = [container_id]
            note_common = {
                **common_base,
                "created": note["created_at"],
                "modified": note["updated_at"],
                "object_refs": refs,
                "allow_custom": True,
            }
            if note["kind"] == "opinion":
                note_objects.append(
                    stix2.Opinion(
                        id=ids.opinion_id(note["opinion_value"], _ms_time(note["created_at"])),
                        opinion=note["opinion_value"],
                        explanation=note["content"],
                        **note_common,
                    )
                )
            else:
                note_objects.append(
                    stix2.Note(
                        id=ids.note_id(note["content"], _ms_time(note["created_at"])),
                        content=note["content"],
                        **note_common,
                    )
                )
    for note_obj in note_objects:
        # Two notes with the same content and the same created_at land on the
        # same id: same silent handling, they carry nothing more.
        _push_unique(objects, seen_ids, note_obj)
    # `objects` holds no duplicate by construction: the list is therefore
    # already deduplicated, and it keeps the emission order - which a Python
    # `set` would not, at the cost of the bundle's determinism.
    container_refs = [o.id for o in objects]

    if not container_refs:
        raise ExportError(["empty investigation: nothing to export"])

    container_common = {
        **common_base,
        "created": inv["created_at"],
        "modified": inv["updated_at"],
        "allow_custom": True,
    }
    if inv["description"]:
        container_common["description"] = inv["description"]
    if opts.container == "report":
        container = stix2.Report(
            id=container_id,
            name=inv["name"],
            published=inv["created_at"],
            report_types=["threat-report"],
            object_refs=container_refs,
            **container_common,
        )
    else:
        container = stix2.Grouping(
            id=container_id,
            name=inv["name"],
            context="suspicious-activity",
            object_refs=container_refs,
            **container_common,
        )

    markings = [m for m in _TLP_ORDER if m.id in used_marking_ids]
    all_objects = [*([author] if author else []), *markings, *objects, container]
    bundle = stix2.Bundle(objects=all_objects, allow_custom=True)
    bundle_dict = json.loads(bundle.serialize())
    # At the head, ahead of any object referencing it. Unconditional: an empty
    # export already raises (ExportError), so there is always at least one
    # entity carrying the extension. A spare definition would be harmless
    # anyway, where a missing definition is the defect we are fixing.
    bundle_dict["objects"][:0] = _tooling_objects()

    return bundle_dict, fingerprint(bundle_dict), warnings


def fingerprint(bundle_dict: dict) -> str:
    """Version fingerprint: canonical hash of the content, canvas layout aside.

    Two analysts compare their fingerprints to know whether they are looking
    at the same state of the investigation; moving nodes does not change it.
    """
    stripped = []
    for obj in bundle_dict.get("objects", []):
        # The plumbing describes the layout, it is not content: including it
        # would flip in one go the fingerprint of every already exported
        # investigation, and they would show up as modified without anyone
        # having touched them.
        if obj.get("id") in _TOOLING_IDS:
            continue
        obj = dict(obj)
        extensions = dict(obj.get("extensions", {}))
        extensions.pop(STIXIT_EXTENSION_ID, None)
        if extensions:
            obj["extensions"] = extensions
        else:
            obj.pop("extensions", None)
        stripped.append(obj)
    stripped.sort(key=lambda o: o["id"])
    payload = canonicalize({"objects": stripped}, utf8=True)
    return "sha256:" + hashlib.sha256(payload).hexdigest()
