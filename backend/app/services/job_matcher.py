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

def _grade_from_score(score: int) -> str:
    """Map a 0–100 match score to a letter grade users can scan in one glance."""
    if score >= 90: return "A+"
    if score >= 85: return "A"
    if score >= 80: return "A-"
    if score >= 75: return "B+"
    if score >= 70: return "B"
    if score >= 65: return "B-"
    if score >= 60: return "C+"
    if score >= 55: return "C"
    if score >= 50: return "C-"
    if score >= 40: return "D"
    return "F"


async def analyze_job(jd_text: str, resume_text: str, profile_name: str) -> dict:
    """Match a resume against a job description and return structured analysis.

    Returns the existing fields plus six dimensional scores, an archetype tag,
    and a one-line "why" rationale so the UI can render a grade chip + drawer.
    """
    prompt = f"""You are a senior HR expert and career coach. Analyze this job description against the candidate's resume.

Return ONLY valid JSON:
{{
  "title": "Job title from JD",
  "company": "Company name",
  "location": "Location or Remote",
  "match_score": 78,
  "dimensions": {{
    "skills_match": 80,
    "experience_level": 75,
    "domain_relevance": 70,
    "leadership_fit": 65,
    "compensation_fit": 70,
    "culture_signal": 60
  }},
  "archetype": "Builder | Operator | Strategist | Specialist | Generalist | Leader",
  "why": "One sentence rationale, max 25 words, that names the strongest match factor and the biggest risk.",
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
- dimensions.*: each is an independent 0-100 score. match_score should roughly track their weighted average.
- archetype: pick the SINGLE label that best describes the role (not the candidate).
- why: must reference real evidence from the JD or resume, no hedging.
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

        # Normalise dimensions so the frontend always gets all six keys.
        dims = data.get("dimensions") or {}
        for k in ("skills_match", "experience_level", "domain_relevance",
                  "leadership_fit", "compensation_fit", "culture_signal"):
            try:
                dims[k] = max(0, min(100, int(dims.get(k, 0))))
            except (TypeError, ValueError):
                dims[k] = 0
        data["dimensions"] = dims

        score = int(data.get("match_score") or 0)
        data["match_score"] = max(0, min(100, score))
        data["grade"] = _grade_from_score(data["match_score"])
        data["archetype"] = (data.get("archetype") or "Generalist").strip()
        data["why"] = (data.get("why") or "").strip()
        data["skill_gaps"] = json.dumps(data.get("skill_gaps", []))
        return data
    except Exception:
        return {
            "title": "Unknown", "company": "", "location": "",
            "match_score": 0, "grade": "F",
            "dimensions": {
                "skills_match": 0, "experience_level": 0, "domain_relevance": 0,
                "leadership_fit": 0, "compensation_fit": 0, "culture_signal": 0,
            },
            "archetype": "Generalist", "why": "",
            "skill_gaps": "[]", "matching_skills": "[]",
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

async def generate_negotiation_brief(
    jd_text: str,
    resume_text: str,
    profile_name: str,
    company: str,
    title: str,
    salary_min: int = 0,
    salary_max: int = 0,
) -> dict:
    """Produce a structured salary-negotiation brief for a specific job."""
    prompt = f"""You are a senior executive compensation coach. Build a salary
negotiation brief for the candidate. Be concrete and tactical, never vague.

Return ONLY valid JSON:
{{
  "target_total_comp": "USD range, e.g. $220k–$260k",
  "anchors": ["3-5 anchor points the candidate can cite"],
  "questions_to_ask_recruiter": ["2-4 high-leverage questions"],
  "concession_ladder": ["What to give up first, second, third"],
  "scripts": {{
    "first_offer_response": "Verbatim opener when an offer arrives",
    "counter_offer":         "Verbatim counter, with the number",
    "walk_away":             "Verbatim line if they hold firm under your floor"
  }},
  "risks": ["1-3 risks to call out"],
  "summary": "2 sentences"
}}

Role: {title} at {company}
Existing salary range estimate: ${salary_min}–${salary_max}
Candidate profile: {profile_name}

Job description:
{jd_text[:3000]}

Candidate resume excerpt:
{resume_text[:2000]}
"""
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        return json.loads(result)
    except Exception as e:
        return {"error": f"Negotiation brief failed: {e}"}


async def generate_company_research(jd_text: str, company: str, title: str) -> dict:
    """Deep-research brief on a target company for interview prep."""
    prompt = f"""You are a research analyst preparing a candidate for an interview.
Build a one-page brief on {company} based ONLY on what is in the job description
and your general knowledge — do NOT invent stats. If unknown, say "unknown".

Return ONLY valid JSON:
{{
  "company_one_liner": "One-sentence pitch",
  "what_they_do":    "2-3 sentences",
  "stage_and_size":  "Stage / headcount / funding (or 'unknown')",
  "recent_signals":  ["3-5 recent signals worth referencing"],
  "key_people_to_research": ["Roles or names worth Googling before the call"],
  "smart_questions": ["4-6 thoughtful questions to ask the interviewer"],
  "red_flags":       ["2-4 things to probe in the interview"],
  "fit_pitch":       "How the candidate should frame their relevance, in 2 sentences"
}}

Role being interviewed for: {title}
Job description excerpt:
{jd_text[:3500]}
"""
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        return json.loads(result)
    except Exception as e:
        return {"error": f"Research brief failed: {e}"}


async def generate_outreach_messages(
    jd_text: str,
    resume_text: str,
    profile_name: str,
    company: str,
    title: str,
) -> dict:
    """Three reusable LinkedIn outreach drafts: recruiter, hiring manager, peer."""
    prompt = f"""Draft three short LinkedIn outreach messages from {profile_name} to
people at {company} about the {title} role. Each must be under 60 words,
specific to the role, and not generic. Use the candidate's resume to find
ONE concrete hook per message (a project, metric, or shared interest).

Return ONLY valid JSON:
{{
  "recruiter":      {{ "subject": "...", "body": "..." }},
  "hiring_manager": {{ "subject": "...", "body": "..." }},
  "peer":           {{ "subject": "...", "body": "..." }}
}}

Job description excerpt:
{jd_text[:2500]}

Candidate resume excerpt:
{resume_text[:2000]}
"""
    try:
        result = await chat([{"role": "user", "content": prompt}], json_mode=True)
        return json.loads(result)
    except Exception as e:
        return {"error": f"Outreach drafts failed: {e}"}


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
