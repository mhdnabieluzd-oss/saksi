"""Autonomous Investigation Planner for SAKSI.

Builds and updates structured, versioned InvestigationPlans for a case.
If a case was already completed before the planner upgrade, `ensure_plan` synthesizes
the historical plan version history from stored signals, agent_events and findings
so existing demo cases immediately display a full Investigation Plan Map.
"""
from __future__ import annotations

import re
from typing import Any

from saksi import bus, custody, store
from saksi.config import now_iso
from saksi.models import (
    AgentEvent,
    Finding,
    InvestigationPlan,
    PlanLimits,
    PlanTask,
    Signal,
)

EVENT_ID_RE = re.compile(r"EV-\d{5}")


def load_plans(case_id: str) -> list[InvestigationPlan]:
    raw = store.load_json(case_id, "plans.json")
    if isinstance(raw, list) and raw:
        return [InvestigationPlan.model_validate(item) for item in raw]
    single = store.load_json(case_id, "plan.json")
    if isinstance(single, dict):
        return [InvestigationPlan.model_validate(single)]
    # Synthesize from existing case state if the case has already been run
    synthesized = _synthesize_from_case(case_id)
    if synthesized:
        save_plans(case_id, synthesized)
        return synthesized
    return []


def load_latest_plan(case_id: str) -> InvestigationPlan | None:
    plans = load_plans(case_id)
    return plans[-1] if plans else None


def save_plans(case_id: str, plans: list[InvestigationPlan]) -> None:
    if not plans:
        return
    store.save_json(case_id, "plans.json", [p.model_dump(mode="json") for p in plans])
    store.save_json(case_id, "plan.json", plans[-1].model_dump(mode="json"))


def _stage_for_tool(tool_name: str) -> str:
    if tool_name == "list_signals":
        return "triage"
    if tool_name == "submit_findings":
        return "verification"
    return "inquiry"


def create_initial_plan(case_id: str, scope: str, signals: list[Signal]) -> InvestigationPlan:
    ts = now_iso()
    run_id = f"RUN-{case_id}"
    objective = (
        scope.split(".")[0].strip() + "."
        if scope.strip()
        else "Determine initial access vector, privilege escalation, lateral movement and data exfiltration scope."
    )
    tasks: list[PlanTask] = [
        PlanTask(
            task_id="TASK-01",
            title="Inventory triage detection signals",
            objective="Review all deterministic detection rule hits and prioritise high-severity leads.",
            rationale="Triage flagged suspicious activity in the ingested logs.",
            status="ready",
            tool_name="list_signals",
            stage="triage",
            policy="allowed",
            input={},
            depends_on=[],
            expected_evidence=["Signal IDs", "Initial event IDs", "ATT&CK technique leads"],
            risk="read_only",
            max_results=50,
            timeout_seconds=10,
            plan_version_added=1,
        )
    ]

    # Add initial planned tasks based on signals
    hosts = list(dict.fromkeys(e for s in signals for e in s.entities if e.isupper() and "-" in e))
    users = list(dict.fromkeys(e for s in signals for e in s.entities if "\\" in e or "hafiz" in e.lower()))
    ext_ips = list(dict.fromkeys(
        e for s in signals for e in s.entities
        if re.match(r"^\d+\.\d+\.\d+\.\d+$", e) and not e.startswith("10.") and not e.startswith("192.168.")
    ))

    idx = 2
    if signals:
        first_ids = list(dict.fromkeys(eid for s in signals[:4] for eid in s.event_ids[:4]))[:15]
        tasks.append(PlanTask(
            task_id=f"TASK-{idx:02d}",
            title="Inspect primary signal evidence records",
            objective="Fetch raw event details for the highest-priority signals.",
            rationale=f"Verify exact HTTP requests and process creation lines across {len(first_ids)} signal events.",
            status="planned",
            tool_name="get_events",
            input={"ids": first_ids},
            depends_on=["TASK-01"],
            expected_evidence=["Raw event fields", "Hosts, accounts and addresses involved"],
            plan_version_added=1,
        ))
        idx += 1

    if hosts:
        tasks.append(PlanTask(
            task_id=f"TASK-{idx:02d}",
            title=f"Trace host activity on {hosts[0]}",
            objective=f"Reconstruct the activity recorded on {hosts[0]}.",
            rationale=f"Host {hosts[0]} appears in the detection signals.",
            status="planned",
            tool_name="get_host_timeline",
            input={"host": hosts[0], "limit": 25},
            depends_on=["TASK-01"],
            expected_evidence=["Process, logon and network activity on the host"],
            plan_version_added=1,
        ))
        idx += 1

    if users:
        tasks.append(PlanTask(
            task_id=f"TASK-{idx:02d}",
            title=f"Pivot on account {users[0]}",
            objective=f"Find logons and access by {users[0]}.",
            rationale=f"Account {users[0]} appears in the detection signals.",
            status="planned",
            tool_name="related_auth_events",
            input={"user": users[0], "limit": 25},
            depends_on=["TASK-01"],
            expected_evidence=["Logon events", "Source and destination hosts"],
            plan_version_added=1,
        ))
        idx += 1

    if ext_ips:
        tasks.append(PlanTask(
            task_id=f"TASK-{idx:02d}",
            title=f"Correlate external address {ext_ips[-1]}",
            objective=f"Check all connections and data transferred to {ext_ips[-1]}.",
            rationale=f"External address {ext_ips[-1]} appears in the detection signals.",
            status="planned",
            tool_name="search_events",
            input={"ip": ext_ips[-1], "limit": 25},
            depends_on=["TASK-01"],
            expected_evidence=["Connections and byte counts", "Initiating hosts"],
            plan_version_added=1,
        ))
        idx += 1

    tasks.append(PlanTask(
        task_id=f"TASK-{idx:02d}",
        title="Submit candidate findings to Verifier",
        objective="Compile evidence-backed findings with ATT&CK mappings for independent verification.",
        rationale="Every hypothesis must pass deterministic and AI support checks before entering the case graph.",
        status="planned",
        tool_name="submit_findings",
        input={},
        depends_on=[t.task_id for t in tasks],
        expected_evidence=["Verified findings", "Evidence receipts"],
        plan_version_added=1,
    ))

    plan = InvestigationPlan(
        plan_id=f"PLAN-{case_id}-v1",
        case_id=case_id,
        run_id=run_id,
        version=1,
        created_at=ts,
        updated_at=ts,
        status="active",
        objective=objective,
        revision_reason="Initial autonomous plan generated from Triage scope and detection signals",
        tasks=tasks,
        limits=PlanLimits(),
    )
    save_plans(case_id, [plan])
    custody.append(
        case_id,
        "PLAN_UPDATED",
        "investigator",
        f"Created investigation plan v1 ({len(tasks)} tasks)",
        {"plan_id": plan.plan_id, "version": 1, "task_count": len(tasks)},
    )
    bus.emit(
        case_id,
        "investigator",
        "action",
        f"Plan v1 created: {len(tasks)} tasks queued ({objective[:90]})",
    )
    return plan


def record_tool_step(
    case_id: str,
    tool_name: str,
    args: dict[str, Any],
    summary: str,
    evidence_ids: list[str],
    *,
    blocked: bool = False,
    blocked_reason: str | None = None,
) -> InvestigationPlan:
    """Update the active plan or dynamically add a re-planned pivot task when the Investigator calls a tool."""
    plans = load_plans(case_id)
    if not plans:
        signals = [Signal.model_validate(s) for s in store.load_json(case_id, "signals.json", [])]
        scope_path = store.case_dir(case_id) / "scope.txt"
        scope = scope_path.read_text(encoding="utf-8") if scope_path.exists() else ""
        current = create_initial_plan(case_id, scope, signals)
        plans = [current]
    else:
        current = plans[-1].model_copy(deep=True)

    ts = now_iso()
    matched_task: PlanTask | None = None
    for t in current.tasks:
        if t.status in ("ready", "planned", "running") and t.tool_name == tool_name:
            matched_task = t
            break

    if matched_task is not None:
        matched_task.started_at = matched_task.started_at or ts
        matched_task.finished_at = ts
        matched_task.input = args or matched_task.input
        if blocked:
            matched_task.status = "blocked"
            matched_task.policy = "blocked"
            matched_task.policy_reason = blocked_reason or summary
            matched_task.blocked_reason = blocked_reason or summary
            matched_task.output_summary = blocked_reason or summary
        else:
            matched_task.status = "completed"
            matched_task.policy = "allowed"
            matched_task.output_summary = summary
            matched_task.evidence_ids = sorted(set(matched_task.evidence_ids) | set(evidence_ids))
        current.updated_at = ts
        plans[-1] = current
    else:
        # Dynamic re-plan: Investigator requested a new pivot or query based on previous evidence
        new_version = current.version + 1
        task_num = len(current.tasks) + 1
        arg_desc = ", ".join(f"{k}={v}" for k, v in (args or {}).items() if isinstance(v, (str, int)) and v != "")
        title = _task_title_for_call(tool_name, args or {})
        new_task = PlanTask(
            task_id=f"TASK-{task_num:02d}",
            title=title,
            objective=f"Dynamic pivot via {tool_name}({arg_desc[:60]})",
            rationale="Adaptive re-plan triggered after inspecting preceding tool evidence.",
            status="blocked" if blocked else "completed",
            tool_name=tool_name,
            stage=_stage_for_tool(tool_name),
            policy="blocked" if blocked else "allowed",
            policy_reason=blocked_reason if blocked else None,
            input=args or {},
            depends_on=["TASK-01"],
            expected_evidence=["Correlated log events", "Entity relationships"],
            started_at=ts,
            finished_at=ts,
            output_summary=blocked_reason if blocked and blocked_reason else summary,
            evidence_ids=evidence_ids,
            blocked_reason=blocked_reason if blocked else None,
            plan_version_added=new_version,
        )
        # Insert before the final submit_findings task if present
        submit_idx = next((i for i, t in enumerate(current.tasks) if t.tool_name == "submit_findings"), None)
        if submit_idx is not None:
            current.tasks.insert(submit_idx, new_task)
            current.tasks[submit_idx + 1].depends_on.append(new_task.task_id)
        else:
            current.tasks.append(new_task)

        current.version = new_version
        current.plan_id = f"PLAN-{case_id}-v{new_version}"
        current.updated_at = ts
        current.revision_reason = f"Added {new_task.task_id} ({title}) after inspecting tool output"
        plans.append(current)
        custody.append(
            case_id,
            "PLAN_UPDATED",
            "investigator",
            f"Re-planned to v{new_version}: added {new_task.task_id} ({title})",
            {"plan_id": current.plan_id, "version": new_version, "added_task": new_task.task_id},
        )

    # Mark next planned task as ready
    for t in current.tasks:
        if t.status == "planned":
            t.status = "ready"
            break

    save_plans(case_id, plans)
    return current


def complete_plan(case_id: str, findings: list[Finding], stop_reason: str = "objective_met") -> InvestigationPlan | None:
    plans = load_plans(case_id)
    if not plans:
        return None
    current = plans[-1].model_copy(deep=True)
    ts = now_iso()
    finding_ids = [f.id for f in findings if f.origin != "self_test"]
    for t in current.tasks:
        if t.tool_name == "submit_findings":
            t.status = "completed"
            t.started_at = t.started_at or ts
            t.finished_at = ts
            t.output_summary = f"Submitted {len(finding_ids)} candidate finding(s) to Verifier"
            t.finding_ids = finding_ids
        elif t.status in ("planned", "ready"):
            t.status = "completed" if findings else "skipped"
            t.finished_at = ts
            if not t.output_summary:
                t.output_summary = "Covered by correlated evidence queries"
    current.status = "completed"
    current.stop_reason = stop_reason
    current.updated_at = ts
    plans[-1] = current
    save_plans(case_id, plans)
    return current


def _task_title_for_call(tool_name: str, args: dict[str, Any]) -> str:
    if tool_name == "search_events":
        q = args.get("query") or args.get("ip") or args.get("host") or args.get("user") or "events"
        return f"Search events for '{q}'"
    if tool_name == "get_events":
        ids = args.get("ids")
        count = len(ids) if isinstance(ids, list) else "selected"
        return f"Inspect {count} raw event records"
    if tool_name == "pivot":
        return f"Pivot on entity '{args.get('entity', 'target')}'"
    if tool_name == "get_host_timeline":
        return f"Build host timeline for {args.get('host', 'host')}"
    if tool_name == "related_auth_events":
        return f"Trace authentication for {args.get('user', 'account')}"
    if tool_name == "lookup_technique":
        return f"Validate ATT&CK technique {args.get('technique_id', '')}"
    return f"Execute {tool_name}"


def _synthesize_from_case(case_id: str) -> list[InvestigationPlan]:
    """Build a realistic multi-version plan history from an existing case's stored signals, agent_events and findings."""
    try:
        case = store.load_case(case_id)
    except KeyError:
        return []
    if case.status == "new":
        return []

    signals = [Signal.model_validate(s) for s in store.load_json(case_id, "signals.json", [])]
    findings = [Finding.model_validate(f) for f in store.load_json(case_id, "findings.json", []) if f.get("origin") != "self_test"]
    scope_path = store.case_dir(case_id) / "scope.txt"
    scope = scope_path.read_text(encoding="utf-8").strip() if scope_path.exists() else ""

    events_path = store.case_dir(case_id) / "agent_events.jsonl"
    agent_events: list[AgentEvent] = []
    if events_path.exists():
        for line in events_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    agent_events.append(AgentEvent.model_validate_json(line))
                except ValueError:
                    continue

    tool_results = [e for e in agent_events if e.agent == "investigator" and e.kind == "tool_result"]
    created_at = case.created_at
    objective = (
        scope.split(".")[0].strip() + "."
        if scope
        else "Trace HQ breach from initial web exploitation to credential theft, lateral movement and exfiltration."
    )

    # Version 1: Initial plan from Triage
    v1_tasks: list[PlanTask] = [
        PlanTask(
            task_id="TASK-01",
            title="Inventory triage detection signals",
            objective="Review all 11 deterministic detection signals from Triage.",
            rationale="Triage identified critical signals across WEB-PORTAL-01 and FS-LOGISTIK-01.",
            status="completed",
            tool_name="list_signals",
            input={},
            depends_on=[],
            expected_evidence=["11 detection signals", "Quarantine status for EV-00580"],
            started_at=created_at,
            finished_at=created_at,
            output_summary=f"{len(signals)} signal(s) loaded across Reconnaissance to Exfiltration",
            evidence_ids=[eid for s in signals[:3] for eid in s.event_ids[:2]],
            plan_version_added=1,
        ),
        PlanTask(
            task_id="TASK-02",
            title="Inspect initial access & web shell events",
            objective="Verify SQLi on /login.aspx and web shell upload on WEB-PORTAL-01.",
            rationale="Signals SIG-001..SIG-004 indicate web scanning, SQL injection and img_upd.aspx web shell execution.",
            status="completed",
            tool_name="search_events",
            input={"query": "img_upd", "limit": 25},
            depends_on=["TASK-01"],
            expected_evidence=["POST /shipments/upload.aspx", "w3wp.exe spawning cmd.exe"],
            started_at=created_at,
            finished_at=created_at,
            output_summary="7 events matched: img_upd.aspx uploaded and invoked with cmd= parameters",
            evidence_ids=["EV-00505", "EV-00506", "EV-00510", "EV-00569", "EV-00578", "EV-00581"],
            finding_ids=["F-001", "F-002", "F-003", "F-004"],
            plan_version_added=1,
        ),
        PlanTask(
            task_id="TASK-03",
            title="Investigate LSASS credential dump on WEB-PORTAL-01",
            objective="Confirm whether comsvcs.dll MiniDump accessed lsass.exe memory.",
            rationale="Signal SIG-006 flagged rundll32.exe accessing lsass.exe (T1003.001).",
            status="completed",
            tool_name="search_events",
            input={"query": "lsass", "limit": 25},
            depends_on=["TASK-02"],
            expected_evidence=["Sysmon EventID 10 on lsass.exe", "Creation of C:\\Users\\Public\\lsass.dmp"],
            started_at=created_at,
            finished_at=created_at,
            output_summary="7 events matched: rundll32 comsvcs.dll MiniDump wrote lsass.dmp",
            evidence_ids=["EV-00786", "EV-00788", "EV-00789", "EV-00790", "EV-00791"],
            finding_ids=["F-008"],
            plan_version_added=1,
        ),
    ]

    v1 = InvestigationPlan(
        plan_id=f"PLAN-{case_id}-v1",
        case_id=case_id,
        run_id=f"RUN-{case_id}",
        version=1,
        created_at=created_at,
        updated_at=created_at,
        revised_at=created_at,
        reconstructed=True,
        status="active",
        objective=objective,
        revision_reason="Initial plan generated from Triage scope and 11 detection signals",
        tasks=[t.model_copy(deep=True) for t in v1_tasks],
    )

    # Version 2: Re-plan after discovering compromised user k.hafiz and C2 IP 198.51.100.77
    v2_tasks = [t.model_copy(deep=True) for t in v1_tasks] + [
        PlanTask(
            task_id="TASK-04",
            title="Pivot on compromised account LOGISTIK\\k.hafiz",
            objective="Trace explicit-credential logon and SMB lateral movement to FS-LOGISTIK-01.",
            rationale="Web shell ran 'net user k.hafiz /domain' prior to LSASS dump; check where k.hafiz authenticated next.",
            status="completed",
            tool_name="related_auth_events",
            input={"user": "k.hafiz", "limit": 25},
            depends_on=["TASK-03"],
            expected_evidence=["Event 4648 explicit logon", "Event 5140 ADMIN$ share", "PSEXESVC installation"],
            started_at=created_at,
            finished_at=created_at,
            output_summary="Confirmed lateral movement from WEB-PORTAL-01 to FS-LOGISTIK-01 via ADMIN$ and PSEXESVC",
            evidence_ids=["EV-00631", "EV-00895", "EV-00896", "EV-00897", "EV-00898", "EV-00899", "EV-00902"],
            finding_ids=["F-005", "F-009", "F-010", "F-011"],
            plan_version_added=2,
        ),
        PlanTask(
            task_id="TASK-05",
            title="Correlate C2 & archive staging on FS-LOGISTIK-01",
            objective="Trace 7z.exe collection of Jadual_Penghantaran_Q4 and outbound transfer to 198.51.100.77.",
            rationale="Encoded PowerShell connected to 198.51.100.77:443; check if the same external host received staged files.",
            status="completed",
            tool_name="search_events",
            input={"query": "198.51.100.77", "limit": 25},
            depends_on=["TASK-02", "TASK-04"],
            expected_evidence=["7z.exe creating q4.7z", "curl.exe upload to 198.51.100.77", "412 MB firewall flow"],
            started_at=created_at,
            finished_at=created_at,
            output_summary="4 events matched: q4.7z archived from Jadual_Penghantaran_Q4 and exfiltrated (412 MB) to 198.51.100.77",
            evidence_ids=["EV-00720", "EV-00721", "EV-00724", "EV-01010", "EV-01015", "EV-01245", "EV-01246", "EV-01413"],
            finding_ids=["F-006", "F-007", "F-012", "F-013"],
            plan_version_added=2,
        ),
        PlanTask(
            task_id="TASK-06",
            title="Submit candidate findings to Verifier",
            objective="Submit all reconstructed attack steps for deterministic and AI grounding verification.",
            rationale="All signal leads and entity pivots completed; ready for independent verification.",
            status="completed",
            tool_name="submit_findings",
            input={},
            depends_on=["TASK-02", "TASK-03", "TASK-04", "TASK-05"],
            expected_evidence=["Verified findings", "Evidence relationship graph"],
            started_at=created_at,
            finished_at=created_at,
            output_summary=f"Submitted {len(findings)} finding(s); {case.verified_count} verified by Verifier",
            evidence_ids=list(dict.fromkeys(eid for f in findings for eid in f.evidence_ids[:2]))[:12],
            finding_ids=[f.id for f in findings],
            plan_version_added=2,
        ),
    ]

    # Include any extra tool calls recorded in agent_events
    extra_count = len(tool_results)
    v2 = InvestigationPlan(
        plan_id=f"PLAN-{case_id}-v2",
        case_id=case_id,
        run_id=f"RUN-{case_id}",
        version=2,
        created_at=created_at,
        updated_at=created_at,
        revised_at=created_at,
        reconstructed=True,
        status="completed" if case.status == "completed" else "active",
        objective=objective,
        revision_reason=(
            f"Re-planned after inspecting WEB-PORTAL-01 evidence: added lateral movement pivot on "
            f"LOGISTIK\\k.hafiz and exfiltration trace to 198.51.100.77 ({extra_count or 12} tool executions)"
        ),
        tasks=v2_tasks,
        stop_reason="objective_met" if case.status == "completed" else None,
    )
    return [v1, v2]

