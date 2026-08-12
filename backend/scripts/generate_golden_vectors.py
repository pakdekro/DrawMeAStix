"""Generates the golden vectors for the TypeScript port of the STIX core (#38).

The produced file (frontend/src/stix/golden-vectors.json) is committed: the
vitest tests replay every case and must reproduce the ID identically.
The SDO recipes come from app.stix_core.ids (themselves pinned to pycti by
tests/test_stix_ids.py); the SCO IDs come from the stix2 lib (the spec's
reference implementation).

Usage: cd backend && uv run python scripts/generate_golden_vectors.py
"""

from __future__ import annotations

import json
from pathlib import Path

import stix2

from app.stix_core import ids

OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "stix" / "golden-vectors.json"

# (function, kwargs) - same argument names on the TS side for a direct replay.
SDO_CASES: list[tuple[str, dict]] = [
    ("attack_pattern_id", {"x_mitre_id": "T1566"}),
    ("attack_pattern_id", {"x_mitre_id": "  t1059.001  "}),
    ("attack_pattern_id", {"name": "Spearphishing Attachment"}),
    ("attack_pattern_id", {"name": "  Phishing  "}),
    ("attack_pattern_id", {"name": "Ingénierie sociale - ciblée"}),
    ("attack_pattern_id", {"name": "Δοκιμή Unicode"}),
    ("campaign_id", {"name": "Opération Héron"}),
    ("campaign_id", {"name": " SolarWinds Compromise "}),
    ("grouping_id", {"name": "Triage - Opération Héron", "context": "suspicious-activity"}),
    (
        "grouping_id",
        {
            "name": "Triage - Opération Héron",
            "context": "suspicious-activity",
            "created": "2026-07-25T10:00:00.000Z",
        },
    ),
    ("identity_id", {"name": "CERT Pak", "identity_class": "organization"}),
    ("identity_id", {"name": "Jean Dupont", "identity_class": "Individual"}),
    ("indicator_id", {"pattern": "[ipv4-addr:value = '203.0.113.5']"}),
    ("indicator_id", {"pattern": "  [domain-name:value = 'evil.example']  "}),
    (
        "indicator_id",
        {"pattern": "[file:hashes.'SHA-256' = 'aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f' AND file:name = 'payload.exe']"},  # noqa: E501
    ),
    ("infrastructure_id", {"name": "C2 - evil.example"}),
    ("intrusion_set_id", {"name": "APT28"}),
    ("intrusion_set_id", {"name": "aPt29  "}),
    ("intrusion_set_id", {"name": "Sandworm Team"}),
    ("location_id", {"name": "France", "location_type": "Country"}),
    ("location_id", {"name": "Paris", "location_type": "City"}),
    (
        "location_id",
        {"name": "Point 48N2E", "location_type": "Position", "latitude": 48.85, "longitude": 2.35},
    ),
    ("location_id", {"name": "Point sans coordonnées", "location_type": "Position"}),
    ("malware_id", {"name": "X-Agent"}),
    ("malware_id", {"name": "  Emotet "}),
    ("malware_id", {"name": "ПлохойСофт"}),
    ("note_id", {"content": "  Attribution incertaine, infra partagée.  "}),
    (
        "note_id",
        {"content": "Attribution incertaine.", "created": "2026-07-25T10:00:00.000Z"},
    ),
    ("opinion_id", {"opinion": "probably-true"}),
    ("opinion_id", {"opinion": "probably-true", "created": "2026-07-25T10:00:00.000Z"}),
    ("report_id", {"name": "Rapport Héron", "published": "2026-07-25T12:00:00.000Z"}),
    ("threat_actor_group_id", {"name": "APT28"}),
    ("threat_actor_group_id", {"name": "Fancy Bear"}),
    ("threat_actor_individual_id", {"name": "John Doe"}),
    ("tool_id", {"name": "Mimikatz"}),
    ("tool_id", {"name": "PsExec "}),
    ("vulnerability_id", {"name": "CVE-2024-3094"}),
    (
        "relationship_id",
        {
            "relationship_type": "uses",
            "source_ref": "threat-actor--0225e0e0-3a4d-5f5f-8b3f-6b6f5c8d9e0a",
            "target_ref": "malware--1336f1f1-4b5e-6a6a-9c4a-7c7a6d9e0f1b",
        },
    ),
    (
        "relationship_id",
        {
            "relationship_type": "uses",
            "source_ref": "threat-actor--0225e0e0-3a4d-5f5f-8b3f-6b6f5c8d9e0a",
            "target_ref": "malware--1336f1f1-4b5e-6a6a-9c4a-7c7a6d9e0f1b",
            "start_time": "2026-01-01T00:00:00.000Z",
        },
    ),
    (
        "relationship_id",
        {
            "relationship_type": "uses",
            "source_ref": "threat-actor--0225e0e0-3a4d-5f5f-8b3f-6b6f5c8d9e0a",
            "target_ref": "malware--1336f1f1-4b5e-6a6a-9c4a-7c7a6d9e0f1b",
            "start_time": "2026-01-01T00:00:00.000Z",
            "stop_time": "2026-02-01T00:00:00.000Z",
        },
    ),
    (
        # stop_time without start_time: pycti drops it, the ID must equal the bare case
        "relationship_id",
        {
            "relationship_type": "uses",
            "source_ref": "threat-actor--0225e0e0-3a4d-5f5f-8b3f-6b6f5c8d9e0a",
            "target_ref": "malware--1336f1f1-4b5e-6a6a-9c4a-7c7a6d9e0f1b",
            "stop_time": "2026-02-01T00:00:00.000Z",
        },
    ),
]

SCO_CASES: list[tuple[type, str, dict]] = [
    (stix2.IPv4Address, "ipv4-addr", {"value": "203.0.113.5"}),
    (stix2.IPv4Address, "ipv4-addr", {"value": "198.51.100.0/24"}),
    (stix2.IPv6Address, "ipv6-addr", {"value": "2001:db8::1"}),
    (stix2.DomainName, "domain-name", {"value": "evil.example"}),
    (stix2.DomainName, "domain-name", {"value": "café.example"}),
    (stix2.URL, "url", {"value": "https://evil.example/payload?id=1&x=à"}),
    (stix2.EmailAddress, "email-addr", {"value": "phish@evil.example"}),
    (stix2.File, "file", {"name": "payload.exe"}),
    (stix2.File, "file", {"hashes": {"MD5": "44d88612fea8a8f36de82e1278abb02f"}}),
    (
        stix2.File,
        "file",
        {"hashes": {"SHA-256": "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f"}},
    ),
    (
        # MD5 + SHA-256: the lib keeps only the MD5 (hash preference order)
        stix2.File,
        "file",
        {
            "name": "dropper.dll",
            "hashes": {
                "MD5": "44d88612fea8a8f36de82e1278abb02f",
                "SHA-256": "aec070645fe53ee3b3763059376134f058cc337247c978add178b6ccdfb0019f",
            },
        },
    ),
    (stix2.AutonomousSystem, "autonomous-system", {"number": 64496}),
]


def main() -> None:
    cases = [
        {"fn": fn, "args": kwargs, "expected": getattr(ids, fn)(**kwargs)}
        for fn, kwargs in SDO_CASES
    ]
    sco_cases = [
        {"type": stix_type, "props": props, "expected": cls(**props).id}
        for cls, stix_type, props in SCO_CASES
    ]
    payload = {
        "_comment": "Généré par generate_golden_vectors.py - ne pas éditer à la main.",
        "namespace": str(ids.OPENCTI_NAMESPACE),
        "cases": cases,
        "sco_cases": sco_cases,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(cases)} cas SDO + {len(sco_cases)} cas SCO -> {OUT}")


if __name__ == "__main__":
    main()
