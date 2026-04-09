from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class StarStory(Base):
    __tablename__ = "star_stories"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False)

    title = Column(String, nullable=False)          # e.g. "Led SRE team through outage"
    situation = Column(Text, default="")
    task = Column(Text, default="")
    action = Column(Text, default="")
    result = Column(Text, default="")
    tags = Column(Text, default="")                 # JSON list: ["leadership","incident","scale"]

    created_at = Column(DateTime, default=datetime.utcnow)

    profile = relationship("Profile", back_populates="star_stories")
