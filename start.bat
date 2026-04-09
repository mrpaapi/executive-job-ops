@echo off
title executive-job-ops

echo.
echo  Starting executive-job-ops...
echo.

if not exist "resumes" mkdir resumes

REM Load .env variables
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
)

REM Start backend
echo  Starting backend...
cd backend
start "Backend" cmd /c ".venv\Scripts\activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
cd ..

REM Wait a moment for backend
timeout /t 4 /nobreak >nul

REM Start frontend
echo  Starting frontend...
cd frontend
start "Frontend" cmd /c "npm run dev -- --port 3000"
cd ..

timeout /t 3 /nobreak >nul

echo.
echo  ╔══════════════════════════════════════╗
echo  ║  executive-job-ops is running!       ║
echo  ║                                      ║
echo  ║  Opening http://localhost:3000 ...   ║
echo  ╚══════════════════════════════════════╝
echo.

start http://localhost:3000
pause
