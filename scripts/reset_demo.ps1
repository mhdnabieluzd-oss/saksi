$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PlatformDir = Split-Path -Parent $ScriptDir

$PythonExe = "python"
if (Test-Path "$PlatformDir\.venv\Scripts\python.exe") {
    $PythonExe = "$PlatformDir\.venv\Scripts\python.exe"
} elseif (Test-Path "$PlatformDir\..\.venv\Scripts\python.exe") {
    $PythonExe = (Resolve-Path "$PlatformDir\..\.venv\Scripts\python.exe").Path
}

Write-Host "Resetting SAKSI demo fixtures and refreshing response proposal expiries (now + 7 days)..." -ForegroundColor Cyan
& $PythonExe "$ScriptDir\seed_demo.py"
Write-Host "Demo reset complete." -ForegroundColor Green

