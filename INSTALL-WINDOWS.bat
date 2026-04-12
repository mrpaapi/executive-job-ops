@echo off
setlocal enabledelayedexpansion
title executive-job-ops Setup
color 0A
cd /d "%~dp0"

echo.
echo  =============================================
echo   executive-job-ops  ^|  by srinathsankara
echo   First-time setup wizard
echo  =============================================
echo.

REM ── GUARD: correct folder ────────────────────────────────────
if not exist "backend\app\main.py" (
    color 0C
    echo  ERROR: Wrong folder!
    echo.
    echo  You must run this from INSIDE the executive-job-ops folder.
    echo  See README.md Step 0 for how to move it.
    echo.
    pause
    exit /b 1
)

REM ── CLEANUP: Remove old artifacts for fresh install ─────────
echo  Cleaning up old artifacts...
if exist "backend\.venv" rmdir /s /q "backend\.venv" >nul 2>&1
if exist "frontend\node_modules" rmdir /s /q "frontend\node_modules" >nul 2>&1
for /d /r "backend\app" %%d in (__pycache__) do rmdir /s /q "%%d" >nul 2>&1
if exist "frontend\dist" rmdir /s /q "frontend\dist" >nul 2>&1
if exist "backend\executive_job_ops.db" del /q "backend\executive_job_ops.db" >nul 2>&1
if exist ".env" del /q ".env" >nul 2>&1
echo  Cleanup complete.
echo.

REM ── STEP 1: Find a compatible Python (3.11 or 3.12) ─────────
echo  [1/5] Checking for compatible Python...

REM Use py launcher to check for 3.11 first (most compatible)
py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON=py -3.11
    for /f "tokens=*" %%v in ('py -3.11 --version') do echo  Using %%v
    goto :python_ok
)

REM Fall back to 3.12
py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON=py -3.12
    for /f "tokens=*" %%v in ('py -3.12 --version') do echo  Using %%v
    goto :python_ok
)

REM Nothing compatible found
color 0C
echo.
echo  -----------------------------------------------
echo   No compatible Python found.
echo.
echo   You need Python 3.11. Here is why:
echo   Python 3.13 and 3.14 are too new and break
echo   the packages this app depends on.
echo  -----------------------------------------------
echo.
echo  Downloading Python 3.11 installer now...
echo.
echo  IMPORTANT - when the installer opens:
echo    1. Click "Install Now"
echo    2. Make sure "Add Python to PATH" is checked
echo.
echo  After installing, close this window and
echo  double-click INSTALL-WINDOWS.bat again.
echo.
start https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe
pause
exit /b 1

:python_ok

REM ── STEP 2: Check Node.js ────────────────────────────────────
echo  [2/5] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Node.js not found. Downloading installer...
    echo  Install it, then run INSTALL-WINDOWS.bat again.
    echo.
    start https://nodejs.org/dist/v20.14.0/node-v20.14.0-x64.msi
    pause
    exit /b 1
)
for /f %%v in ('node --version') do echo  Node.js %%v found.

REM ── STEP 3: Setup .env ───────────────────────────────────────
echo  [3/5] Setting up configuration...
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo.
    echo  -----------------------------------------------
    echo   ACTION NEEDED: Add your OpenAI API key
    echo  -----------------------------------------------
    echo.
    echo  1. Go to: https://platform.openai.com/api-keys
    echo  2. Create a free account
    echo  3. Click "Create new secret key" and copy it
    echo  4. In Notepad: find the line OPENAI_API_KEY=
    echo     and paste your key after the = sign
    echo  5. Save with Ctrl+S then close Notepad
    echo.
    echo  Press any key to open Notepad...
    pause >nul
    notepad .env
    echo  Press any key after you have saved your key...
    pause >nul
)
echo  Configuration ready.

REM ── STEP 4: Install backend packages ─────────────────────────
echo  [4/5] Installing backend (2-3 minutes, please wait)...

%PYTHON% -m pip install --upgrade pip --quiet --no-warn-script-location

%PYTHON% -m pip install --quiet --no-warn-script-location ^
    "fastapi==0.111.0" ^
    "uvicorn[standard]==0.29.0" ^
    "sqlalchemy==2.0.30" ^
    "aiosqlite==0.20.0" ^
    "pydantic==2.7.1" ^
    "pydantic-settings==2.2.1" ^
    "python-multipart==0.0.9" ^
    "httpx==0.27.0" ^
    "openai==1.30.1" ^
    "PyPDF2==3.0.1" ^
    "python-dotenv==1.0.1" ^
    "watchdog==4.0.0" ^
    "aiofiles==23.2.1" ^
    "beautifulsoup4==4.12.3" ^
    "requests==2.31.0" ^
    "apscheduler==3.10.4" ^
    "passlib==1.7.4" ^
    "bcrypt==4.1.3"

if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR: Some packages failed to install.
    echo  Take a screenshot and open an issue at:
    echo  https://github.com/srinathsankara/executive-job-ops/issues
    pause
    exit /b 1
)

REM Verify they actually load
%PYTHON% -c "import sqlalchemy, fastapi, aiosqlite, pydantic_settings; print('All packages OK')"
if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR: Packages installed but failed to load.
    echo  This usually means the wrong Python version is active.
    echo  See README.md Troubleshooting section.
    pause
    exit /b 1
)
echo  Backend ready.

REM ── STEP 5: Install frontend ──────────────────────────────────
echo  [5/5] Installing frontend (1-2 minutes)...
cd frontend
call npm install --silent 2>nul
if errorlevel 1 (
    color 0C
    echo  ERROR: Frontend install failed. Check your internet connection.
    pause
    exit /b 1
)
cd ..
echo  Frontend ready.

if not exist "resumes" mkdir resumes

REM Save which python to use so start.bat picks it up
echo %PYTHON% > .python-version.txt

echo.
echo  =============================================
echo   Setup complete!
echo   Now double-click  start.bat  to run the app
echo  =============================================
echo.
pause
