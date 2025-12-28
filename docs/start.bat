@echo off
REM Start the Checkers AI system on Windows

echo [START] Starting Checkers AI System...
echo.

REM Check if Python dependencies are installed
echo Checking dependencies...
pip install -q -r requirements.txt

REM Create checkpoints directory
if not exist "..\checkpoints" mkdir "..\checkpoints"

echo.
echo Starting components:
echo.

REM Start API server in new window
echo [1] Starting API Server on http://localhost:8000...
start "Checkers API Server" cmd /k "uvicorn api.main:app --host 0.0.0.0 --port 8000"

REM Wait for API to start
timeout /t 3 /nobreak >nul

REM Start learning worker in new window (optional)
echo [2] Starting Learning Worker...
start "Checkers Learning Worker" cmd /k "python -m learning.worker"

echo.
echo [SUCCESS] System is running!
echo.
echo [INFO] Access points:
echo   - API: http://localhost:8000
echo   - API Docs: http://localhost:8000/docs
echo   - Stats: http://localhost:8000/ai/stats
echo.
echo [NEXT] Next steps:
echo   1. Open ..\index.html in your browser
echo   2. Set API_CONFIG.enabled = true in ..\script.js
echo   3. Play games to train the AI!
echo.
echo Press any key to view running services...
pause >nul

REM Show running Python processes
tasklist | findstr python

echo.
echo To stop services, close the command windows or use Ctrl+C
echo.
pause
