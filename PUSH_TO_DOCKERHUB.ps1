# PowerShell script to build and push Checkers AI to Docker Hub

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Push to Docker Hub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check for Docker
try {
    $dockerVer = docker --version
    Write-Host "[OK] Docker found: $dockerVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker not found!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop and restart your terminal." -ForegroundColor Yellow
    Write-Host "Download: https://www.docker.com/products/docker-desktop" -ForegroundColor Gray
    Read-Host "Press Enter to exit"
    exit 1
}

# 2. Get Username
$Username = Read-Host "Enter your Docker Hub username"
if (-not $Username) {
    Write-Host "Username required." -ForegroundColor Red
    exit 1
}

$RepoName = "checkers-ai"
$Tag = "latest"
$ImageName = "${Username}/${RepoName}:${Tag}"

Write-Host ""
Write-Host "Target Image: $ImageName" -ForegroundColor Yellow
Write-Host ""

# 3. Build API/Worker Image
Write-Host "[1/3] Building Backend Image..." -ForegroundColor Cyan
# Build from root context
docker build -t $ImageName .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}
Write-Host "Build complete." -ForegroundColor Green
Write-Host ""

# 4. Push to Hub
Write-Host "[2/3] Pushing to Docker Hub..." -ForegroundColor Cyan
Write-Host "You may be asked to log in if you haven't already." -ForegroundColor Gray
docker login
if ($LASTEXITCODE -ne 0) {
    Write-Host "Login failed." -ForegroundColor Red
    exit 1
}

docker push $ImageName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push failed." -ForegroundColor Red
    exit 1
}
Write-Host "Push complete!" -ForegroundColor Green
Write-Host ""

# 5. Update .env for convenience
Write-Host "[3/3] Updating .env file..." -ForegroundColor Cyan
$EnvFile = ".env"
$EnvContent = "CHECKERS_AI_IMAGE=$ImageName"
Set-Content -Path $EnvFile -Value $EnvContent
Write-Host "Updated .env with: $EnvContent" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUCCESS!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To share this project, give your friend:"
Write-Host "1. This project folder (with docker-compose.web.yml)"
Write-Host "2. The instruction to run: .\START_DOCKER_APP.bat"
Write-Host ""
Read-Host "Press Enter to exit"
