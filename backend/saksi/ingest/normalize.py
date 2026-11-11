"""Turn raw evidence files (web, Sysmon, SIEM, generic CSV/JSON/JSONL) into Events.

Field conventions follow docs/saksi-api.md "Normalised field conventions". Events come back with an
empty `id`; ingest assigns ids after sorting. `raw` is the record exactly as it appeared in the file.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from saksi.models import Event, Severity, SourceKind

MAX_EVENTS = 200_000
_TS_FORMATS = ("%d/%m/%Y %H:%M:%S", "%Y/%m/%d %H:%M:%S")
_EPOCH = re.compile(r"\d{10,13}(\.\d+)?")
_PLACEHOLDERS = {"", "-", "n/a", "null", "none"}
_SEVERITY: dict[str, Severity] = {
    "info": "info", "information": "info", "informational": "info",
    "low": "low", "warning": "low",
    "medium": "medium",
    "high": "high", "error": "high",
    "critical": "critical",
}
_SIEM_TYPES = {
    "4624": "logon", "4625": "logon_failure", "4648": "explicit_logon", "5140": "share_access",
    "7045": "service_install", "flow": "network_flow", "dns": "dns_query", "ids": "ids_alert",
}
_TS_KEYS = ("timestamp", "time", "@timestamp", "date", "utctime", "ts", "datetime")
_TYPE_KEYS = ("event_type", "action", "eventid", "event_code", "category", "detection_types")
_HOST_KEYS = ("host", "hostname", "computer", "computer_name", "host_id")
_USER_KEYS = ("user", "username", "user_name", "user_id")
_SRC_KEYS = ("src_ip", "source_ip", "client_ip", "sourceip", "source.ip")
_DST_KEYS = ("dst_ip", "destination_ip", "dest_ip", "destinationip", "destination.ip")
_MSG_KEYS = ("message", "description", "raw_log", "details", "rule_names")
_PROCESS_KEYS = ("processname", "process", "image", "process_name")
_PARENT_PROCESS_KEYS = ("parent_process", "parentprocess", "parentimage", "parent_image")
_COMMAND_KEYS = ("commandline", "command_line")
_STATUS_KEYS = ("status_code", "status", "response.code")
_BYTES_KEYS = ("bytes_out", "bytes_sent")
_SEVERITY_KEYS = ("severity", "level", "severity_level")

Builder = Callable[[dict[str, Any], str, str], Event | None]


def detect_kind(path: Path) -> SourceKind:
    """Classify a file as web, sysmon, siem or generic from the field names of its first record."""
    if path.suffix.lower() == ".csv":
        return "generic"
    text_format = _text_format(path)
    if text_format is not None:
        return "sysmon" if text_format == "xml" else "web"
    first = _first_record(path)
    if first is None:
        return "generic"
    keys = {str(key).lower() for key in first}
    if {"client_ip", "server_ip", "elb"} <= keys:
        return "web"
    if {"utctime", "eventid"} <= keys:
        return "sysmon"
    if {"@timestamp", "event_code"} <= keys:
        return "siem"
    return "generic"


def normalize_file(path: Path) -> tuple[list[Event], int]:
    """Normalise every record in `path`. Returns (events with empty ids, count of rows skipped as unparseable)."""
    text_format = _text_format(path) if path.suffix.lower() != ".csv" else None
    builder = _TEXT_BUILDERS[text_format] if text_format else _BUILDERS[detect_kind(path)]
    events: list[Event] = []
    skipped = 0
    for row in _rows(path):
        event = None if row is None else builder(row[1], row[0], path.name)
        if event is None:
            skipped += 1
            continue
        events.append(event)
        if len(events) >= MAX_EVENTS:
            break
    return events, skipped


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig", errors="replace")


def _first_line(path: Path) -> str | None:
    with path.open(encoding="utf-8-sig", errors="replace") as handle:
        for line in handle:
            if line.strip():
                return line.strip()
    return None


def _is_json_array(path: Path) -> bool:
    return (_first_line(path) or "").startswith("[")


def _first_record(path: Path) -> dict[str, Any] | None:
    try:
        if _is_json_array(path):
            records = json.loads(_read(path))
            first = records[0] if isinstance(records, list) and records else None
        else:
            first = json.loads(_first_line(path) or "null")
    except json.JSONDecodeError:
        return None
    return first if isinstance(first, dict) else None


def _rows(path: Path) -> Iterator[tuple[str, dict[str, Any]] | None]:
    """Yield (raw, record) for each data row, or None for a row that cannot be parsed."""
    if path.suffix.lower() == ".csv":
        yield from _csv_rows(path)
    elif (text_format := _text_format(path)) is not None:
        yield from _TEXT_ROWS[text_format](path)
    elif _is_json_array(path):
        yield from _json_array_rows(path)
    else:
        yield from _jsonl_rows(path)


_ACCESS_LINE = re.compile(
    r'^(?P<ip>\S+) \S+ (?P<user>\S+) \[(?P<ts>[^\]]+)\] "(?P<method>[A-Z]+) (?P<target>\S+)(?: HTTP/[\d.]+)?" '
    r'(?P<status>\d{3}) (?P<bytes>\S+)')
_ERROR_LINE = re.compile(r"^(?P<ts>\d{4}/\d\d/\d\d \d\d:\d\d:\d\d) \[(?P<level>\w+)\] (?P<msg>.*)$")
_LEVEL_SEVERITY: dict[str, Severity] = {"debug": "info", "info": "info", "notice": "info", "warn": "low",
                                         "error": "low", "crit": "high", "alert": "high", "emerg": "critical"}
MAX_XML_LINE = 1_000_000


def _text_format(path: Path) -> str | None:
    """Spot the plain-text formats: one Sysmon XML <Event> per line ("xml"), nginx/Apache access log
    ("access") or nginx error log ("error"). Returns None for JSON, JSONL and CSV-like files."""
    first = _first_line(path)
    if first is None:
        return None
    if first.startswith("<Event"):
        return "xml"
    if _ACCESS_LINE.match(first):
        return "access"
    if _ERROR_LINE.match(first):
        return "error"
    return None


def _lines(path: Path) -> Iterator[str]:
    with path.open(encoding="utf-8-sig", errors="replace") as handle:
        for line in handle:
            raw = line.rstrip("\r\n")
            if raw.strip():
                yield raw


def _xml_rows(path: Path) -> Iterator[tuple[str, dict[str, Any]] | None]:
    """Sysmon events exported as XML, one <Event> element per line. Flattened to the same field names
    the JSON Sysmon export uses, so the Sysmon builder and detection rules apply unchanged."""
    for raw in _lines(path):
        # Sysmon events never carry a DTD. Refusing DOCTYPE/ENTITY blocks entity-expansion (billion laughs) input.
        if len(raw) > MAX_XML_LINE or "<!DOCTYPE" in raw.upper() or "<!ENTITY" in raw.upper():
            yield None
            continue
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            yield None
            continue
        ns = {"e": root.tag.partition("}")[0].strip("{")}
        q = (lambda name: f"e:{name}") if ns["e"] else (lambda name: name)
        system = root.find(q("System"), ns) if ns["e"] else root.find("System")
        record: dict[str, Any] = {}
        if system is not None:
            event_id = system.find(q("EventID"), ns)
            computer = system.find(q("Computer"), ns)
            created = system.find(q("TimeCreated"), ns)
            record["EventID"] = event_id.text if event_id is not None else None
            record["Computer"] = computer.text if computer is not None else None
            record["UtcTime"] = created.get("SystemTime") if created is not None else None
        data = root.find(q("EventData"), ns) if ns["e"] else root.find("EventData")
        if data is not None:
            for item in data:
                name = item.get("Name")
                if name:
                    record[name] = item.text
        # EventData's own UtcTime ("2020-11-03 15:50:18.664") wins when present, as in the JSON export.
        yield raw, record


def _access_rows(path: Path) -> Iterator[tuple[str, dict[str, Any]] | None]:
    """nginx/Apache combined access log lines -> the web record shape (client_ip, method, path, status...)."""
    for raw in _lines(path):
        match = _ACCESS_LINE.match(raw)
        if match is None:
            yield None
            continue
        try:
            moment = datetime.strptime(match["ts"], "%d/%b/%Y:%H:%M:%S %z")
        except ValueError:
            yield None
            continue
        target = match["target"]
        route, _, query = target.partition("?")
        yield raw, {
            "timestamp": moment.astimezone(timezone.utc).isoformat(), "client_ip": match["ip"],
            "method": match["method"], "path": route, "query": query or None,
            "status": match["status"], "bytes_sent": None if match["bytes"] == "-" else match["bytes"],
        }


def _error_rows(path: Path) -> Iterator[tuple[str, dict[str, Any]] | None]:
    """nginx error log lines. Timestamps carry no zone and are read as UTC like other naive times."""
    for raw in _lines(path):
        match = _ERROR_LINE.match(raw)
        yield (raw, {"ts": match["ts"], "level": match["level"], "msg": match["msg"]}) if match else None


def _web_error(record: dict[str, Any], raw: str, source_file: str) -> Event | None:
    ts = _parse_ts(record.get("ts"))
    if ts is None:
        return None
    message = str(record.get("msg") or "")
    client = re.search(r"client: ([0-9a-fA-F.:]+)", message)
    request = re.search(r'request: "([A-Z]+) (\S+)', message)
    return _event(
        ts=ts, source="web", source_file=source_file, event_type="http_error", raw=raw,
        message=message[:300],
        severity=_LEVEL_SEVERITY.get(str(record.get("level")).lower(), "low"),
        src_ip=client.group(1) if client else None,
        url=request.group(2) if request else None,
    )

def _csv_rows(path: Path) -> Iterator[tuple[str, dict[str, Any]] | None]:
    lines = [line.rstrip("\r\n") for line in _read(path).split("\n")]
    start = next((index for index, line in enumerate(lines) if line.strip()), None)
    if start is None:
        return
    header = [name.strip() for name in next(csv.reader([lines[start]]))]
    for line in lines[start + 1:]:
        if not line.strip():
            continue
        try:
            fields = next(csv.reader([line]))
        except csv.Error:
            yield None
            continue
        yield (line, dict(zip(header, fields))) if len(fields) == len(header) else None


def _json_array_rows(path: Path) -> Iterator[tuple[str, dict[str, Any]] | None]:
    try:
        records = json.loads(_read(path))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path.name} is not valid JSON: {exc}") from exc
    if not isinstance(records, list):
        raise ValueError(f"{path.name} must contain a JSON array")
    for record in records:
        yield (json.dumps(record, ensure_ascii=False), record) if isinstance(record, dict) else None


def _jsonl_rows(path: Path) -> Iterator[tuple[str, dict[str, Any]] | None]:
    with path.open(encoding="utf-8-sig", errors="replace") as handle:
        for line in handle:
            raw = line.rstrip("\r\n")
            if not raw.strip():
                continue
            try:
                record = json.loads(raw)
            except json.JSONDecodeError:
                yield None
                continue
            yield (raw, record) if isinstance(record, dict) else None


def _clean(value: Any) -> str | None:
    if value is None or isinstance(value, (dict, list)):
        return None
    text = str(value).strip()
    return None if text.lower() in _PLACEHOLDERS else text


def _pick(low: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        if _clean(low.get(key)) is not None:
            return low[key]
    return None


def _host(value: Any) -> str | None:
    text = _clean(value)
    return text.split(".")[0].upper() if text else None


def _base(value: Any) -> str | None:
    text = _clean(value)
    if not text:
        return None
    return text.replace("/", "\\").rsplit("\\", 1)[-1].lower() or None


def _int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(float(str(value).strip()))
    except (ValueError, OverflowError):
        return None


def _severity(value: Any) -> Severity:
    return _SEVERITY.get((_clean(value) or "").lower(), "info")


def _http_severity(status: int | None) -> Severity:
    if status is None or status < 400:
        return "info"
    return "medium" if status >= 500 else "low"


def _slug(value: Any) -> str | None:
    text = _clean(value)
    if not text:
        return None
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_") or None


def _to_datetime(value: Any) -> datetime | None:
    if isinstance(value, (int, float)) or (isinstance(value, str) and _EPOCH.fullmatch(value.strip())):
        number = float(value)
        if number > 1e11:  # epoch milliseconds
            number /= 1000
        try:
            return datetime.fromtimestamp(number, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text[:-1] + "+00:00" if text[-1] in "zZ" else text)
    except ValueError:
        pass
    for fmt in _TS_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _parse_ts(value: Any) -> str | None:
    """Return the timestamp as UTC 'YYYY-MM-DDTHH:MM:SS.mmmZ' (milliseconds always present so sorting is exact)."""
    if value is None or isinstance(value, bool):
        return None
    moment = _to_datetime(value)
    if moment is None:
        return None
    moment = (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def _sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _event(*, ts: str, source: SourceKind, source_file: str, event_type: str, raw: str,
           message: str | None, **fields: Any) -> Event:
    return Event(
        id="",
        ts=ts,
        source=source,
        source_file=source_file,
        event_type=event_type,
        message=message or raw[:300],
        raw=raw,
        sha256=_sha256(raw),
        **fields,
    )


def _web(record: dict[str, Any], raw: str, source_file: str) -> Event | None:
    ts = _parse_ts(record.get("timestamp"))
    if ts is None:
        return None
    method = _clean(record.get("method")) or "GET"
    path = _clean(record.get("path")) or "/"
    query = _clean(record.get("query"))
    status = _int(record.get("status"))
    return _event(
        ts=ts, source="web", source_file=source_file, event_type="http_request", raw=raw,
        message=f"{method} {path} -> {status}",
        severity=_http_severity(status),
        host=_host(record.get("host")),
        src_ip=_clean(record.get("client_ip")),
        dst_ip=_clean(record.get("server_ip")),
        url=path + (f"?{query}" if query else ""),
        status_code=status,
        bytes_out=_int(record.get("bytes_sent")),
    )


def _sysmon(record: dict[str, Any], raw: str, source_file: str) -> Event | None:
    ts = _parse_ts(record.get("UtcTime"))
    event_id = _int(record.get("EventID"))
    if ts is None or event_id is None:
        return None
    common: dict[str, Any] = {
        "ts": ts, "source": "sysmon", "source_file": source_file, "raw": raw,
        "host": _host(record.get("Computer")), "user": _clean(record.get("User")),
    }
    if event_id == 1:
        image = _clean(record.get("Image")) or ""
        command = _clean(record.get("CommandLine"))
        return _event(**common, event_type="process_create", process=_base(image),
                      parent_process=_base(record.get("ParentImage")), command_line=command,
                      message=f"Process created: {command or image}")
    if event_id == 3:
        dst = _clean(record.get("DestinationIp"))
        port = _clean(record.get("DestinationPort"))
        return _event(**common, event_type="network_connect", process=_base(record.get("Image")),
                      src_ip=_clean(record.get("SourceIp")), dst_ip=dst,
                      message=f"Connection to {dst}:{port}")
    if event_id == 10:
        source_image = _clean(record.get("SourceImage")) or _clean(record.get("Image"))
        return _event(**common, event_type="process_access", process=_base(source_image),
                      message=(f"{_base(source_image)} accessed {_base(record.get('TargetImage'))} "
                               f"(GrantedAccess {_clean(record.get('GrantedAccess'))})"))
    if event_id == 11:
        return _event(**common, event_type="file_create", process=_base(record.get("Image")),
                      message=f"File created: {_clean(record.get('TargetFilename'))}")
    return _event(**common, event_type=f"sysmon_event_{event_id}", process=_base(record.get("Image")),
                  message=f"Sysmon event {event_id}")


def _siem(record: dict[str, Any], raw: str, source_file: str) -> Event | None:
    ts = _parse_ts(record.get("@timestamp"))
    code = _clean(record.get("event_code"))
    if ts is None or code is None:
        return None
    event_type = _SIEM_TYPES.get(code) or f"siem_{_slug(code)}"
    service_file = _clean(record.get("service_file"))
    return _event(
        ts=ts, source="siem", source_file=source_file, event_type=event_type, raw=raw,
        message=_clean(record.get("message")),
        severity=_severity(record.get("severity")),
        host=_host(record.get("host")),
        user=_clean(record.get("user")),
        src_ip=_clean(record.get("src_ip")),
        dst_ip=_clean(record.get("dst_ip")),
        process=_base(service_file) if event_type == "service_install" else None,
        bytes_out=_int(record.get("bytes_out")),
    )


def _generic(record: dict[str, Any], raw: str, source_file: str) -> Event | None:
    low = {str(key).lower(): value for key, value in record.items()}
    ts = _parse_ts(_pick(low, _TS_KEYS))
    if ts is None:
        return None
    event_type = _slug(_pick(low, _TYPE_KEYS)) or "log_line"
    src = _clean(_pick(low, _SRC_KEYS))
    dst = _clean(_pick(low, _DST_KEYS))
    tag = _clean(low.get("tag_technique")) or _clean(low.get("mitre_technique_id"))
    tactic = _clean(low.get("tag_tactic")) or _clean(low.get("mitre_tactic"))
    if tag and (not re.fullmatch(r"T\d{4}(\.\d{3})?", tag) or tag == "T0000"):
        tag = tactic = None

    src_kind = _clean(low.get("source"))
    source: SourceKind = src_kind if src_kind in ("web", "sysmon", "siem", "generic") else "generic"

    raw_val = record.get("raw")
    raw_payload = raw_val if isinstance(raw_val, str) and raw_val.strip() else raw

    flags_val = record.get("flags")
    flags = [str(f) for f in flags_val] if isinstance(flags_val, list) else []

    return _event(
        tag_technique=tag, tag_tactic=tactic if tag else None,
        ts=ts, source=source, source_file=source_file, event_type=event_type, raw=raw_payload,
        message=_clean(_pick(low, _MSG_KEYS)) or f"{event_type}: {src or '?'} -> {dst or '?'}",
        severity=_severity(_pick(low, _SEVERITY_KEYS)),
        host=_host(_pick(low, _HOST_KEYS)),
        user=_clean(_pick(low, _USER_KEYS)),
        src_ip=src,
        dst_ip=dst,
        process=_base(_pick(low, _PROCESS_KEYS)),
        parent_process=_base(_pick(low, _PARENT_PROCESS_KEYS)),
        command_line=_clean(_pick(low, _COMMAND_KEYS)),
        url=_clean(low.get("url")),
        status_code=_int(_pick(low, _STATUS_KEYS)),
        bytes_out=_int(_pick(low, _BYTES_KEYS)),
        flags=flags,
    )


_TEXT_ROWS = {"xml": _xml_rows, "access": _access_rows, "error": _error_rows}
_BUILDERS: dict[SourceKind, Builder] = {
    "web": _web,
    "sysmon": _sysmon,
    "siem": _siem,
    "generic": _generic,
}


_TEXT_BUILDERS: dict[str, Builder] = {"xml": _sysmon, "access": _web, "error": _web_error}
