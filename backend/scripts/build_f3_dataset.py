"""Distills MITRE F3 (Fight Financial Fraud) into a compact dataset for the palette.

Source: the NATIVE F3 file, not its STIX bundle. The bundle is a catalogue of
the framework (123 techniques, 8 tactics, and 49 `subtechnique-of` links that
only describe the hierarchy) - importing it would drop the whole matrix into an
investigation. What the palette needs is a dictionary, exactly as for ATT&CK.

The native file is also the only one that carries `isAttack`, and that flag is
the whole point of this script: 46 of the 138 techniques are ATT&CK techniques
that F3 reuses by number, and the STIX bundle LOSES that provenance - every
external reference in it says `mitre-f3`, T-ids included. Reading the bundle
instead, we would end up claiming that T1566 is an F3 identifier.

Three consequences, all handled below:

- an `isAttack` entry is emitted as an ATT&CK technique, so that it deduplicates
  with the one the ATT&CK palette offers rather than forking it. That is what
  makes a fraud case and an intrusion case meet on the same technique;
- its name is taken back from ATT&CK when ATT&CK has it. F3 names its
  sub-techniques by full path ("Brute Force: Password Guessing") where ATT&CK
  names the leaf ("Password Guessing"). Keeping both spellings would put two
  cards carrying the SAME deterministic ID on the canvas, which is exactly the
  collision the builder warns about;
- a number ATT&CK has since revoked is replaced by its successor. F3 1.2
  still cites T1672 Email Spoofing, which ATT&CK v19 revoked in favour of
  T1684.002: kept as is, F3's card for it would be a second object beside the
  one the ATT&CK palette offers. The ATT&CK dataset carries the revocations,
  which is why this build runs after it.

Some `isAttack` identifiers are still not in our ATT&CK dataset, which carries
the three matrices: F3 mints its own under an ATT&CK parent, and as of F3 1.2
T1585.004 and T1586.004 exist nowhere in ATT&CK. They keep the F3 spelling and
are listed at the end of the run rather than silently trusted; the run is the
current list, this paragraph is not.

Usage: cd backend && uv run python scripts/build_f3_dataset.py
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

# The native series is published one file per version, with no unversioned
# copy: `f3-v1.1.json` today, `f3-v1.2.json` the day there is one. A pinned
# URL would therefore keep rebuilding v1.1 for ever, and the weekly refresh
# would report "unchanged" about a framework that had moved. So the published
# files are listed and the highest version wins.
#
# The repository ALSO carries `src/data/matrix-data.json`, which is what the
# site builds from and is always current. It is deliberately not used: it is
# working state on a branch, and this application ships what MITRE published,
# never what it happens to be drafting.
REPO = "center-for-threat-informed-defense/fight-fraud-framework"
LISTING = f"https://api.github.com/repos/{REPO}/contents/public"
RAW = f"https://raw.githubusercontent.com/{REPO}/main/public/{{name}}"
NATIVE = re.compile(r"^f3-v(\d+(?:\.\d+)*)\.json$")
ROOT = Path(__file__).resolve().parents[2] / "frontend" / "public"
OUT = ROOT / "f3-dataset.json"
ATTACK = ROOT / "attack-dataset.json"


def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "drawmeastix-dataset/1.0"})
    with urllib.request.urlopen(req) as resp:  # noqa: S310
        return json.load(resp)


def latest_native() -> str:
    """Name of the most recent published native file.

    `f3-v1.json` and `f3-v1.1.json` both exist and hold the same thing: the
    first is the series, the second the release. Comparing the numbers as
    tuples rather than as strings is what keeps `(1,)` from outranking
    `(1, 1)`, and `(1, 10)` from losing to `(1, 9)`.
    """
    published = [
        (tuple(int(part) for part in match.group(1).split(".")), entry["name"])
        for entry in fetch(LISTING)
        if (match := NATIVE.match(entry["name"]))
    ]
    if not published:
        raise SystemExit(f"no f3-v<version>.json under {LISTING}")
    return max(published)[1]


def shortname(name: str) -> str:
    """Tactic short name, ATT&CK style. Checked against the `x_mitre_shortname`
    of the STIX bundle: the eight tactics come out identical."""
    return name.lower().replace(" ", "-")


def main() -> None:
    source = latest_native()
    data = fetch(RAW.format(name=source))

    attack_names: dict[str, str] = {}
    attack_revoked: dict[str, str] = {}
    if ATTACK.exists():
        attack = json.loads(ATTACK.read_text(encoding="utf-8"))
        for e in attack["entries"]:
            if e.get("type") == "attack-pattern" and e.get("id"):
                attack_names[e["id"]] = e["name"]
        attack_revoked = attack.get("revoked", {})

    tactics = [o for o in data if o.get("tactic") is True]
    techniques = [o for o in data if o.get("tactic") is not True]
    version = next((o.get("version") for o in data if o.get("version")), "?")
    by_tactic_id = {t["id"]: shortname(t["name"]) for t in tactics}

    entries = []
    unknown_attack_ids = []
    followed: list[str] = []
    renamed = 0
    for obj in techniques:
        tid = obj["id"]
        borrowed = obj.get("isAttack") is True
        name = obj["name"]
        if borrowed and tid not in attack_names and tid in attack_revoked:
            followed.append(f"{tid} -> {attack_revoked[tid]}")
            tid = attack_revoked[tid]
        if borrowed:
            attack_name = attack_names.get(tid)
            if attack_name is None:
                unknown_attack_ids.append(f"{tid} ({name})")
            elif attack_name != name:
                name = attack_name
                renamed += 1
        entry = {
            "type": "attack-pattern",
            "id": tid,
            "name": name,
            "framework": "mitre-attack" if borrowed else "mitre-f3",
        }
        phases = sorted(by_tactic_id[t] for t in obj.get("tactics", []) if t in by_tactic_id)
        if phases:
            entry["tactics"] = phases
        entries.append(entry)

    entries.sort(key=lambda e: e["id"])
    # Following a revocation can land on a number F3 also cites directly: two
    # entries would then be two cards for one identifier.
    ids = [e["id"] for e in entries]
    twice = sorted({i for i in ids if ids.count(i) > 1})
    if twice:
        raise SystemExit(f"the same number twice after following revocations: {twice}")
    payload = {
        "_comment": "Generated by backend/scripts/build_f3_dataset.py - do not edit.",
        "source": "MITRE F3 (center-for-threat-informed-defense/fight-fraud-framework)",
        "f3_version": version,
        "tactics": [
            {
                "id": t["id"],
                "shortname": shortname(t["name"]),
                "name": t["name"],
                "framework": "mitre-attack" if t.get("isAttack") else "mitre-f3",
            }
            for t in tactics
        ],
        "entries": entries,
    }
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    borrowed_n = sum(1 for e in entries if e["framework"] == "mitre-attack")
    size_kb = OUT.stat().st_size // 1024
    print(
        f"F3 v{version} : {len(entries)} techniques "
        f"({borrowed_n} ATT&CK, {len(entries) - borrowed_n} F3), "
        f"{len(payload['tactics'])} tactics -> {OUT.name} ({size_kb} Ko)"
    )
    # Named in the report, not just fetched: this is the line that says the
    # framework itself moved, in the pull request the weekly refresh opens.
    print(f"  read from {source}, the most recent published native file")
    print(f"  {renamed} names taken back from ATT&CK (F3 spells sub-techniques by full path)")
    if followed:
        print("  revoked by ATT&CK, replaced by their successor:")
        for line in followed:
            print(f"    {line}")
    if unknown_attack_ids:
        print("  flagged isAttack but absent from our ATT&CK dataset, F3 spelling kept:")
        for tid in unknown_attack_ids:
            print(f"    {tid}")


if __name__ == "__main__":
    main()
