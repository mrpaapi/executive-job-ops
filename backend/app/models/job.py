from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)

    title = Column(String, nullable=False)
    company = Column(String, default="")
    location = Column(String, default="")
    url = Column(String, default="")
    description = Column(Text, default="")

    # Kanban status
    status = Column(String, default="saved")  # saved | applied | interview | offer | rejected

    # AI-generated fields
    match_score = Column(Float, default=0)       # 0-100
    skill_gaps = Column(Text, default="")        # JSON list
    cover_letter = Column(Text, default="")
    salary_min = Column(Integer, default=0)
    salary_max = Column(Integer, default=0)
    salary_currency = Column(String, default="USD")
    notes = Column(Text, default="")

    applied_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    profile = relationship("Profile", back_populates="jobs")
