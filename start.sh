#!/usr/bin/env bash
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

PYTHON_BIN="python3"
if [ -x "$PLATFORM_DIR/.venv/bin/python" ]; then
  PYTHON_BIN="$PLATFORM_DIR/.venv/bin/python"
elif [ -x "$PLATFORM_DIR/.venv/Scripts/python.exe" ]; then
  PYTHON_BIN="$PLATFORM_DIR/.venv/Scripts/python.exe"
elif [ -x "$PLATFORM_DIR/../.venv/bin/python" ]; then
  PYTHON_BIN="$PLATFORM_DIR/../.venv/bin/python"
elif [ -x "$PLATFORM_DIR/../.venv/Scripts/python.exe" ]; then
  PYTHON_BIN="$PLATFORM_DIR/../.venv/Scripts/python.exe"
fi

echo "[1/3] Seeding recorded demo case (CASE-2026-0001) & refreshing proposals..."
"$PYTHON_BIN" "$PLATFORM_DIR/scripts/seed_demo.py"

if [ "${1:-}" = "--seed-only" ]; then
  echo "Seed complete."
  exit 0
fi

echo "[2/3] Starting SAKSI FastAPI backend on http://127.0.0.1:$BACKEND_PORT ..."
(cd "$PLATFORM_DIR/backend" && "$PYTHON_BIN" -m uvicorn saksi.main:app --host 127.0.0.1 --port "$BACKEND_PORT") &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT

echo "[3/3] Starting SAKSI Vite frontend on http://127.0.0.1:$FRONTEND_PORT ..."
cd "$PLATFORM_DIR/frontend"
npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"

