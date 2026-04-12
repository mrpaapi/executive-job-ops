import asyncio
import re
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.ai_client import get_ai_provider_label
from app.services.resume_parser import parse_resume_file
from app.models.profile import Profile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
import logging

logger = logging.getLogger(__name__)

# Per-profile locks so the file watcher and the explicit upload endpoint
# can't race each other when the same file is processed concurrently.
_INGEST_LOCKS: dict[str, asyncio.Lock] = {}

# Tracks the last mtime we successfully parsed for a given absolute path.
# Used to skip redundant parses when the file hasn't actually changed
# (e.g. watchdog's noisy on_modified events on Windows).
_LAST_PARSED_MTIME: dict[str, float] = {}


def _ingest_lock(profile_name: str) -> asyncio.Lock:
    lock = _INGEST_LOCKS.get(profile_name)
    if lock is None:
        lock = asyncio.Lock()
        _INGEST_LOCKS[profile_name] = lock
    return lock

def filename_to_profile_name(filename: str) -> str:
    """sre-leadership-v2.pdf → SRE Leadership"""
    stem = Path(filename).stem
    stem = re.sub(r'-?v\d+$', '', stem, flags=re.IGNORECASE)
    stem = re.sub(r'[-_]', ' ', stem)
    return stem.strip().title()

async def update_profile_processing_state(profile_name: str, status: str, error: str = "", provider: str = ""):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Profile).where(Profile.name == profile_name))
        profile = result.scalar_one_or_none()
        if not profile:
            return

        profile.processing_status = status
        profile.processing_error = error
        if provider:
            profile.processing_provider = provider

        await db.commit()

SUPPORTED_RESUME_SUFFIXES = {".pdf", ".docx"}


async def _mark_existing_profile_done_if_queued(profile_name: str) -> None:
    """If a profile is sitting in queued/extracting/sending state but the file
    hasn't actually changed since we last parsed it, restore status to 'done'.
    Avoids stuck spinners after dedup short-circuit."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Profile).where(Profile.name == profile_name))
        profile = result.scalar_one_or_none()
        if profile and profile.processing_status in ("queued", "extracting_text", "sending_to_llm", "classifying"):
            profile.processing_status = "done"
            profile.processing_error = ""
            await db.commit()


async def _upsert_profile_queued(profile_name: str, filepath: Path, provider: str) -> None:
    """Idempotent upsert of a queued profile row. Survives concurrent insert races."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Profile).where(Profile.name == profile_name))
        profile = result.scalar_one_or_none()

        if profile:
            profile.resume_path = str(filepath)
            profile.processing_status = "queued"
            profile.processing_error = ""
            profile.processing_provider = provider
            await db.commit()
            return

        profile = Profile(
            name=profile_name,
            resume_path=str(filepath),
            processing_status="queued",
            processing_error="",
            processing_provider=provider,
        )
        db.add(profile)
        try:
            await db.commit()
        except IntegrityError:
            # Another concurrent task inserted the row first — re-fetch and update.
            await db.rollback()
            result = await db.execute(select(Profile).where(Profile.name == profile_name))
            profile = result.scalar_one()
            profile.resume_path = str(filepath)
            profile.processing_status = "queued"
            profile.processing_error = ""
            profile.processing_provider = provider
            await db.commit()


async def ingest_resume(filepath: Path, force: bool = False):
    """Parse a résumé file (PDF or .docx) and upsert a profile in the database.

    Race-safe: serialised per profile name via an asyncio lock, and skips redundant
    re-parses when the file mtime hasn't changed since the last successful parse.
    Pass ``force=True`` to bypass the mtime cache (e.g. user-triggered retry).
    """
    if filepath.suffix.lower() not in SUPPORTED_RESUME_SUFFIXES:
        return

    profile_name = filename_to_profile_name(filepath.name)
    provider = get_ai_provider_label()

    async with _ingest_lock(profile_name):
        # Dedupe noisy watchdog re-fires: skip if we already parsed this exact
        # file at its current mtime. The upload endpoint and the file watcher
        # both call ingest_resume for the same file, and Windows often triggers
        # multiple on_modified events for one write.
        try:
            current_mtime = filepath.stat().st_mtime
        except FileNotFoundError:
            logger.warning(f"Resume file vanished before processing: {filepath}")
            return
        path_key = str(filepath.resolve())
        if not force and _LAST_PARSED_MTIME.get(path_key) == current_mtime:
            logger.info(f"Skipping unchanged résumé: {filepath.name}")
            # The caller (retry / upload endpoint) may have just set
            # processing_status="queued". If we skip, restore it to "done"
            # so the UI doesn't show a stuck queue indefinitely.
            await _mark_existing_profile_done_if_queued(profile_name)
            return

        logger.info(f"Ingesting resume: {filepath.name} → profile: {profile_name}")

        await _upsert_profile_queued(profile_name, filepath, provider)

        try:
            parsed = await parse_resume_file(
                filepath,
                progress_callback=lambda status: update_profile_processing_state(
                    profile_name,
                    status,
                    "",
                    provider,
                ),
            )
        except Exception as e:
            logger.error(f"Failed to parse {filepath.name}: {e}")
            await update_profile_processing_state(profile_name, "failed", str(e), provider)
            return

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Profile).where(Profile.name == profile_name))
            profile = result.scalar_one_or_none()
            if profile is None:
                logger.error(f"Profile vanished mid-parse: {profile_name}")
                return

            profile.resume_path = str(filepath)
            profile.raw_text = parsed["raw_text"]
            profile.skills = parsed["skills"]
            profile.titles = parsed["titles"]
            profile.years_experience = parsed["years_experience"]
            profile.summary = parsed["summary"]
            profile.role_family = parsed["role_family"]
            profile.processing_status = "done"
            profile.processing_error = ""
            profile.processing_provider = provider
            await db.commit()
            logger.info(f"Profile '{profile_name}' saved successfully.")

        _LAST_PARSED_MTIME[path_key] = current_mtime

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

async def _existing_done_profile_names() -> set[str]:
    """Profile names that already have a successful parse — used to skip
    redundant re-ingestion on every backend restart."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Profile.name).where(Profile.processing_status == "done")
        )
        return {row[0] for row in result.all()}


async def start_resume_watcher():
    """Watch the resumes folder and auto-ingest any PDF or .docx files found.

    Only ingests files that don't already have a 'done' profile in the database,
    so a backend restart doesn't re-parse every résumé from scratch (which on a
    slow CPU-only Ollama setup would block fresh uploads for many minutes).
    """
    folder = settings.resume_path
    already_done = await _existing_done_profile_names()

    # Ingest any new PDF or .docx résumés we haven't successfully parsed yet,
    # plus retry anything left in a non-done state.
    for suffix in SUPPORTED_RESUME_SUFFIXES:
        for f in folder.glob(f"*{suffix}"):
            profile_name = filename_to_profile_name(f.name)
            if profile_name in already_done:
                logger.info(f"Skipping startup re-ingest (already done): {f.name}")
                continue
            await ingest_resume(f)

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
