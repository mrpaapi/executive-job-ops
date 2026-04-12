import json
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import settings
from app.core.ai_client import get_ai_provider_label
from app.core.watcher import ingest_resume, filename_to_profile_name, SUPPORTED_RESUME_SUFFIXES
from app.models.profile import Profile

router = APIRouter()

class ProfileOut(BaseModel):
    id: int
    name: str
    role_family: str
    titles: list
    skills: list
    years_experience: float
    summary: str
    resume_path: str

    class Config:
        from_attributes = True

def serialize_profile(p: Profile) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "role_family": p.role_family,
        "titles": json.loads(p.titles or "[]"),
        "skills": json.loads(p.skills or "[]"),
        "years_experience": p.years_experience or 0,
        "summary": p.summary or "",
        "resume_path": p.resume_path,
        "processing_status": p.processing_status or "done",
        "processing_error": p.processing_error or "",
        "processing_provider": p.processing_provider or "",
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }

@router.get("/")
async def list_profiles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).order_by(Profile.name))
    profiles = result.scalars().all()
    return [serialize_profile(p) for p in profiles]

@router.get("/{profile_id}")
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return serialize_profile(profile)

@router.post("/upload")
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    name_lower = (file.filename or "").lower()
    if not (name_lower.endswith(".pdf") or name_lower.endswith(".docx")):
        raise HTTPException(
            status_code=400,
            detail="Only PDF or Word (.docx) files are supported",
        )

    dest = settings.resume_path / file.filename
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    profile_name = filename_to_profile_name(file.filename)
    result = await db.execute(select(Profile).where(Profile.name == profile_name))
    profile = result.scalar_one_or_none()

    if profile:
        profile.resume_path = str(dest)
        profile.processing_status = "queued"
        profile.processing_error = ""
        profile.processing_provider = get_ai_provider_label()
    else:
        profile = Profile(
            name=profile_name,
            resume_path=str(dest),
            processing_status="queued",
            processing_error="",
            processing_provider=get_ai_provider_label(),
        )
        db.add(profile)

    await db.commit()
    await db.refresh(profile)

    # Trigger parsing directly — don't rely on the filesystem watcher, which is
    # unreliable on Windows for files written by Python itself.
    background_tasks.add_task(ingest_resume, dest)

    return {
        "message": f"Resume '{file.filename}' uploaded and queued for processing",
        "filename": file.filename,
        "profile": serialize_profile(profile),
    }

@router.post("/{profile_id}/retry")
async def retry_profile_processing(
    profile_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    resume_path = Path(profile.resume_path)
    if not resume_path.exists():
        raise HTTPException(status_code=400, detail="Resume file could not be found for this profile")

    profile.processing_status = "queued"
    profile.processing_error = ""
    profile.processing_provider = get_ai_provider_label()
    await db.commit()

    background_tasks.add_task(ingest_resume, resume_path, True)
    return {"message": "Profile requeued for processing", "profile": serialize_profile(profile)}

@router.delete("/{profile_id}")
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.delete(profile)
    await db.commit()
    return {"message": "Profile deleted"}
