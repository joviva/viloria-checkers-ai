@echo off
REM Complete startup script for Checkers AI - Starts both API server and learning worker
SETLOCAL EnableDelayedExpansion

echo ========================================
echo   Checkers AI Complete System Startup
echo ========================================
echo.

REM Change to script directory
cd /d "%~dp0"
set "PROJECT_ROOT=%~dp0.."

REM Check if virtual environment exists
if not exist "..\..venv\" (
    echo [ERROR] Virtual environment not found at ..\..venv
    echo Please run setup first or create virtual environment
    pause
    exit /b 1
)

echo [INFO] Project root: %PROJECT_ROOT%
echo [INFO] Using virtual environment: ..\..venv
echo.

REM Kill any existing processes on port 8000
echo [CLEANUP] Stopping any existing services on port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM Create necessary directories
if not exist "..\checkpoints" mkdir "..\checkpoints"
if not exist "..\data" mkdir "..\data"
echo [OK] Directories verified

echo.
echo ========================================
echo   Starting Services
echo ========================================
echo.

REM Start API server in new window
echo [1] Starting API Server on http://localhost:8000...
start "Checkers API Server" cmd /k "cd /d "%~dp0" && ..\..venv\Scripts\activate && python -m uvicorn api.main:app --host 0.0.0.0 --port 8000"

REM Wait for API to start
echo [INFO] Waiting for API server to start...
timeout /t 5 /nobreak >nul

REM Verify API is running
powershell -Command "try { Invoke-RestRequest -Uri 'http://localhost:8000/ai/stats' -Method GET -TimeoutSec 2 | Out-Null; Write-Host '[OK] API server is running' } catch { Write-Host '[WARNING] API server may not be ready yet' }" 2>nul

echo.
echo [2] Starting Learning Worker...
start "Checkers Learning Worker" cmd /k "cd /d "%~dp0" && ..\..venv\Scripts\activate && python -m learning.worker"

echo.
echo ========================================
echo   System Status
echo ========================================
echo.
echo [SUCCESS] All services started!
echo.
echo [INFO] Access points:
echo   - API Server:  http://localhost:8000
echo   - API Docs:    http://localhost:8000/docs
echo   - Stats:       http://localhost:8000/ai/stats
echo.
echo [INFO] Frontend:
echo   - Open: %PROJECT_ROOT%\index.html in your browser
echo   - The game will automatically connect to the API
echo.
echo [INFO] To stop services:
echo   - Close the "Checkers API Server" window
echo   - Close the "Checkers Learning Worker" window
echo   - Or run: taskkill /FI "WINDOWTITLE eq Checkers*" /F
echo.
echo [NEXT] Press any key to open the game in your browser...
pause >nul

REM Open the game in default browser
start "" "%PROJECT_ROOT%\index.html"

echo.
echo Game opened! Services are running in background windows.
echo.
