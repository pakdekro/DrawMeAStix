"""Distills MITRE ATLAS (adversary behaviour against AI systems) into a palette dataset.

Source: the NATIVE ATLAS file, as for F3, and for a different reason. ATLAS
publishes a STIX bundle too, through `atlas-navigator-data`, but that bundle
trails the data repository (170 techniques against 178 at the time of writing)
and it is the data repository that MITRE releases. The native file also carries
two things the bundle drops: the order of the tactics in the matrix, and the
ATT&CK technique each ATLAS technique was adapted from.

ATLAS does NOT reuse ATT&CK identifiers, which is the whole difference with F3
and it removes most of the work: every technique here is an `AML.T####` of its
own, and the 37 that adapt an ATT&CK technique merely point at it. No
arbitration, no name to take back, no risk of two cards for one identifier. The
adaptation is kept in the dataset because it is worth reading, and it is NOT
turned into an ATT&CK reference at export: MITRE's own bundle does not claim
one, and an ATLAS technique is not the ATT&CK technique it was inspired by.

What is deliberately left out: the 37 mitigations (STIX `course-of-action`, an
object this canvas does not carry) and the 68 case studies (not a STIX object
at all). The framework page says so rather than the omission being discovered.

Versioning follows MITRE's own pointers instead of a pinned file:
`dist/ATLAS-latest.yaml` holds the path of the current series pointer, which
holds the name of the current release. A release is `ATLAS-2026.07.yaml`, dated
rather than numbered.

Usage: cd backend && uv run python scripts/build_atlas_dataset.py
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import yaml

REPO = "mitre-atlas/atlas-data"
RAW = f"https://raw.githubusercontent.com/{REPO}/main/dist/{{path}}"
# The chain starts here. Each hop is a file whose whole content is the relative
# path of the next one, until a real document answers.
ENTRY = "ATLAS-latest.yaml"
MAX_HOPS = 5
ROOT = Path(__file__).resolve().parents[2] / "frontend" / "public"
OUT = ROOT / "atlas-dataset.json"


def fetch(path: str) -> bytes:
    url = RAW.format(path=path)
    req = urllib.request.Request(url, headers={"User-Agent": "drawmeastix-dataset/1.0"})
    with urllib.request.urlopen(req) as resp:  # noqa: S310
        return resp.read()


def latest_release() -> tuple[str, dict]:
    """Follow MITRE's pointers to the current release, and return it.

    `dist/ATLAS-latest.yaml` contains `v6/ATLAS-latest.yaml`, which contains
    `ATLAS-2026.07.yaml`. Following the chain rather than pinning a name is
    what makes the weekly refresh see a new release at all; ATLAS ships one
    every month or two, and `dist/ATLAS.yaml` is a deprecated v5 copy that
    still sits there for whoever pinned it.
    """
    path = ENTRY
    for _ in range(MAX_HOPS):
        raw = fetch(path).decode("utf-8").strip()
        # A pointer is one line naming a file; anything else is the document.
        if "\n" not in raw and raw.endswith(".yaml"):
            parent = path.rsplit("/", 1)[0] if "/" in path else ""
            path = f"{parent}/{raw}" if parent else raw
            continue
        return path, yaml.safe_load(raw)
    raise SystemExit(f"more than {MAX_HOPS} pointers deep from dist/{ENTRY}")


def shortname(name: str) -> str:
    """Tactic short name, ATT&CK style. Checked against the `x_mitre_shortname`
    of MITRE's own STIX bundle: the sixteen come out identical."""
    return name.lower().replace(" ", "-")


def main() -> None:
    source, data = latest_release()
    version = data["collection"]["version"]
    tactics, techniques = data["tactics"], data["techniques"]
    relationships = data["relationships"]

    # The matrix order is a relationship like any other in this format: the
    # matrix `sequences` its tactics, each carrying its position. Sorting on it
    # rather than on the identifiers is what keeps Reconnaissance first and
    # Impact last, and what puts AI Model Access where ATLAS puts it, in the
    # middle of the ATT&CK tactics it sits between.
    sequenced = sorted(relationships["ATLAS-matrix"]["sequences"], key=lambda r: r["position"])
    ordered = [
        {
            "id": tid,
            "shortname": shortname(tactics[tid]["name"]),
            "name": tactics[tid]["name"],
            "framework": "mitre-atlas",
            **(
                {"attack": tactics[tid]["attack-reference"]["id"]}
                if tactics[tid].get("attack-reference")
                else {}
            ),
        }
        for r in sequenced
        if (tid := r["target"]) in tactics
    ]

    achieves = {
        src: [r["target"] for r in groups["achieves"]]
        for src, groups in relationships.items()
        if "achieves" in groups
    }
    by_id = {t["id"]: shortname(t["name"]) for t in ordered}

    entries = []
    for tid, obj in techniques.items():
        entry = {
            "type": "attack-pattern",
            "id": tid,
            "name": obj["name"],
            "framework": "mitre-atlas",
        }
        phases = sorted(by_id[t] for t in achieves.get(tid, []) if t in by_id)
        if phases:
            entry["tactics"] = phases
        # What this technique adapts, when it adapts one. Read on the page, and
        # never written into a bundle: pointing at T1596 is not being T1596.
        if obj.get("attack-reference"):
            entry["attack"] = obj["attack-reference"]["id"]
        entries.append(entry)

    entries.sort(key=lambda e: e["id"])
    payload = {
        "_comment": "Generated by build_atlas_dataset.py - do not edit.",
        "source": f"MITRE ATLAS ({REPO}, dist/{source})",
        "atlas_version": version,
        "tactics": ordered,
        "entries": entries,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    subs = sum(1 for e in entries if e["id"].count(".") == 2)
    adapted = sum(1 for e in entries if "attack" in e)
    size_kb = OUT.stat().st_size // 1024
    print(
        f"ATLAS {version} : {len(entries)} techniques ({subs} sub-techniques), "
        f"{len(ordered)} tactics -> {OUT.name} ({size_kb} Ko)"
    )
    print(f"  read from dist/{source}, reached by following MITRE's own pointers")
    print(f"  {adapted} adapt an ATT&CK technique, and keep their own identifier")
    print(
        f"  left out: {len(data['mitigations'])} mitigations (course-of-action) "
        f"and {len(data['case-studies'])} case studies (no STIX object)"
    )


if __name__ == "__main__":
    main()
