"""The old Defense Evasion tactic and its two successors are treated as one family."""
from saksi.agents.verifier import _resolve_tactic


def test_evasion_family_names_resolve_to_the_valid_one():
    assert _resolve_tactic("Defense Evasion", ["Stealth"]) == "Stealth"
    assert _resolve_tactic("Defense Impairment", ["Stealth"]) == "Stealth"
    assert _resolve_tactic("Stealth", ["Defense Impairment"]) == "Defense Impairment"


def test_unrelated_tactic_still_fails():
    assert _resolve_tactic("Collection", ["Stealth"]) is None
    assert _resolve_tactic("Execution", ["Execution"]) == "Execution"
