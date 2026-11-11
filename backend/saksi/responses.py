"""Human-Approved Defensive Response service for SAKSI.

Strict safety boundary:
1. Recommendation: converts verified findings into MITRE D3FEND-mapped response proposals.
2. Approval: requires explicit analyst approval bound to the canonical payload_hash.
3. Execution: simulation-first (`saksi_sim_edr` / `saksi_sim_iam` / `saksi_sim_fw`), plus
   a local lab connector (`saksi_lab_containment_adapter`, environment LAB-LOCAL) that only writes a
   record file in the case folder. It changes no host, network or account.
   Never executes arbitrary shell commands from an LLM.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import re
from typing import Any

from saksi import custody, store
from saksi.config import now_iso
from saksi.models import (
    ExecutionMode,
    Finding,
    ResponseActionType,
    ResponseProposal,
)

IP_RE = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")

LAB_ENV_ID = "LAB-LOCAL"                      # server-side constant; the client must echo it to run a lab action
LAB_CONNECTOR = "saksi_lab_containment_adapter"
LAB_STATE_FILE = "lab_containment_state.json"


def compute_payload_hash(
    case_id: str,
    action_type: ResponseActionType,
    target: str,
    connector: str,
    parameters: dict[str, Any],
) -> str:
    return custody.canonical_hash({
        "case_id": case_id,
        "action_type": action_type,
        "target": target,
        "connector": connector,
        "parameters": parameters,
    })


def _expiry_iso(hours: int = 24) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_proposals(case_id: str) -> list[ResponseProposal]:
    with store.case_lock(case_id):
        raw = store.load_json(case_id, "responses.json")
        if isinstance(raw, list) and raw:
            return [ResponseProposal.model_validate(item) for item in raw]
        generated = generate_proposals_from_findings(case_id)
        if generated:
            save_proposals(case_id, generated)
            for prop in generated:
                custody.append(
                    case_id,
                    "RESPONSE_PROPOSED",
                    prop.recommended_by,
                    f"Proposed {prop.action_type} on {prop.target} ({prop.id})",
                    {
                        "proposal_id": prop.id,
                        "action_type": prop.action_type,
                        "target": prop.target,
                        "payload_hash": prop.payload_hash,
                        "finding_ids": prop.finding_ids,
                    },
                )
        return generated


def save_proposals(case_id: str, proposals: list[ResponseProposal]) -> None:
    store.save_json(case_id, "responses.json", [p.model_dump(mode="json") for p in proposals])


def generate_proposals_from_findings(case_id: str) -> list[ResponseProposal]:
    """Generate deterministic, evidence-backed response proposals strictly from VERIFIED findings."""
    raw_findings = store.load_json(case_id, "findings.json", [])
    findings = [
        Finding.model_validate(f)
        for f in raw_findings
        if f.get("status") == "verified" and f.get("origin") != "self_test"
    ]
    if not findings:
        return []

    created_at = now_iso()
    expires_at = _expiry_iso(24)
    proposals: list[ResponseProposal] = []
    seen_targets: set[tuple[str, str]] = set()
    events_by_id = {e.id: e for e in store.load_events(case_id)}

    def add_proposal(
        action_type: ResponseActionType,
        target: str,
        title: str,
        reason: str,
        benefit: str,
        matched_findings: list[Finding],
        d3fend_id: str,
        d3fend_name: str,
        impact: str,
        reversibility: str,
        rollback: str,
        connector: str,
        parameters: dict[str, Any],
        risk_tier: str = "high",
        recommended_by: str = "scenario_template",
    ) -> None:
        key = (action_type, target.lower())
        if key in seen_targets:
            return
        fids = [f.id for f in matched_findings]
        eids = list(dict.fromkeys(eid for f in matched_findings for eid in f.evidence_ids[:6]))[:12]
        # Scenario templates name a fixed target. Keep one only when that target is actually in the
        # matched findings (title/summary/entities) or in the events they cite.
        needle = target.lower()
        in_findings = any(
            needle in " ".join([f.title, f.summary, *f.entities]).lower() for f in matched_findings
        )
        in_events = any(
            needle in f"{events_by_id[eid].raw} {events_by_id[eid].message}".lower()
            for f in matched_findings for eid in f.evidence_ids if eid in events_by_id
        )
        if not (in_findings or in_events):
            return
        seen_targets.add(key)
        finding_status = {f.id: f.status for f in matched_findings}
        pid = f"RESP-{len(proposals) + 1:03d}"
        phash = compute_payload_hash(case_id, action_type, target, connector, parameters)
        proposals.append(ResponseProposal(
            id=pid,
            case_id=case_id,
            action_type=action_type,
            target=target,
            title=title,
            reason=reason,
            security_benefit=benefit,
            finding_ids=fids,
            evidence_ids=eids,
            d3fend_id=d3fend_id,
            d3fend_name=d3fend_name,
            impact_assessment=impact,
            reversibility=reversibility,
            rollback_procedure=rollback,
            connector=connector,
            execution_mode="simulation",
            parameters=parameters,
            risk_tier=risk_tier,  # type: ignore[arg-type]
            confidence="high",
            status="pending_approval",
            created_at=created_at,
            expires_at=expires_at,
            payload_hash=phash,
            recommended_by=recommended_by,
            basis_hash=_basis_hash(
                [(fid, finding_status[fid]) for fid in fids],
                [(eid, events_by_id[eid].sha256) for eid in eids if eid in events_by_id],
            ),
        ))

    def _match(f: Finding, *tokens: str) -> bool:
        haystack = f"{f.title} {f.summary} {f.technique_id} {' '.join(f.entities)}".lower()
        return any(tok.lower() in haystack for tok in tokens)

    # 1. Block external attacker / C2 IPs
    c2_findings = [f for f in findings if _match(f, "198.51.100.77", "T1041", "T1071")]
    if c2_findings:
        add_proposal(
            action_type="block_ip",
            target="198.51.100.77",
            title="Block C2 & Exfiltration IP 198.51.100.77 at Perimeter Firewall",
            reason="Verified outbound C2 connection (T1071.001) and 412 MB archive exfiltration (T1041) to 198.51.100.77:443.",
            benefit="Immediately severs active C2 channel and prevents further outbound data transfer.",
            matched_findings=c2_findings,
            d3fend_id="D3-ITF",
            d3fend_name="Inbound/Outbound Traffic Filtering",
            impact="Low operational risk: external address 198.51.100.77 has no legitimate business traffic.",
            reversibility="Fully reversible via firewall address-group policy removal.",
            rollback="Remove 198.51.100.77 from PA-FW-01 deny-list rule 'SAKSI-BLOCK-EXT'.",
            connector="saksi_sim_fw",
            parameters={"firewall": "PA-FW-01", "direction": "both", "ip": "198.51.100.77", "port": "any"},
            risk_tier="medium",
        )

    scanner_findings = [f for f in findings if _match(f, "203.0.113.66", "T1595", "T1190")]
    if scanner_findings:
        add_proposal(
            action_type="block_ip",
            target="203.0.113.66",
            title="Block External Attacker IP 203.0.113.66 at Perimeter Firewall",
            reason="Verified vulnerability scanning (T1595.002), SQLi exploitation (T1190) and web shell control (T1505.003) from 203.0.113.66.",
            benefit="Prevents external attacker from sending further commands to WEB-PORTAL-01.",
            matched_findings=scanner_findings,
            d3fend_id="D3-ITF",
            d3fend_name="Inbound/Outbound Traffic Filtering",
            impact="Low operational risk: external attacker IP with no legitimate sessions.",
            reversibility="Fully reversible via firewall rule rollback.",
            rollback="Remove 203.0.113.66 from PA-FW-01 deny-list rule 'SAKSI-BLOCK-EXT'.",
            connector="saksi_sim_fw",
            parameters={"firewall": "PA-FW-01", "direction": "inbound", "ip": "203.0.113.66"},
            risk_tier="medium",
        )

    # 2. Disable compromised domain account
    acct_findings = [f for f in findings if _match(f, "k.hafiz", "T1078", "T1021")]
    if acct_findings:
        add_proposal(
            action_type="disable_account",
            target="LOGISTIK\\k.hafiz",
            title="Suspend Compromised Domain Account LOGISTIK\\k.hafiz & Revoke Kerberos Tickets",
            reason="Verified credential abuse (T1078), SMB ADMIN$ share access (T1021.002) and PsExec execution (T1569.002) under LOGISTIK\\k.hafiz.",
            benefit="Stops lateral movement across domain servers and invalidates stolen session tokens.",
            matched_findings=acct_findings,
            d3fend_id="D3-AL",
            d3fend_name="Account Locking & Session Revocation",
            impact="Medium impact: user k.hafiz will be locked out of logistics workstations and file shares until password reset.",
            reversibility="Reversible by Active Directory administrator on DC-01.",
            rollback="Re-enable AD account LOGISTIK\\k.hafiz on DC-01 after credential rotation and MFA re-enrolment.",
            connector="saksi_sim_iam",
            parameters={"domain_controller": "DC-01", "account": "LOGISTIK\\k.hafiz", "revoke_sessions": True},
            risk_tier="high",
        )

    # 3. Isolate compromised hosts
    web_findings = [f for f in findings if _match(f, "WEB-PORTAL-01", "T1505", "T1003")]
    if web_findings:
        add_proposal(
            action_type="isolate_host",
            target="WEB-PORTAL-01",
            title="Network-Isolate Compromised Host WEB-PORTAL-01 (10.10.1.10)",
            reason="Verified web shell persistence (img_upd.aspx), encoded PowerShell execution and LSASS credential dumping on WEB-PORTAL-01.",
            benefit="Contains the beachhead server while preserving memory and disk forensics for DFIR acquisition.",
            matched_findings=web_findings,
            d3fend_id="D3-NI",
            d3fend_name="Network Isolation",
            impact="High business impact: public logistics web portal (10.10.1.10) will be unreachable except by SOC management VLAN.",
            reversibility="Reversible via EDR host un-isolation command.",
            rollback="Release EDR network containment on WEB-PORTAL-01 after web shell removal and IIS credential rotation.",
            connector="saksi_sim_edr",
            parameters={"host": "WEB-PORTAL-01", "ip": "10.10.1.10", "allow_soc_mgmt": True},
            risk_tier="critical",
        )

    fs_findings = [f for f in findings if _match(f, "FS-LOGISTIK-01", "T1569", "T1560")]
    if fs_findings:
        add_proposal(
            action_type="isolate_host",
            target="FS-LOGISTIK-01",
            title="Network-Isolate File Server FS-LOGISTIK-01 (10.10.3.20)",
            reason="Verified PsExec service installation (PSEXESVC), 7-Zip staging of Jadual_Penghantaran_Q4 and 412 MB exfiltration from FS-LOGISTIK-01.",
            benefit="Halts ongoing file staging and unauthorized SMB administrative access.",
            matched_findings=fs_findings,
            d3fend_id="D3-NI",
            d3fend_name="Network Isolation",
            impact="Critical operational impact: internal logistics file shares on FS-LOGISTIK-01 will be offline during containment.",
            reversibility="Reversible via EDR containment release.",
            rollback="Lift EDR isolation on FS-LOGISTIK-01 after removing PSEXESVC and C:\\Users\\Public\\q4.7z.",
            connector="saksi_sim_edr",
            parameters={"host": "FS-LOGISTIK-01", "ip": "10.10.3.20", "allow_soc_mgmt": True},
            risk_tier="critical",
        )

    if not proposals:
        _add_evidence_driven_proposals(findings, events_by_id, add_proposal)

    return proposals


_BUILTIN_ACCOUNT = re.compile(
    r"^(nt authority\\|nt service\\|window manager\\|font driver host\\|(local service|network service|system)$)|\$$",
    re.IGNORECASE)


def _is_builtin_account(user: str) -> bool:
    """Built-in and machine accounts (SYSTEM, NETWORK SERVICE, HOST$) are never proposed for disabling."""
    return bool(_BUILTIN_ACCOUNT.search(user.strip()))


def _add_evidence_driven_proposals(findings: list[Finding], events_by_id: dict[str, Any], add_proposal) -> None:
    """For uploaded data (no scenario template matched): propose containment for the host, account and
    external address that appear most often in the verified findings' cited events. The analyst still
    has to approve each one."""
    import ipaddress
    from collections import Counter

    hosts: Counter[str] = Counter()
    users: Counter[str] = Counter()
    ips: Counter[str] = Counter()
    for f in findings:
        for eid in f.evidence_ids:
            ev = events_by_id.get(eid)
            if ev is None:
                continue
            if ev.host:
                hosts[ev.host] += 1
            if ev.user and not _is_builtin_account(ev.user):
                users[ev.user] += 1
            for ip in (ev.src_ip, ev.dst_ip):
                try:
                    if ip and not ipaddress.ip_address(ip).is_private:
                        ips[ip] += 1
                except ValueError:
                    continue

    def cited_by(value: str) -> list[Finding]:
        return [f for f in findings if any(
            value in (events_by_id[e].host, events_by_id[e].user, events_by_id[e].src_ip, events_by_id[e].dst_ip)
            for e in f.evidence_ids if e in events_by_id)]

    def top(counter: Counter[str], n: int) -> list[tuple[str, list[Finding]]]:
        return [(value, cited_by(value)) for value, _count in counter.most_common(n)]

    for host, fs in top(hosts, 3):
        add_proposal(
            action_type="isolate_host", target=host,
            title=f"Network-isolate host {host}",
            reason=f"{host} appears in the evidence of {len(fs)} verified finding(s), more than any other host.",
            benefit="Stops the host talking to the rest of the network while the analyst investigates.",
            matched_findings=fs, d3fend_id="D3-NI", d3fend_name="Network Isolation",
            impact="Medium to high: services on this host go offline until isolation is lifted.",
            reversibility="Reversible by lifting the EDR network containment.",
            rollback=f"Lift EDR network containment on {host}.",
            connector="saksi_sim_edr", parameters={"host": host, "allow_soc_mgmt": True},
            risk_tier="high", recommended_by="evidence_rules",
        )
    for user, fs in top(users, 2):
        add_proposal(
            action_type="disable_account", target=user,
            title=f"Disable account {user} and revoke its sessions",
            reason=f"{user} appears in the evidence of {len(fs)} verified finding(s), more than any other account.",
            benefit="Cuts off any attacker using this account and forces a credential reset.",
            matched_findings=fs, d3fend_id="D3-AL", d3fend_name="Account Locking",
            impact="Medium: the account owner is locked out until the analyst re-enables it.",
            reversibility="Reversible by re-enabling the account after a credential reset.",
            rollback=f"Re-enable {user} after credential rotation and MFA re-enrolment.",
            connector="saksi_sim_iam", parameters={"account": user, "revoke_sessions": True},
            risk_tier="medium", recommended_by="evidence_rules",
        )
    for ip, fs in top(ips, 2):
        add_proposal(
            action_type="block_ip", target=ip,
            title=f"Block external address {ip} at the perimeter firewall",
            reason=f"{ip} is a public address that appears in the evidence of {len(fs)} verified finding(s).",
            benefit="Stops further traffic to and from this address.",
            matched_findings=fs, d3fend_id="D3-ITF", d3fend_name="Inbound/Outbound Traffic Filtering",
            impact="Low to medium: legitimate traffic to this address would also be blocked.",
            reversibility="Fully reversible by removing the deny rule.",
            rollback=f"Remove {ip} from the firewall deny list.",
            connector="saksi_sim_fw", parameters={"direction": "both", "ip": ip, "port": "any"},
            risk_tier="medium", recommended_by="evidence_rules",
        )


def _find(proposals: list[ResponseProposal], case_id: str, proposal_id: str) -> ResponseProposal:
    prop = next((p for p in proposals if p.id == proposal_id), None)
    if prop is None:
        raise KeyError(f"Response proposal {proposal_id} not found")
    return prop


def _invalidate(case_id: str, proposals: list[ResponseProposal], prop: ResponseProposal, reason: str) -> None:
    """Mark an approval/proposal invalid, ledger it, persist, and leave the caller to raise."""
    prop.status = "invalidated"
    prop.invalidated_reason = reason
    entry = custody.append(
        case_id,
        "RESPONSE_INVALIDATED",
        "system",
        f"Invalidated {prop.action_type} on {prop.target} ({prop.id}): {reason}",
        {
            "proposal_id": prop.id,
            "action_type": prop.action_type,
            "target": prop.target,
            "payload_hash": prop.payload_hash,
            "reason": reason,
        },
    )
    prop.ledger_seq = entry.seq
    save_proposals(case_id, proposals)


def _assert_integrity(
    case_id: str,
    proposals: list[ResponseProposal],
    prop: ResponseProposal,
    request_hash: str | None = None,
) -> None:
    """Server-side re-verification before approve/execute.

    Recomputes the payload hash from the stored fields, checks that every cited finding is still
    verified, that every cited event still matches its stored hash, and (when present) that the
    basis hash is unchanged. Any failure invalidates the proposal and raises ValueError(reason).
    `request_hash`, when given, must equal the stored hash; a mismatch also invalidates.
    """
    reason: str | None = None
    recomputed = compute_payload_hash(prop.case_id, prop.action_type, prop.target, prop.connector, prop.parameters)
    if recomputed != prop.payload_hash:
        reason = "Payload changed: the stored action fields no longer match the payload hash that was proposed."
    elif request_hash is not None and request_hash != prop.payload_hash:
        reason = "Payload hash mismatch: the request does not match the approved action payload."
    else:
        reason = _basis_problem(case_id, prop)
    if reason:
        _invalidate(case_id, proposals, prop, reason)
        raise ValueError(f"Safety Policy Gate: approval invalidated. {reason}")


def _basis_problem(case_id: str, prop: ResponseProposal) -> str | None:
    findings = {f.get("id"): f for f in store.load_json(case_id, "findings.json", [])}
    for fid in prop.finding_ids:
        status = (findings.get(fid) or {}).get("status")
        if status != "verified":
            return f"Finding {fid} is no longer verified (current status: {status or 'missing'})."
    events = {e.id: e for e in store.load_events(case_id)} if prop.evidence_ids else {}
    for eid in prop.evidence_ids:
        event = events.get(eid)
        if event is None:
            return f"Cited event {eid} is missing from the case evidence."
        if not custody.event_integrity(event).match:
            return f"Cited event {eid} failed its integrity check (stored hash does not match the raw record)."
    if prop.basis_hash and prop.basis_hash != _basis_hash(
        [(fid, (findings.get(fid) or {}).get("status")) for fid in prop.finding_ids],
        [(eid, events[eid].sha256) for eid in prop.evidence_ids if eid in events],
    ):
        return "The findings or evidence this proposal was based on have changed."
    return None


def _basis_hash(finding_statuses: list[tuple[str, Any]], event_hashes: list[tuple[str, str]]) -> str:
    return custody.canonical_hash({
        "findings": sorted([fid, status] for fid, status in finding_statuses),
        "evidence": sorted([eid, sha] for eid, sha in event_hashes),
    })


def approve_proposal(
    case_id: str,
    proposal_id: str,
    analyst: str,
    payload_hash: str,
    note: str = "",
    mode: ExecutionMode | None = None,
) -> ResponseProposal:
    with store.case_lock(case_id):
        proposals = load_proposals(case_id)
        prop = _find(proposals, case_id, proposal_id)
        if prop.payload_hash != payload_hash:
            raise ValueError("Payload hash mismatch: approval must bind to the exact unmodified action payload.")
        if prop.status not in ("pending_approval", "draft", "rejected"):
            raise ValueError(f"Proposal {proposal_id} cannot be approved from status '{prop.status}'.")

        ts = now_iso()
        if prop.expires_at < ts:
            prop.status = "expired"
            save_proposals(case_id, proposals)
            raise ValueError(f"Proposal {proposal_id} has expired.")
        _assert_integrity(case_id, proposals, prop, payload_hash)

        prop.status = "approved"
        prop.approved_by = analyst.strip() or "Analyst"
        prop.approved_at = ts
        prop.approved_mode = mode or "simulation"
        prop.decision_note = note.strip()
        entry = custody.append(
            case_id,
            "RESPONSE_APPROVED",
            f"analyst:{prop.approved_by}",
            f"Approved {prop.action_type} on {prop.target} ({prop.id})",
            {
                "proposal_id": prop.id,
                "action_type": prop.action_type,
                "target": prop.target,
                "payload_hash": prop.payload_hash,
                "approved_mode": prop.approved_mode,
                "note": prop.decision_note,
            },
        )
        prop.ledger_seq = entry.seq
        save_proposals(case_id, proposals)
        return prop


def reject_proposal(
    case_id: str,
    proposal_id: str,
    analyst: str,
    payload_hash: str,
    note: str = "",
) -> ResponseProposal:
    with store.case_lock(case_id):
        proposals = load_proposals(case_id)
        prop = _find(proposals, case_id, proposal_id)
        if prop.payload_hash != payload_hash:
            raise ValueError("Payload hash mismatch.")

        ts = now_iso()
        prop.status = "rejected"
        prop.rejected_by = analyst.strip() or "Analyst"
        prop.rejected_at = ts
        prop.decision_note = note.strip()
        entry = custody.append(
            case_id,
            "RESPONSE_REJECTED",
            f"analyst:{prop.rejected_by}",
            f"Rejected {prop.action_type} on {prop.target} ({prop.id})",
            {
                "proposal_id": prop.id,
                "action_type": prop.action_type,
                "target": prop.target,
                "payload_hash": prop.payload_hash,
                "note": prop.decision_note,
            },
        )
        prop.ledger_seq = entry.seq
        save_proposals(case_id, proposals)
        return prop


def execute_proposal(
    case_id: str,
    proposal_id: str,
    analyst: str,
    payload_hash: str,
    mode: ExecutionMode = "simulation",
    confirm_target: str | None = None,
    environment: str | None = None,
) -> ResponseProposal:
    """Policy Gate + Adapter: executes ONLY if approved, the hash matches and the basis is intact."""
    with store.case_lock(case_id):
        proposals = load_proposals(case_id)
        prop = _find(proposals, case_id, proposal_id)
        if prop.status != "approved":
            raise ValueError(
                f"Safety Policy Gate: Proposal {proposal_id} has status '{prop.status}'. "
                "Explicit analyst approval is required before execution."
            )

        ts = now_iso()
        if prop.expires_at < ts:
            prop.status = "expired"
            save_proposals(case_id, proposals)
            raise ValueError(f"Safety Policy Gate: Approval for {proposal_id} has expired.")
        # A hash that differs from the approved payload, an edited payload, or changed
        # findings/evidence invalidate the approval (ledgered) instead of just failing the call.
        _assert_integrity(case_id, proposals, prop, payload_hash)

        if mode == "live_lab":
            if (prop.approved_mode or "simulation") != "live_lab":
                raise ValueError(
                    "Safety Policy Gate: this proposal was approved for simulation only. "
                    "Lab execution needs an approval with scope 'live_lab'."
                )
            if confirm_target is None or confirm_target != prop.target:
                raise ValueError("Safety Policy Gate: confirm_target must equal the proposal target exactly.")
            if environment != LAB_ENV_ID:
                raise ValueError(f"Safety Policy Gate: environment must be '{LAB_ENV_ID}' for lab execution.")

        prop.execution_mode = mode
        prop.executed_at = ts
        prop.executed_by = analyst.strip() or "Analyst"
        extra: dict[str, Any] = {}

        if mode == "simulation":
            prop.status = "simulated"
            prop.execution_result = (
                f"[SIMULATED — NO SYSTEM ACTION TAKEN] Connector '{prop.connector}' validated payload "
                f"{prop.payload_hash[:12]} and simulated '{prop.action_type}' on target '{prop.target}'."
            )
        else:
            prop.status = "succeeded"
            # Lab adapter: appends a record to a local file in the case folder. Nothing else changes.
            existing = store.load_json(case_id, LAB_STATE_FILE, [])
            existing.append({
                "proposal_id": prop.id,
                "action_type": prop.action_type,
                "target": prop.target,
                "connector": LAB_CONNECTOR,
                "environment": LAB_ENV_ID,
                "payload_hash": prop.payload_hash,
                "executed_at": ts,
                "authorized_by": prop.approved_by,
                "executed_by": prop.executed_by,
                "status": "active_lab_policy",
            })
            store.save_json(case_id, LAB_STATE_FILE, existing)
            prop.environment = LAB_ENV_ID
            prop.execution_result = (
                f"Lab record written in {LAB_ENV_ID} for '{prop.action_type}' on '{prop.target}' "
                f"(local adapter; recorded in {LAB_STATE_FILE}, hash {prop.payload_hash[:12]}). "
                "No host, network or account was changed."
            )
            extra = {"environment": LAB_ENV_ID, "lab_connector": LAB_CONNECTOR}

        entry = custody.append(
            case_id,
            "RESPONSE_EXECUTED",
            f"analyst:{prop.executed_by}",
            f"Executed {prop.action_type} on {prop.target} ({mode})",
            {
                "proposal_id": prop.id,
                "action_type": prop.action_type,
                "target": prop.target,
                "mode": mode,
                "connector": prop.connector,
                "payload_hash": prop.payload_hash,
                "approved_by": prop.approved_by,
                **extra,
            },
        )
        prop.ledger_seq = entry.seq
        save_proposals(case_id, proposals)
        return prop


def rollback_proposal(
    case_id: str,
    proposal_id: str,
    analyst: str,
    payload_hash: str = "",
    note: str = "",
) -> ResponseProposal:
    with store.case_lock(case_id):
        proposals = load_proposals(case_id)
        prop = _find(proposals, case_id, proposal_id)
        if prop.status not in ("succeeded", "simulated"):
            raise ValueError(f"Proposal {proposal_id} can only be rolled back from 'succeeded' or 'simulated' state.")
        if not payload_hash:
            raise ValueError("Payload hash is required to roll back a response.")
        if prop.payload_hash != payload_hash:
            raise ValueError("Payload hash mismatch.")

        ts = now_iso()
        who = analyst.strip() or "Analyst"
        prop.status = "rolled_back"
        prop.rolled_back_at = ts
        prop.rolled_back_by = who
        suffix = f" ({note.strip()})" if note.strip() else ""
        prop.execution_result = f"Rolled back at {ts} by {who}{suffix}: {prop.rollback_procedure}"
        if prop.environment:
            records = store.load_json(case_id, LAB_STATE_FILE, [])
            for rec in records:
                if rec.get("proposal_id") == prop.id and rec.get("status") == "active_lab_policy":
                    rec.update(status="rolled_back", rolled_back_by=who, rolled_back_at=ts)
            store.save_json(case_id, LAB_STATE_FILE, records)
        entry = custody.append(
            case_id,
            "RESPONSE_ROLLED_BACK",
            f"analyst:{who}",
            f"Rolled back {prop.action_type} on {prop.target} ({prop.id})",
            {
                "proposal_id": prop.id,
                "action_type": prop.action_type,
                "target": prop.target,
                "payload_hash": prop.payload_hash,
            },
        )
        prop.ledger_seq = entry.seq
        save_proposals(case_id, proposals)
        return prop
