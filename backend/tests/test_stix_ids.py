"""Non-regression: our deterministic IDs must be identical to pycti's.

This is THE anti-duplicate guarantee of the product: if one of these
assertions breaks, OpenCTI changed its algorithm and our bundles would
create duplicates on import. Never "fix" this test by adjusting the
expected value without aligning app/stix_core/ids.py on the new pycti.
"""

import datetime

import pycti
import pytest

from app.stix_core import ids

NOW = datetime.datetime(2026, 7, 25, 12, 0, 0, tzinfo=datetime.UTC)

# Deliberately treacherous values: capitals, spaces, accents, unicode.
NAMES = ["APT28", "  Sandworm Team  ", "Opération Héron", "ラザルス", "plain"]


@pytest.mark.parametrize("name", NAMES)
def test_simple_name_recipes(name):
    assert ids.campaign_id(name) == pycti.Campaign.generate_id(name)
    assert ids.infrastructure_id(name) == pycti.Infrastructure.generate_id(name)
    assert ids.intrusion_set_id(name) == pycti.IntrusionSet.generate_id(name)
    assert ids.malware_id(name) == pycti.Malware.generate_id(name)
    assert ids.tool_id(name) == pycti.Tool.generate_id(name)
    assert ids.vulnerability_id(name) == pycti.Vulnerability.generate_id(name)
    assert ids.threat_actor_group_id(name) == pycti.ThreatActorGroup.generate_id(name)
    assert ids.threat_actor_individual_id(name) == pycti.ThreatActorIndividual.generate_id(name)


@pytest.mark.parametrize("name", NAMES)
@pytest.mark.parametrize("identity_class", ["organization", "Individual", "system"])
def test_identity(name, identity_class):
    assert ids.identity_id(name, identity_class) == pycti.Identity.generate_id(
        name, identity_class
    )


def test_attack_pattern():
    assert ids.attack_pattern_id(name="Phishing") == pycti.AttackPattern.generate_id("Phishing")
    assert ids.attack_pattern_id(
        name="Phishing", x_mitre_id=" T1566 "
    ) == pycti.AttackPattern.generate_id("Phishing", " T1566 ")
    with pytest.raises(ValueError):
        ids.attack_pattern_id()


def test_indicator():
    pattern = " [ipv4-addr:value = '198.51.100.7'] "
    assert ids.indicator_id(pattern) == pycti.Indicator.generate_id(pattern)


def test_report():
    assert ids.report_id("Rapport Q3", NOW) == pycti.Report.generate_id("Rapport Q3", NOW)
    assert ids.report_id("Rapport Q3", "2026-07-25T12:00:00+00:00") == pycti.Report.generate_id(
        "Rapport Q3", "2026-07-25T12:00:00+00:00"
    )


def test_grouping():
    assert ids.grouping_id("Invest X", "Suspicious-Activity") == pycti.Grouping.generate_id(
        "Invest X", "Suspicious-Activity"
    )
    assert ids.grouping_id("Invest X", "suspicious-activity", NOW) == pycti.Grouping.generate_id(
        "Invest X", "suspicious-activity", NOW
    )


def test_note_and_opinion():
    assert ids.note_id(" contenu ") == pycti.Note.generate_id(None, " contenu ")
    assert ids.note_id("contenu", NOW) == pycti.Note.generate_id(NOW, "contenu")
    assert ids.opinion_id("agree") == pycti.Opinion.generate_id(None, "agree")
    assert ids.opinion_id("agree", NOW) == pycti.Opinion.generate_id(NOW, "agree")


def test_location():
    assert ids.location_id("France", "Country") == pycti.Location.generate_id("France", "Country")
    assert ids.location_id("x", "Position", 48.85, 2.35) == pycti.Location.generate_id(
        "x", "Position", 48.85, 2.35
    )
    assert ids.location_id("x", "Position", 48.85, None) == pycti.Location.generate_id(
        "x", "Position", 48.85, None
    )
    assert ids.location_id("Paris", "Position") == pycti.Location.generate_id("Paris", "Position")


def test_relationship():
    src = ids.intrusion_set_id("APT28")
    tgt = ids.malware_id("X-Agent")
    for args in [
        ("uses", src, tgt),
        ("uses", src, tgt, NOW),
        ("uses", src, tgt, NOW, NOW + datetime.timedelta(days=1)),
        # pycti ignores stop_time when start_time is absent: same for us
        ("uses", src, tgt, None, NOW),
    ]:
        assert ids.relationship_id(*args) == pycti.StixCoreRelationship.generate_id(*args)


def test_ids_are_stable():
    """Golden values: catch an algorithm change even if pycti and us drift
    together (the goal is matching the platform, not pycti)."""
    assert (
        ids.intrusion_set_id("APT28")
        == "intrusion-set--f743ab1d-b2f2-58f8-975f-0993511c0b9d"
    )
