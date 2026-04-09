#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}Starting executive-job-ops...${NC}"
echo ""

# Load .env
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs 2>/dev/null) || true
fi

# Make resumes folder
mkdir -p resumes

# Start backend
echo -e "${BLUE}► Starting backend (API)...${NC}"
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port "${BACKEND_PORT:-8000}" --reload &
BACKEND_PID=$!
cd ..

# Wait for backend
sleep 3

# Start frontend
echo -e "${BLUE}► Starting frontend (dashboard)...${NC}"
cd frontend
npm run dev -- --port "${FRONTEND_PORT:-3000}" &
FRONTEND_PID=$!
cd ..

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  executive-job-ops is running!       ║${NC}"
echo -e "${GREEN}║                                      ║${NC}"
echo -e "${GREEN}║  Open in browser:                    ║${NC}"
echo -e "${GREEN}║  http://localhost:3000               ║${NC}"
echo -e "${GREEN}║                                      ║${NC}"
echo -e "${GREEN}║  Press Ctrl+C to stop                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
