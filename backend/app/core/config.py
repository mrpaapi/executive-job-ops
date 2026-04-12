from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # ── OpenAI ────────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_model:   str = "gpt-4o-mini"

    # ── OpenRouter ────────────────────────────────────────────────
    openrouter_api_key: str = ""
    openrouter_model:   str = "openai/gpt-4o-mini"

    # ── Gemini ────────────────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model:   str = "gemini-1.5-flash"

    # ── Local LLM (Ollama / LM Studio) ───────────────────────────
    local_llm_url:   str = "http://localhost:11434/v1"  # Default to local Ollama
    local_llm_model: str = "llama3"

    # ── Job discovery ─────────────────────────────────────────────
    adzuna_app_id:  str = ""
    adzuna_api_key: str = ""

    # ── RxResume ──────────────────────────────────────────────────
    rxresume_url:   str = ""   # e.g. http://localhost:3050
    rxresume_token: str = ""   # JWT from RxResume → Settings → API Tokens

    # ── Gmail ─────────────────────────────────────────────────────
    gmail_credentials_path: str = "./gmail_credentials.json"
    gmail_token_path:       str = "./gmail_token.json"
    gmail_enabled:          bool = False

    # ── App ───────────────────────────────────────────────────────
    resume_folder: str = "./resumes"
    database_url:  str = "sqlite+aiosqlite:///./executive_job_ops.db"
    backend_port:  int = 8000
    frontend_port: int = 3000
    secret_key:    str = "change-me"

    class Config:
        env_file = ".env"
        extra    = "ignore"

    @property
    def resume_path(self) -> Path:
        p = Path(self.resume_folder)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def use_local_llm(self) -> bool:
        return bool(self.local_llm_url)

    @property
    def active_provider(self) -> str:
        if self.openrouter_api_key: return "openrouter"
        if self.gemini_api_key:     return "gemini"
        if self.use_local_llm:      return "local"
        return "openai"


settings = Settings()
