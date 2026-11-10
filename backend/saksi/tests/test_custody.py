"""Ledger append/verify, tamper simulation, ML-DSA-65 seals and Merkle roots."""

from __future__ import annotations

import hashlib
import json

from saksi import custody, store


def _case_with_entries(count: int) -> str:
    case_id = store.new_case_id()
    for index in range(count):
        custody.append(case_id, "AGENT_STEP", "triage", f"step {index}", {"index": index})
    return case_id


def test_append_and_verify_ok() -> None:
    case_id = _case_with_entries(5)
    result = custody.verify(case_id)
    assert result.ok is True
    assert result.entries == 5
    assert result.broken_at is None
    assert result.reason == "Chain intact: 5 entries verified."
    assert result.tampered_simulation is False


def test_tamper_breaks_chain_and_restore_repairs_it() -> None:
    case_id = _case_with_entries(6)
    tampered = custody.tamper(case_id)
    assert tampered.ok is False
    assert tampered.broken_at == 3
    assert tampered.reason == "Entry 3 was modified after it was recorded: its hash no longer matches its contents."
    assert tampered.tampered_simulation is True

    restored = custody.restore(case_id)
    assert restored.ok is True
    assert restored.tampered_simulation is False


def test_seal_signature_is_valid() -> None:
    case_id = _case_with_entries(4)
    status = custody.seal(case_id)
    assert status.valid is True
    assert status.signed_seq == 4
    assert custody.verify(case_id).signature.valid is True


def test_edit_before_seal_invalidates_signature() -> None:
    case_id = _case_with_entries(4)
    custody.seal(case_id)
    path = store.case_dir(case_id) / "ledger.jsonl"
    lines = path.read_text(encoding="utf-8").splitlines()
    record = json.loads(lines[1])
    record["summary"] = "edited after sealing"
    lines[1] = json.dumps(record)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    result = custody.verify(case_id)
    assert result.ok is False
    assert result.broken_at == 2
    assert result.signature.valid is False


def test_merkle_root_is_deterministic() -> None:
    hashes = [custody.canonical_hash(index) for index in range(5)]
    assert custody.merkle_root(hashes) == custody.merkle_root(list(hashes))
    assert custody.merkle_root(hashes) != custody.merkle_root(hashes[:4])
    assert custody.merkle_root([]) == hashlib.sha256(b"").hexdigest()
