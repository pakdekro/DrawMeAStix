"""Distills the MISP threat-actor galaxy into the actor names ATT&CK ignores.

Why: the ATT&CK dataset knows 174 groups under MITRE's naming. An analyst
reading a vendor report meets "Storm-2603", "UNC5221" or a colour-coded name
that ATT&CK never adopted, finds nothing, and creates one more `intrusion-set`
whose name (and therefore whose identifier) matches no one else's. The galaxy
covers about a thousand actors with far richer synonyms.

Source: MISP/misp-galaxy, clusters/threat-actor.json, published under CC0.

WHAT THIS SCRIPT REFUSES TO SHIP, and why it matters more than what it ships:
the two corpora disagree on where an actor ends. MITRE folds UNC2452 into
APT29; the galaxy keeps it as an actor of its own. Shipping both would offer
two canonical names for one adversary, and since our identifiers derive from
the name, we would MANUFACTURE the duplicate we exist to prevent. So the rule
is arbitration, not union:

  1. ATT&CK wins outright. Any galaxy actor whose name OR any synonym is
     already resolvable from the ATT&CK dataset is dropped whole.
  2. Galaxy entries sharing a canonical name are merged (the galaxy carries
     duplicates of its own).
  3. A synonym claimed by two different actors is dropped from both: it
     resolves to nothing certain, so it must not resolve at all.

What remains is a pure addition: names ATT&CK has never heard of. Run it AFTER
build_attack_dataset.py, which it reads.

Usage: cd backend && uv run python scripts/build_actors_dataset.py
"""

from __future__ import annotations

import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

URL = "https://raw.githubusercontent.com/MISP/misp-galaxy/main/clusters/threat-actor.json"
ATTACK = Path(__file__).resolve().parents[2] / "frontend" / "public" / "attack-dataset.json"
OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "actors-dataset.json"


def key(value: str) -> str:
    """Comparison form: case, spaces and punctuation carry no meaning here."""
    return re.sub(r"[^a-z0-9]", "", value.lower())


def fetch() -> dict:
    req = urllib.request.Request(URL, headers={"User-Agent": "drawmeastix-dataset/1.0"})
    with urllib.request.urlopen(req) as resp:  # noqa: S310
        return json.load(resp)


def main() -> None:
    if not ATTACK.exists():
        raise SystemExit(f"{ATTACK} is missing: run build_attack_dataset.py first")
    attack = json.loads(ATTACK.read_text(encoding="utf-8"))
    known = set()
    for entry in attack["entries"]:
        if entry["type"] != "intrusion-set":
            continue
        known.add(key(entry["name"]))
        known.update(key(a) for a in entry.get("aliases", []))

    galaxy = fetch()
    actors = galaxy["values"]

    # 1. ATT&CK wins
    kept = []
    dropped_to_attack = 0
    for actor in actors:
        names = [actor["value"], *actor.get("meta", {}).get("synonyms", [])]
        if any(key(n) in known for n in names):
            dropped_to_attack += 1
            continue
        kept.append(actor)

    # 2. merge the galaxy's own duplicates
    #
    # Names are stripped on the way in. The galaxy ships at least one padded
    # with spaces, and a name is not decoration here: it is what the analyst
    # reads on the node and what the identifier is computed from.
    merged: dict[str, dict] = {}
    placeholders = 0
    for actor in kept:
        name = actor["value"].strip()
        # The galaxy carries a few placeholders ("[Unnamed group]") that name
        # nobody. Suggesting one would put it on a canvas and in a bundle.
        if not name or name.startswith("[") or name.lower().startswith("unnamed"):
            placeholders += 1
            continue
        k = key(name)
        target = merged.setdefault(k, {"name": name, "aliases": []})
        # Deduplicated by comparison form, not by exact string: the galaxy
        # spells the same alias two ways more than once ("Laundry Bear" and
        # "LaundryBear"), and two spellings of one name resolve to the same
        # actor while looking like two claims on it.
        seen = {key(a) for a in target["aliases"]}
        for raw in actor.get("meta", {}).get("synonyms", []):
            synonym = raw.strip()
            if synonym and key(synonym) not in seen:
                seen.add(key(synonym))
                target["aliases"].append(synonym)
    duplicates = len(kept) - placeholders - len(merged)

    # 3. a name claimed by two actors resolves to nothing certain
    #
    # Claims are counted over canonical names AND synonyms, because the galaxy
    # does both: "Alpha Spider" is an actor of its own and a synonym of "Velvet
    # Tempest". A canonical name always wins, since it is somebody's entry; the
    # synonym that collides with it is what gets dropped.
    canonical = {k for k in merged}
    claims: dict[str, set[str]] = defaultdict(set)
    for k, actor in merged.items():
        for synonym in actor["aliases"]:
            claims[key(synonym)].add(k)
    contested = {s for s, owners in claims.items() if len(owners) > 1} | canonical
    ambiguous = 0
    entries = []
    for k, actor in sorted(merged.items(), key=lambda kv: kv[1]["name"].lower()):
        aliases = [a for a in actor["aliases"] if key(a) not in contested]
        ambiguous += len(actor["aliases"]) - len(aliases)
        entry = {"type": "intrusion-set", "name": actor["name"]}
        if aliases:
            entry["aliases"] = aliases
        entries.append(entry)

    payload = {
        "_comment": "Generated by backend/scripts/build_actors_dataset.py - do not edit.",
        "source": f"MISP galaxy threat-actor v{galaxy.get('version')} (CC0)",
        "arbitration": "names already resolvable from ATT&CK are dropped; ATT&CK is authoritative",
        "entries": entries,
    }
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"{OUT}: {len(entries)} actors")
    print(f"  dropped, ATT&CK already resolves them : {dropped_to_attack}")
    print(f"  dropped, placeholders naming nobody   : {placeholders}")
    print(f"  merged, duplicated inside the galaxy  : {duplicates}")
    print(f"  synonyms dropped as contested         : {ambiguous}")


if __name__ == "__main__":
    main()
