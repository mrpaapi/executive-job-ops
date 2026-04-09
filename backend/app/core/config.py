from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    local_llm_url: str = ""
    local_llm_model: str = "llama3"

    resume_folder: str = "./resumes"
    database_url: str = "sqlite+aiosqlite:///./executive_job_ops.db"
    backend_port: int = 8000
    frontend_port: int = 3000
    secret_key: str = "change-me"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def resume_path(self) -> Path:
        p = Path(self.resume_folder)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def use_local_llm(self) -> bool:
        return bool(self.local_llm_url)

settings = Settings()
