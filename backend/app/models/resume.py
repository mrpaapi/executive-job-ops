from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import json
from app.core.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False, index=True)
    title = Column(String, nullable=False)  # e.g., "Senior Director Resume"
    is_default = Column(Integer, default=0)  # Boolean stored as int

    # Structured resume data (JSON)
    summary = Column(Text, default="")
    experience = Column(Text, default="[]")  # JSON list of {title, company, dates, description}
    education = Column(Text, default="[]")  # JSON list of {school, degree, field, dates}
    skills = Column(Text, default="[]")     # JSON list of strings
    certifications = Column(Text, default="[]")  # JSON list of {name, issuer, date}

    # Contact info
    email = Column(String, default="")
    phone = Column(String, default="")
    location = Column(String, default="")
    website = Column(String, default="")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    profile = relationship("Profile", backref="resumes")

    def to_dict(self):
        return {
            "id": self.id,
            "profile_id": self.profile_id,
            "title": self.title,
            "is_default": bool(self.is_default),
            "summary": self.summary,
            "experience": json.loads(self.experience or "[]"),
            "education": json.loads(self.education or "[]"),
            "skills": json.loads(self.skills or "[]"),
            "certifications": json.loads(self.certifications or "[]"),
            "email": self.email,
            "phone": self.phone,
            "location": self.location,
            "website": self.website,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
