"""Distills MITRE ATT&CK into a compact dataset for the palette (#10).

Source: the official STIX from mitre-attack/attack-stix-data. We only ship what
the palette consumes - type, ATT&CK ID, name, aliases, tactics - to stay light
(the app is local, every KB counts). The JSON produced is committed under
frontend/public/ and loaded on demand by the palette; re-run this script to
follow a new ATT&CK version.

THE THREE DOMAINS, ONE CORPUS. ATT&CK publishes Enterprise, Mobile and ICS as
three bundles, and they are three matrices of ONE knowledge base: one
identifier space, one external reference (`mitre-attack`), no numbers in
common. Checked at every run rather than assumed, because a collision would be
the one thing that could put two names on one identifier, and our identifiers
derive from the number alone.

So they are merged rather than kept apart, and a technique that is not
Enterprise carries its domain. Absent means Enterprise, the way absent means
ATT&CK everywhere else in this application: it is what the corpus was made of
before the other two arrived. Groups, malware and tools carry no domain at all
- an actor is not a matrix, and the same group is described in two bundles
whenever it operates in both.

What is NOT a domain: Cloud, Containers, Network Devices, ESXi and the rest are
PLATFORMS of Enterprise, and their matrices on the website are filtered views
of a corpus we already ship whole.

Usage: cd backend && uv run python scripts/build_attack_dataset.py
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

RAW = (
    "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/"
    "{domain}-attack/{domain}-attack.json"
)
# Enterprise first: it is the default domain, the largest corpus, and the one
# whose spelling wins for anything the three describe in common.
DOMAINS = ("enterprise", "mobile", "ics")
OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "attack-dataset.json"

# MITRE STIX type -> entity type on the canvas
TYPE_MAP = {
    "attack-pattern": "attack-pattern",
    "intrusion-set": "intrusion-set",
    "malware": "malware",
    "tool": "tool",
}


def attack_id(obj: dict) -> str | None:
    for ref in obj.get("external_references", []):
        if ref.get("source_name") == "mitre-attack" and ref.get("external_id"):
            return ref["external_id"]
    return None


def fetch(domain: str) -> dict:
    url = RAW.format(domain=domain)
    req = urllib.request.Request(url, headers={"User-Agent": "drawmeastix-dataset/1.0"})
    with urllib.request.urlopen(req) as resp:  # noqa: S310
        return json.load(resp)


def collection_version(bundle: dict) -> str:
    return next(
        (
            o.get("x_mitre_version")
            for o in bundle["objects"]
            if o.get("type") == "x-mitre-collection"
        ),
        "?",
    )


def main() -> None:
    entries: list[dict] = []
    seen: dict[tuple[str, str], dict] = {}
    versions: dict[str, str] = {}
    conflicts: list[str] = []
    per_domain: dict[str, int] = {}

    for domain in DOMAINS:
        bundle = fetch(domain)
        versions[domain] = collection_version(bundle)
        added = 0
        for obj in bundle["objects"]:
            stix_type = TYPE_MAP.get(obj.get("type", ""))
            if stix_type is None:
                continue
            if obj.get("revoked") or obj.get("x_mitre_deprecated"):
                continue
            ext_id = attack_id(obj)
            if not ext_id or not obj.get("name"):
                continue
            key = (stix_type, ext_id)
            if key in seen:
                # The same group or malware described in two matrices, which is
                # ordinary. The same NUMBER on two different names would not be,
                # and it is the one thing that would put two cards on the canvas
                # for one identifier: reported rather than resolved silently.
                if seen[key]["name"] != obj["name"]:
                    conflicts.append(
                        f"{ext_id}: {seen[key]['name']!r} then {obj['name']!r} in {domain}"
                    )
                continue
            entry: dict = {"type": stix_type, "id": ext_id, "name": obj["name"]}
            aliases = obj.get("aliases") or obj.get("x_mitre_aliases") or []
            aliases = [a for a in aliases if a != obj["name"]]
            if aliases:
                entry["aliases"] = aliases
            if stix_type == "attack-pattern":
                # Each domain names its own kill chain, so the phases of a
                # Mobile technique live under `mitre-mobile-attack`. Reading
                # only `mitre-attack` here silently stripped their tactics.
                tactics = sorted(
                    p["phase_name"]
                    for p in obj.get("kill_chain_phases", [])
                    if p.get("kill_chain_name") == f"mitre-{domain}-attack"
                    or (domain == "enterprise" and p.get("kill_chain_name") == "mitre-attack")
                )
                if tactics:
                    entry["tactics"] = tactics
                if domain != "enterprise":
                    entry["domain"] = domain
            seen[key] = entry
            entries.append(entry)
            added += 1
        per_domain[domain] = added

    entries.sort(key=lambda e: (e["type"], e["id"]))
    version = versions["enterprise"]
    payload = {
        "_comment": "Generated by backend/scripts/build_attack_dataset.py - do not edit.",
        "source": "MITRE ATT&CK Enterprise, Mobile and ICS (mitre-attack/attack-stix-data)",
        "attack_version": version,
        "entries": entries,
    }
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    counts: dict[str, int] = {}
    for e in entries:
        counts[e["type"]] = counts.get(e["type"], 0) + 1
    size_kb = OUT.stat().st_size // 1024
    print(f"ATT&CK v{version} : {counts} -> {OUT.name} ({size_kb} Ko)")
    print("  " + ", ".join(f"{d} +{n} (v{versions[d]})" for d, n in per_domain.items()))
    if len({v for v in versions.values()}) > 1:
        print("  the three domains do NOT carry the same version, which is unusual")
    if conflicts:
        print("  SAME IDENTIFIER, TWO NAMES - the palette would fork an object:")
        for c in conflicts:
            print(f"    {c}")


if __name__ == "__main__":
    main()
