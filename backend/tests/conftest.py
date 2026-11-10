"""Shared fixtures: every test runs against a fresh temporary data directory."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point SAKSI_DATA_DIR at a temporary directory so no test touches development/data."""
    path = tmp_path / "data"
    monkeypatch.setenv("SAKSI_DATA_DIR", str(path))
    return path
