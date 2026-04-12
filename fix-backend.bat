@echo off
title Fix Backend - executive-job-ops
cd /d "%~dp0\backend"

echo.
echo  Installing all backend dependencies...
echo  This takes 2-3 minutes, please wait.
echo.

REM Use pip directly (works with Microsoft Store Python 3.13)
python -m pip install --upgrade pip
python -m pip install fastapi==0.111.0
python -m pip install "uvicorn[standard]==0.29.0"
python -m pip install sqlalchemy==2.0.30
python -m pip install aiosqlite==0.20.0
python -m pip install pydantic==2.7.1
python -m pip install pydantic-settings==2.2.1
python -m pip install python-multipart==0.0.9
python -m pip install httpx==0.27.0
python -m pip install openai==1.30.1
python -m pip install PyPDF2==3.0.1
python -m pip install python-dotenv==1.0.1
python -m pip install watchdog==4.0.0
python -m pip install aiofiles==23.2.1
python -m pip install beautifulsoup4==4.12.3
python -m pip install requests==2.31.0
python -m pip install apscheduler==3.10.4
python -m pip install passlib==1.7.4
python -m pip install bcrypt==4.1.3

echo.
echo  All packages installed. Starting backend...
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

pause