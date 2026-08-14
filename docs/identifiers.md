# How identifiers are computed

Draw Me A STIX does not draw random identifiers. Every object it exports carries
a UUID version 5 derived from that object's own properties. This document says
exactly how, so that anybody can recompute one and check it against ours rather
than take our word for it.

If you only want to know what this changes for you as an analyst, the short
version lives at [`/about`](https://app.drawmeastix.io/about#identifiers).

## The rule in one paragraph

Take the identifying properties of the object. Normalise them. Serialise that
object with [JCS, RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), the
canonical JSON form that guarantees one and only one byte sequence for a given
value. Hash it into a UUIDv5 under the namespace
`00abedb4-aa42-466c-9c01-fed23315a9b7`. Prefix it with the STIX type.

```
identifier = "<stix-type>--" + uuid5(NAMESPACE, jcs(identifying_properties))
```

## Why this, and not what the specification says

For **observables** (SCO), this *is* what STIX 2.1 prescribes, in section 2.9.
Nothing surprising happens there.

For **objects** (SDO), the specification says the identifier should be a random
UUIDv4. We deliberately depart from it, and reproduce the scheme OpenCTI uses on
its side, because the departure is the whole point: an identifier that follows
the properties makes a re-import an update rather than a duplication. Two
analysts on two machines, sharing no server, produce the same identifier for the
same malware, and their bundles merge instead of piling up.

The namespace is the one STIX 2.1 defines for observables. OpenCTI reuses it for
its objects too, so there is a single namespace for everything.

## What counts as identifying, type by type

Only the properties listed here enter the hash. Everything else about an object,
including its description, its dates and its markings, can change without
changing its identifier.

Unless stated otherwise, a text value is **lowercased and trimmed** before
hashing, so `  Cobalt Strike  ` and `cobalt strike` collapse onto the same
identifier.

### Objects

| Type | Identifying properties | Notes |
|---|---|---|
| `attack-pattern` | `x_mitre_id`, else `name` | the ATT&CK id wins when present, so two spellings of the same technique meet |
| `campaign` | `name` | |
| `grouping` | `name`, `context`, `created` | `created` only when set |
| `identity` | `name`, `identity_class` | `identity_class` is lowercased, not trimmed |
| `indicator` | `pattern` | trimmed, **not** lowercased: a pattern is code |
| `infrastructure` | `name` | |
| `intrusion-set` | `name` | |
| `location` | see below | |
| `malware` | `name` | |
| `note` | `content`, `created` | trimmed, not lowercased; `created` only when set |
| `opinion` | `opinion`, `created` | same |
| `report` | `name`, `published` | |
| `threat-actor` | `name` + `opencti_type` | `Threat-Actor-Group` or `Threat-Actor-Individual`, so a group and a person of the same name stay distinct |
| `tool` | `name` | |
| `vulnerability` | `name` | |
| `relationship` | `relationship_type`, `source_ref`, `target_ref`, and `start_time`/`stop_time` when set | `stop_time` only enters if `start_time` does, which mirrors pycti |

`location` has three shapes, because a point on a map and a country are not the
same claim:

- a position with coordinates: `latitude` and `longitude`, whichever are set;
- a position without coordinates: `name`;
- anything else: `name` and `x_opencti_location_type`.

### Observables

The contributing properties come from the `stix2` library's own definitions:

| Type | Contributing properties |
|---|---|
| `autonomous-system` | `number` |
| `directory` | `path` |
| `domain-name` | `value` |
| `email-addr` | `value` |
| `file` | `hashes`, `name`, `parent_directory_ref`, `extensions` |
| `ipv4-addr` | `value` |
| `ipv6-addr` | `value` |
| `mac-addr` | `value` |
| `mutex` | `name` |
| `software` | `name`, `cpe`, `swid`, `vendor`, `version` |
| `url` | `value` |
| `user-account` | `account_type`, `user_id`, `account_login` |
| `x509-certificate` | `hashes`, `serial_number` |

Three observables of the spec are missing from that table, and on purpose.
`email-message` and `network-traffic` derive their identifier from the
identifier of another object (`from_ref`, `src_ref`, `dst_ref`), so they cannot
be created on their own the way a node is dropped on a canvas. `process` has no
contributing property at all: the spec gives it a random UUID, so re-importing
one would create a second, which is the one thing this whole page exists to
prevent.

Observable values go in as given, with a single exception: a MAC address is
lowercased. The OASIS schema accepts no other form, so an address typed in
capitals would have its identifier computed on a form the export could never
carry.

A `x509-certificate` has no `name` in the spec, so the node name stands in for
whichever of the two identifying fields was left empty: read as a fingerprint
when it is hexadecimal and of a hash's length, as the serial number otherwise.
Anything typed in the fields wins over that reading.

When a file carries several hashes, exactly one enters the identifier, chosen in
the order `MD5`, `SHA-1`, `SHA-256`, `SHA-512`, and falling back to the first
one present if none of those are. That order is not ours; it is what `stix2`
does, and matching it is the point.

## Checking it yourself

Two implementations exist and they are kept in lockstep: a Python one in
`backend/app/stix_core/ids.py`, and the TypeScript one that actually runs in
your browser, in `frontend/src/stix/ids.ts`.

The Python side is the oracle. Its own tests compare each recipe against
[pycti](https://github.com/OpenCTI-Platform/client-python), OpenCTI's official
client, so the day OpenCTI changes its algorithm, our tests break rather than
our users' imports.

The TypeScript side is locked to the Python side by **41 golden vectors** for
objects and a further set for observables, in
`frontend/src/stix/golden-vectors.json`. That file is generated, never edited by
hand:

```sh
cd backend
uv run python scripts/generate_golden_vectors.py
```

Continuous integration regenerates it and fails if the result differs from what
is committed, so the two implementations cannot drift apart quietly.

A vector is a case you can reproduce in any language:

```json
{
  "fn": "attack_pattern_id",
  "args": { "x_mitre_id": "T1566" },
  "expected": "attack-pattern--d041e624-3991-5138-9544-d3ba2ce68ff7"
}
```

## What this costs

Determinism has a price, and it is worth naming.

**Renaming creates a second object.** The identifier follows the properties, so
correcting a typo in a malware name, or fixing a hash, produces a different
identifier. Exported again, the receiving platform sees a new object next to the
old one rather than a rename. Cheap on the canvas, not cheap downstream.

**An identifier is a stable fingerprint of the value.** It cannot be reversed,
but it can be recomputed. Somebody who already suspects that a bundle concerns a
given address can hash that address and look for the result. If you share a
bundle you believe is stripped of its observables, its identifiers still answer
yes or no to a guess.
