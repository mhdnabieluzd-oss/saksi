"""Paths, environment, settings and small shared helpers for SAKSI."""

from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

from saksi.models import Settings

BACKEND_DIR = Path(__file__).resolve().parent.parent
PLATFORM_DIR = BACKEND_DIR.parent
BASE_DIR = BACKEND_DIR
SCENARIO_DIR = PLATFORM_DIR / "scenarios" if (PLATFORM_DIR / "scenarios").exists() else BACKEND_DIR / "scenarios"
FIXTURES_DIR = PLATFORM_DIR / "fixtures"
DEFAULT_MODEL = "anthropic/claude-haiku-5.5"

load_dotenv(PLATFORM_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")


def data_dir() -> Path:
    """Return the data root: SAKSI_DATA_DIR when set, else backend/data. Read on every call."""
    override = os.environ.get("SAKSI_DATA_DIR")
    return Path(override) if override else BACKEND_DIR / "data"


def api_key() -> str | None:
    """Return the OpenRouter API key, or None when unset. Callers must never log it."""
    return os.environ.get("SAKSI_OPENROUTER_API_KEY") or os.environ.get("OPENROUTER_API_KEY") or None


def default_model() -> str:
    """Return the LLM model id from SAKSI_MODEL, defaulting to anthropic/claude-haiku-5.5."""
    return os.environ.get("SAKSI_MODEL") or DEFAULT_MODEL


def load_settings() -> Settings:
    """Load data/settings.json, or the defaults (model from SAKSI_MODEL) when the file does not exist yet."""
    path = data_dir() / "settings.json"
    if not path.exists():
        return Settings(model=default_model(), reporter_model=default_model())
    return Settings.model_validate_json(path.read_text(encoding="utf-8"))


def save_settings(settings: Settings) -> None:
    """Atomically write data/settings.json."""
    write_atomic(data_dir() / "settings.json", settings.model_dump_json(indent=2).encode("utf-8"))


def write_atomic(path: Path, data: bytes) -> None:
    """Write bytes to a temp file beside `path`, then swap it in with os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def now_iso() -> str:
    """Return the current UTC time as ISO 8601 with a trailing Z, to the second."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
