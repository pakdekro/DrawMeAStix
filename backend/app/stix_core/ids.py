"""Deterministic STIX IDs - OpenCTI algorithm.

OpenCTI deduplicates through UUIDv5 computed over the "identifying" properties
of each type (JCS/RFC 8785 canonicalization, OASIS namespace reused by the
platform). Producing the same IDs guarantees that a re-imported Draw Me A STIX
bundle never creates duplicates on the OpenCTI side.

Recipes modelled on pycti (client-python); the test tests/test_stix_ids.py
compares every recipe against pycti's result and will break if OpenCTI changes
algorithm.

Observables (SCO) are not covered here: the `stix2` lib natively generates
their spec-compliant deterministic IDs, and OpenCTI takes them as they are.
"""

from __future__ import annotations

import datetime
import uuid

from stix2.canonicalization.Canonicalize import canonicalize

OPENCTI_NAMESPACE = uuid.UUID("00abedb4-aa42-466c-9c01-fed23315a9b7")


def _id(prefix: str, data: dict) -> str:
    payload = canonicalize(data, utf8=False)
    return f"{prefix}--{uuid.uuid5(OPENCTI_NAMESPACE, payload)}"


def _iso(value: str | datetime.datetime | None) -> str | None:
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    return value


def attack_pattern_id(name: str | None = None, x_mitre_id: str | None = None) -> str:
    mitre_id = x_mitre_id.lower().strip() if x_mitre_id is not None else ""
    if mitre_id:
        return _id("attack-pattern", {"x_mitre_id": mitre_id})
    if name is None:
        raise ValueError("name ou x_mitre_id requis")
    return _id("attack-pattern", {"name": name.lower().strip()})


def campaign_id(name: str) -> str:
    return _id("campaign", {"name": name.lower().strip()})


_HASH_PREFERENCE = ("MD5", "SHA-1", "SHA-256", "SHA-512")


def file_id(hashes: dict | None = None, name: str | None = None) -> str:
    """Deterministic ID of a file SCO, extensions left out.

    The spec counts `extensions` among the contributing properties of a
    file: letting stix2 generate the ID would pull in our layout extension
    (positions, local_id) - the ID would change on the slightest node move
    or on re-import. So we compute the ID on hashes/name only, with the
    same hash preference as the stix2 lib.
    """
    data: dict = {}
    if hashes:
        chosen = next((a for a in _HASH_PREFERENCE if a in hashes), None)
        if chosen is None:
            chosen = next(iter(hashes))
        data["hashes"] = {chosen: hashes[chosen]}
    if name is not None:
        data["name"] = name
    if not data:
        raise ValueError("file : hashes ou name requis")
    return _id("file", data)


def grouping_id(name: str, context: str, created: str | datetime.datetime | None = None) -> str:
    data: dict = {"name": name.lower().strip(), "context": context.lower().strip()}
    if (created := _iso(created)) is not None:
        data["created"] = created
    return _id("grouping", data)


def identity_id(name: str, identity_class: str) -> str:
    return _id(
        "identity",
        {"name": name.lower().strip(), "identity_class": identity_class.lower()},
    )


def indicator_id(pattern: str) -> str:
    return _id("indicator", {"pattern": pattern.strip()})


def infrastructure_id(name: str) -> str:
    return _id("infrastructure", {"name": name.lower().strip()})


def intrusion_set_id(name: str) -> str:
    return _id("intrusion-set", {"name": name.lower().strip()})


def location_id(
    name: str,
    location_type: str,
    latitude: float | None = None,
    longitude: float | None = None,
) -> str:
    if location_type == "Position" and (latitude is not None or longitude is not None):
        data = {}
        if latitude is not None:
            data["latitude"] = latitude
        if longitude is not None:
            data["longitude"] = longitude
    elif location_type == "Position":
        data = {"name": name.lower().strip()}
    else:
        data = {"name": name.lower().strip(), "x_opencti_location_type": location_type}
    return _id("location", data)


def malware_id(name: str) -> str:
    return _id("malware", {"name": name.lower().strip()})


def note_id(content: str, created: str | datetime.datetime | None = None) -> str:
    data: dict = {"content": content.strip()}
    if (created := _iso(created)) is not None:
        data["created"] = created
    return _id("note", data)


def opinion_id(opinion: str, created: str | datetime.datetime | None = None) -> str:
    data: dict = {"opinion": opinion.strip()}
    if (created := _iso(created)) is not None:
        data["created"] = created
    return _id("opinion", data)


def report_id(name: str, published: str | datetime.datetime) -> str:
    return _id("report", {"name": name.lower().strip(), "published": _iso(published)})


def threat_actor_group_id(name: str) -> str:
    return _id(
        "threat-actor",
        {"name": name.lower().strip(), "opencti_type": "Threat-Actor-Group"},
    )


def threat_actor_individual_id(name: str) -> str:
    return _id(
        "threat-actor",
        {"name": name.lower().strip(), "opencti_type": "Threat-Actor-Individual"},
    )


def tool_id(name: str) -> str:
    return _id("tool", {"name": name.lower().strip()})


def vulnerability_id(name: str) -> str:
    return _id("vulnerability", {"name": name.lower().strip()})


def relationship_id(
    relationship_type: str,
    source_ref: str,
    target_ref: str,
    start_time: str | datetime.datetime | None = None,
    stop_time: str | datetime.datetime | None = None,
) -> str:
    data = {
        "relationship_type": relationship_type,
        "source_ref": source_ref,
        "target_ref": target_ref,
    }
    start_time, stop_time = _iso(start_time), _iso(stop_time)
    # pycti includes stop_time only when start_time is present too
    if start_time is not None:
        data["start_time"] = start_time
        if stop_time is not None:
            data["stop_time"] = stop_time
    return _id("relationship", data)
