"""FastAPI HTTP layer for SAKSI: REST routes, the run WebSocket and the built single-page app.

Agent-layer modules (pipeline, bus, chat, llm, agents.*) are imported lazily so this file loads
before they exist. A missing module answers 503 rather than crashing the server.
"""

from __future__ import annotations

import asyncio
import importlib
import re
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, TypeAdapter

from saksi import benchmark, custody, planner, report_pdf, responses, store, tool_registry
from saksi.config import BASE_DIR, PLATFORM_DIR, load_settings, save_settings
from saksi.ingest.ingest import case_stats, create_case_from_files
from saksi.ingest.scenario import ensure_scenario
from saksi.models import (
    AgentEvent,
    BenchmarkRunResult,
    CaseDetail,
    CaseSummary,
    ChatMessage,
    ChatRequest,
    EventDetail,
    EventPage,
    Event,
    Finding,
    Graph,
    InvestigationPlan,
    Lang,
    LedgerEntry,
    LedgerVerification,
    LlmHealth,
    NewScenarioRequest,
    Overview,
    Report,
    ReportHashCheck,
    ReportRequest,
    ResponseDecisionRequest,
    ResponseExecuteRequest,
    ResponseProposal,
    RunStatus,
    Settings,
    ShieldAlert,
    Signal,
    Story,
    ToolDefinition,
)

ALLOWED_EXTENSIONS = {"csv", "json", "jsonl", "txt", "log"}
MAX_UPLOAD_FILES = 3
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_TITLE_LENGTH = 120
RECENT_CASES = 5
RECENT_AGENT_EVENTS = 15
DIST_DIR = PLATFORM_DIR / "frontend" / "dist" if (PLATFORM_DIR / "frontend").exists() else BASE_DIR / "web" / "dist"
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://saksi-mauve.vercel.app",       
    "https://saksi-*.vercel.app",            
]

_SIGNALS = TypeAdapter(list[Signal])
_FINDINGS = TypeAdapter(list[Finding])
_SHIELD = TypeAdapter(list[ShieldAlert])
_UNSAFE_NAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")
_evidence_cache: dict[str, tuple[int, int, int]] = {}  # case_id -> (events mtime_ns, verified, total)

app = FastAPI(title="SAKSI API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          
    allow_credentials=False,      
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------- helpers
def _module(name: str) -> Any:
    """Import an agent-layer module by its name under `saksi`, answering 503 when it is not available."""
    try:
        return importlib.import_module(f"saksi.{name}")
    except ImportError as exc:
        raise HTTPException(503, f"The {name} module is not available yet.") from exc


def _is_llm_error(exc: BaseException) -> bool:
    try:
        llm_error = importlib.import_module("saksi.llm").LlmError
    except ImportError:
        return False
    return isinstance(exc, llm_error)


@contextmanager
def _llm_guard() -> Iterator[None]:
    """Turn an LLM failure into a short 503 without leaking the underlying error."""
    try:
        yield
    except HTTPException:
        raise
    except Exception as exc:
        if _is_llm_error(exc):
            raise HTTPException(503, "The AI model did not respond. Try again in a moment.") from None
        raise


def _summary(case_id: str) -> CaseSummary:
    try:
        return store.load_case(case_id)
    except KeyError:
        raise HTTPException(404, f"Case {case_id} not found") from None


def _events(case_id: str) -> list[Event]:
    _summary(case_id)
    return store.load_events(case_id)


def _load_json_list(case_id: str, name: str, adapter: TypeAdapter) -> list[Any]:
    return adapter.validate_python(store.load_json(case_id, name, []))


def _mentions(value: Any, event_id: str) -> bool:
    """True when `event_id` appears as a string anywhere inside a ledger entry's data."""
    if isinstance(value, str):
        return value == event_id
    if isinstance(value, dict):
        return any(_mentions(item, event_id) for item in value.values())
    if isinstance(value, list):
        return any(_mentions(item, event_id) for item in value)
    return False


def _matches(event: Event, q: Optional[str], source: Optional[str],
             severity: Optional[str], flag: Optional[str]) -> bool:
    if source and event.source != source:
        return False
    if severity and event.severity != severity:
        return False
    if flag and flag not in event.flags:
        return False
    if q:
        needle = q.casefold()
        haystacks = (event.id, event.message, event.raw, event.host, event.user, event.src_ip,
                     event.dst_ip, event.process, event.command_line, event.url)
        return any(value and needle in value.casefold() for value in haystacks)
    return True


def _evidence_counts(case_id: str) -> tuple[int, int]:
    """Return (verified, total) events for a case, re-hashing only when the events file has changed."""
    path = store.case_dir(case_id) / "events.jsonl"
    if not path.exists():
        return 0, 0
    mtime = path.stat().st_mtime_ns
    cached = _evidence_cache.get(case_id)
    if cached and cached[0] == mtime:
        return cached[1], cached[2]
    events = store.load_events(case_id)
    verified = sum(custody.event_integrity(event).match for event in events)
    _evidence_cache[case_id] = (mtime, verified, len(events))
    return verified, len(events)


def _recent_agent_events(cases: list[CaseSummary]) -> list[AgentEvent]:
    found: list[AgentEvent] = []
    for case in cases:
        path = store.case_dir(case.id) / "agent_events.jsonl"
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").split("\n"):
            if not line:
                continue
            try:
                found.append(AgentEvent.model_validate_json(line))
            except ValueError:
                continue
    found.sort(key=lambda item: (item.ts, item.case_id, item.seq), reverse=True)
    return found[:RECENT_AGENT_EVENTS]


def _llm_health(model: str) -> LlmHealth:
    try:
        return importlib.import_module("saksi.llm").health()
    except Exception:  # a health probe: any failure means the model is not usable right now
        return LlmHealth(ok=False, model=model, detail="LLM module unavailable")


def _safe_upload_name(raw: Optional[str], taken: set[str], index: int) -> str:
    """Return a safe base name: directories stripped, unsafe characters replaced, extension allow-listed."""
    base = (raw or "").replace("\\", "/").rsplit("/", 1)[-1]
    stem, dot, extension = base.rpartition(".")
    if not dot:
        stem, extension = base, ""
    extension = extension.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type not allowed: {raw or 'unnamed'}. "
                                 f"Use one of: {', '.join(sorted(ALLOWED_EXTENSIONS))}.")
    stem = _UNSAFE_NAME_CHARS.sub("_", stem).strip("._") or "evidence"
    name = f"{stem}.{extension}"
    if name in taken:
        name = f"{index}_{name}"
    return name


def _save_upload(upload: UploadFile, destination: Path) -> None:
    total = 0
    with destination.open("wb") as handle:
        while chunk := upload.file.read(1 << 20):
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                raise HTTPException(413, f"{destination.name} is larger than 25 MB.")
            handle.write(chunk)


def _stored_report(case_id: str, lang: Lang) -> Report:
    report = _module("agents.reporter").load_report(case_id, lang)
    if report is None:
        raise HTTPException(404, f"No {lang} report for {case_id} yet. "
                                 f"Generate it with POST /api/cases/{case_id}/report.")
    return report


# ---------------------------------------------------------------- health, overview, settings
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "version": app.version}


@app.get("/api/health/llm", response_model=LlmHealth)
def health_llm() -> LlmHealth:
    settings = load_settings()
    return _llm_health(settings.model)


@app.get("/api/overview", response_model=Overview)
def overview(include_llm: bool = Query(True)) -> Overview:
    settings = load_settings()
    cases = store.list_cases()
    evidence_verified = evidence_total = 0
    for case in cases:
        verified, total = _evidence_counts(case.id)
        evidence_verified += verified
        evidence_total += total
    if include_llm:
        llm_health = _llm_health(settings.model)
        agents_available: Optional[int] = 4 if llm_health.ok else 0
    else:
        llm_health = LlmHealth(ok=False, model=settings.model, detail="Not checked yet")
        agents_available = None
    return Overview(
        cases_total=len(cases),
        active_investigations=sum(case.status in ("new", "running") for case in cases),
        critical_incidents=sum(case.severity == "critical" for case in cases),
        agents_available=agents_available,
        evidence_verified=evidence_verified,
        evidence_total=evidence_total,
        recent_cases=cases[:RECENT_CASES],
        recent_agent_events=_recent_agent_events(cases),
        llm=llm_health,
        llm_checked=include_llm,
        ml_dsa_ready=custody.ml_dsa_ready(),
    )


@app.get("/api/settings", response_model=Settings)
def get_settings() -> Settings:
    return load_settings()


@app.put("/api/settings", response_model=Settings)
def put_settings(body: Settings) -> Settings:
    save_settings(body)
    return body


# ---------------------------------------------------------------- cases
@app.get("/api/cases", response_model=list[CaseSummary])
def list_cases() -> list[CaseSummary]:
    return store.list_cases()


@app.post("/api/cases/scenario", response_model=CaseSummary)
def create_scenario_case(body: NewScenarioRequest = NewScenarioRequest()) -> CaseSummary:
    paths = ensure_scenario(body.scenario)
    return create_case_from_files(paths, "HQ breach at Markas Logistik (simulated)", scenario=True)


@app.post("/api/cases/upload", response_model=CaseSummary)
def upload_case(files: list[UploadFile] = File(...), title: str = Form("")) -> CaseSummary:
    if not 1 <= len(files) <= MAX_UPLOAD_FILES:
        raise HTTPException(400, f"Upload 1 to {MAX_UPLOAD_FILES} files.")
    taken: set[str] = set()
    names: list[str] = []
    for index, upload in enumerate(files):
        name = _safe_upload_name(upload.filename, taken, index)
        taken.add(name)
        names.append(name)
    clean_title = title.strip()[:MAX_TITLE_LENGTH] or "Uploaded evidence"

    workdir = Path(tempfile.mkdtemp(prefix="saksi-upload-"))
    try:
        paths: list[Path] = []
        for upload, name in zip(files, names):
            destination = workdir / name
            _save_upload(upload, destination)
            paths.append(destination)
        return create_case_from_files(paths, clean_title, scenario=False)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.get("/api/cases/{case_id}", response_model=CaseDetail)
def get_case(case_id: str) -> CaseDetail:
    summary = _summary(case_id)
    scope_path = store.case_dir(case_id) / "scope.txt"
    scope = scope_path.read_text(encoding="utf-8") if scope_path.exists() else ""
    return CaseDetail(
        summary=summary,
        stats=case_stats(store.load_events(case_id)),
        scope=scope,
        signals=_load_json_list(case_id, "signals.json", _SIGNALS),
        findings=_load_json_list(case_id, "findings.json", _FINDINGS),
        shield_alerts=_load_json_list(case_id, "shield.json", _SHIELD),
    )


@app.get("/api/cases/{case_id}/events", response_model=EventPage)
def list_events(
    case_id: str,
    q: Optional[str] = None,
    source: Optional[str] = None,
    severity: Optional[str] = None,
    flag: Optional[str] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
) -> EventPage:
    matched = [event for event in _events(case_id) if _matches(event, q, source, severity, flag)]
    return EventPage(total=len(matched), items=matched[offset:offset + limit])


@app.get("/api/cases/{case_id}/events/{event_id}", response_model=EventDetail)
def get_event(case_id: str, event_id: str) -> EventDetail:
    event = next((item for item in _events(case_id) if item.id == event_id), None)
    if event is None:
        raise HTTPException(404, f"Event {event_id} not found in {case_id}")
    findings = _load_json_list(case_id, "findings.json", _FINDINGS)

    def touches(entry: LedgerEntry) -> bool:
        if entry.kind == "EVENTS_NORMALISED":
            return True
        if entry.kind == "EVIDENCE_INGESTED":
            return entry.data.get("name") == event.source_file
        return _mentions(entry.data, event.id)

    return EventDetail(
        event=event,
        integrity=custody.event_integrity(event),
        related_finding_ids=[finding.id for finding in findings if event.id in finding.evidence_ids],
        custody=[entry for entry in custody.entries(case_id) if touches(entry)],
    )


@app.get("/api/cases/{case_id}/graph", response_model=Graph)
def get_graph(case_id: str) -> Graph:
    _summary(case_id)
    data = store.load_json(case_id, "graph.json")
    if data is None:
        raise HTTPException(404, f"The graph for {case_id} is not ready. Run the investigation first.")
    graph = Graph.model_validate(data)
    if graph.edges and all(e.provenance == "observed" for e in graph.edges):
        for edge in graph.edges:
            if edge.label.startswith("logon as"):
                edge.provenance = "inferred"
            elif edge.label in ("authenticated", "connection"):
                edge.provenance = "contextual"
    return graph


@app.get("/api/cases/{case_id}/story", response_model=Story)
def get_story(case_id: str) -> Story:
    _summary(case_id)
    data = store.load_json(case_id, "story.json")
    if data is None:
        raise HTTPException(404, f"The story for {case_id} is not ready. Run the investigation first.")
    return Story.model_validate(data)


# ---------------------------------------------------------------- run and agents
@app.post("/api/cases/{case_id}/run", response_model=RunStatus)
def start_run(case_id: str) -> RunStatus:
    _summary(case_id)
    try:
        return _module("pipeline").start_run(case_id)
    except RuntimeError:
        raise HTTPException(409, f"An investigation is already running for {case_id}.") from None


@app.get("/api/cases/{case_id}/run", response_model=RunStatus)
def get_run(case_id: str) -> RunStatus:
    _summary(case_id)
    return _module("pipeline").get_run(case_id)


@app.post("/api/cases/{case_id}/run/pause", response_model=RunStatus)
def pause_run(case_id: str) -> RunStatus:
    _summary(case_id)
    return _module("pipeline").pause_run(case_id)


@app.post("/api/cases/{case_id}/run/resume", response_model=RunStatus)
def resume_run(case_id: str) -> RunStatus:
    _summary(case_id)
    return _module("pipeline").resume_run(case_id)


@app.post("/api/cases/{case_id}/run/stop", response_model=RunStatus)
def stop_run(case_id: str) -> RunStatus:
    _summary(case_id)
    return _module("pipeline").stop_run(case_id)


@app.get("/api/cases/{case_id}/plan", response_model=InvestigationPlan)
def get_plan(case_id: str) -> InvestigationPlan:
    _summary(case_id)
    plan = planner.load_latest_plan(case_id)
    if plan is None:
        raise HTTPException(404, f"No investigation plan for {case_id} yet.")
    return plan


@app.get("/api/cases/{case_id}/plans", response_model=list[InvestigationPlan])
def get_plans(case_id: str) -> list[InvestigationPlan]:
    _summary(case_id)
    return planner.load_plans(case_id)


@app.get("/api/tool-registry", response_model=list[ToolDefinition])
def get_tool_registry() -> list[ToolDefinition]:
    return tool_registry.list_tools()


class ToolTestRequest(BaseModel):
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    analyst: str = "Analyst"
    test: bool = True


@app.post("/api/cases/{case_id}/tool-requests")
def validate_case_tool_request(case_id: str, body: ToolTestRequest) -> dict[str, Any]:
    _summary(case_id)
    raw_args = dict(body.arguments)
    who = body.analyst.strip() or "Analyst"
    actor = f"analyst:{who}" if body.test else "investigator"
    allowed, reason, _tool = tool_registry.validate_tool_request(
        case_id,
        body.tool_name,
        raw_args,
        seen_calls=set(),
        actor=actor,
        test=body.test,
    )
    scrubbed_args = tool_registry.scrub_args(raw_args)
    if not allowed:
        if not body.test:
            planner.record_tool_step(
                case_id,
                body.tool_name,
                scrubbed_args,
                f"Blocked by Policy Gate: {reason}",
                [],
                blocked=True,
                blocked_reason=reason,
            )
        try:
            _module("bus").emit(
                case_id,
                "investigator",
                "warning",
                f"Policy Gate blocked tool '{body.tool_name}': {reason}",
                tool=body.tool_name,
                args=scrubbed_args,
            )
        except Exception:
            pass
    return {
        "allowed": allowed,
        "reason": reason,
        "sanitized_args": scrubbed_args,
        "test": body.test,
        "actor": actor,
    }


# ---------------------------------------------------------------- human-approved response
@app.get("/api/cases/{case_id}/response-proposals", response_model=list[ResponseProposal])
def list_response_proposals(case_id: str) -> list[ResponseProposal]:
    _summary(case_id)
    return responses.load_proposals(case_id)


@app.post("/api/cases/{case_id}/response-proposals/{proposal_id}/approve", response_model=ResponseProposal)
def approve_response_proposal(
    case_id: str,
    proposal_id: str,
    body: ResponseDecisionRequest,
) -> ResponseProposal:
    _summary(case_id)
    try:
        return responses.approve_proposal(
            case_id,
            proposal_id,
            analyst=body.analyst,
            payload_hash=body.payload_hash,
            note=body.note,
            mode=body.mode,
        )
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


@app.post("/api/cases/{case_id}/response-proposals/{proposal_id}/reject", response_model=ResponseProposal)
def reject_response_proposal(
    case_id: str,
    proposal_id: str,
    body: ResponseDecisionRequest,
) -> ResponseProposal:
    _summary(case_id)
    try:
        return responses.reject_proposal(
            case_id,
            proposal_id,
            analyst=body.analyst,
            payload_hash=body.payload_hash,
            note=body.note,
        )
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


@app.post("/api/cases/{case_id}/response-proposals/{proposal_id}/execute", response_model=ResponseProposal)
def execute_response_proposal(
    case_id: str,
    proposal_id: str,
    body: ResponseExecuteRequest,
) -> ResponseProposal:
    _summary(case_id)
    try:
        return responses.execute_proposal(
            case_id,
            proposal_id,
            analyst=body.analyst,
            payload_hash=body.payload_hash,
            mode=body.mode,
            confirm_target=body.confirm_target,
            environment=body.environment,
        )
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


@app.post("/api/cases/{case_id}/response-proposals/{proposal_id}/rollback", response_model=ResponseProposal)
def rollback_response_proposal(
    case_id: str,
    proposal_id: str,
    body: ResponseDecisionRequest,
) -> ResponseProposal:
    _summary(case_id)
    try:
        return responses.rollback_proposal(
            case_id,
            proposal_id,
            analyst=body.analyst,
            payload_hash=body.payload_hash,
            note=body.note,
        )
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from None
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


# ---------------------------------------------------------------- benchmarks
class BenchmarkRunRequest(BaseModel):
    case_id: str = "CASE-2026-0001"
    workflow: str = "autonomous_planner"


@app.get("/api/benchmarks/runs", response_model=list[BenchmarkRunResult])
def list_benchmark_runs() -> list[BenchmarkRunResult]:
    return benchmark.list_benchmark_runs()


@app.post("/api/benchmarks/runs", response_model=BenchmarkRunResult)
def run_benchmark_evaluation(body: BenchmarkRunRequest = BenchmarkRunRequest()) -> BenchmarkRunResult:
    _summary(body.case_id)
    wf = "fixed_baseline" if body.workflow == "fixed_baseline" else "autonomous_planner"
    return benchmark.evaluate_case(body.case_id, workflow=wf)


@app.get("/api/benchmarks/runs/{run_id}", response_model=BenchmarkRunResult)
def get_benchmark_run(run_id: str) -> BenchmarkRunResult:
    run = benchmark.get_benchmark_run(run_id)
    if run is None:
        raise HTTPException(404, f"Benchmark run {run_id} not found.")
    return run


@app.get("/api/cases/{case_id}/agents/events", response_model=list[AgentEvent])
def agent_events(case_id: str, after: int = Query(0, ge=0)) -> list[AgentEvent]:
    _summary(case_id)
    return _module("bus").history(case_id, after)


@app.post("/api/cases/{case_id}/selftest/verifier", response_model=Finding)
def verifier_self_test(case_id: str) -> Finding:
    _summary(case_id)
    with _llm_guard():
        return _module("agents.verifier").self_test(case_id)


# ---------------------------------------------------------------- shield and custody
@app.get("/api/cases/{case_id}/shield", response_model=list[ShieldAlert])
def get_shield(case_id: str) -> list[ShieldAlert]:
    _summary(case_id)
    return _load_json_list(case_id, "shield.json", _SHIELD)


@app.get("/api/cases/{case_id}/ledger", response_model=list[LedgerEntry])
def get_ledger(case_id: str) -> list[LedgerEntry]:
    _summary(case_id)
    return custody.entries(case_id)


@app.get("/api/cases/{case_id}/ledger/verify", response_model=LedgerVerification)
def verify_ledger(case_id: str) -> LedgerVerification:
    _summary(case_id)
    return custody.verify(case_id)


@app.post("/api/cases/{case_id}/ledger/tamper", response_model=LedgerVerification)
def tamper_ledger(case_id: str) -> LedgerVerification:
    _summary(case_id)
    try:
        return custody.tamper(case_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


@app.post("/api/cases/{case_id}/ledger/restore", response_model=LedgerVerification)
def restore_ledger(case_id: str) -> LedgerVerification:
    _summary(case_id)
    return custody.restore(case_id)


# ---------------------------------------------------------------- chat and reports
@app.get("/api/cases/{case_id}/chat", response_model=list[ChatMessage])
def chat_history(case_id: str) -> list[ChatMessage]:
    _summary(case_id)
    return _module("chat").history(case_id)


@app.post("/api/cases/{case_id}/chat", response_model=ChatMessage)
def chat_answer(case_id: str, body: ChatRequest) -> ChatMessage:
    _summary(case_id)
    if not body.question.strip():
        raise HTTPException(400, "Ask a question first.")
    with _llm_guard():
        return _module("chat").answer(case_id, body.question.strip())


@app.post("/api/cases/{case_id}/report", response_model=Report)
def generate_report(case_id: str, body: ReportRequest = ReportRequest()) -> Report:
    _summary(case_id)
    with _llm_guard():
        return _module("agents.reporter").generate_report(case_id, body.lang, body.classification)


@app.get("/api/cases/{case_id}/report", response_model=Report)
def get_report(case_id: str, lang: Lang = "en") -> Report:
    _summary(case_id)
    return _stored_report(case_id, lang)


@app.get("/api/cases/{case_id}/report.pdf")
def get_report_pdf(case_id: str, request: Request, lang: Lang = "en") -> Response:
    _summary(case_id)
    report = _stored_report(case_id, lang)
    verify_url = str(request.base_url) + f"api/verify/report?case_id={case_id}&hash={report.report_hash}"
    pdf = report_pdf.render_pdf(report, verify_url)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="SAKSI_{case_id}_{lang}.pdf"'},
    )


@app.get("/api/verify/report", response_model=ReportHashCheck)
def verify_report(
    case_id: str,
    report_hash: str = Query(..., alias="hash", min_length=1, max_length=128),
) -> ReportHashCheck:
    _summary(case_id)
    reporter = _module("agents.reporter")
    for lang in ("en", "ms"):
        report = reporter.load_report(case_id, lang)
        if report is not None and report.report_hash == report_hash:
            recomputed = custody.canonical_hash(report.model_dump(mode="json", exclude={"report_hash"}))
            if recomputed == report_hash:
                return ReportHashCheck(case_id=case_id, report_hash=report_hash, match=True, lang=lang)
            return ReportHashCheck(case_id=case_id, report_hash=report_hash, match=False, lang=lang)
    return ReportHashCheck(case_id=case_id, report_hash=report_hash, match=False, lang=None)


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
    """Answer unexpected failures with a generic message: no stack trace or internal text reaches the client."""
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


# ---------------------------------------------------------------- WebSocket
async def _forward(queue: asyncio.Queue, websocket: WebSocket) -> None:
    while True:
        await websocket.send_json(await queue.get())


async def _until_disconnect(websocket: WebSocket) -> None:
    while (await websocket.receive())["type"] != "websocket.disconnect":
        pass


@app.websocket("/ws/cases/{case_id}")
async def case_socket(websocket: WebSocket, case_id: str) -> None:
    await websocket.accept()
    try:
        store.load_case(case_id)
    except KeyError:
        await websocket.close(code=4404)
        return
    try:
        pipeline, bus = _module("pipeline"), _module("bus")
    except HTTPException:
        await websocket.close(code=1011)
        return

    queue = bus.subscribe(case_id)
    try:
        await websocket.send_json({"type": "run_status", "data": pipeline.get_run(case_id).model_dump(mode="json")})
        history_events = bus.history(case_id)
        last_seq = 0
        for event in history_events:
            await websocket.send_json({"type": "agent_event", "data": event.model_dump(mode="json")})
            last_seq = max(last_seq, event.seq)
        await websocket.send_json({"type": "replay_complete", "data": {"last_seq": last_seq}})

        sender = asyncio.create_task(_forward(queue, websocket))
        receiver = asyncio.create_task(_until_disconnect(websocket))
        _, pending = await asyncio.wait({sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        bus.unsubscribe(case_id, queue)


# ---------------------------------------------------------------- built single-page app
if DIST_DIR.is_dir():
    if (DIST_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    @app.get("/{full_path:path}", include_in_schema=False)
    def single_page_app(full_path: str = "") -> FileResponse:
        if full_path == "api" or full_path.startswith(("api/", "ws/")) or full_path == "ws":
            raise HTTPException(404, "Not found.")
        return FileResponse(DIST_DIR / "index.html")
