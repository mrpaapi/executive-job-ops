import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.ai_client import chat
from app.models.star_story import StarStory
from app.models.profile import Profile

router = APIRouter()

class StarStoryCreate(BaseModel):
    profile_id: int
    title: str
    situation: str
    task: str
    action: str
    result: str
    tags: Optional[list] = []

class GenerateStoriesRequest(BaseModel):
    profile_id: int

def serialize_story(s: StarStory) -> dict:
    return {
        "id": s.id,
        "profile_id": s.profile_id,
        "title": s.title,
        "situation": s.situation,
        "task": s.task,
        "action": s.action,
        "result": s.result,
        "tags": json.loads(s.tags or "[]"),
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }

@router.get("/stories")
async def list_stories(profile_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    q = select(StarStory).order_by(StarStory.created_at.desc())
    if profile_id:
        q = q.where(StarStory.profile_id == profile_id)
    result = await db.execute(q)
    return [serialize_story(s) for s in result.scalars().all()]

@router.post("/stories")
async def create_story(req: StarStoryCreate, db: AsyncSession = Depends(get_db)):
    story = StarStory(
        profile_id=req.profile_id,
        title=req.title,
        situation=req.situation,
        task=req.task,
        action=req.action,
        result=req.result,
        tags=json.dumps(req.tags or []),
    )
    db.add(story)
    await db.commit()
    await db.refresh(story)
    return serialize_story(story)

@router.post("/stories/generate")
async def generate_stories(req: GenerateStoriesRequest, db: AsyncSession = Depends(get_db)):
    """AI-generate starter STAR stories from a resume."""
    profile_result = await db.execute(select(Profile).where(Profile.id == req.profile_id))
    profile = profile_result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    prompt = f"""You are an expert career coach. Generate 5 STAR (Situation, Task, Action, Result) interview stories based on this person's resume.
Make them specific, believable, and powerful. Each story should highlight a different competency.

Return ONLY valid JSON array:
[
  {{
    "title": "Short story title",
    "situation": "Context and background...",
    "task": "What you were responsible for...",
    "action": "Specific steps you took...",
    "result": "Quantified outcome...",
    "tags": ["leadership", "scale", "incident-management"]
  }}
]

Profile: {profile.name}
Resume summary: {profile.summary}
Skills: {profile.skills}
Raw resume excerpt: {(profile.raw_text or "")[:3000]}
"""
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        stories_data = json.loads(result)
        if isinstance(stories_data, dict):
            stories_data = stories_data.get("stories", [])

        saved = []
        for s in stories_data:
            story = StarStory(
                profile_id=req.profile_id,
                title=s.get("title", ""),
                situation=s.get("situation", ""),
                task=s.get("task", ""),
                action=s.get("action", ""),
                result=s.get("result", ""),
                tags=json.dumps(s.get("tags", [])),
            )
            db.add(story)
            saved.append(story)

        await db.commit()
        for s in saved:
            await db.refresh(s)
        return [serialize_story(s) for s in saved]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

@router.delete("/stories/{story_id}")
async def delete_story(story_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StarStory).where(StarStory.id == story_id))
    story = result.scalar_one_or_none()
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    await db.delete(story)
    await db.commit()
    return {"message": "Story deleted"}
