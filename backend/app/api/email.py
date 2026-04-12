"""
Gmail email-tracking endpoints.
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.config import settings
from app.models.job import Job
from app.services.email_tracker import scan_gmail_for_jobs

router = APIRouter()


@router.get("/status")
async def gmail_status():
    from pathlib import Path
    creds_ok = Path(settings.gmail_credentials_path).exists()
    token_ok  = Path(settings.gmail_token_path).exists()
    return {
        "configured":    creds_ok,
        "authenticated": token_ok,
        "credentials_path": settings.gmail_credentials_path,
    }


@router.get("/scan")
async def scan_emails(days: int = 30, db: AsyncSession = Depends(get_db)):
    """
    Scan Gmail for job-related emails and return classified events.
    Optionally auto-matches events to tracked jobs by company name.
    """
    try:
        events = await scan_gmail_for_jobs(days=days)
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gmail scan failed: {str(e)[:200]}")

    # Try to match each event to a tracked job by company name
    result = await db.execute(select(Job))
    all_jobs = result.scalars().all()

    for event in events:
        company = (event.get("company") or "").lower()
        if company:
            for job in all_jobs:
                if company in (job.company or "").lower() or (job.company or "").lower() in company:
                    event["matched_job_id"]    = job.id
                    event["matched_job_title"] = job.title
                    event["matched_company"]   = job.company
                    break

    return {"events": events, "count": len(events)}


class ApplyEventRequest(BaseModel):
    job_id:   int
    new_status: str   # "interview" | "offer" | "rejected"


@router.post("/apply-event")
async def apply_email_event(req: ApplyEventRequest, db: AsyncSession = Depends(get_db)):
    """Apply a Gmail-detected status change to a tracked job."""
    valid = {"interview", "offer", "rejected"}
    if req.new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Status must be one of {valid}")

    result = await db.execute(select(Job).where(Job.id == req.job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.status = req.new_status
    await db.commit()
    return {"message": f"Job '{job.title}' updated to '{req.new_status}'", "job_id": job.id}
