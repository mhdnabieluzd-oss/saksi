"""Tool Registry and Policy Broker for SAKSI's autonomous Investigator.

Every tool capability must be registered here with an explicit schema, capability class,
permission scope, risk tier and result limits. Any unknown tool or policy violation is
denied by default and recorded to the case audit ledger.
"""
from __future__ import annotations

import re
from typing import Any

from saksi import custody
from saksi.models import ToolDefinition

_SECRET_KEY_RE = re.compile(r"(password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|private[_-]?key)", re.I)
_SECRET_VAL_RE = re.compile(r"(?:\bBearer\s+[A-Za-z0-9._~+/=-]+|\bsk-[A-Za-z0-9_-]{6,})", re.I)


def scrub_args(args: dict[str, Any] | None) -> dict[str, Any]:
    """Redact secret-looking keys or token values from tool arguments before logging or returning."""
    if not isinstance(args, dict):
        return {}
    cleaned: dict[str, Any] = {}
    for k, v in args.items():
        key_str = str(k)
        if _SECRET_KEY_RE.search(key_str):
            cleaned[key_str] = "[redacted]"
        elif isinstance(v, str):
            cleaned[key_str] = _SECRET_VAL_RE.sub("[redacted]", v)
        elif isinstance(v, dict):
            cleaned[key_str] = scrub_args(v)
        elif isinstance(v, list):
            cleaned[key_str] = [
                _SECRET_VAL_RE.sub("[redacted]", item) if isinstance(item, str) else item
                for item in v[:25]
            ]
        else:
            cleaned[key_str] = v
    return cleaned


REGISTERED_TOOLS: list[ToolDefinition] = [
    ToolDefinition(
        name="list_signals",
        description="List deterministic detection signals (rule hits) produced by Triage.",
        capability_class="read_evidence",
        permission_scope="case:read",
        risk_tier="read_only",
        max_results=50,
        timeout_seconds=10,
        requires_approval=False,
        data_handling="redacted_cloud",
        input_schema={"type": "object", "properties": {}, "additionalProperties": False},
    ),
    ToolDefinition(
        name="search_events",
        description="Search normalised case events by query text, source, host, user, IP or event type.",
        capability_class="read_evidence",
        permission_scope="case:read",
        risk_tier="read_only",
        max_results=25,
        timeout_seconds=20,
        requires_approval=False,
        data_handling="redacted_cloud",
        input_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "source": {"type": "string", "enum": ["web", "sysmon", "siem", "generic"]},
                "host": {"type": "string"},
                "user": {"type": "string"},
                "ip": {"type": "string"},
                "event_type": {"type": "string"},
                "suspicious_only": {"type": "boolean"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 25},
            },
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name="get_events",
        description="Fetch full redacted event records for up to 20 specific event IDs.",
        capability_class="read_evidence",
        permission_scope="case:read",
        risk_tier="read_only",
        max_results=20,
        timeout_seconds=15,
        requires_approval=False,
        data_handling="redacted_cloud",
        input_schema={
            "type": "object",
            "properties": {
                "ids": {"type": "array", "items": {"type": "string"}, "maxItems": 20},
            },
            "required": ["ids"],
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name="pivot",
        description="Correlate all events involving an entity (IP, hostname, account, process or path).",
        capability_class="correlate",
        permission_scope="case:read",
        risk_tier="read_only",
        max_results=25,
        timeout_seconds=20,
        requires_approval=False,
        data_handling="redacted_cloud",
        input_schema={
            "type": "object",
            "properties": {
                "entity": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 25},
            },
            "required": ["entity"],
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name="lookup_technique",
        description="Look up a MITRE ATT&CK Enterprise technique's official name and valid tactics.",
        capability_class="enrich",
        permission_scope="kb:read",
        risk_tier="read_only",
        max_results=1,
        timeout_seconds=5,
        requires_approval=False,
        data_handling="local",
        input_schema={
            "type": "object",
            "properties": {"technique_id": {"type": "string"}},
            "required": ["technique_id"],
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name="get_host_timeline",
        description="Build a chronological process, logon and network timeline for a specific host.",
        capability_class="correlate",
        permission_scope="case:read",
        risk_tier="read_only",
        max_results=25,
        timeout_seconds=20,
        requires_approval=False,
        data_handling="redacted_cloud",
        input_schema={
            "type": "object",
            "properties": {
                "host": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 25},
            },
            "required": ["host"],
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name="related_auth_events",
        description="Correlate authentication, explicit-credential and share access events for an account.",
        capability_class="correlate",
        permission_scope="case:read",
        risk_tier="read_only",
        max_results=25,
        timeout_seconds=20,
        requires_approval=False,
        data_handling="redacted_cloud",
        input_schema={
            "type": "object",
            "properties": {
                "user": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 25},
            },
            "required": ["user"],
            "additionalProperties": False,
        },
    ),
    ToolDefinition(
        name="submit_findings",
        description="Submit final evidence-backed candidate findings to the independent Verifier.",
        capability_class="correlate",
        permission_scope="case:write_findings",
        risk_tier="read_only",
        max_results=20,
        timeout_seconds=30,
        requires_approval=False,
        data_handling="local",
        input_schema={"type": "object", "required": ["findings"]},
    ),
]

_BY_NAME: dict[str, ToolDefinition] = {t.name: t for t in REGISTERED_TOOLS}


def list_tools() -> list[ToolDefinition]:
    return list(REGISTERED_TOOLS)


def get_tool(name: str) -> ToolDefinition | None:
    return _BY_NAME.get(name)


def validate_tool_request(
    case_id: str,
    tool_name: str,
    args: dict[str, Any] | None,
    *,
    seen_calls: set[str] | None = None,
    actor: str = "investigator",
    test: bool = False,
) -> tuple[bool, str, ToolDefinition | None]:
    """Policy Gate: check registry membership, argument schema, and loop repetition."""
    scrubbed = scrub_args(args)
    extra = {"test": True} if test else {}
    tool = _BY_NAME.get(tool_name)
    if tool is None:
        reason = f"Blocked unregistered tool '{tool_name}': not in Tool Registry (deny by default)."
        custody.append(
            case_id,
            "TOOL_BLOCKED",
            actor,
            reason,
            {"tool": tool_name, "args": scrubbed, **extra},
        )
        return False, reason, None

    if tool.requires_approval:
        reason = f"Tool '{tool_name}' requires explicit analyst approval before execution."
        custody.append(
            case_id,
            "TOOL_BLOCKED",
            actor,
            reason,
            {"tool": tool_name, "args": scrubbed, **extra},
        )
        return False, reason, tool

    clean_args = args if isinstance(args, dict) else {}
    required = tool.input_schema.get("required", [])
    for req in required:
        val = clean_args.get(req)
        if val is None or val == "" or val == []:
            reason = f"Blocked tool '{tool_name}': missing required argument '{req}'."
            custody.append(
                case_id,
                "TOOL_BLOCKED",
                actor,
                reason,
                {"tool": tool_name, "missing": req, "args": scrubbed, **extra},
            )
            return False, reason, tool

    props = tool.input_schema.get("properties")
    if tool.input_schema.get("additionalProperties") is False and isinstance(props, dict):
        unknown_keys = [k for k in clean_args if k not in props]
        if unknown_keys:
            reason = f"Blocked tool '{tool_name}': unexpected argument(s) {', '.join(sorted(unknown_keys))}."
            custody.append(
                case_id,
                "TOOL_BLOCKED",
                actor,
                reason,
                {"tool": tool_name, "unexpected": unknown_keys, "args": scrubbed, **extra},
            )
            return False, reason, tool

    # Check limit bounds if provided
    if "limit" in clean_args:
        try:
            lim = int(clean_args["limit"])
            if lim < 1 or lim > tool.max_results:
                clean_args["limit"] = min(max(lim, 1), tool.max_results)
        except (TypeError, ValueError):
            clean_args["limit"] = tool.max_results

    if seen_calls is not None and tool_name != "submit_findings":
        sig = f"{tool_name}:{custody.canonical_hash(clean_args)}"
        if sig in seen_calls:
            reason = f"Skipped duplicate call to '{tool_name}' with identical arguments (loop guard)."
            return False, reason, tool
        seen_calls.add(sig)

    return True, f"Tool '{tool_name}' allowed ({tool.risk_tier}, scope {tool.permission_scope})", tool

