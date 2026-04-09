from fastapi import APIRouter
from pydantic import BaseModel
from app.core.config import settings

router = APIRouter()

class SettingsOut(BaseModel):
    has_api_key: bool
    openai_model: str
    resume_folder: str
    use_local_llm: bool
    local_llm_url: str

@router.get("/")
async def get_settings():
    return SettingsOut(
        has_api_key=bool(settings.openai_api_key and settings.openai_api_key != "sk-your-key-here"),
        openai_model=settings.openai_model,
        resume_folder=settings.resume_folder,
        use_local_llm=settings.use_local_llm,
        local_llm_url=settings.local_llm_url,
    )
