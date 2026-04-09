# executive-job-ops

**Your personal AI-powered job hunt command centre — built for everyone, not just engineers.**

Drop your resume in a folder. Paste a job link. Get matched, tracked, and interview-prepped automatically.

Created by [@mrpaapi](https://github.com/mrpaapi) - Srinath Sankara· Built to help people land jobs, not wrestle with tools.

---

## What it does

| Feature | How it works |
|---|---|
| **Multi-profile support** | Drop `sre-leadership.pdf` and `devops-leadership.pdf` in `/resumes/` — the system creates two separate profiles automatically |
| **Resume ↔ Job matching** | Paste any job URL or description — AI picks the best resume, scores the fit, flags skill gaps |
| **Application tracker** | Kanban board per profile — Applied → Interview → Offer → Rejected |
| **Interview prep** | STAR story bank + role-specific questions auto-generated from the job description |
| **Cover letter generator** | One click, tailored to the job and your profile |
| **Salary intelligence** | Market range shown for every role you track |
| **Works for everyone** | One-click installer for Windows, Mac, and Linux. No coding needed. |

---

## Quickstart (zero tech knowledge required)

### Step 1 — Download & install

```bash
# Mac / Linux
curl -sSL https://raw.githubusercontent.com/mrpaapi/executive-job-ops/main/install.sh | bash

# Windows — open PowerShell and run:
iwr https://raw.githubusercontent.com/mrpaapi/executive-job-ops/main/install.ps1 | iex
```

> **What gets installed:** Python 3.11, Node.js 20, and the app itself. Docker is optional — the app runs without it.

### Step 2 — Add your resumes

```
executive-job-ops/
└── resumes/
    ├── sre-leadership.pdf        ← becomes "SRE Leadership" profile
    ├── devops-leadership.pdf     ← becomes "DevOps Leadership" profile
    └── your-name-general.pdf    ← becomes "General" profile
```

**Naming rules (simple):**
- Use hyphens between words
- The filename becomes your profile name (spaces added automatically)
- Any PDF works — the AI reads it

### Step 3 — Start the app

```bash
cd executive-job-ops
./start.sh        # Mac/Linux
start.bat         # Windows
```

Open your browser at **http://localhost:3000** — that's it.

---

## For people who want to self-host / contribute

### Prerequisites

- Python 3.11+
- Node.js 20+
- An [OpenAI API key](https://platform.openai.com/api-keys) (free tier works for light use)

### Full setup

```bash
git clone https://github.com/mrpaapi/executive-job-ops.git
cd executive-job-ops
cp .env.example .env          # Add your OpenAI key here
./install.sh                  # Installs everything
./start.sh                    # Starts backend + frontend
```

### Docker (one command)

```bash
docker-compose up --build
```

---

## Project structure

```
executive-job-ops/
├── resumes/              ← Drop your PDFs here
├── backend/              ← FastAPI (Python)
│   └── app/
│       ├── api/          ← REST endpoints
│       ├── core/         ← Config, AI client, file watcher
│       ├── models/       ← SQLite database models
│       └── services/     ← Resume parsing, matching, prep
├── frontend/             ← React dashboard
│   └── src/
│       ├── pages/        ← Dashboard, Jobs, Prep, Settings
│       └── components/   ← Shared UI components
├── install.sh            ← One-click installer (Mac/Linux)
├── install.ps1           ← One-click installer (Windows)
├── start.sh              ← Start everything (Mac/Linux)
└── start.bat             ← Start everything (Windows)
```

---

## How the resume auto-detection works

```
resumes/sre-leadership-v2.pdf
         ↓
   Filename parsed → "SRE Leadership" (v2 stripped)
         ↓
   PDF text extracted → skills, titles, years of experience
         ↓
   Profile created/updated in database
         ↓
   Available in dashboard immediately
```

No YAML editing. No config files. No commands to run.

---

## Privacy

- All data stays on your machine (SQLite local database)
- Resumes are never uploaded anywhere
- Job descriptions are sent to OpenAI only for matching/analysis (same as using ChatGPT)
- You can run fully offline with a local LLM — see `docs/offline-mode.md`

---

## Contributing

PRs welcome. This project exists to help people find jobs — if you have ideas, open an issue.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT © 2024 [mrpaapi](https://github.com/mrpaapi)
