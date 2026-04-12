"""Internal Resume Builder API - replaces RxResume integration."""
import json
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.resume import Resume
from app.models.profile import Profile
from app.models.job import Job
from app.services.resume_pdf import generate_resume_pdf, tailor_resume_summary
from app.core.ai_client import get_ai_client

router = APIRouter()


# ── Pydantic models ────────────────────────────────────────────────────────

class ExperienceItem(BaseModel):
    title: str
    company: str
    dates: str
    description: str


class EducationItem(BaseModel):
    school: str
    degree: str
    field: str
    dates: str


class CertificationItem(BaseModel):
    name: str
    issuer: str
    date: str


class ResumeCreate(BaseModel):
    title: str
    summary: str
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    skills: list[str] = []
    certifications: list[CertificationItem] = []
    email: str = ""
    phone: str = ""
    location: str = ""
    website: str = ""


class ResumeUpdate(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    experience: Optional[list[ExperienceItem]] = None
    education: Optional[list[EducationItem]] = None
    skills: Optional[list[str]] = None
    certifications: Optional[list[CertificationItem]] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    website: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/")
async def list_resumes(profile_id: int, db: AsyncSession = Depends(get_db)):
    """List all resumes for a profile."""
    result = await db.execute(
        select(Resume).where(Resume.profile_id == profile_id).order_by(Resume.created_at.desc())
    )
    resumes = result.scalars().all()
    return {"resumes": [r.to_dict() for r in resumes]}


@router.get("/{resume_id}")
async def get_resume(resume_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific resume."""
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return resume.to_dict()


@router.post("/")
async def create_resume(profile_id: int, req: ResumeCreate, db: AsyncSession = Depends(get_db)):
    """Create a new resume for a profile."""
    # Verify profile exists
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Profile not found")

    resume = Resume(
        profile_id=profile_id,
        title=req.title,
        summary=req.summary,
        experience=json.dumps([e.dict() for e in req.experience]),
        education=json.dumps([e.dict() for e in req.education]),
        skills=json.dumps(req.skills),
        certifications=json.dumps([c.dict() for c in req.certifications]),
        email=req.email,
        phone=req.phone,
        location=req.location,
        website=req.website,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return resume.to_dict()


@router.patch("/{resume_id}")
async def update_resume(resume_id: int, req: ResumeUpdate, db: AsyncSession = Depends(get_db)):
    """Update a resume."""
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Update only provided fields
    if req.title is not None:
        resume.title = req.title
    if req.summary is not None:
        resume.summary = req.summary
    if req.experience is not None:
        resume.experience = json.dumps([e.dict() for e in req.experience])
    if req.education is not None:
        resume.education = json.dumps([e.dict() for e in req.education])
    if req.skills is not None:
        resume.skills = json.dumps(req.skills)
    if req.certifications is not None:
        resume.certifications = json.dumps([c.dict() for c in req.certifications])
    if req.email is not None:
        resume.email = req.email
    if req.phone is not None:
        resume.phone = req.phone
    if req.location is not None:
        resume.location = req.location
    if req.website is not None:
        resume.website = req.website

    await db.commit()
    await db.refresh(resume)
    return resume.to_dict()


@router.delete("/{resume_id}")
async def delete_resume(resume_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a resume."""
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    await db.delete(resume)
    await db.commit()
    return {"message": "Resume deleted"}


@router.get("/{resume_id}/pdf")
async def export_resume_pdf(resume_id: int, db: AsyncSession = Depends(get_db)):
    """Export resume as PDF."""
    result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Generate PDF
    pdf_bytes = generate_resume_pdf(resume.to_dict())

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{resume.title}.pdf"'},
    )


@router.post("/{resume_id}/tailor")
async def tailor_resume_for_job(
    resume_id: int, job_id: int, db: AsyncSession = Depends(get_db)
):
    """
    Tailor resume summary for a specific job and return PDF.
    Uses LLM to customize the summary based on job description.
    """
    # Get resume and job
    resume_result = await db.execute(select(Resume).where(Resume.id == resume_id))
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Get LLM client
    try:
        llm_client, llm_model = get_ai_client()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LLM not configured: {str(e)}")

    # Tailor the summary
    resume_dict = resume.to_dict()
    original_summary = resume_dict.get("summary", "")
    if not original_summary:
        raise HTTPException(status_code=400, detail="Resume has no summary to tailor")

    tailored_summary = await tailor_resume_summary(
        original_summary, job.title, job.description, llm_client, llm_model
    )

    # Update resume with tailored summary
    resume_dict["summary"] = tailored_summary

    # Generate PDF with tailored content
    pdf_bytes = generate_resume_pdf(resume_dict)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{resume.title}_tailored.pdf"'},
    )
