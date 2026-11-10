"""Reporter interpretations are inferences only: no restated verified facts, no Verified/Unverified labels."""

from __future__ import annotations

from saksi.agents.reporter import clean_interpretations


def test_drops_interpretations_that_restate_verified_findings() -> None:
    values = ["Verified: the Q4 shipment schedule was archived with 7z.",
              "VERIFIED that the session reached 198.51.100.77.",
              "Whether the transfer is still active is unknown."]
    assert clean_interpretations(values) == ["Whether the transfer is still active is unknown."]


def test_strips_unverified_and_malay_labels() -> None:
    values = ["Unverified: a second host may have been touched.",
              "Belum disahkan: kemungkinan akaun lain terlibat.",
              "unverified: the dump contents are not visible."]
    assert clean_interpretations(values) == [
        "a second host may have been touched.",
        "kemungkinan akaun lain terlibat.",
        "the dump contents are not visible.",
    ]


def test_keeps_plain_inferences_and_drops_empty_values() -> None:
    assert clean_interpretations(["  ", "Intent appears to be data theft."]) == ["Intent appears to be data theft."]
