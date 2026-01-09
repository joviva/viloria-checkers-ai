# Complete startup script for Checkers AI - Starts both API server and learning worker
param(
    [switch]$SkipBrowser
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Checkers AI Complete System Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Change to script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ScriptDir

Write-Host "[INFO] Project root: $ProjectRoot" -ForegroundColor Gray
Write-Host "[INFO] Using virtual environment: $ProjectRoot\.venv" -ForegroundColor Gray
Write-Host ""

# Check if virtual environment exists
$VenvPath = Join-Path $ProjectRoot ".venv"
if (-not (Test-Path $VenvPath)) {
    Write-Host "[ERROR] Virtual environment not found at $VenvPath" -ForegroundColor Red
    Write-Host "Please create virtual environment first" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Kill any existing processes on port 8000
Write-Host "[CLEANUP] Stopping any existing services on port 8000..." -ForegroundColor Yellow
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | 
    Select-Object -ExpandProperty OwningProcess -Unique | 
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# Create necessary directories
$CheckpointsDir = Join-Path $ProjectRoot "checkpoints"
$DataDir = Join-Path $ProjectRoot "data"
if (-not (Test-Path $CheckpointsDir)) { New-Item -ItemType Directory -Path $CheckpointsDir | Out-Null }
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }
Write-Host "[OK] Directories verified" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting Services" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Start API server in new window
Write-Host "[1] Starting API Server on http://localhost:8000..." -ForegroundColor Yellow
$ApiCommand = "cd '$ScriptDir'; & '$VenvPath\Scripts\Activate.ps1'; python -m uvicorn api.main:app --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $ApiCommand -WindowStyle Normal

# Wait for API to start
Write-Host "[INFO] Waiting for API server to start..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Verify API is running
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/stats" -Method GET -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[OK] API server is running" -ForegroundColor Green
    Write-Host "    Total games: $($response.total_games)" -ForegroundColor Gray
    Write-Host "    Total trajectories: $($response.total_trajectories)" -ForegroundColor Gray
} catch {
    Write-Host "[WARNING] API server may not be ready yet (this is normal)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[2] Starting Learning Worker..." -ForegroundColor Yellow
$WorkerCommand = "cd '$ScriptDir'; & '$VenvPath\Scripts\Activate.ps1'; python -m learning.worker"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $WorkerCommand -WindowStyle Normal

# Wait a moment for worker to connect
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  System Status" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[SUCCESS] All services started!" -ForegroundColor Green
Write-Host ""
Write-Host "[INFO] Access points:" -ForegroundColor Cyan
Write-Host "  - API Server:  http://localhost:8000" -ForegroundColor White
Write-Host "  - API Docs:    http://localhost:8000/docs" -ForegroundColor White
Write-Host "  - Stats:       http://localhost:8000/api/stats" -ForegroundColor White
Write-Host ""
Write-Host "[INFO] Frontend:" -ForegroundColor Cyan
Write-Host "  - Game: $ProjectRoot\index.html" -ForegroundColor White
Write-Host "  - The game will automatically connect to the API" -ForegroundColor White
Write-Host ""
Write-Host "[INFO] To stop services:" -ForegroundColor Cyan
Write-Host "  - Close the PowerShell windows for API and Worker" -ForegroundColor White
Write-Host "  - Or run: Get-NetTCPConnection -LocalPort 8000 | %{Stop-Process -Id `$_.OwningProcess -Force}" -ForegroundColor Gray
Write-Host ""

# Check current status
try {
    $stats = Invoke-RestMethod -Uri "http://localhost:8000/api/stats" -Method GET -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[LIVE STATUS]" -ForegroundColor Cyan
    Write-Host "  Learning Active: $($stats.learning_active)" -ForegroundColor $(if ($stats.learning_active) { "Green" } else { "Yellow" })
    Write-Host "  Learning Iterations: $($stats.learning_iterations)" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "[INFO] Could not fetch live status (server still starting)" -ForegroundColor Gray
    Write-Host ""
}

if (-not $SkipBrowser) {
    Write-Host "[NEXT] Opening game in your browser..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    Start-Process (Join-Path $ProjectRoot "index.html")
    Write-Host ""
    Write-Host "Game opened! Services are running in background windows." -ForegroundColor Green
} else {
    Write-Host "[INFO] Skipped opening browser (use without -SkipBrowser to auto-open)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Press any key to exit this window (services will keep running)..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
