"""
Discovery API — resilient, per-source status reporting
GET  /api/discovery/          — search all selected sources
GET  /api/discovery/source    — search ONE source (for per-button UX)
POST /api/discovery/add       — save a discovered job to the tracker
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.profile import Profile
from app.models.job import Job
from app.services.job_discovery import discover_jobs, SOURCE_FNS, PORTAL_SOURCE_FNS
from app.services.portal_companies import (
    GREENHOUSE_COMPANIES,
    LEVER_COMPANIES,
    ASHBY_COMPANIES,
    WELLFOUND_COMPANIES,
)
import asyncio

router = APIRouter()


def _parse_companies(raw: Optional[str]) -> Optional[list[tuple[str, str]]]:
    """
    Parse a "Name|slug,Name|slug" or "slug,slug" list into the tuple form the
    portal fetchers expect. Returns None when no override was supplied so the
    fetcher falls back to its curated default list.
    """
    if not raw:
        return None
    out: list[tuple[str, str]] = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if "|" in chunk:
            name, slug = chunk.split("|", 1)
            out.append((name.strip() or slug.strip(), slug.strip()))
        else:
            out.append((chunk, chunk))
    return out or None


@router.get("/portals")
async def list_portal_companies():
    """Return the curated company list each portal scanner ships with."""
    def _fmt(lst):
        return [{"name": n, "slug": s} for n, s in lst]
    return {
        "greenhouse": _fmt(GREENHOUSE_COMPANIES),
        "lever":      _fmt(LEVER_COMPANIES),
        "ashby":      _fmt(ASHBY_COMPANIES),
        "wellfound":  _fmt(WELLFOUND_COMPANIES),
    }


@router.get("/")
async def search_jobs(
    profile_id: int,
    sources: Optional[str] = Query(default="remotive,weworkremotely,google"),
    keywords: Optional[str] = None,
    country: Optional[str] = "global",
    greenhouse_companies: Optional[str] = None,
    lever_companies:      Optional[str] = None,
    ashby_companies:      Optional[str] = None,
    wellfound_companies:  Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    source_list = [s.strip() for s in sources.split(",") if s.strip()]
    skills = json.loads(profile.skills or "[]")
    titles = json.loads(profile.titles or "[]")

    # Use custom keywords if provided, otherwise use profile titles/skills
    custom_keywords = None
    if keywords:
        custom_keywords = [k.strip() for k in keywords.split(",") if k.strip()]

    portal_overrides = {
        k: v for k, v in {
            "greenhouse": _parse_companies(greenhouse_companies),
            "lever":      _parse_companies(lever_companies),
            "ashby":      _parse_companies(ashby_companies),
            "wellfound":  _parse_companies(wellfound_companies),
        }.items() if v is not None
    }

    data = await discover_jobs(
        profile_name=profile.name,
        profile_skills=skills,
        profile_titles=titles,
        role_family=profile.role_family or "General",
        sources=source_list,
        custom_keywords=custom_keywords,
        country=country,
        portal_companies=portal_overrides or None,
    )
    data["profile"] = profile.name
    return data


@router.get("/source")
async def search_one_source(
    profile_id: int,
    source: str,
    keywords: Optional[str] = None,
    country: Optional[str] = "global",
    companies: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Search a single source — used by per-source buttons in the UI."""
    result = await db.execute(select(Profile).where(Profile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if source not in SOURCE_FNS:
        raise HTTPException(status_code=400, detail=f"Unknown source: {source}")

    skills = json.loads(profile.skills or "[]")
    titles = json.loads(profile.titles or "[]")

    # Use custom keywords if provided
    if keywords:
        kw_list = [k.strip() for k in keywords.split(",") if k.strip()]
    else:
        kw_list = list(dict.fromkeys(
            titles[:3] + skills[:5]  # Use full titles, not just first word
        ))

    if source in PORTAL_SOURCE_FNS:
        override = _parse_companies(companies)
        jobs_raw, status = await SOURCE_FNS[source](kw_list, override)
    else:
        jobs_raw, status = await SOURCE_FNS[source](kw_list)

    from app.services.job_discovery import (
        quick_score, calculate_skill_gaps, _filter_by_country, _profile_skill_index,
    )
    # Filter by country
    jobs_raw = _filter_by_country(jobs_raw, country)

    pindex = _profile_skill_index(skills)
    for job in jobs_raw:
        job["match_score"]  = quick_score(job["title"], job["description"], skills, titles, custom_keywords=kw_list if keywords else None)
        job["skill_gaps"]   = calculate_skill_gaps(
            job["title"], job.get("description", ""), skills, profile_index=pindex,
        )
        job["profile_name"] = profile.name

    jobs_raw.sort(key=lambda j: j["match_score"], reverse=True)
    return {"jobs": jobs_raw, "status": status, "profile": profile.name}


@router.post("/add")
async def add_discovered_job(
    req: dict,
    db: AsyncSession = Depends(get_db),
):
    profile_id  = req.get("profile_id")
    url         = req.get("url", "")

    # Deduplicate
    existing = await db.execute(
        select(Job).where(Job.profile_id == profile_id, Job.url == url)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Job already in your tracker")

    job = Job(
        profile_id=profile_id,
        title=req.get("title",""),
        company=req.get("company",""),
        location=req.get("location",""),
        url=url,
        description=req.get("description",""),
        match_score=req.get("match_score", 0),
        skill_gaps="[]",
        status="saved",
        notes=f"Discovered via {req.get('source','')}",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return {"message": f"'{job.title}' added to your tracker.", "job_id": job.id}
