"""
Gmail Email Tracker — OAuth2 + Gmail API.

Setup (one-time, see README):
  1. Create a Google Cloud project and enable the Gmail API.
  2. Create OAuth 2.0 Desktop credentials → download as gmail_credentials.json
     and place it in the project root.
  3. On first scan, a browser window opens for consent; token saved to gmail_token.json.

Detection logic:
  - Searches Gmail for emails matching job-related keywords in the last 30 days.
  - Classifies each email as: interview_invite | offer | rejection | unknown.
  - Matches to a tracked job by comparing company names.
  - Returns a list of matches for the frontend to confirm before updating statuses.
"""
import os
import json
import re
from pathlib import Path
from typing import Optional

from app.core.config import settings

# ── Gmail API helpers (lazy import so the app starts without google packages) ─

def _get_gmail_service():
    try:
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
    except ImportError:
        raise RuntimeError(
            "Google API packages not installed. "
            "Run: pip install google-auth google-auth-oauthlib google-api-python-client"
        )

    SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
    creds  = None
    token_path = Path(settings.gmail_token_path)
    creds_path = Path(settings.gmail_credentials_path)

    if not creds_path.exists():
        raise FileNotFoundError(
            f"Gmail credentials file not found at {creds_path}. "
            "See README → Gmail setup for instructions."
        )

    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.write_text(creds.to_json())

    return build("gmail", "v1", credentials=creds)


# ── Classification ────────────────────────────────────────────────────────────

INTERVIEW_PATTERNS = [
    r"interview", r"schedule.{0,30}call", r"phone screen", r"technical screen",
    r"we.d like to.{0,20}speak", r"next step", r"move forward",
]
OFFER_PATTERNS = [
    r"offer letter", r"job offer", r"pleased to offer", r"we.re excited to offer",
    r"formal offer", r"compensation package",
]
REJECTION_PATTERNS = [
    r"not moving forward", r"decided to move forward with other",
    r"will not be moving", r"unfortunately", r"not selected",
    r"other candidates", r"won.t be proceeding", r"regret to inform",
]


def classify_email(subject: str, snippet: str) -> str:
    text = f"{subject} {snippet}".lower()
    for p in OFFER_PATTERNS:
        if re.search(p, text):
            return "offer"
    for p in INTERVIEW_PATTERNS:
        if re.search(p, text):
            return "interview"
    for p in REJECTION_PATTERNS:
        if re.search(p, text):
            return "rejected"
    return "unknown"


def extract_company(subject: str, snippet: str, sender: str) -> str:
    """Best-effort company name extraction from email metadata."""
    # Try sender domain (e.g. recruiter@stripe.com → Stripe)
    domain_match = re.search(r"@([\w-]+)\.", sender)
    if domain_match:
        domain = domain_match.group(1)
        # Skip common email providers
        if domain.lower() not in {"gmail", "yahoo", "hotmail", "outlook", "icloud"}:
            return domain.replace("-", " ").title()
    return ""


# ── Main scan function ────────────────────────────────────────────────────────

async def scan_gmail_for_jobs(days: int = 30) -> list[dict]:
    """
    Scans Gmail for job-related emails in the last `days` days.
    Returns a list of classified email events.
    """
    service = _get_gmail_service()

    query = (
        f"newer_than:{days}d "
        "(subject:interview OR subject:offer OR subject:application OR "
        "subject:opportunity OR subject:position OR subject:role)"
    )

    result = service.users().messages().list(
        userId="me", q=query, maxResults=50
    ).execute()

    messages = result.get("messages", [])
    events   = []

    for msg_ref in messages:
        msg = service.users().messages().get(
            userId="me", id=msg_ref["id"],
            format="metadata",
            metadataHeaders=["Subject", "From", "Date"],
        ).execute()

        headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
        subject = headers.get("Subject", "")
        sender  = headers.get("From",    "")
        date    = headers.get("Date",    "")
        snippet = msg.get("snippet", "")

        category = classify_email(subject, snippet)
        if category == "unknown":
            continue

        company = extract_company(subject, snippet, sender)

        events.append({
            "gmail_id":  msg_ref["id"],
            "subject":   subject,
            "sender":    sender,
            "date":      date,
            "snippet":   snippet[:200],
            "category":  category,
            "company":   company,
        })

    return events
