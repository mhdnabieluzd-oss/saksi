"""ATT&CK lookup: known techniques resolve, unknown ids do not."""

from __future__ import annotations

from saksi import attack_db


def test_t1190_is_initial_access() -> None:
    assert attack_db.exists("T1190")
    assert "Initial Access" in attack_db.tactics_for("T1190")


def test_sub_technique_exists() -> None:
    assert attack_db.exists("T1003.001")
    assert attack_db.get("T1003.001")["id"] == "T1003.001"


def test_unknown_technique_is_absent() -> None:
    assert attack_db.exists("T1999") is False
    assert attack_db.get("T1999") is None
    assert attack_db.tactics_for("T1999") == []
