"""Hash-chained, append-only chain-of-custody ledger with ML-DSA-65 seals and tamper simulation."""

from __future__ import annotations

import functools
import hashlib
import importlib.util
import json
import threading
from pathlib import Path
from typing import Any

from dilithium_py.ml_dsa import ML_DSA_65

from saksi import store
from saksi.config import data_dir, now_iso, write_atomic
from saksi.models import (
    Event,
    IntegrityCheck,
    LedgerEntry,
    LedgerKind,
    LedgerVerification,
    SignatureStatus,
)

GENESIS = "0" * 64
SIGNATURE_ALGORITHM = "ML-DSA-65 (FIPS 204)"
_KEY_LOCK = threading.Lock()


def canonical_hash(obj: Any) -> str:
    """Return the sha256 hex digest of the canonical JSON encoding of `obj`."""
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def merkle_root(hashes: list[str]) -> str:
    """Return the Merkle root of hex digests: pairwise sha256 over concatenated hex, last node duplicated when odd."""
    if not hashes:
        return hashlib.sha256(b"").hexdigest()
    level = list(hashes)
    while len(level) > 1:
        if len(level) % 2:
            level.append(level[-1])
        level = [hashlib.sha256((level[i] + level[i + 1]).encode("utf-8")).hexdigest()
                 for i in range(0, len(level), 2)]
    return level[0]


def event_integrity(event: Event) -> IntegrityCheck:
    """Recompute the event's sha256 from its raw record and compare it with the stored value."""
    computed = hashlib.sha256(event.raw.encode("utf-8")).hexdigest()
    return IntegrityCheck(stored_hash=event.sha256, computed_hash=computed, match=computed == event.sha256)


@functools.cache
def ml_dsa_ready() -> bool:
    """Return True when ML-DSA-65 can generate, sign and verify on this machine (probed once)."""
    if importlib.util.find_spec("dilithium_py") is None:
        return False
    try:
        public_key, secret_key = ML_DSA_65.keygen()
        signature = ML_DSA_65.sign(secret_key, b"saksi-readiness")
        return ML_DSA_65.verify(public_key, b"saksi-readiness", signature)
    except Exception:  # a readiness probe: any failure means "not ready"
        return False


def _ledger_path(case_id: str) -> Path:
    return store.case_dir(case_id) / "ledger.jsonl"


def _seal_path(case_id: str) -> Path:
    return store.case_dir(case_id) / "seal.json"


def _marker_path(case_id: str) -> Path:
    return store.case_dir(case_id) / "tamper.active"


def _backup_path(case_id: str) -> Path:
    return store.case_dir(case_id) / "ledger.jsonl.bak"


def _keys_dir() -> Path:
    return data_dir() / "keys"


def _read_lines(case_id: str) -> list[str]:
    path = _ledger_path(case_id)
    if not path.exists():
        return []
    # Split on "\n" only: JSON may contain U+2028, which str.splitlines would break on.
    return [line for line in path.read_text(encoding="utf-8").split("\n") if line]


def _parse(line: str) -> dict[str, Any] | None:
    try:
        value = json.loads(line)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _without_hash(entry: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in entry.items() if key != "entry_hash"}


def _find_break(raw: list[dict[str, Any] | None]) -> tuple[int, str] | None:
    """Return (seq, reason) for the first entry whose hash or link fails, or None when the chain is intact."""
    previous = GENESIS
    for index, entry in enumerate(raw):
        seq = index + 1
        if entry is None:
            return seq, f"Entry {seq} could not be read."
        if entry.get("seq") != seq:
            return seq, f"Entry {seq} has an unexpected sequence number."
        if canonical_hash(_without_hash(entry)) != entry.get("entry_hash"):
            return seq, (f"Entry {seq} was modified after it was recorded: "
                         "its hash no longer matches its contents.")
        if entry.get("prev_hash") != previous:
            if seq == 1:
                return seq, "Entry 1 does not link to the start of the ledger."
            return seq, f"Entry {seq} does not link to entry {seq - 1}."
        previous = entry["entry_hash"]
    return None


def _chain_head(raw: list[dict[str, Any] | None], upto: int) -> str | None:
    """Recompute the head hash after `upto` entries from their current content, or None if the chain breaks first."""
    head = GENESIS
    for index in range(upto):
        entry = raw[index] if index < len(raw) else None
        if entry is None or entry.get("seq") != index + 1 or entry.get("prev_hash") != head:
            return None
        head = canonical_hash(_without_hash(entry))
        if entry.get("entry_hash") != head:
            return None
    return head


def _seal_message(case_id: str, seq: int, head: str) -> bytes:
    return f"SAKSI-SEAL|{case_id}|{seq}|{head}".encode("utf-8")


def _fingerprint(public_key: bytes) -> str:
    return hashlib.sha256(public_key).hexdigest()[:16]


def _public_key() -> bytes | None:
    path = _keys_dir() / "ml_dsa_65.pk"
    return path.read_bytes() if path.exists() else None


def _keys() -> tuple[bytes, bytes]:
    """Return (public, secret) ML-DSA-65 keys, generating them on first use."""
    pk_path, sk_path = _keys_dir() / "ml_dsa_65.pk", _keys_dir() / "ml_dsa_65.sk"
    with _KEY_LOCK:
        if not (pk_path.exists() and sk_path.exists()):
            public_key, secret_key = ML_DSA_65.keygen()
            write_atomic(sk_path, secret_key)
            write_atomic(pk_path, public_key)
        return pk_path.read_bytes(), sk_path.read_bytes()


def _events_root_ok(case_id: str, raw: list[dict[str, Any] | None]) -> bool | None:
    """Check every stored event against its raw record and the Merkle root in the latest EVENTS_NORMALISED entry."""
    normalised = [entry for entry in raw if entry and entry.get("kind") == "EVENTS_NORMALISED"]
    if not normalised:
        return None
    expected = normalised[-1].get("data", {}).get("merkle_root")
    events = store.load_events(case_id)
    integrity_ok = all(event_integrity(event).match for event in events)
    return integrity_ok and merkle_root([event.sha256 for event in events]) == expected


def _signature(case_id: str, raw: list[dict[str, Any] | None]) -> SignatureStatus:
    """Verify seal.json against the chain as it is now, so any edit to an entry at or before the seal fails."""
    public_key = _public_key()
    fingerprint = _fingerprint(public_key) if public_key else ""
    seal_path = _seal_path(case_id)
    if not seal_path.exists():
        return SignatureStatus(public_key_fingerprint=fingerprint, valid=None)
    seal = json.loads(seal_path.read_text(encoding="utf-8"))
    seq, head = seal["signed_seq"], seal["signed_head_hash"]
    valid = False
    if public_key and _chain_head(raw, seq) == head:
        try:
            valid = ML_DSA_65.verify(public_key, _seal_message(case_id, seq, head),
                                     bytes.fromhex(seal["signature_hex"]))
        except ValueError:
            valid = False
    return SignatureStatus(
        algorithm=seal["algorithm"],
        public_key_fingerprint=seal["public_key_fingerprint"],
        signed_head_hash=head,
        signed_seq=seq,
        signed_at=seal["signed_at"],
        valid=valid,
    )


def _intact_reason(count: int, signature: SignatureStatus) -> str:
    reason = f"Chain intact: {count} entries verified."
    if signature.signed_seq is not None:
        after_seal = count - signature.signed_seq - 1  # the SEAL entry itself sits at signed_seq + 1
        if after_seal > 0:
            reason += (f" {after_seal} entries were recorded after the seal; "
                       f"the seal still covers entry {signature.signed_seq}.")
    return reason


def append(case_id: str, kind: LedgerKind, actor: str, summary: str, data: dict[str, Any] | None = None) -> LedgerEntry:
    """Append one entry to the case ledger, chained to the previous entry's hash. Thread-safe."""
    with store.case_lock(case_id):
        lines = _read_lines(case_id)
        last = LedgerEntry.model_validate_json(lines[-1]) if lines else None
        body: dict[str, Any] = {
            "seq": last.seq + 1 if last else 1,
            "ts": now_iso(),
            "case_id": case_id,
            "kind": kind,
            "actor": actor,
            "summary": summary,
            "data": data or {},
            "prev_hash": last.entry_hash if last else GENESIS,
        }
        entry = LedgerEntry(**body, entry_hash=canonical_hash(body))
        with _ledger_path(case_id).open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(entry.model_dump_json() + "\n")
    return entry


def entries(case_id: str) -> list[LedgerEntry]:
    """Return every ledger entry in order, without verifying them."""
    with store.case_lock(case_id):
        return [LedgerEntry.model_validate_json(line) for line in _read_lines(case_id)]


def verify(case_id: str) -> LedgerVerification:
    """Recompute every entry hash and link, the event Merkle root and the seal signature."""
    with store.case_lock(case_id):
        raw = [_parse(line) for line in _read_lines(case_id)]
        broken = _find_break(raw)
        events_ok = _events_root_ok(case_id, raw)
        signature = _signature(case_id, raw)
    broken_at: int | None = None
    if broken is not None:
        broken_at, reason = broken
    elif events_ok is False:
        reason = "Chain intact, but the event evidence no longer matches the hashes recorded at ingestion."
    elif signature.valid is False:
        reason = "Chain intact, but the ML-DSA-65 seal does not verify against this ledger."
    else:
        reason = _intact_reason(len(raw), signature)
    ok = broken is None and events_ok is not False and signature.valid is not False
    return LedgerVerification(
        ok=ok,
        entries=len(raw),
        broken_at=broken_at,
        reason=reason,
        head_hash=raw[-1].get("entry_hash") if raw and raw[-1] else None,
        events_root_ok=events_ok,
        signature=signature,
        checked_at=now_iso(),
        tampered_simulation=_marker_path(case_id).exists(),
    )


def seal(case_id: str) -> SignatureStatus:
    """Sign the current ledger head with ML-DSA-65, write seal.json and record a SEAL entry. Returns the new status."""
    with store.case_lock(case_id):
        current = entries(case_id)
        seq = current[-1].seq if current else 0
        head = current[-1].entry_hash if current else GENESIS
        public_key, secret_key = _keys()
        signature = ML_DSA_65.sign(secret_key, _seal_message(case_id, seq, head))
        fingerprint = _fingerprint(public_key)
        seal_doc = {
            "algorithm": SIGNATURE_ALGORITHM,
            "public_key_fingerprint": fingerprint,
            "signed_head_hash": head,
            "signed_seq": seq,
            "signed_at": now_iso(),
            "signature_hex": signature.hex(),
        }
        write_atomic(_seal_path(case_id), (json.dumps(seal_doc, indent=2) + "\n").encode("utf-8"))
        append(case_id, "SEAL", "system", f"Ledger sealed at entry {seq} with ML-DSA-65.",
               {"public_key_fingerprint": fingerprint, "signed_seq": seq})
    return verify(case_id).signature


def tamper(case_id: str) -> LedgerVerification:
    """Simulate tampering: back up the ledger, change one character of the middle entry's summary, keep its hash."""
    with store.case_lock(case_id):
        path = _ledger_path(case_id)
        if not _marker_path(case_id).exists():
            if not _backup_path(case_id).exists():
                write_atomic(_backup_path(case_id), path.read_bytes())
            lines = _read_lines(case_id)
            if len(lines) < 2:
                raise ValueError("Ledger has fewer than two entries; nothing to tamper with.")
            seq = max(2, len(lines) // 2)
            record = json.loads(lines[seq - 1])
            summary = record["summary"]
            record["summary"] = chr(ord(summary[0]) ^ 1) + summary[1:]
            lines[seq - 1] = json.dumps(record, ensure_ascii=False)
            write_atomic(path, ("\n".join(lines) + "\n").encode("utf-8"))
            _marker_path(case_id).write_bytes(b"")
    return verify(case_id)


def restore(case_id: str) -> LedgerVerification:
    """Put the backed-up ledger back, remove the backup and the tamper marker, then verify."""
    with store.case_lock(case_id):
        backup = _backup_path(case_id)
        if backup.exists():
            write_atomic(_ledger_path(case_id), backup.read_bytes())
            backup.unlink()
        _marker_path(case_id).unlink(missing_ok=True)
    return verify(case_id)
