from sqlalchemy import Column, Integer, String, Float, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    resume_path = Column(String, nullable=False)
    role_family = Column(String, default="General")   # SRE, DevOps, Engineering, etc.
    titles = Column(Text, default="")                  # JSON list of titles found
    skills = Column(Text, default="")                  # JSON list of skills
    years_experience = Column(Float, default=0)
    summary = Column(Text, default="")
    raw_text = Column(Text, default="")
    processing_status = Column(String, default="done")
    processing_error = Column(Text, default="")
    processing_provider = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    jobs = relationship("Job", back_populates="profile", cascade="all, delete-orphan")
    star_stories = relationship("StarStory", back_populates="profile", cascade="all, delete-orphan")
