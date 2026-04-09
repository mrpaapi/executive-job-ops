import asyncio
import re
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.resume_parser import parse_resume_pdf
from app.models.profile import Profile
from sqlalchemy import select
import logging

logger = logging.getLogger(__name__)

def filename_to_profile_name(filename: str) -> str:
    """sre-leadership-v2.pdf → SRE Leadership"""
    stem = Path(filename).stem
    stem = re.sub(r'-?v\d+$', '', stem, flags=re.IGNORECASE)
    stem = re.sub(r'[-_]', ' ', stem)
    return stem.strip().title()

async def ingest_resume(filepath: Path):
    """Parse a PDF and upsert a profile in the database."""
    if filepath.suffix.lower() != '.pdf':
        return

    profile_name = filename_to_profile_name(filepath.name)
    logger.info(f"Ingesting resume: {filepath.name} → profile: {profile_name}")

    try:
        parsed = await parse_resume_pdf(filepath)
    except Exception as e:
        logger.error(f"Failed to parse {filepath.name}: {e}")
        return

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Profile).where(Profile.name == profile_name))
        profile = result.scalar_one_or_none()

        if profile:
            profile.resume_path = str(filepath)
            profile.raw_text = parsed["raw_text"]
            profile.skills = parsed["skills"]
            profile.titles = parsed["titles"]
            profile.years_experience = parsed["years_experience"]
            profile.summary = parsed["summary"]
            profile.role_family = parsed["role_family"]
        else:
            profile = Profile(
                name=profile_name,
                resume_path=str(filepath),
                raw_text=parsed["raw_text"],
                skills=parsed["skills"],
                titles=parsed["titles"],
                years_experience=parsed["years_experience"],
                summary=parsed["summary"],
                role_family=parsed["role_family"],
            )
            db.add(profile)

        await db.commit()
        logger.info(f"Profile '{profile_name}' saved successfully.")

class ResumeEventHandler(FileSystemEventHandler):
    def __init__(self, loop):
        self.loop = loop

    def on_created(self, event):
        if not event.is_directory:
            asyncio.run_coroutine_threadsafe(
                ingest_resume(Path(event.src_path)), self.loop
            )

    def on_modified(self, event):
        if not event.is_directory:
            asyncio.run_coroutine_threadsafe(
                ingest_resume(Path(event.src_path)), self.loop
            )

async def start_resume_watcher():
    """Watch the resumes folder and auto-ingest any PDFs found."""
    folder = settings.resume_path

    # Ingest any existing PDFs on startup
    for pdf in folder.glob("*.pdf"):
        await ingest_resume(pdf)

    loop = asyncio.get_event_loop()
    handler = ResumeEventHandler(loop)
    observer = Observer()
    observer.schedule(handler, str(folder), recursive=False)
    observer.start()
    logger.info(f"Watching {folder} for new resumes...")

    try:
        while True:
            await asyncio.sleep(1)
    finally:
        observer.stop()
        observer.join()
