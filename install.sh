#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    executive-job-ops installer     ║${NC}"
echo -e "${BLUE}║         by mrpaapi                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════╝${NC}"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
  echo -e "${YELLOW}Python 3 not found. Installing via Homebrew (Mac) or apt (Linux)...${NC}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v brew &>/dev/null; then
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install python@3.11
  else
    sudo apt-get update && sudo apt-get install -y python3.11 python3-pip python3-venv
  fi
fi

# Check Node
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}Node.js not found. Installing via nvm...${NC}"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
fi

echo -e "${GREEN}✓ Python $(python3 --version)${NC}"
echo -e "${GREEN}✓ Node $(node --version)${NC}"

# Setup .env
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}  ACTION NEEDED: Add your OpenAI key  ${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "  1. Get a free key at: https://platform.openai.com/api-keys"
  echo "  2. Open the file '.env' in this folder"
  echo "  3. Replace 'sk-your-key-here' with your actual key"
  echo ""
  read -p "Press Enter once you've added your key, or Enter to skip for now... "
fi

# Backend venv
echo -e "\n${BLUE}Setting up Python backend...${NC}"
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --quiet -r requirements.txt
cd ..
echo -e "${GREEN}✓ Backend ready${NC}"

# Frontend
echo -e "\n${BLUE}Setting up frontend...${NC}"
cd frontend
npm install --silent
cd ..
echo -e "${GREEN}✓ Frontend ready${NC}"

# Make start script executable
chmod +x start.sh

echo ""
echo -e "${GREEN}╔════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Installation complete!        ║${NC}"
echo -e "${GREEN}║                                ║${NC}"
echo -e "${GREEN}║  Run: ./start.sh               ║${NC}"
echo -e "${GREEN}║  Then open: http://localhost:3000 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════╝${NC}"
echo ""
