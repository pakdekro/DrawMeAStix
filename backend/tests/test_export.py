"""Tests of the STIX 2.1 bundle export (direct stix_core call, no HTTP)."""

import pycti
import pytest
import stix2

from app.stix_core.bundle import STIXIT_EXTENSION_ID, ExportError
from tests.support import Investigation


def _setup_investigation(db) -> Investigation:
    """APT28 --uses--> X-Agent --communicates-with--> domain, + note + opinion."""
    inv = Investigation(db, name="Opération Héron", description="test")
    inv.apt = inv.entity(
        "intrusion-set", "APT28", properties={"aliases": ["Fancy Bear"]},
        position_x=100, position_y=50,
    )
    inv.mal = inv.entity("malware", "X-Agent", properties={"is_family": True})
    inv.dom = inv.entity("domain-name", "evil.example.com")
    inv.entity("tool", "Brouillon", status="candidate")  # must NOT be exported

    inv.relationship(inv.apt, inv.mal, "uses")
    inv.relationship(inv.mal, inv.dom, "communicates-with")

    inv.note("Vu dans le rapport X", entity_id=inv.apt)
    inv.note("Attribution fragile", kind="opinion", entity_id=inv.apt, opinion_value="disagree")
    return inv


def test_export_report_bundle(db):
    inv = _setup_investigation(db)
    bundle, fingerprint, warnings = inv.export(author_name="Mon CERT", tlp="amber")

    # re-parsable by the reference lib
    parsed = stix2.parse(bundle, allow_custom=True)
    by_type = {}
    for obj in parsed.objects:
        by_type.setdefault(obj["type"], []).append(obj)

    # deterministic IDs identical to the ones OpenCTI would generate
    intrusion = by_type["intrusion-set"][0]
    assert intrusion["id"] == pycti.IntrusionSet.generate_id("APT28")
    assert intrusion["created_by_ref"] == pycti.Identity.generate_id("Mon CERT", "organization")
    assert by_type["malware"][0]["is_family"] is True
    assert by_type["malware"][0]["object_marking_refs"] == [stix2.TLP_AMBER.id]

    # the candidate is not exported
    assert "tool" not in by_type

    # relationships and SCOs present
    assert {r["relationship_type"] for r in by_type["relationship"]} == {
        "uses", "communicates-with"
    }
    assert by_type["domain-name"][0]["value"] == "evil.example.com"

    # STIX notes and opinions hooked onto the entity
    assert by_type["note"][0]["object_refs"] == [intrusion["id"]]
    assert by_type["opinion"][0]["opinion"] == "disagree"

    # report container: everything is referenced
    report = by_type["report"][0]
    refs = set(report["object_refs"])
    for t in ("intrusion-set", "malware", "domain-name", "relationship", "note", "opinion"):
        for obj in by_type[t]:
            assert obj["id"] in refs, f"{obj['id']} absent du report"

    # layout carried in the extension, positions included
    ext = intrusion["extensions"][STIXIT_EXTENSION_ID]
    assert (ext["position_x"], ext["position_y"]) == (100, 50)
    assert ext["extension_type"] == "property-extension"

    assert fingerprint.startswith("sha256:")
    assert warnings == []


def test_export_grouping(db):
    inv = _setup_investigation(db)
    bundle, _, _ = inv.export(container="grouping", tlp="none")
    types = {o["type"] for o in bundle["objects"]}
    assert "grouping" in types and "report" not in types
    grouping = next(o for o in bundle["objects"] if o["type"] == "grouping")
    assert grouping["context"] == "suspicious-activity"
    assert "marking-definition" not in types


def test_fingerprint_stable_and_content_sensitive(db):
    inv = _setup_investigation(db)
    fp1 = inv.export()[1]
    fp2 = inv.export()[1]
    assert fp1 == fp2, "deux exports du même état doivent avoir la même empreinte"

    # moving a node does not change the fingerprint (layout out of scope)
    inv.move(inv.apt, 999, 999)
    assert inv.export()[1] == fp1

    # renaming an entity changes the fingerprint
    inv.rename(inv.apt, "APT-RENAMED")
    assert inv.export()[1] != fp1


def test_export_reproducible_ids_across_reexports(db):
    """Two distinct investigations holding the same entity → same STIX ID."""
    ids_seen = []
    for n in ("A", "B"):
        inv = Investigation(db, name=f"invest {n}")
        inv.entity("malware", "Emotet")
        bundle = inv.export()[0]
        mal = next(o for o in bundle["objects"] if o["type"] == "malware")
        ids_seen.append(mal["id"])
    assert ids_seen[0] == ids_seen[1]


def test_export_indicator_requires_pattern(db):
    inv = Investigation(db, name="x")
    inv.entity("indicator", "ioc sans pattern")
    with pytest.raises(ExportError) as exc:
        inv.export()
    assert "pattern" in exc.value.problems[0]


def test_export_empty_investigation(db):
    inv = Investigation(db, name="vide")
    with pytest.raises(ExportError):
        inv.export()


def test_export_indicator_with_pattern(db):
    inv = Investigation(db, name="ioc")
    pattern = "[ipv4-addr:value = '198.51.100.7']"
    inv.entity("indicator", "IP C2", properties={"pattern": pattern})
    bundle = inv.export()[0]
    ind = next(o for o in bundle["objects"] if o["type"] == "indicator")
    assert ind["id"] == pycti.Indicator.generate_id(pattern)
    assert ind["pattern_type"] == "stix"
