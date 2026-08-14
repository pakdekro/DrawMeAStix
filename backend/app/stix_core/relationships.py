"""Matrix of the STIX 2.1 relationships allowed between object types.

Source: the "Relationships" tables of the STIX 2.1 spec (OASIS, section 4.x for
SDOs, 6.x for SROs), narrowed to the types Draw Me A STIX handles in v1.
The front end queries this matrix so that only legal relationships are offered
when an edge is created on the canvas.

Conventions:
- `related-to` is always offered as a last resort between two SDOs
  (the spec's common relationship), never put in the explicit matrix.
- `based-on` (indicator → SCO) and `resolves-to`/`belongs-to` (SCO → SCO)
  follow OpenCTI usage.
"""

from __future__ import annotations

SDO_TYPES = frozenset({
    "attack-pattern",
    "campaign",
    "identity",
    "indicator",
    "infrastructure",
    "intrusion-set",
    "location",
    "malware",
    "threat-actor",
    "tool",
    "vulnerability",
})

SCO_TYPES = frozenset({
    "ipv4-addr",
    "ipv6-addr",
    "domain-name",
    "url",
    "email-addr",
    "file",
    "autonomous-system",
    # Second batch: the observables of the spec whose identity rests on
    # properties of their own. The ones left out do so on purpose -
    # `email-message` and `network-traffic` derive their id from the id of
    # another object, and `process` has no contributing property at all, so
    # the spec gives it a random UUID and re-importing it would duplicate it.
    "mac-addr",
    "mutex",
    "directory",
    "software",
    "user-account",
    "x509-certificate",
})

ALL_TYPES = SDO_TYPES | SCO_TYPES

_NETWORK_SCOS = ("domain-name", "ipv4-addr", "ipv6-addr", "url")
_TARGETS = ("identity", "location", "vulnerability")
_USES = ("attack-pattern", "infrastructure", "malware", "tool")

# {source_type: {relationship_type: (target_types, ...)}}
MATRIX: dict[str, dict[str, tuple[str, ...]]] = {
    "attack-pattern": {
        "delivers": ("malware",),
        "targets": _TARGETS,
        "uses": ("malware", "tool"),
    },
    "campaign": {
        "attributed-to": ("intrusion-set", "threat-actor"),
        "compromises": ("infrastructure",),
        "originates-from": ("location",),
        "targets": _TARGETS,
        "uses": _USES,
    },
    "identity": {
        "located-at": ("location",),
    },
    "indicator": {
        "indicates": (
            "attack-pattern",
            "campaign",
            "infrastructure",
            "intrusion-set",
            "malware",
            "threat-actor",
            "tool",
        ),
        "based-on": tuple(sorted(SCO_TYPES)),
    },
    "infrastructure": {
        "communicates-with": ("infrastructure", *_NETWORK_SCOS),
        "consists-of": ("infrastructure", *sorted(SCO_TYPES)),
        "controls": ("infrastructure", "malware"),
        "delivers": ("malware",),
        "has": ("vulnerability",),
        "hosts": ("tool", "malware"),
        "located-at": ("location",),
        "uses": ("infrastructure",),
    },
    "intrusion-set": {
        "attributed-to": ("threat-actor",),
        "compromises": ("infrastructure",),
        "hosts": ("infrastructure",),
        "owns": ("infrastructure",),
        "originates-from": ("location",),
        "targets": _TARGETS,
        "uses": _USES,
    },
    "malware": {
        "authored-by": ("threat-actor", "intrusion-set"),
        "beacons-to": ("infrastructure",),
        "exfiltrates-to": ("infrastructure",),
        "communicates-with": _NETWORK_SCOS,
        "controls": ("malware",),
        "downloads": ("malware", "tool", "file"),
        "drops": ("malware", "tool", "file"),
        "exploits": ("vulnerability",),
        "originates-from": ("location",),
        "targets": _TARGETS,
        "uses": _USES,
        "variant-of": ("malware",),
    },
    "threat-actor": {
        "attributed-to": ("identity",),
        "compromises": ("infrastructure",),
        "hosts": ("infrastructure",),
        "owns": ("infrastructure",),
        "impersonates": ("identity",),
        "located-at": ("location",),
        "targets": _TARGETS,
        "uses": _USES,
    },
    "tool": {
        "delivers": ("malware",),
        "drops": ("malware",),
        "has": ("vulnerability",),
        "targets": _TARGETS,
    },
    # SCO → SCO (spec 2.1, relationship properties of the observables)
    "ipv4-addr": {
        "belongs-to": ("autonomous-system",),
    },
    "ipv6-addr": {
        "belongs-to": ("autonomous-system",),
    },
    "domain-name": {
        "resolves-to": ("ipv4-addr", "ipv6-addr", "domain-name"),
    },
}


def allowed_relationships(source_type: str, target_type: str) -> list[str]:
    """Legal relationship types between two object types.

    Returns an ordered list: specific relationships first,
    `related-to` last (always allowed between two SDOs).
    Empty list if either type is unknown.
    """
    if source_type not in ALL_TYPES or target_type not in ALL_TYPES:
        return []
    result = [
        rel
        for rel, targets in MATRIX.get(source_type, {}).items()
        if target_type in targets
    ]
    if source_type in SDO_TYPES and target_type in SDO_TYPES:
        result.append("related-to")
    return result
