@echo off
REM Auto-Launcher - Services auto-start when game is opened
REM Keep this running in the background while playing

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

REM Start the auto-launcher (will auto-start services)
python auto_launcher.py

pause
