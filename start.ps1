param(
    [switch]$SeedOnly,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = "Stop"
$PlatformDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $PlatformDir

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  SAKSI — Agentic AI Cyber Incident Investigation     " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# Locate Python virtual environment
$PythonExe = "python"
if (Test-Path "$PlatformDir\.venv\Scripts\python.exe") {
    $PythonExe = "$PlatformDir\.venv\Scripts\python.exe"
} elseif (Test-Path "$PlatformDir\..\.venv\Scripts\python.exe") {
    $PythonExe = (Resolve-Path "$PlatformDir\..\.venv\Scripts\python.exe").Path
}

Write-Host "[1/3] Seeding recorded demo case (CASE-2026-0001) & refreshing proposals..." -ForegroundColor Green
& $PythonExe "$PlatformDir\scripts\seed_demo.py"

if ($SeedOnly) {
    Write-Host "Seed complete." -ForegroundColor Green
    exit 0
}

Write-Host "[2/3] Starting SAKSI FastAPI backend on http://127.0.0.1:$BackendPort ..." -ForegroundColor Green
$BackendJob = Start-Process -FilePath $PythonExe `
    -ArgumentList "-m", "uvicorn", "saksi.main:app", "--host", "127.0.0.1", "--port", "$BackendPort" `
    -WorkingDirectory "$PlatformDir\backend" `
    -PassThru

Write-Host "[3/3] Starting SAKSI Vite frontend on http://127.0.0.1:$FrontendPort ..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
try {
    Set-Location "$PlatformDir\frontend"
    npm run dev -- --host 127.0.0.1 --port $FrontendPort
} finally {
    if ($BackendJob -and !$BackendJob.HasExited) {
        Stop-Process -Id $BackendJob.Id -Force -ErrorAction SilentlyContinue
    }
}

