import os
import time
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.config import settings

router = APIRouter()


class SettingsOut(BaseModel):
    # Active provider info
    active_provider:  str
    has_api_key:      bool
    # OpenAI
    openai_model:     str
    # OpenRouter
    openrouter_model: str
    has_openrouter:   bool
    # Gemini
    gemini_model:     str
    has_gemini:       bool
    # Local LLM
    use_local_llm:    bool
    local_llm_url:    str
    local_llm_model:  str
    # RxResume
    rxresume_configured: bool
    rxresume_url:     str
    # Gmail
    gmail_configured: bool
    # Misc
    resume_folder:    str


class SaveSettingsRequest(BaseModel):
    provider:       str = "local"    # openai | openrouter | gemini | local (default: local Ollama)
    # OpenAI
    openai_api_key: Optional[str] = ""
    openai_model:   Optional[str] = "gpt-4o-mini"
    # OpenRouter
    openrouter_api_key: Optional[str] = ""
    openrouter_model:   Optional[str] = "openai/gpt-4o-mini"
    # Gemini
    gemini_api_key:   Optional[str] = ""
    gemini_model:     Optional[str] = "gemini-1.5-flash"
    # Local LLM
    local_llm_url:    Optional[str] = "http://localhost:11434/v1"
    local_llm_model:  Optional[str] = "llama3"
    # RxResume
    rxresume_url:     Optional[str] = ""
    rxresume_token:   Optional[str] = ""
    # Gmail
    gmail_enabled:    Optional[bool] = False


def find_env_file() -> Path:
    candidates = [
        Path(".env"),
        Path("../.env"),
        Path(__file__).parent.parent.parent.parent / ".env",
    ]
    for p in candidates:
        if p.exists():
            return p.resolve()
    root = Path(__file__).parent.parent.parent.parent / ".env"
    root.touch()
    return root


def update_env_value(key: str, value: str):
    env_path = find_env_file()
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
    updated, new_lines = False, []
    for line in lines:
        if line.startswith(f"{key}=") or line.startswith(f"{key} ="):
            new_lines.append(f"{key}={value}")
            updated = True
        else:
            new_lines.append(line)
    if not updated:
        new_lines.append(f"{key}={value}")
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    os.environ[key] = value


@router.get("/")
async def get_settings():
    from pathlib import Path as P
    return SettingsOut(
        active_provider  = settings.active_provider,
        has_api_key      = bool((settings.openai_api_key or "").strip().replace("sk-your-key-here", "")),
        openai_model     = settings.openai_model,
        openrouter_model = settings.openrouter_model,
        has_openrouter   = bool(settings.openrouter_api_key),
        gemini_model     = settings.gemini_model,
        has_gemini       = bool(settings.gemini_api_key),
        use_local_llm    = settings.use_local_llm,
        local_llm_url    = settings.local_llm_url,
        local_llm_model  = settings.local_llm_model,
        rxresume_configured = bool(settings.rxresume_url and settings.rxresume_token),
        rxresume_url     = settings.rxresume_url,
        gmail_configured = P(settings.gmail_credentials_path).exists(),
        resume_folder    = settings.resume_folder,
    )


@router.post("/test")
async def test_llm_connection():
    from app.core.ai_client import chat, get_ai_provider_label
    provider = get_ai_provider_label()
    start = time.time()
    try:
        response = await chat([{"role": "user", "content": "Reply with exactly the word: OK"}])
        return {
            "ok":          True,
            "provider":    provider,
            "latency_ms":  round((time.time() - start) * 1000),
            "response":    (response or "").strip()[:80],
        }
    except Exception as exc:
        return {"ok": False, "provider": provider, "error": str(exc)}


@router.post("/api-key")
async def save_settings(req: SaveSettingsRequest):
    p = req.provider

    # Clear all provider keys first, then set the active one
    for key in ("OPENAI_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "LOCAL_LLM_URL"):
        update_env_value(key, "")
        setattr(settings, key.lower(), "")

    if p == "openai":
        if req.openai_api_key and not req.openai_api_key.startswith("sk-"):
            raise HTTPException(status_code=400, detail="OpenAI key should start with sk-")
        if req.openai_api_key:
            update_env_value("OPENAI_API_KEY", req.openai_api_key)
            settings.openai_api_key = req.openai_api_key
        update_env_value("OPENAI_MODEL", req.openai_model or "gpt-4o-mini")
        settings.openai_model = req.openai_model or "gpt-4o-mini"
        msg = f"OpenAI ({req.openai_model}) saved."

    elif p == "openrouter":
        if not req.openrouter_api_key:
            raise HTTPException(status_code=400, detail="OpenRouter API key is required")
        update_env_value("OPENROUTER_API_KEY", req.openrouter_api_key)
        update_env_value("OPENROUTER_MODEL",   req.openrouter_model or "openai/gpt-4o-mini")
        settings.openrouter_api_key = req.openrouter_api_key
        settings.openrouter_model   = req.openrouter_model or "openai/gpt-4o-mini"
        msg = f"OpenRouter ({req.openrouter_model}) saved."

    elif p == "gemini":
        if not req.gemini_api_key:
            raise HTTPException(status_code=400, detail="Gemini API key is required")
        update_env_value("GEMINI_API_KEY", req.gemini_api_key)
        update_env_value("GEMINI_MODEL",   req.gemini_model or "gemini-1.5-flash")
        settings.gemini_api_key = req.gemini_api_key
        settings.gemini_model   = req.gemini_model or "gemini-1.5-flash"
        msg = f"Gemini ({req.gemini_model}) saved."

    elif p == "local":
        if not req.local_llm_url or not req.local_llm_url.startswith("http"):
            raise HTTPException(status_code=400, detail="Local LLM URL must start with http://")
        update_env_value("LOCAL_LLM_URL",   req.local_llm_url)
        update_env_value("LOCAL_LLM_MODEL", req.local_llm_model or "llama3")
        settings.local_llm_url   = req.local_llm_url
        settings.local_llm_model = req.local_llm_model or "llama3"
        msg = f"Local LLM ({req.local_llm_model} at {req.local_llm_url}) saved."

    else:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {p}")

    # RxResume (optional, saved regardless of AI provider)
    if req.rxresume_url is not None:
        update_env_value("RXRESUME_URL",   req.rxresume_url)
        update_env_value("RXRESUME_TOKEN", req.rxresume_token or "")
        settings.rxresume_url   = req.rxresume_url
        settings.rxresume_token = req.rxresume_token or ""

    # Provider/model just changed — discard cached clients and any memoised
    # LLM responses so the next call hits the new config.
    from app.core.ai_client import clear_llm_cache
    clear_llm_cache()

    return {"message": f"{msg} No restart needed."}
