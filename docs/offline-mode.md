# Running executive-job-ops offline (no OpenAI account needed)

You can run the full app without sending any data to OpenAI by using a local LLM with [Ollama](https://ollama.com).

## Step 1 — Install Ollama

- **Mac**: `brew install ollama` or download from https://ollama.com
- **Windows**: Download the installer from https://ollama.com
- **Linux**: `curl -fsSL https://ollama.com/install.sh | sh`

## Step 2 — Pull a model

```bash
# Good balance of speed and quality (recommended)
ollama pull llama3

# Faster, lighter (weaker analysis)
ollama pull phi3

# Best quality (needs 16GB+ RAM)
ollama pull llama3:70b
```

## Step 3 — Configure executive-job-ops

Open your `.env` file and add:

```env
LOCAL_LLM_URL=http://localhost:11434/v1
LOCAL_LLM_MODEL=llama3
```

Leave `OPENAI_API_KEY` blank or remove it.

## Step 4 — Start as normal

```bash
./start.sh     # Mac/Linux
start.bat      # Windows
```

The Settings page will confirm "Running with local LLM".

---

## Quality notes

Local models are less accurate than GPT-4o for resume analysis and cover letter generation, but work well for:
- Basic job matching and scoring
- STAR story generation
- Interview question generation

For leadership-level roles where cover letter quality matters, GPT-4o-mini ($0.15/1M tokens) costs less than $0.01 per job analysis.
