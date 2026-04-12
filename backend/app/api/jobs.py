import json
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from app.core.database import get_db
from app.models.job import Job
from app.models.profile import Profile
from app.models.resume import Resume
from app.services.job_matcher import (
    scrape_job_description, analyze_job, generate_cover_letter, generate_interview_questions,
    generate_negotiation_brief, generate_company_research, generate_outreach_messages,
)
from app.services.resume_parser import extract_text_from_pdf, extract_text_from_resume_file
from app.services.job_discovery import calculate_skill_gaps

router = APIRouter()

class AddJobRequest(BaseModel):
    profile_id: int
    url: Optional[str] = ""
    description: Optional[str] = ""


class BatchAddRequest(BaseModel):
    profile_id: int
    urls: list[str]

class UpdateStatusRequest(BaseModel):
    status: str
    notes: Optional[str] = None

class AnalyzeGapsRequest(BaseModel):
    resume_id: int

def _safe_loads(raw: Optional[str], fallback):
    try:
        return json.loads(raw) if raw else fallback
    except Exception:
        return fallback


def serialize_job(j: Job) -> dict:
    analysis = _safe_loads(j.analysis_json, {}) or {}
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
        "grade":      analysis.get("grade", ""),
        "dimensions": analysis.get("dimensions", {}),
        "archetype":  analysis.get("archetype", ""),
        "why":        analysis.get("why", ""),
        "applied_at": j.applied_at.isoformat() if j.applied_at else None,
        "created_at": j.created_at.isoformat() if j.created_at else None,
    }

@router.get("/")
async def list_jobs(
    profile_id: Optional[int] = None,
    profileId: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    selected_profile_id = profileId or profile_id
    q = select(Job).order_by(Job.created_at.desc())
    if selected_profile_id:
        q = q.where(Job.profile_id == selected_profile_id)
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

    analysis_meta = json.dumps({
        "grade":      analysis.get("grade", ""),
        "dimensions": analysis.get("dimensions", {}),
        "archetype":  analysis.get("archetype", ""),
        "why":        analysis.get("why", ""),
    })
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
        analysis_json=analysis_meta,
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
    # Eager-load the related Profile in a single round-trip (was N+1).
    result = await db.execute(
        select(Job).options(selectinload(Job.profile)).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Reuse the stored cover letter if one already exists — saves 60-120s
    # of CPU inference every time the user re-opens the job card.
    if job.cover_letter:
        return {"cover_letter": job.cover_letter, "cached": True}

    profile = job.profile
    letter = await generate_cover_letter(job.description, profile.raw_text or "", profile.name)
    job.cover_letter = letter
    await db.commit()
    return {"cover_letter": letter, "cached": False}

@router.get("/{job_id}/questions")
async def get_interview_questions(job_id: int, db: AsyncSession = Depends(get_db)):
    # Eager-load Profile in one query (was N+1).
    result = await db.execute(
        select(Job).options(selectinload(Job.profile)).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = job.profile
    questions = await generate_interview_questions(
        job.description, profile.name if profile else "Candidate"
    )
    return {"questions": questions}

@router.post("/{job_id}/analyze-skill-gaps")
async def analyze_job_skill_gaps(job_id: int, req: AnalyzeGapsRequest, db: AsyncSession = Depends(get_db)):
    """Analyze skill gaps for a job against a stored resume."""
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    resume_result = await db.execute(select(Resume).where(Resume.id == req.resume_id))
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # resume.skills is stored as a JSON string column
    try:
        resume_skills = json.loads(resume.skills or "[]")
    except Exception:
        resume_skills = []

    gaps = calculate_skill_gaps(job.title or "", job.description or "", resume_skills)
    return {
        "job_id": job_id,
        "resume_id": req.resume_id,
        "resume_title": resume.title,
        "job_title": job.title,
        "skill_gaps": gaps,
        "total_gaps": len(gaps),
    }


@router.post("/analyze-skill-gaps-upload")
async def analyze_skill_gaps_upload(
    job_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Run skill-gap analysis for a job against a resume PDF uploaded directly
    from the user's computer (no DB lookup, no archiving).
    """
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    original_name = file.filename or ""
    suffix = Path(original_name).suffix.lower()
    if suffix not in (".pdf", ".docx"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF or Word (.docx) resume",
        )

    try:
        content = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = Path(tmp.name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read upload: {e}")

    try:
        raw_text = await extract_text_from_resume_file(tmp_path, original_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse resume: {e}")
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass

    if not raw_text or len(raw_text.strip()) < 40:
        raise HTTPException(status_code=400, detail="Could not extract text from the uploaded resume")

    # Naive skill extraction: tokenise the resume text and reuse the existing
    # keyword-based gap calculator. Good enough for a deterministic local
    # comparison without round-tripping to the LLM.
    import re
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9+\#\.-]{1,}", raw_text)
    resume_skills = list({t for t in tokens if len(t) > 1})

    gaps = calculate_skill_gaps(job.title or "", job.description or "", resume_skills)
    return {
        "job_id": job_id,
        "resume_id": None,
        "resume_title": file.filename,
        "job_title": job.title,
        "skill_gaps": gaps,
        "total_gaps": len(gaps),
        "source": "upload",
    }

@router.post("/batch-add")
async def batch_add_jobs(req: BatchAddRequest, db: AsyncSession = Depends(get_db)):
    """
    Paste many job URLs at once and let the backend scrape + analyse + save
    each one in parallel. Returns a per-URL status payload so the UI can show
    "12 added, 2 duplicates, 1 failed" without partial successes vanishing.
    """
    profile_result = await db.execute(select(Profile).where(Profile.id == req.profile_id))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Normalise + dedupe URLs in the request itself
    seen: set[str] = set()
    urls: list[str] = []
    for u in req.urls or []:
        u = (u or "").strip()
        if u and u not in seen:
            seen.add(u)
            urls.append(u)
    if not urls:
        raise HTTPException(status_code=400, detail="Provide at least one URL")
    if len(urls) > 25:
        raise HTTPException(status_code=400, detail="Max 25 URLs per batch")

    # Pull existing URLs for this profile in one query so we can mark dupes
    existing_q = await db.execute(
        select(Job.url).where(Job.profile_id == req.profile_id, Job.url.in_(urls))
    )
    already: set[str] = {row[0] for row in existing_q.all()}

    import asyncio as _asyncio
    sem = _asyncio.Semaphore(4)  # bound LLM concurrency, local Ollama can be slow

    async def _process(url: str) -> dict:
        if url in already:
            return {"url": url, "status": "duplicate"}
        async with sem:
            try:
                scraped = await scrape_job_description(url)
                jd_text = scraped.get("raw_text", "")
                if not jd_text:
                    return {"url": url, "status": "failed", "error": "Could not scrape"}
                analysis = await analyze_job(jd_text, profile.raw_text or "", profile.name)
                analysis_meta = json.dumps({
                    "grade":      analysis.get("grade", ""),
                    "dimensions": analysis.get("dimensions", {}),
                    "archetype":  analysis.get("archetype", ""),
                    "why":        analysis.get("why", ""),
                })
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
                    analysis_json=analysis_meta,
                    status="saved",
                )
                db.add(job)
                await db.flush()
                return {
                    "url": url, "status": "added",
                    "job_id": job.id,
                    "title": job.title, "company": job.company,
                    "match_score": job.match_score,
                    "grade": analysis.get("grade", ""),
                }
            except Exception as e:
                return {"url": url, "status": "failed", "error": str(e)[:120]}

    results = await _asyncio.gather(*[_process(u) for u in urls])
    await db.commit()

    return {
        "total":     len(urls),
        "added":     sum(1 for r in results if r["status"] == "added"),
        "duplicate": sum(1 for r in results if r["status"] == "duplicate"),
        "failed":    sum(1 for r in results if r["status"] == "failed"),
        "results":   results,
    }


@router.post("/{job_id}/negotiate")
async def get_negotiation_brief(job_id: int, db: AsyncSession = Depends(get_db)):
    """Generate (or return cached) salary negotiation brief for a job."""
    result = await db.execute(
        select(Job).options(selectinload(Job.profile)).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    profile = job.profile
    brief = await generate_negotiation_brief(
        job.description or "",
        (profile.raw_text if profile else "") or "",
        profile.name if profile else "Candidate",
        job.company or "",
        job.title or "",
        job.salary_min or 0,
        job.salary_max or 0,
    )
    return brief


@router.post("/{job_id}/research")
async def get_company_research(job_id: int, db: AsyncSession = Depends(get_db)):
    """Deep-research brief on the target company for interview prep."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return await generate_company_research(
        job.description or "", job.company or "", job.title or ""
    )


@router.post("/{job_id}/outreach")
async def get_outreach_messages(job_id: int, db: AsyncSession = Depends(get_db)):
    """Three LinkedIn outreach drafts (recruiter / hiring manager / peer)."""
    result = await db.execute(
        select(Job).options(selectinload(Job.profile)).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    profile = job.profile
    return await generate_outreach_messages(
        job.description or "",
        (profile.raw_text if profile else "") or "",
        profile.name if profile else "Candidate",
        job.company or "",
        job.title or "",
    )


@router.delete("/{job_id}")
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.delete(job)
    await db.commit()
    return {"message": "Job deleted"}
