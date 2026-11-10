"""Settings module alias for SAKSI (§3.1 layout)."""

from __future__ import annotations

from saksi.config import (
    BACKEND_DIR,
    BASE_DIR,
    DEFAULT_MODEL,
    FIXTURES_DIR,
    PLATFORM_DIR,
    SCENARIO_DIR,
    api_key,
    data_dir,
    default_model,
    load_settings,
    now_iso,
    save_settings,
    write_atomic,
)

__all__ = [
    "BACKEND_DIR",
    "BASE_DIR",
    "DEFAULT_MODEL",
    "FIXTURES_DIR",
    "PLATFORM_DIR",
    "SCENARIO_DIR",
    "api_key",
    "data_dir",
    "default_model",
    "load_settings",
    "now_iso",
    "save_settings",
    "write_atomic",
]
