import json
from pathlib import Path
import PyPDF2
from app.core.ai_client import chat

async def extract_text_from_pdf(filepath: Path) -> str:
    text = ""
    with open(filepath, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            text += page.extract_text() or ""
    return text.strip()

async def parse_resume_pdf(filepath: Path) -> dict:
    raw_text = await extract_text_from_pdf(filepath)
    if not raw_text:
        return _empty_parse()

    prompt = f"""You are a resume parser. Extract structured information from this resume text.
Return ONLY valid JSON with these exact keys:
{{
  "skills": ["skill1", "skill2"],
  "titles": ["Most Recent Title", "Previous Title"],
  "years_experience": 10,
  "summary": "2-3 sentence professional summary",
  "role_family": "SRE | DevOps | Software Engineering | Data Engineering | Product Management | Design | Finance | Marketing | Sales | General"
}}

Rules:
- skills: up to 20 most relevant technical and soft skills
- titles: job titles from the resume, most recent first
- years_experience: total years as a number
- role_family: pick the single best match from the options above
- summary: write in third person, highlight seniority and key strengths

Resume text:
{raw_text[:6000]}
"""

    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        parsed = json.loads(result)
        parsed["raw_text"] = raw_text
        parsed["skills"] = json.dumps(parsed.get("skills", []))
        parsed["titles"] = json.dumps(parsed.get("titles", []))
        return parsed
    except Exception:
        return _empty_parse(raw_text)

def _empty_parse(raw_text: str = "") -> dict:
    return {
        "raw_text": raw_text,
        "skills": "[]",
        "titles": "[]",
        "years_experience": 0,
        "summary": "",
        "role_family": "General",
    }
