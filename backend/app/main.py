from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging

# Route our app loggers (e.g. app.core.watcher) through uvicorn's stream so
# operators actually see "Ingesting resume…" / failure messages in the console.
_uvicorn_logger = logging.getLogger("uvicorn.error")
_app_logger = logging.getLogger("app")
_app_logger.handlers = _uvicorn_logger.handlers or [logging.StreamHandler()]
_app_logger.setLevel(logging.INFO)
_app_logger.propagate = False

from app.core.database import init_db
from app.core.watcher import start_resume_watcher
from app.core.ai_client import get_ai_client
from app.api import profiles, jobs, prep, settings as settings_router, discovery, resume, email

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Pre-warm the AI client so the first user request doesn't pay the
    # AsyncOpenAI construction + SSL handshake cost. We don't make a real
    # inference call — just instantiate and prime the client cache.
    try:
        get_ai_client()
        _app_logger.info("AI client pre-warmed")
    except Exception as exc:
        _app_logger.warning("AI client pre-warm skipped: %s", exc)
    watcher_task = asyncio.create_task(start_resume_watcher())
    yield
    watcher_task.cancel()

app = FastAPI(
    title="executive-job-ops",
    description="AI-powered job hunt command centre",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router,        prefix="/api/profiles",  tags=["profiles"])
app.include_router(jobs.router,            prefix="/api/jobs",      tags=["jobs"])
app.include_router(prep.router,            prefix="/api/prep",      tags=["prep"])
app.include_router(settings_router.router, prefix="/api/settings",  tags=["settings"])
app.include_router(discovery.router,       prefix="/api/discovery", tags=["discovery"])
app.include_router(resume.router,          prefix="/api/resume",    tags=["resume"])
app.include_router(email.router,           prefix="/api/email",     tags=["email"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}
