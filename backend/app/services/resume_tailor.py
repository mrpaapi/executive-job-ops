"""
Resume Auto-Tailoring via RxResume v4 API.

Workflow:
  1. User sets RXRESUME_URL + RXRESUME_TOKEN in Settings.
  2. On "Generate tailored resume", we:
     a. Fetch the user's base resume from RxResume (by resume ID stored on the profile).
     b. Ask the LLM to produce tailored summary/skills JSON for this specific job.
     c. PATCH the resume via RxResume API with the tailored data.
     d. Call the RxResume print endpoint to produce a PDF.
     e. Return the PDF URL to the frontend for download.

RxResume API reference: https://docs.rxresume.com/source-code/api-reference
"""
import httpx
from app.core.config import settings
from app.core.ai_client import chat
import json


class RxResumeError(Exception):
    pass


async def _rx(method: str, path: str, **kwargs):
    if not settings.rxresume_url or not settings.rxresume_token:
        raise RxResumeError("RxResume not configured — add RXRESUME_URL and RXRESUME_TOKEN to .env")
    base = settings.rxresume_url.rstrip("/")
    headers = {
        "Authorization": f"Bearer {settings.rxresume_token}",
        "Content-Type":  "application/json",
    }
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await getattr(c, method)(f"{base}/api{path}", headers=headers, **kwargs)
        if resp.status_code >= 400:
            raise RxResumeError(f"RxResume API error {resp.status_code}: {resp.text[:200]}")
        return resp.json()


async def list_resumes() -> list[dict]:
    """Return all resumes for the authenticated user."""
    data = await _rx("get", "/resume")
    return data if isinstance(data, list) else data.get("data", [])


async def get_resume(resume_id: str) -> dict:
    return await _rx("get", f"/resume/{resume_id}")


async def tailor_and_export(
    resume_id: str,
    job_title: str,
    job_description: str,
    profile_name: str,
) -> dict:
    """
    Tailors an existing RxResume resume for a specific job and returns a PDF URL.
    Returns: { "pdf_url": str, "resume_id": str, "tailored_resume_id": str }
    """
    # 1. Fetch base resume
    base = await get_resume(resume_id)
    current_summary = (
        base.get("data", {}).get("sections", {}).get("summary", {}).get("content", "")
    )
    current_skills_raw = base.get("data", {}).get("sections", {}).get("skills", {})

    # 2. Ask LLM to tailor the summary and highlight relevant skills
    prompt = f"""You are a professional resume writer. Tailor this resume summary and skills emphasis for the job below.

Return ONLY valid JSON:
{{
  "summary": "2-3 sentence tailored professional summary that directly addresses the job requirements",
  "highlight_skills": ["skill1", "skill2", "skill3"]
}}

Candidate: {profile_name}
Current summary: {current_summary[:500]}
Job title: {job_title}
Job description: {job_description[:2000]}
"""
    try:
        raw = await chat([{"role": "user", "content": prompt}], json_mode=True)
        tailored = json.loads(raw)
    except Exception:
        tailored = {"summary": current_summary, "highlight_skills": []}

    # 3. Duplicate the base resume so we don't overwrite the original
    duped = await _rx("post", f"/resume/{resume_id}/duplicate")
    tailored_id = duped.get("id") or duped.get("data", {}).get("id")
    if not tailored_id:
        raise RxResumeError("Failed to duplicate resume in RxResume")

    # 4. Patch the duplicated resume with the tailored summary
    patch_payload = {
        "title": f"{base.get('title', profile_name)} — {job_title[:40]}",
        "data": {
            **base.get("data", {}),
            "sections": {
                **base.get("data", {}).get("sections", {}),
                "summary": {
                    **base.get("data", {}).get("sections", {}).get("summary", {}),
                    "content": tailored.get("summary", current_summary),
                },
            },
        },
    }
    await _rx("patch", f"/resume/{tailored_id}", json=patch_payload)

    # 5. Export as PDF via the print endpoint
    pdf_resp = await _rx("get", f"/resume/{tailored_id}/print")
    pdf_url  = pdf_resp.get("url") or f"{settings.rxresume_url}/resume/{tailored_id}/print"

    return {
        "pdf_url":           pdf_url,
        "resume_id":         resume_id,
        "tailored_resume_id": tailored_id,
        "tailored_summary":  tailored.get("summary", ""),
    }
