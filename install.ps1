# executive-job-ops Windows Installer
# by srinathsankara — https://github.com/srinathsankara/executive-job-ops

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    executive-job-ops installer     ║" -ForegroundColor Cyan
Write-Host "║         by srinathsankara          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Cleanup old artifacts
Write-Host "Cleaning up old artifacts..." -ForegroundColor Cyan
if (Test-Path "backend\.venv") {
    Remove-Item -Recurse -Force "backend\.venv" -ErrorAction SilentlyContinue
}
if (Test-Path "frontend\node_modules") {
    Remove-Item -Recurse -Force "frontend\node_modules" -ErrorAction SilentlyContinue
}
Get-ChildItem -Path "backend\app" -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
if (Test-Path "frontend\dist") {
    Remove-Item -Recurse -Force "frontend\dist" -ErrorAction SilentlyContinue
}
if (Test-Path "backend\executive_job_ops.db") {
    Remove-Item -Force "backend\executive_job_ops.db" -ErrorAction SilentlyContinue
}
if (Test-Path ".env") {
    Remove-Item -Force ".env" -ErrorAction SilentlyContinue
}
Write-Host "✓ Cleanup complete" -ForegroundColor Green
Write-Host ""

# Check Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python not found. Downloading installer..." -ForegroundColor Yellow
    $url = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
    $out = "$env:TEMP\python-installer.exe"
    Invoke-WebRequest $url -OutFile $out
    Start-Process $out -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait
    Write-Host "Python installed. Please restart PowerShell and run this script again." -ForegroundColor Green
    exit 0
}

# Check Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Downloading installer..." -ForegroundColor Yellow
    $url = "https://nodejs.org/dist/v20.14.0/node-v20.14.0-x64.msi"
    $out = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest $url -OutFile $out
    Start-Process msiexec -ArgumentList "/i $out /quiet" -Wait
    Write-Host "Node.js installed. Please restart PowerShell and run this script again." -ForegroundColor Green
    exit 0
}

Write-Host "✓ Python $(python --version)" -ForegroundColor Green
Write-Host "✓ Node $(node --version)" -ForegroundColor Green

# Setup .env
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host "  ACTION NEEDED: Add your OpenAI key  " -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Get a free key at: https://platform.openai.com/api-keys"
    Write-Host "  2. Open the file '.env' in Notepad"
    Write-Host "  3. Replace 'sk-your-key-here' with your actual key"
    Write-Host ""
    notepad .env
    Read-Host "Press Enter once you've saved your API key"
}

# Backend virtualenv
Write-Host "`nSetting up Python backend..." -ForegroundColor Cyan
Set-Location backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --quiet -r requirements.txt
Set-Location ..
Write-Host "✓ Backend ready" -ForegroundColor Green

# Frontend
Write-Host "`nSetting up frontend..." -ForegroundColor Cyan
Set-Location frontend
npm install --silent
Set-Location ..
Write-Host "✓ Frontend ready" -ForegroundColor Green

Write-Host ""
Write-Host "╔════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   Installation complete!           ║" -ForegroundColor Green
Write-Host "║                                    ║" -ForegroundColor Green
Write-Host "║   Run: start.bat                   ║" -ForegroundColor Green
Write-Host "║   Then open: http://localhost:3000 ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
