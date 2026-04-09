import json
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.core.database import get_db
from app.models.job import Job
from app.models.profile import Profile
from app.services.job_matcher import (
    scrape_job_description, analyze_job, generate_cover_letter, generate_interview_questions
)

router = APIRouter()

class AddJobRequest(BaseModel):
    profile_id: int
    url: Optional[str] = ""
    description: Optional[str] = ""

class UpdateStatusRequest(BaseModel):
    status: str
    notes: Optional[str] = None

def serialize_job(j: Job) -> dict:
    return {
        "id": j.id,
        "profile_id": j.profile_id,
        "title": j.title,
        "company": j.company,
        "location": j.location,
        "url": j.url,
        "status": j.status,
        "match_score": j.match_score,
        "skill_gaps": json.loads(j.skill_gaps or "[]"),
        "cover_letter": j.cover_letter,
        "salary_min": j.salary_min,
        "salary_max": j.salary_max,
        "salary_currency": j.salary_currency,
        "notes": j.notes,
        "applied_at": j.applied_at.isoformat() if j.applied_at else None,
        "created_at": j.created_at.isoformat() if j.created_at else None,
    }

@router.get("/")
async def list_jobs(profile_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    q = select(Job).order_by(Job.created_at.desc())
    if profile_id:
        q = q.where(Job.profile_id == profile_id)
    result = await db.execute(q)
    return [serialize_job(j) for j in result.scalars().all()]

@router.post("/analyze")
async def analyze_job_posting(req: AddJobRequest, db: AsyncSession = Depends(get_db)):
    """Scrape + analyze a job, return analysis without saving."""
    profile_result = await db.execute(select(Profile).where(Profile.id == req.profile_id))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    jd_text = req.description
    url = req.url or ""

    if url and not jd_text:
        scraped = await scrape_job_description(url)
        jd_text = scraped.get("raw_text", "")

    if not jd_text:
        raise HTTPException(status_code=400, detail="Provide a job URL or description text")

    analysis = await analyze_job(jd_text, profile.raw_text or "", profile.name)
    analysis["jd_text"] = jd_text
    analysis["url"] = url
    return analysis

@router.post("/")
async def add_job(req: AddJobRequest, db: AsyncSession = Depends(get_db)):
    """Analyze and save a job to the tracker."""
    profile_result = await db.execute(select(Profile).where(Profile.id == req.profile_id))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    jd_text = req.description
    url = req.url or ""

    if url and not jd_text:
        scraped = await scrape_job_description(url)
        jd_text = scraped.get("raw_text", "")

    if not jd_text:
        raise HTTPException(status_code=400, detail="Provide a job URL or description text")

    analysis = await analyze_job(jd_text, profile.raw_text or "", profile.name)

    job = Job(
        profile_id=req.profile_id,
        title=analysis.get("title", "Unknown"),
        company=analysis.get("company", ""),
        location=analysis.get("location", ""),
        url=url,
        description=jd_text,
        match_score=analysis.get("match_score", 0),
        skill_gaps=analysis.get("skill_gaps", "[]"),
        salary_min=analysis.get("salary_min", 0),
        salary_max=analysis.get("salary_max", 0),
        salary_currency=analysis.get("salary_currency", "USD"),
        status="saved",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return serialize_job(job)

@router.patch("/{job_id}/status")
async def update_status(job_id: int, req: UpdateStatusRequest, db: AsyncSession = Depends(get_db)):
    valid = {"saved", "applied", "interview", "offer", "rejected"}
    if req.status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")

    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = req.status
    if req.status == "applied" and not job.applied_at:
        job.applied_at = datetime.utcnow()
    if req.notes is not None:
        job.notes = req.notes
    await db.commit()
    return serialize_job(job)

@router.post("/{job_id}/cover-letter")
async def get_cover_letter(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    profile_result = await db.execute(select(Profile).where(Profile.id == job.profile_id))
    profile = profile_result.scalar_one_or_none()

    letter = await generate_cover_letter(job.description, profile.raw_text or "", profile.name)
    job.cover_letter = letter
    await db.commit()
    return {"cover_letter": letter}

@router.get("/{job_id}/questions")
async def get_interview_questions(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    profile_result = await db.execute(select(Profile).where(Profile.id == job.profile_id))
    profile = profile_result.scalar_one_or_none()

    questions = await generate_interview_questions(job.description, profile.name if profile else "Candidate")
    return {"questions": questions}

@router.delete("/{job_id}")
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.delete(job)
    await db.commit()
    return {"message": "Job deleted"}
