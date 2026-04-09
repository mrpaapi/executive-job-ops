import json
import re
import httpx
from bs4 import BeautifulSoup
from app.core.ai_client import chat

async def scrape_job_description(url: str) -> dict:
    """Scrape a job posting URL and return title, company, description."""
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            headers = {"User-Agent": "Mozilla/5.0 (compatible; executive-job-ops/1.0)"}
            resp = await client.get(url, headers=headers)
            soup = BeautifulSoup(resp.text, "html.parser")

            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()

            text = soup.get_text(separator="\n", strip=True)
            text = re.sub(r'\n{3,}', '\n\n', text)[:8000]

            return {"raw_text": text, "url": url}
    except Exception as e:
        return {"raw_text": "", "url": url, "error": str(e)}

async def analyze_job(jd_text: str, resume_text: str, profile_name: str) -> dict:
    """Match a resume against a job description and return structured analysis."""
    prompt = f"""You are a senior HR expert and career coach. Analyze this job description against the candidate's resume.

Return ONLY valid JSON:
{{
  "title": "Job title from JD",
  "company": "Company name",
  "location": "Location or Remote",
  "match_score": 78,
  "skill_gaps": ["skill missing 1", "skill missing 2"],
  "matching_skills": ["skill that matches 1", "skill that matches 2"],
  "salary_min": 180000,
  "salary_max": 220000,
  "salary_currency": "USD",
  "summary": "2-3 sentence honest assessment of fit",
  "recommended_profile": "{profile_name}"
}}

Rules:
- match_score: 0-100 realistic score. 70+ = strong fit. Be honest.
- skill_gaps: skills in JD that are NOT in the resume (max 8)
- salary_min/max: realistic market range in USD for this role and location. 0 if unknown.
- summary: be specific and actionable

Job Description:
{jd_text[:4000]}

Resume ({profile_name}):
{resume_text[:3000]}
"""
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        data = json.loads(result)
        data["skill_gaps"] = json.dumps(data.get("skill_gaps", []))
        return data
    except Exception:
        return {
            "title": "Unknown", "company": "", "location": "",
            "match_score": 0, "skill_gaps": "[]", "matching_skills": "[]",
            "salary_min": 0, "salary_max": 0, "salary_currency": "USD",
            "summary": "Could not analyze job. Check your API key.",
        }

async def generate_cover_letter(jd_text: str, resume_text: str, profile_name: str) -> str:
    prompt = f"""Write a compelling, concise cover letter (3 paragraphs, under 300 words) for this job.

Tone: confident, specific, human. Not generic. Reference actual details from both the JD and resume.
Do NOT use phrases like "I am excited to apply" or "I am a passionate".

Profile: {profile_name}

Job Description:
{jd_text[:3000]}

Resume highlights:
{resume_text[:2000]}
"""
    return await chat([{"role": "user", "content": prompt}])

async def generate_interview_questions(jd_text: str, profile_name: str) -> list[dict]:
    prompt = f"""Generate 8 targeted interview questions for this job posting.
Mix of: technical (3), behavioural (3), leadership/situational (2).
For each question provide a brief coaching tip.

Return ONLY valid JSON array:
[
  {{
    "question": "...",
    "type": "technical | behavioural | leadership",
    "tip": "What they're really evaluating..."
  }}
]

Profile applying: {profile_name}

Job Description:
{jd_text[:3000]}
"""
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        # handle both array and wrapped object
        parsed = json.loads(result)
        if isinstance(parsed, list):
            return parsed
        return parsed.get("questions", [])
    except Exception:
        return []
