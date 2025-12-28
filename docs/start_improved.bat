@echo off
REM Enhanced startup script for Checkers AI Backend
REM Handles virtual environment, dependencies, and error checking

SETLOCAL EnableDelayedExpansion

echo ========================================
echo   Checkers AI Backend Startup
echo ========================================
echo.

REM Change to docs directory
cd /d "%~dp0"

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.8 or higher from python.org
    pause
    exit /b 1
)

echo [OK] Python is installed
python --version

REM Check/Create virtual environment
if not exist ".venv\" (
    echo.
    echo [SETUP] Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created
)

REM Activate virtual environment
echo.
echo [SETUP] Activating virtual environment...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo [ERROR] Failed to activate virtual environment
    pause
    exit /b 1
)
echo [OK] Virtual environment activated

REM Install/Update dependencies
echo.
echo [SETUP] Installing dependencies...
echo This may take a few minutes on first run...
python -m pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [WARNING] Some dependencies may have failed to install
    echo Attempting to continue...
)
echo [OK] Dependencies installed

REM Create necessary directories
if not exist "..\checkpoints" mkdir "..\checkpoints"
if not exist "..\data" mkdir "..\data"
echo [OK] Directories created

REM Check if port 8000 is available
echo.
echo [CHECK] Checking if port 8000 is available...
netstat -ano | findstr ":8000" >nul 2>&1
if not errorlevel 1 (
    echo [WARNING] Port 8000 is already in use
    echo Another instance may be running, or another service is using this port
    echo Press Ctrl+C to cancel, or any key to try anyway...
    pause >nul
)

REM Start the API server
echo.
echo ========================================
echo   Starting API Server
echo ========================================
echo.
echo Server URL: http://localhost:8000
echo API Docs:   http://localhost:8000/docs
echo Stats API:  http://localhost:8000/ai/stats
echo.
echo Press Ctrl+C to stop the server
echo.

python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload

REM If server stops, deactivate venv
deactivate
echo.
echo [INFO] Server stopped
pause
