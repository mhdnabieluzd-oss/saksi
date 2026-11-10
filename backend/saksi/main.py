"""FastAPI application entry point for SAKSI (`uvicorn saksi.main:app` or `uvicorn saksi.api:app`)."""

from __future__ import annotations

from saksi.api import app

__all__ = ["app"]
