import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pathlib import Path
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import settings
from app.core.watcher import ingest_resume
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
async def upload_resume(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    dest = settings.resume_path / file.filename
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)

    await ingest_resume(dest)
    return {"message": f"Resume '{file.filename}' uploaded and profile created", "filename": file.filename}

@router.delete("/{profile_id}")
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.delete(profile)
    await db.commit()
    return {"message": "Profile deleted"}
