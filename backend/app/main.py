from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio

from app.core.database import init_db
from app.core.watcher import start_resume_watcher
from app.api import profiles, jobs, prep, settings as settings_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    watcher_task = asyncio.create_task(start_resume_watcher())
    yield
    watcher_task.cancel()

app = FastAPI(
    title="executive-job-ops",
    description="AI-powered job hunt command centre by mrpaapi",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profiles.router, prefix="/api/profiles", tags=["profiles"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(prep.router, prefix="/api/prep", tags=["prep"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "executive-job-ops", "author": "mrpaapi"}
