@echo off
REM Service Controller - Manages FastAPI server and learning worker
REM This runs in the background and listens on http://localhost:9000
REM The game will automatically call this when you click "New Game"

cd /d "%~dp0"

REM Check if virtual environment exists
if not exist ".venv" (
    echo ERROR: Virtual environment not found!
    echo Please run this first:
    echo   python -m venv .venv
    echo   .venv\Scripts\activate
    echo   pip install -r docs/requirements.txt
    pause
    exit /b 1
)

REM Start the service controller
python service_controller.py

pause
