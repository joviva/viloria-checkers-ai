@echo off
cd /d "%~dp0.."
call .venv\Scripts\activate.bat
cd docs
python -m learning.worker
pause
