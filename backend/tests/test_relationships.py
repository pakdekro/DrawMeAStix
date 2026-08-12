from app.stix_core.relationships import (
    ALL_TYPES,
    MATRIX,
    allowed_relationships,
)


def test_matrix_only_references_known_types():
    for source, rels in MATRIX.items():
        assert source in ALL_TYPES, source
        for rel, targets in rels.items():
            assert rel, (source, rel)
            for t in targets:
                assert t in ALL_TYPES, (source, rel, t)


def test_classic_cti_relations():
    assert "uses" in allowed_relationships("intrusion-set", "malware")
    assert "attributed-to" in allowed_relationships("campaign", "intrusion-set")
    assert "indicates" in allowed_relationships("indicator", "malware")
    assert "based-on" in allowed_relationships("indicator", "ipv4-addr")
    assert "resolves-to" in allowed_relationships("domain-name", "ipv4-addr")
    assert "variant-of" in allowed_relationships("malware", "malware")
    assert "targets" in allowed_relationships("threat-actor", "identity")


def test_related_to_fallback_only_between_sdos():
    # SDO ↔ SDO : toujours possible en dernier recours
    assert allowed_relationships("vulnerability", "campaign") == ["related-to"]
    assert allowed_relationships("location", "malware") == ["related-to"]
    # jamais avec un SCO
    assert "related-to" not in allowed_relationships("malware", "ipv4-addr")
    assert "related-to" not in allowed_relationships("url", "domain-name")


def test_related_to_is_last():
    rels = allowed_relationships("intrusion-set", "malware")
    assert rels[-1] == "related-to"
    assert rels.index("uses") < rels.index("related-to")


def test_illegal_pairs_are_empty():
    assert allowed_relationships("url", "malware") == []
    assert allowed_relationships("ipv4-addr", "domain-name") == []


def test_unknown_types_are_empty():
    assert allowed_relationships("nawak", "malware") == []
    assert allowed_relationships("malware", "") == []
