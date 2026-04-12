@echo off
setlocal enabledelayedexpansion
title executive-job-ops
color 0A
cd /d "%~dp0"

REM ── GUARD: correct folder ────────────────────────────────────
if not exist "backend\app\main.py" (
    color 0C
    echo.
    echo  ERROR: Wrong folder.
    echo  Open the executive-job-ops folder and run start.bat from inside it.
    echo.
    pause
    exit /b 1
)

REM ── Pick Python: use saved version from install, else auto-detect ──
set PYTHON=
if exist ".python-version.txt" (
    set /p PYTHON=<.python-version.txt
)

REM If not saved, try py launcher in order of preference
if "%PYTHON%"=="" (
    py -3.11 --version >nul 2>&1
    if not errorlevel 1 set PYTHON=py -3.11
)
if "%PYTHON%"=="" (
    py -3.12 --version >nul 2>&1
    if not errorlevel 1 set PYTHON=py -3.12
)

REM Last resort: whatever python is on PATH
if "%PYTHON%"=="" set PYTHON=python

REM ── GUARD: check Python works ────────────────────────────────
%PYTHON% --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR: Python not found.
    echo  Please run INSTALL-WINDOWS.bat first.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('%PYTHON% --version') do set PYVER=%%v

REM ── GUARD: check Python is compatible ────────────────────────
%PYTHON% -c "import sys; exit(0 if sys.version_info < (3,13) else 1)" >nul 2>&1
if errorlevel 1 (
    color 0C
    echo.
    echo  -----------------------------------------------
    echo   ERROR: Incompatible Python version detected.
    echo.
    echo   This app needs Python 3.11 or 3.12.
    echo   You have Python 3.13 or 3.14 active.
    echo.
    echo   FIX: Install Python 3.11 then run
    echo   INSTALL-WINDOWS.bat again.
    echo.
    echo   Download: https://www.python.org/ftp/python/
    echo             3.11.9/python-3.11.9-amd64.exe
    echo  -----------------------------------------------
    echo.
    pause
    exit /b 1
)

REM ── GUARD: packages installed ────────────────────────────────
%PYTHON% -c "import sqlalchemy, fastapi, aiosqlite" >nul 2>&1
if errorlevel 1 (
    color 0E
    echo.
    echo  Packages not found. Running setup first...
    echo.
    call INSTALL-WINDOWS.bat
    if errorlevel 1 exit /b 1
    REM Reload python choice after install
    if exist ".python-version.txt" set /p PYTHON=<.python-version.txt
)

echo.
echo  =============================================
echo   executive-job-ops  ^|  by srinathsankara
echo  =============================================
echo  Using: %PYVER%
echo.

if not exist "resumes" mkdir resumes

REM ── Start backend ────────────────────────────────────────────
echo  Starting backend API...
cd backend
start "Backend - executive-job-ops" cmd /k "%PYTHON% -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
cd ..

echo  Waiting for backend to start...
timeout /t 10 /nobreak >nul

REM ── Start frontend ────────────────────────────────────────────
echo  Starting frontend dashboard...
cd frontend
start "Frontend - executive-job-ops" cmd /k "npm run dev -- --port 3000"
cd ..

timeout /t 6 /nobreak >nul

echo.
echo  =============================================
echo   Everything is running!
echo   Opening http://localhost:3000 ...
echo   Keep the two black windows open.
echo  =============================================
echo.
start http://localhost:3000
pause
