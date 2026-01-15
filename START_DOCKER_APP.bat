@echo off
echo Starting Checkers AI (Frontend + Backend + Worker)...
echo.

IF NOT EXIST .env (
    echo [WARNING] .env file not found.
    echo Please edit this file to set your Docker image manually below
    echo or run PUSH_TO_DOCKERHUB.ps1 first.
    echo.
    set /p IMAGE_NAME="Enter Docker Image Name (e.g. user/checkers-ai:latest): "
    set CHECKERS_AI_IMAGE=%IMAGE_NAME%
) ELSE (
    echo Loading configuration from .env...
    for /f "tokens=*" %%a in (.env) do set %%a
)

echo.
echo Using Image: %CHECKERS_AI_IMAGE%
echo.

docker compose -f docker-compose.web.yml up
pause
