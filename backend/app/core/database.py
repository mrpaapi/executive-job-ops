from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# Always use aiosqlite driver - strip any existing prefix and rebuild cleanly
_db_path = settings.database_url
_db_path = _db_path.replace("sqlite+aiosqlite:///", "")
_db_path = _db_path.replace("sqlite:///", "")

DATABASE_URL = f"sqlite+aiosqlite:///{_db_path}"

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def init_db():
    from app.models import profile, job, star_story, resume  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        result = await conn.exec_driver_sql("PRAGMA table_info(profiles)")
        existing_columns = {row[1] for row in result.fetchall()}

        if "processing_status" not in existing_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE profiles ADD COLUMN processing_status VARCHAR DEFAULT 'done'"
            )

        if "processing_error" not in existing_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE profiles ADD COLUMN processing_error TEXT DEFAULT ''"
            )

        if "processing_provider" not in existing_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE profiles ADD COLUMN processing_provider VARCHAR DEFAULT ''"
            )

        # ── jobs additive migrations ─────────────────────────────────────
        result = await conn.exec_driver_sql("PRAGMA table_info(jobs)")
        job_cols = {row[1] for row in result.fetchall()}
        if "analysis_json" not in job_cols:
            await conn.exec_driver_sql(
                "ALTER TABLE jobs ADD COLUMN analysis_json TEXT DEFAULT ''"
            )

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
