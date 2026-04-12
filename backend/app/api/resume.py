"""
Internal Resume Builder API - replaces RxResume integration.
Stores resumes in database and generates PDFs using reportlab.
"""
import json
import tempfile
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.resume import Resume
from app.models.profile import Profile
from app.models.job import Job
from app.services.resume_pdf import generate_resume_pdf, tailor_resume_summary_sync
from app.services.resume_parser import extract_text_from_pdf, extract_text_from_resume_file
from app.core.ai_client import get_ai_client, chat

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
    profile_id: int
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

@router.get("/status")
async def resume_status():
    """Resume system status (internal builder always available)."""
    return {"configured": True, "builder": "internal", "message": "Resume builder available"}


@router.get("/resumes")
async def list_resumes(profile_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    """List all resumes. If profile_id provided, list only for that profile."""
    if profile_id:
        result = await db.execute(
            select(Resume).where(Resume.profile_id == profile_id).order_by(Resume.created_at.desc())
        )
    else:
        result = await db.execute(select(Resume).order_by(Resume.created_at.desc()))

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


@router.post("")
async def create_resume(req: ResumeCreate, db: AsyncSession = Depends(get_db)):
    """Create a new resume."""
    # Verify profile exists
    result = await db.execute(select(Profile).where(Profile.id == req.profile_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Profile not found")

    resume = Resume(
        profile_id=req.profile_id,
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

    pdf_bytes = generate_resume_pdf(resume.to_dict())
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{resume.title}.pdf"'},
    )


class TailorRequest(BaseModel):
    job_id: int
    resume_id: int


async def _tailor_summary_async(original_summary: str, job_title: str, job_description: str) -> str:
    """Tailor the resume summary for a job using the configured async LLM."""
    prompt = (
        "You are an expert resume writer. Tailor this professional summary "
        "to match the job requirements.\n\n"
        f"Original Summary:\n{original_summary}\n\n"
        f"Job Title: {job_title}\n"
        f"Job Description: {job_description[:3000]}\n\n"
        "Return ONLY a revised 2-3 sentence professional summary that "
        "emphasizes fit for THIS role. Keep it authentic — no false claims. "
        "No commentary, no prefix, just the summary text."
    )
    try:
        result = await chat([{"role": "user", "content": prompt}])
        return (result or "").strip() or original_summary
    except Exception:
        return original_summary


@router.post("/tailor")
async def tailor_resume(req: TailorRequest, db: AsyncSession = Depends(get_db)):
    """
    Tailor a stored resume for a job and return tailored PDF.
    Uses LLM to customize the summary based on job description.
    """
    # Get resume and job
    resume_result = await db.execute(select(Resume).where(Resume.id == req.resume_id))
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job_result = await db.execute(select(Job).where(Job.id == req.job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Tailor the summary
    resume_dict = resume.to_dict()
    original_summary = resume_dict.get("summary", "") or ""
    if not original_summary:
        raise HTTPException(status_code=400, detail="Resume has no summary to tailor")

    tailored_summary = await _tailor_summary_async(
        original_summary, job.title or "", job.description or ""
    )
    resume_dict["summary"] = tailored_summary

    # Generate PDF with tailored content
    pdf_bytes = generate_resume_pdf(resume_dict)

    # Filename: <resume title>_<YYYYMMDD_HHMMSS>.pdf
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_title = "".join(c for c in (resume.title or "resume") if c.isalnum() or c in "._- ").strip() or "resume"
    filename = f"{safe_title}_{stamp}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/tailor-upload")
async def tailor_resume_upload(
    job_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Tailor a resume uploaded from the user's local machine for a specific job.
    Extracts text from the uploaded PDF, asks the LLM to produce a tailored
    version, and returns a regenerated PDF named after the original file
    plus a datetime suffix.
    """
    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    original_name = file.filename or "resume.pdf"
    suffix = Path(original_name).suffix.lower() or ".pdf"
    if suffix not in (".pdf", ".docx"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF or Word (.docx) uploads are supported for tailoring",
        )

    # Write upload to a temp file so the parser can read it from disk
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

    # Ask the LLM to tailor the full resume body, preserving structure
    prompt = (
        "You are an expert resume writer. Rewrite the following resume so it is "
        "tightly tailored to the target job. Keep all factual content truthful — "
        "never invent experience, employers, or credentials. You may reorder, "
        "re-emphasize, and reword bullets to highlight relevant skills, and "
        "rewrite the professional summary to target this role.\n\n"
        f"TARGET JOB TITLE: {job.title or ''}\n"
        f"TARGET JOB DESCRIPTION:\n{(job.description or '')[:3500]}\n\n"
        "ORIGINAL RESUME TEXT:\n"
        f"{raw_text[:7000]}\n\n"
        "Return the tailored resume as plain text with these sections clearly "
        "labeled in ALL CAPS on their own line: NAME, CONTACT, SUMMARY, SKILLS, "
        "EXPERIENCE, EDUCATION. Under EXPERIENCE list each role as "
        "'Title — Company (dates)' followed by 3-5 bullet lines beginning with '- '. "
        "No markdown, no commentary, no code fences."
    )

    try:
        tailored_text = await chat([{"role": "user", "content": prompt}])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM tailoring failed: {e}")

    tailored_text = (tailored_text or "").strip()
    if not tailored_text:
        raise HTTPException(status_code=500, detail="LLM returned an empty response")

    # Parse the labeled sections into the resume dict shape used by generate_resume_pdf
    resume_dict = _parse_tailored_text(tailored_text)
    # Fall back title to the uploaded filename stem
    if not resume_dict.get("title"):
        resume_dict["title"] = Path(original_name).stem

    try:
        pdf_bytes = generate_resume_pdf(resume_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = Path(original_name).stem or "resume"
    out_name = f"{stem}_{stamp}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{out_name}"'},
    )


def _xml_safe(s: str) -> str:
    """Escape characters that would break reportlab's Paragraph XML parser."""
    if not s:
        return ""
    return (
        str(s)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _parse_tailored_text(text: str) -> dict:
    """Parse the LLM's labeled-section output into a resume dict.

    Resilient to LLMs that ignore the formatting instructions: if no labelled
    sections are detected, the entire response is used as the SUMMARY so the
    PDF generator never receives an empty resume.
    """
    sections: dict[str, list[str]] = {}
    current = None
    labels = {"NAME", "CONTACT", "SUMMARY", "SKILLS", "EXPERIENCE", "EDUCATION"}
    # Strip common markdown markers (## SUMMARY, **SUMMARY**, etc.)
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip().lstrip("#").strip().strip("*").rstrip(":").strip()
        if stripped.upper() in labels and len(stripped) <= 20:
            current = stripped.upper()
            sections[current] = []
            continue
        if current is None:
            continue
        sections[current].append(line)

    if not sections:
        # LLM ignored the format — use the whole response as the summary so we
        # still produce a usable PDF instead of failing.
        return {
            "title": "Tailored Resume",
            "summary": _xml_safe(text.strip()[:4000]),
            "email": "", "phone": "", "location": "", "website": "",
            "skills": [], "experience": [], "education": [], "certifications": [],
        }

    def joined(key: str) -> str:
        return "\n".join(sections.get(key, [])).strip()

    # SKILLS: accept either comma or newline separated
    skills_raw = joined("SKILLS")
    if "," in skills_raw:
        skills = [s.strip(" -•").strip() for s in skills_raw.split(",") if s.strip()]
    else:
        skills = [s.strip(" -•").strip() for s in skills_raw.splitlines() if s.strip()]

    # EXPERIENCE: each role header line followed by bullet lines starting with -
    experience: list[dict] = []
    current_exp: Optional[dict] = None
    for line in sections.get("EXPERIENCE", []):
        s = line.strip()
        if not s:
            continue
        if s.startswith("-") or s.startswith("•"):
            if current_exp is None:
                current_exp = {"title": "", "company": "", "dates": "", "description": ""}
                experience.append(current_exp)
            bullet = s.lstrip("-• ").strip()
            current_exp["description"] = (
                (current_exp["description"] + "\n• " + bullet).strip()
                if current_exp["description"] else f"• {bullet}"
            )
        else:
            # New role header: "Title — Company (dates)" or "Title - Company (dates)"
            title_part, company_part, dates_part = s, "", ""
            if "(" in s and s.endswith(")"):
                dates_part = s[s.rfind("(") + 1 : -1].strip()
                s_nodate = s[: s.rfind("(")].strip()
            else:
                s_nodate = s
            for sep in [" — ", " – ", " - ", "—", "–"]:
                if sep in s_nodate:
                    title_part, company_part = [p.strip() for p in s_nodate.split(sep, 1)]
                    break
            else:
                title_part = s_nodate
            current_exp = {
                "title": title_part,
                "company": company_part,
                "dates": dates_part,
                "description": "",
            }
            experience.append(current_exp)

    # EDUCATION: keep each non-empty line as a school entry
    education: list[dict] = []
    for line in sections.get("EDUCATION", []):
        s = line.strip().lstrip("-• ").strip()
        if not s:
            continue
        dates = ""
        if "(" in s and s.endswith(")"):
            dates = s[s.rfind("(") + 1 : -1].strip()
            s = s[: s.rfind("(")].strip()
        education.append({"school": s, "degree": "", "field": "", "dates": dates})

    contact_raw = joined("CONTACT")
    email, phone, location, website = "", "", "", ""
    for token in [t.strip() for t in contact_raw.replace("\n", "|").split("|") if t.strip()]:
        low = token.lower()
        if "@" in token and not email:
            email = token
        elif any(ch.isdigit() for ch in token) and not phone and "http" not in low:
            phone = token
        elif "http" in low and not website:
            website = token
        elif not location:
            location = token

    return {
        "title": _xml_safe(joined("NAME") or "Tailored Resume"),
        "summary": _xml_safe(joined("SUMMARY")),
        "email":   _xml_safe(email),
        "phone":   _xml_safe(phone),
        "location":_xml_safe(location),
        "website": _xml_safe(website),
        "skills":  [_xml_safe(s) for s in skills],
        "experience": [
            {
                "title":       _xml_safe(e.get("title", "")),
                "company":     _xml_safe(e.get("company", "")),
                "dates":       _xml_safe(e.get("dates", "")),
                "description": _xml_safe(e.get("description", "")),
            }
            for e in experience
        ],
        "education": [
            {
                "school": _xml_safe(ed.get("school", "")),
                "degree": _xml_safe(ed.get("degree", "")),
                "field":  _xml_safe(ed.get("field", "")),
                "dates":  _xml_safe(ed.get("dates", "")),
            }
            for ed in education
        ],
        "certifications": [],
    }
