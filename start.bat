@echo off
title executive-job-ops
color 0A

echo.
echo  ============================================
echo    executive-job-ops - by mrpaapi
echo  ============================================
echo.

REM Go to the correct directory
cd /d "%~dp0"

REM Create resumes folder if it doesn't exist
if not exist "resumes" mkdir resumes

REM Check if .env exists, if not copy from example
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  Created .env file. Please add your OpenAI key.
        echo  Opening .env in Notepad...
        notepad .env
        echo  Press any key once you have saved your API key...
        pause >nul
    )
)

REM Check Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found.
    echo  Please download Python from https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install.
    pause
    exit /b 1
)

REM Check Node is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Node.js not found.
    echo  Please download Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check backend venv exists, set up if not
if not exist "backend\.venv" (
    echo  First time setup - installing backend dependencies...
    cd backend
    python -m venv .venv
    call .venv\Scripts\activate.bat
    pip install -r requirements.txt
    cd ..
    echo  Backend setup complete.
)

REM Check frontend node_modules exists, set up if not
if not exist "frontend\node_modules" (
    echo  First time setup - installing frontend dependencies...
    cd frontend
    npm install
    cd ..
    echo  Frontend setup complete.
)

echo  Starting backend API server...
cd backend
start "Backend - executive-job-ops" cmd /k "call .venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
cd ..

echo  Waiting for backend to be ready...
timeout /t 5 /nobreak >nul

echo  Starting frontend dashboard...
cd frontend
start "Frontend - executive-job-ops" cmd /k "npm run dev -- --port 3000"
cd ..

echo  Waiting for frontend to be ready...
timeout /t 5 /nobreak >nul

echo.
echo  ============================================
echo    Everything is running!
echo.
echo    Open your browser at:
echo    http://localhost:3000
echo.
echo    Two terminal windows are running
echo    in the background - keep them open.
echo.
echo    Press any key to open the browser.
echo  ============================================
echo.

pause >nul
start http://localhost:3000
