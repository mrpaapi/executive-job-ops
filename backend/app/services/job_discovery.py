"""
Job Discovery Service — multi-source scraper
Each source runs independently. If one fails, others continue.
Returns per-source status so the UI can show what worked and what didn't.

Sources:
  Free / no key: Remotive, WeWorkRemotely, Arbeitnow, Working Nomads,
                 startup.jobs, Hiring Cafe, Gradcracker, Indeed RSS
  API key:       Adzuna
  Best-effort:   Glassdoor, LinkedIn (serve best-effort HTML scrape;
                 both block bots aggressively — results may be empty)
"""
import json
import asyncio
import hashlib
import re
from typing import Optional
import httpx
from bs4 import BeautifulSoup
from app.core.config import settings


def job_id(url: str, title: str, company: str) -> str:
    raw = f"{url}{title}{company}".lower().strip()
    return hashlib.md5(raw.encode()).hexdigest()[:12]


_COMMON_SKILLS_CACHE: list[str] | None = None


def _profile_skill_index(profile_skills: list) -> set:
    """Lower-cased set of profile skills (and their substrings) for O(1) lookups."""
    out: set = set()
    for s in profile_skills or []:
        s_lower = s.lower()
        out.add(s_lower)
        for token in s_lower.split():
            if len(token) > 3:
                out.add(token)
    return out


def calculate_skill_gaps(title: str, description: str, profile_skills: list, *, profile_index: set | None = None) -> list:
    """
    Identify skill gaps by finding skills mentioned in job but missing from profile.
    Returns list of missing skill names.

    `profile_index` lets callers compute the lower-cased profile-skill set once
    and reuse it across many job rows (was an O(jobs × profile_skills × common_skills)
    nested scan; now O(jobs × common_skills) per /source call).
    """
    if not profile_skills and profile_index is None:
        return []

    # Common technical skills to look for
    common_skills = [
        # Languages
        "python", "java", "javascript", "typescript", "golang", "rust", "c++", "c#", "php", "ruby", "swift",
        # Web frameworks
        "react", "angular", "vue", "django", "flask", "fastapi", "spring", "express", "nodejs", "node.js",
        # Databases
        "sql", "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra", "dynamodb", "oracle",
        # Cloud
        "aws", "azure", "gcp", "google cloud", "kubernetes", "docker", "terraform", "cloudformation",
        # DevOps
        "ci/cd", "jenkins", "gitlab", "github", "devops", "ansible", "puppet", "chef",
        # Data
        "spark", "hadoop", "kafka", "airflow", "dbt", "databricks", "snowflake", "bigquery",
        # Other
        "machine learning", "ai", "ml", "deep learning", "nlp", "computer vision",
        "rest", "graphql", "microservices", "architecture", "design patterns",
        "agile", "scrum", "leadership", "communication", "project management",
    ]

    job_text = f"{title} {description}".lower()
    pindex = profile_index if profile_index is not None else _profile_skill_index(profile_skills)

    gaps = []
    for skill in common_skills:
        if skill in job_text:
            # Skill mentioned in job — check membership against pre-built set
            if skill in pindex:
                continue
            if any(skill in ps or ps in skill for ps in pindex):
                continue
            gaps.append(skill.title())

    # Remove duplicates while preserving order
    seen = set()
    unique_gaps = []
    for gap in gaps:
        if gap.lower() not in seen:
            seen.add(gap.lower())
            unique_gaps.append(gap)

    return unique_gaps[:8]  # Return top 8 gaps


def quick_score(title: str, snippet: str, skills: list, titles: list, custom_keywords: list = None) -> int:
    """Score a job based on keyword match. If custom_keywords provided, prioritize exact title matches."""
    text = f"{title} {snippet}".lower()

    if custom_keywords:
        # For custom keyword search, score based on how well job title matches keywords
        title_lower = title.lower()
        for kw in custom_keywords:
            kw_lower = kw.lower().strip()
            if kw_lower in title_lower:
                return 90  # Exact match in title
            # Check for main words (> 3 chars) present in title
            main_words = [w for w in kw_lower.replace(',', '').split() if len(w) > 3]
            if main_words and all(w in title_lower for w in main_words):
                return 75  # All main words present
            if any(w in title_lower for w in main_words):
                return 60  # Some words present
            if kw_lower in text:
                return 40  # Mentioned in description
        return 15  # Not directly matched
    else:
        # Profile-based scoring (original logic)
        skill_hits = sum(1 for s in skills if s.lower() in text)
        title_hits  = sum(1 for t in titles if any(w.lower() in text for w in t.split()))
        return min(100, max(10, skill_hits * 8 + title_hits * 15))


def _filter_by_country(jobs: list, country: str) -> list:
    """Filter jobs by country based on location field."""
    if country == "global" or not jobs:
        return jobs

    country_map = {
        "us": ["remote", "usa", "united states", "us"],
        "uk": ["united kingdom", "uk", "england", "scotland", "wales"],
        "ca": ["canada", "canadian"],
        "au": ["australia", "australian"],
        "de": ["germany", "german"],
        "fr": ["france", "french"],
        "nl": ["netherlands", "dutch"],
        "ch": ["switzerland", "swiss"],
        "sg": ["singapore"],
    }

    keywords = country_map.get(country, [])
    if not keywords:
        return jobs

    filtered = []
    for job in jobs:
        loc = (job.get("location") or "").lower()
        if any(kw in loc for kw in keywords):
            filtered.append(job)

    return filtered if filtered else jobs  # Return all if none match (fallback)


# ── helpers ──────────────────────────────────────────────────────────────────

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def _parse_feed(text: str) -> "BeautifulSoup":
    """Parse RSS/XML with graceful fallback when lxml is not installed."""
    for parser in ("lxml-xml", "xml", "lxml", "html.parser"):
        try:
            return BeautifulSoup(text, parser)
        except Exception:
            continue
    return BeautifulSoup(text, "html.parser")


# ── Sources ───────────────────────────────────────────────────────────────────

async def fetch_remotive(keywords: list[str]) -> tuple[list, dict]:
    status = {"source": "Remotive", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        query = " ".join(keywords[:3])
        url = f"https://remotive.com/api/remote-jobs?search={query}&limit=20"
        async with httpx.AsyncClient(timeout=12) as c:
            resp = await c.get(url)
            resp.raise_for_status()
            for job in resp.json().get("jobs", []):
                results.append({
                    "id":          job_id(job.get("url",""), job.get("title",""), job.get("company_name","")),
                    "title":       job.get("title", ""),
                    "company":     job.get("company_name", ""),
                    "location":    job.get("candidate_required_location", "Remote"),
                    "url":         job.get("url", ""),
                    "description": BeautifulSoup(job.get("description",""), "html.parser").get_text()[:800],
                    "source":      "Remotive",
                    "posted_at":   job.get("publication_date", "")[:10],
                })
        status.update({"ok": True, "count": len(results)})
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except httpx.HTTPStatusError as e:
        status["error"] = f"HTTP {e.response.status_code}"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_weworkremotely(keywords: list[str]) -> tuple[list, dict]:
    status = {"source": "WeWorkRemotely", "ok": False, "count": 0, "error": ""}
    results = []
    feeds = [
        "https://weworkremotely.com/remote-jobs.rss",
        "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
    ]
    try:
        async with httpx.AsyncClient(timeout=12) as c:
            for feed_url in feeds:
                try:
                    resp = await c.get(feed_url)
                    soup = _parse_feed(resp.text)
                    for item in soup.find_all("item")[:15]:
                        title    = item.find("title").get_text() if item.find("title") else ""
                        link     = item.find("link").get_text() if item.find("link") else ""
                        desc_tag = item.find("description")
                        desc     = BeautifulSoup(desc_tag.get_text() if desc_tag else "", "html.parser").get_text()[:600]
                        company  = item.find("company").get_text() if item.find("company") else ""
                        region   = item.find("region").get_text() if item.find("region") else "Remote"
                        kw_text  = f"{title} {desc}".lower()
                        if any(k.lower() in kw_text for k in keywords):
                            results.append({
                                "id":          job_id(link, title, company),
                                "title":       title.replace("\n", " ").strip(),
                                "company":     company,
                                "location":    region,
                                "url":         link,
                                "description": desc,
                                "source":      "WeWorkRemotely",
                                "posted_at":   "",
                            })
                except Exception:
                    continue
        status.update({"ok": True, "count": len(results)})
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results[:20], status


async def fetch_arbeitnow(keywords: list[str]) -> tuple[list, dict]:
    status = {"source": "Arbeitnow", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        query = " ".join(keywords[:4])
        url = f"https://arbeitnow.com/api/job-board-api?search={query}"
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(url, headers={"Accept": "application/json"})
            resp.raise_for_status()
            for job in resp.json().get("data", [])[:25]:
                desc_html = job.get("description", "")
                desc_text = BeautifulSoup(desc_html, "html.parser").get_text()[:800] if desc_html else ""
                results.append({
                    "id":          job_id(job.get("url", ""), job.get("title", ""), job.get("company_name", "")),
                    "title":       job.get("title", ""),
                    "company":     job.get("company_name", ""),
                    "location":    job.get("location", "Remote"),
                    "url":         job.get("url", ""),
                    "description": desc_text,
                    "source":      "Arbeitnow",
                    "posted_at":   str(job.get("created_at", ""))[:10],
                })
        status.update({"ok": True, "count": len(results)})
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except httpx.HTTPStatusError as e:
        status["error"] = f"HTTP {e.response.status_code}"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_adzuna(keywords: list[str]) -> tuple[list, dict]:
    status = {"source": "Indeed (Adzuna)", "ok": False, "count": 0, "error": ""}
    results = []
    app_id  = settings.adzuna_app_id
    api_key = settings.adzuna_api_key
    if not app_id or not api_key:
        status["error"] = "API key not configured — add ADZUNA_APP_ID and ADZUNA_API_KEY to .env"
        return results, status
    try:
        query = " ".join(keywords[:4])
        url = (
            f"https://api.adzuna.com/v1/api/jobs/us/search/1"
            f"?app_id={app_id}&app_key={api_key}"
            f"&results_per_page=20&what={query}&content-type=application/json"
        )
        async with httpx.AsyncClient(timeout=12) as c:
            resp = await c.get(url)
            resp.raise_for_status()
            for job in resp.json().get("results", []):
                org = job.get("company", {})
                loc = job.get("location", {})
                results.append({
                    "id":          job_id(job.get("redirect_url",""), job.get("title",""), org.get("display_name","")),
                    "title":       job.get("title", ""),
                    "company":     org.get("display_name", ""),
                    "location":    loc.get("display_name", ""),
                    "url":         job.get("redirect_url", ""),
                    "description": job.get("description", "")[:800],
                    "source":      "Indeed (Adzuna)",
                    "posted_at":   job.get("created", "")[:10],
                })
        status.update({"ok": True, "count": len(results)})
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except httpx.HTTPStatusError as e:
        status["error"] = f"HTTP {e.response.status_code}"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_indeed_rss(keywords: list[str]) -> tuple[list, dict]:
    """Indeed public RSS feed — no key needed."""
    status = {"source": "Indeed", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        query = "+".join(k.replace(" ", "+") for k in keywords[:4])
        url = f"https://rss.indeed.com/rss?q={query}&l=remote&sort=date&limit=20"
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(url, headers=BROWSER_HEADERS)
        soup = _parse_feed(resp.text)
        for item in soup.find_all("item")[:20]:
            title_tag = item.find("title")
            link_tag  = item.find("link")
            desc_tag  = item.find("description")
            pub_tag   = item.find("pubdate") or item.find("pubDate")

            title = title_tag.get_text(strip=True) if title_tag else ""
            # Prefer <link> next-sibling text for RSS (some parsers put URL there)
            link  = ""
            if link_tag:
                link = link_tag.get_text(strip=True) or link_tag.get("href", "")
            desc  = BeautifulSoup(desc_tag.get_text() if desc_tag else "", "html.parser").get_text()[:600]
            company = ""
            if " - " in title:
                parts, title = title.rsplit(" - ", 1), title.rsplit(" - ", 1)[0].strip()
                company = parts[1].strip() if len(parts) > 1 else ""
            posted = pub_tag.get_text(strip=True)[:16] if pub_tag else ""
            results.append({
                "id":          job_id(link, title, company),
                "title":       title,
                "company":     company,
                "location":    "Remote",
                "url":         link,
                "description": desc,
                "source":      "Indeed",
                "posted_at":   posted,
            })
        status.update({"ok": True, "count": len(results)})
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_working_nomads(keywords: list[str]) -> tuple[list, dict]:
    """Working Nomads RSS feed — no key needed."""
    status = {"source": "Working Nomads", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        # Use their RSS feed which is stable and doesn't require auth
        query = "%20".join(keywords[:3])
        url   = f"https://www.workingnomads.com/feed/?search={query}"
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(url, headers=BROWSER_HEADERS)
        soup = _parse_feed(resp.text)
        items = soup.find_all("item")
        if not items:
            # fallback: unfiltered feed, match client-side
            async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
                resp2 = await c.get("https://www.workingnomads.com/feed/", headers=BROWSER_HEADERS)
            soup  = _parse_feed(resp2.text)
            items = soup.find_all("item")

        kw_lower = [k.lower() for k in keywords]
        for item in items[:100]:
            title_tag = item.find("title")
            link_tag  = item.find("link")
            desc_tag  = item.find("description")
            pub_tag   = item.find("pubdate") or item.find("pubDate")

            title = title_tag.get_text(strip=True) if title_tag else ""
            link  = link_tag.get_text(strip=True) if link_tag else ""
            if not link and link_tag:
                link = link_tag.get("href", "")
            desc  = BeautifulSoup(desc_tag.get_text() if desc_tag else "", "html.parser").get_text()[:600]
            posted = pub_tag.get_text(strip=True)[:10] if pub_tag else ""

            text = f"{title} {desc}".lower()
            if not any(k in text for k in kw_lower):
                continue

            # title often "Job Title at Company"
            company = ""
            if " at " in title.lower():
                parts   = re.split(r" at ", title, maxsplit=1, flags=re.IGNORECASE)
                title   = parts[0].strip()
                company = parts[1].strip() if len(parts) > 1 else ""

            results.append({
                "id":          job_id(link, title, company),
                "title":       title,
                "company":     company,
                "location":    "Remote",
                "url":         link,
                "description": desc,
                "source":      "Working Nomads",
                "posted_at":   posted,
            })
            if len(results) >= 20:
                break

        status.update({"ok": True, "count": len(results)})
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except httpx.HTTPStatusError as e:
        status["error"] = f"HTTP {e.response.status_code}"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_startup_jobs(keywords: list[str]) -> tuple[list, dict]:
    """startup.jobs — uses their Atom/RSS feed (avoids JS rendering)."""
    status = {"source": "startup.jobs", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        query = "+".join(keywords[:3])
        # Their feed supports ?search= and returns Atom XML
        url   = f"https://startup.jobs/remote.rss?search={query}"
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(url, headers=BROWSER_HEADERS)
        soup  = _parse_feed(resp.text)
        items = soup.find_all("item") or soup.find_all("entry")
        for item in items[:20]:
            title_tag   = item.find("title")
            link_tag    = item.find("link")
            summary_tag = item.find("summary") or item.find("description") or item.find("content")
            pub_tag     = item.find("published") or item.find("pubdate") or item.find("pubDate")

            title  = title_tag.get_text(strip=True) if title_tag else ""
            href   = (link_tag.get("href") or link_tag.get_text(strip=True)) if link_tag else ""
            desc   = BeautifulSoup(summary_tag.get_text() if summary_tag else "", "html.parser").get_text()[:600]
            posted = pub_tag.get_text(strip=True)[:10] if pub_tag else ""

            # "Job Title — Company" is a common format in their feed
            company = ""
            for sep in (" — ", " - ", " at "):
                if sep.lower() in title.lower():
                    parts   = re.split(re.escape(sep), title, maxsplit=1, flags=re.IGNORECASE)
                    title   = parts[0].strip()
                    company = parts[1].strip() if len(parts) > 1 else ""
                    break

            if not title:
                continue
            results.append({
                "id":          job_id(href, title, company),
                "title":       title,
                "company":     company,
                "location":    "Remote",
                "url":         href,
                "description": desc,
                "source":      "startup.jobs",
                "posted_at":   posted,
            })
        if results:
            status.update({"ok": True, "count": len(results)})
        else:
            status["error"] = "No jobs in feed — try different keywords"
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_remoteok(keywords: list[str]) -> tuple[list, dict]:
    """
    RemoteOK public JSON API — replaces Hiring Cafe (which requires JS).
    Free, no key, returns rich JSON including tags.
    """
    status = {"source": "RemoteOK", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(
                "https://remoteok.com/api",
                headers={**BROWSER_HEADERS, "Accept": "application/json"},
            )
            resp.raise_for_status()
        jobs_raw = resp.json()
        # First element is a legal notice dict, skip it
        if jobs_raw and isinstance(jobs_raw[0], dict) and "legal" in jobs_raw[0]:
            jobs_raw = jobs_raw[1:]

        kw_lower = [k.lower() for k in keywords]
        for job in jobs_raw:
            if not isinstance(job, dict):
                continue
            title = job.get("position", "") or job.get("title", "")
            tags  = " ".join(job.get("tags", []))
            desc  = BeautifulSoup(job.get("description", ""), "html.parser").get_text()[:600]
            text  = f"{title} {tags} {desc}".lower()
            if not any(k in text for k in kw_lower):
                continue
            results.append({
                "id":          job_id(job.get("url", ""), title, job.get("company", "")),
                "title":       title,
                "company":     job.get("company", ""),
                "location":    "Remote",
                "url":         job.get("url", ""),
                "description": desc or tags,
                "source":      "RemoteOK",
                "posted_at":   str(job.get("date", ""))[:10],
            })
            if len(results) >= 20:
                break

        status.update({"ok": True, "count": len(results)})
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except httpx.HTTPStatusError as e:
        status["error"] = f"HTTP {e.response.status_code}"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_glassdoor(keywords: list[str]) -> tuple[list, dict]:
    """
    Glassdoor best-effort HTML scrape.
    Glassdoor aggressively blocks bots; results may be empty or blocked (403/CAPTCHA).
    """
    status = {"source": "Glassdoor", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        query = "%20".join(keywords[:3])
        url   = f"https://www.glassdoor.com/Job/jobs.htm?suggestCount=0&typedKeyword={query}&locT=C&locId=1&jobType="
        headers = {**BROWSER_HEADERS, "Referer": "https://www.google.com/"}
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(url, headers=headers)
            if resp.status_code in (403, 429):
                status["error"] = "Blocked by Glassdoor (CAPTCHA/bot detection) — try again later"
                return results, status
            soup = BeautifulSoup(resp.text, "html.parser")
            for card in soup.select("li.react-job-listing, [data-test='jobListing'], .jobCard")[:20]:
                title_el   = card.select_one("[data-test='job-title'], .job-title, h3")
                company_el = card.select_one("[data-test='employer-name'], .employer-name")
                link_el    = card.select_one("a[href*='/job-listing/']")
                location_el = card.select_one("[data-test='emp-location'], .location")

                title    = title_el.get_text(strip=True)    if title_el    else ""
                company  = company_el.get_text(strip=True)  if company_el  else ""
                location = location_el.get_text(strip=True) if location_el else ""
                href     = link_el["href"]                  if link_el     else ""

                if not title:
                    continue
                full_url = href if href.startswith("http") else f"https://www.glassdoor.com{href}"
                results.append({
                    "id":          job_id(full_url, title, company),
                    "title":       title,
                    "company":     company,
                    "location":    location or "Remote",
                    "url":         full_url,
                    "description": "",
                    "source":      "Glassdoor",
                    "posted_at":   "",
                })
        if results:
            status.update({"ok": True, "count": len(results)})
        else:
            status["error"] = "No jobs found — Glassdoor may have blocked the request"
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_gradcracker(keywords: list[str]) -> tuple[list, dict]:
    """Gradcracker — UK graduate & early-career jobs."""
    status = {"source": "Gradcracker", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        query = "%20".join(keywords[:3])
        url   = f"https://www.gradcracker.com/search/all-disciplines/jobs?q={query}&page=1"
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(url, headers=BROWSER_HEADERS)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Gradcracker wraps each listing in <div class="tw-..."> anchors
        # Try multiple selectors to be robust against layout changes
        cards = (
            soup.select("div.job-listing-item")
            or soup.select("[class*='job-listing']")
            or soup.select("[class*='opportunity']")
            or soup.select("article")
        )

        for card in cards[:20]:
            # Any <a> tag with an href pointing to /hub/ or /jobs/ is the job link
            link_el = (
                card.select_one("a[href*='/hub/']")
                or card.select_one("a[href*='/jobs/']")
                or card.select_one("a[href]")
            )
            title_el   = card.select_one("h2, h3, h4, [class*='title'], [class*='name']")
            company_el = card.select_one("[class*='company'], [class*='employer'], [class*='org']")
            desc_el    = card.select_one("p")

            title   = title_el.get_text(strip=True)      if title_el   else ""
            company = company_el.get_text(strip=True)    if company_el else ""
            href    = link_el["href"]                    if link_el    else ""
            desc    = desc_el.get_text(strip=True)[:400] if desc_el    else ""

            if not title and link_el:
                title = link_el.get_text(strip=True)
            if not title:
                continue

            full_url = href if href.startswith("http") else f"https://www.gradcracker.com{href}"
            results.append({
                "id":          job_id(full_url, title, company),
                "title":       title,
                "company":     company,
                "location":    "UK",
                "url":         full_url,
                "description": desc,
                "source":      "Gradcracker",
                "posted_at":   "",
            })

        if results:
            status.update({"ok": True, "count": len(results)})
        else:
            status["error"] = "No jobs parsed — Gradcracker may have updated their layout"
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


async def fetch_linkedin(keywords: list[str]) -> tuple[list, dict]:
    """
    LinkedIn best-effort scrape of their public job search.
    LinkedIn blocks most server-side requests. Results are often empty.
    For reliable LinkedIn jobs, paste individual job URLs into the Tracker.
    """
    status = {"source": "LinkedIn", "ok": False, "count": 0, "error": ""}
    results = []
    try:
        query = "%20".join(keywords[:3])
        url   = (
            f"https://www.linkedin.com/jobs/search/"
            f"?keywords={query}&location=Worldwide&f_WT=2&f_TPR=r86400"
        )
        headers = {**BROWSER_HEADERS, "Accept": "text/html"}
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as c:
            resp = await c.get(url, headers=headers)
            if resp.status_code in (429, 999):
                status["error"] = "Rate-limited by LinkedIn — paste individual job URLs into Tracker instead"
                return results, status
            soup = BeautifulSoup(resp.text, "html.parser")
            for card in soup.select("div.base-card, li.jobs-search-results__list-item")[:20]:
                title_el    = card.select_one(".base-search-card__title, h3.base-search-card__title")
                company_el  = card.select_one(".base-search-card__subtitle, h4.base-search-card__subtitle")
                location_el = card.select_one(".job-search-card__location")
                link_el     = card.select_one("a.base-card__full-link, a[href*='/jobs/view/']")

                title    = title_el.get_text(strip=True)    if title_el    else ""
                company  = company_el.get_text(strip=True)  if company_el  else ""
                location = location_el.get_text(strip=True) if location_el else ""
                href     = link_el["href"]                  if link_el     else ""

                if not title:
                    continue
                results.append({
                    "id":          job_id(href, title, company),
                    "title":       title,
                    "company":     company,
                    "location":    location,
                    "url":         href,
                    "description": "",
                    "source":      "LinkedIn",
                    "posted_at":   "",
                })
        if results:
            status.update({"ok": True, "count": len(results)})
        else:
            status["error"] = "No results — LinkedIn blocks most automated requests. Paste job URLs into Tracker."
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results, status


# ── Portal scanners — curated company lists on ATS platforms ────────────────
#
# These hit the public job-board APIs that Greenhouse, Lever, and Ashby expose
# for every company (no auth, no keys). Wellfound is best-effort HTML scrape
# — AngelList blocks most automation, same story as LinkedIn/Glassdoor.
#
# Each scanner takes an optional `companies` override so a caller can pass a
# bespoke list (e.g. user typed their own Greenhouse slugs in the UI).
# If omitted, the curated default from portal_companies.py is used.

from app.services.portal_companies import (
    GREENHOUSE_COMPANIES,
    LEVER_COMPANIES,
    ASHBY_COMPANIES,
    WELLFOUND_COMPANIES,
)


def _kw_match(title: str, desc: str, kw_lower: list[str]) -> bool:
    """Loose keyword filter for portal results. If no keywords, include all."""
    if not kw_lower:
        return True
    text = f"{title} {desc}".lower()
    return any(k in text for k in kw_lower)


# Bound concurrent HTTPS connections per portal fan-out so a long curated list
# (60+ Greenhouse boards) doesn't punish the event loop or trip rate limits.
PORTAL_CONCURRENCY = 10


def _bounded(sem: asyncio.Semaphore, coro_factory):
    async def _runner(*args, **kwargs):
        async with sem:
            return await coro_factory(*args, **kwargs)
    return _runner


async def fetch_greenhouse(
    keywords: list[str],
    companies: list[tuple[str, str]] | None = None,
) -> tuple[list, dict]:
    """Scan Greenhouse boards for a curated list of companies."""
    status = {"source": "Greenhouse", "ok": False, "count": 0, "error": ""}
    company_list = companies if companies is not None else GREENHOUSE_COMPANIES
    kw_lower = [k.lower() for k in keywords] if keywords else []
    results: list = []

    async def _one(client: httpx.AsyncClient, name: str, slug: str) -> list:
        url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
        try:
            r = await client.get(url, headers=BROWSER_HEADERS)
            if r.status_code != 200:
                return []
            out = []
            for j in r.json().get("jobs", []):
                title = j.get("title", "")
                html = j.get("content", "") or ""
                desc = BeautifulSoup(html, "html.parser").get_text()[:800] if html else ""
                if not _kw_match(title, desc, kw_lower):
                    continue
                loc = (j.get("location") or {}).get("name", "") or ""
                out.append({
                    "id":          job_id(j.get("absolute_url", ""), title, name),
                    "title":       title,
                    "company":     name,
                    "location":    loc,
                    "url":         j.get("absolute_url", ""),
                    "description": desc,
                    "source":      f"Greenhouse · {name}",
                    "posted_at":   str(j.get("updated_at", ""))[:10],
                })
            return out
        except Exception:
            return []

    try:
        portal_timeout = httpx.Timeout(connect=3.0, read=12.0, write=5.0, pool=5.0)
        sem = asyncio.Semaphore(PORTAL_CONCURRENCY)
        bounded = _bounded(sem, _one)
        async with httpx.AsyncClient(timeout=portal_timeout, follow_redirects=True) as c:
            batches = await asyncio.gather(*[bounded(c, n, s) for n, s in company_list])
        for b in batches:
            results.extend(b)
        results = results[:60]
        status.update({"ok": True, "count": len(results)})
        if not results:
            status["error"] = f"Scanned {len(company_list)} Greenhouse boards — no matches for your keywords"
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results[:60], status


async def fetch_lever(
    keywords: list[str],
    companies: list[tuple[str, str]] | None = None,
) -> tuple[list, dict]:
    """Scan Lever boards for a curated list of companies."""
    status = {"source": "Lever", "ok": False, "count": 0, "error": ""}
    company_list = companies if companies is not None else LEVER_COMPANIES
    kw_lower = [k.lower() for k in keywords] if keywords else []
    results: list = []

    async def _one(client: httpx.AsyncClient, name: str, slug: str) -> list:
        url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
        try:
            r = await client.get(url, headers=BROWSER_HEADERS)
            if r.status_code != 200:
                return []
            out = []
            for j in r.json():
                title = j.get("text", "") or ""
                desc  = (j.get("descriptionPlain") or j.get("description") or "")[:800]
                if not _kw_match(title, desc, kw_lower):
                    continue
                cats = j.get("categories") or {}
                out.append({
                    "id":          job_id(j.get("hostedUrl", ""), title, name),
                    "title":       title,
                    "company":     name,
                    "location":    cats.get("location", "") or "",
                    "url":         j.get("hostedUrl", ""),
                    "description": desc,
                    "source":      f"Lever · {name}",
                    "posted_at":   "",
                })
            return out
        except Exception:
            return []

    try:
        portal_timeout = httpx.Timeout(connect=3.0, read=12.0, write=5.0, pool=5.0)
        sem = asyncio.Semaphore(PORTAL_CONCURRENCY)
        bounded = _bounded(sem, _one)
        async with httpx.AsyncClient(timeout=portal_timeout, follow_redirects=True) as c:
            batches = await asyncio.gather(*[bounded(c, n, s) for n, s in company_list])
        for b in batches:
            results.extend(b)
        results = results[:60]
        status.update({"ok": True, "count": len(results)})
        if not results:
            status["error"] = f"Scanned {len(company_list)} Lever boards — no matches for your keywords"
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results[:60], status


async def fetch_ashby(
    keywords: list[str],
    companies: list[tuple[str, str]] | None = None,
) -> tuple[list, dict]:
    """Scan Ashby boards for a curated list of companies (OpenAI, Retool, n8n…)."""
    status = {"source": "Ashby", "ok": False, "count": 0, "error": ""}
    company_list = companies if companies is not None else ASHBY_COMPANIES
    kw_lower = [k.lower() for k in keywords] if keywords else []
    results: list = []

    async def _one(client: httpx.AsyncClient, name: str, slug: str) -> list:
        url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=false"
        try:
            r = await client.get(url, headers=BROWSER_HEADERS)
            if r.status_code != 200:
                return []
            data = r.json() or {}
            out = []
            for j in data.get("jobs", []):
                title = j.get("title", "") or ""
                desc  = (j.get("descriptionPlain") or "")[:800]
                if not desc:
                    html = j.get("descriptionHtml", "") or ""
                    desc = BeautifulSoup(html, "html.parser").get_text()[:800] if html else ""
                if not _kw_match(title, desc, kw_lower):
                    continue
                out.append({
                    "id":          job_id(j.get("jobUrl", ""), title, name),
                    "title":       title,
                    "company":     name,
                    "location":    j.get("locationName") or j.get("location") or "",
                    "url":         j.get("jobUrl", ""),
                    "description": desc,
                    "source":      f"Ashby · {name}",
                    "posted_at":   str(j.get("publishedAt", ""))[:10],
                })
            return out
        except Exception:
            return []

    try:
        portal_timeout = httpx.Timeout(connect=3.0, read=12.0, write=5.0, pool=5.0)
        sem = asyncio.Semaphore(PORTAL_CONCURRENCY)
        bounded = _bounded(sem, _one)
        async with httpx.AsyncClient(timeout=portal_timeout, follow_redirects=True) as c:
            batches = await asyncio.gather(*[bounded(c, n, s) for n, s in company_list])
        for b in batches:
            results.extend(b)
        results = results[:60]
        status.update({"ok": True, "count": len(results)})
        if not results:
            status["error"] = f"Scanned {len(company_list)} Ashby boards — no matches for your keywords"
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results[:60], status


async def fetch_wellfound(
    keywords: list[str],
    companies: list[tuple[str, str]] | None = None,
) -> tuple[list, dict]:
    """
    Best-effort Wellfound (AngelList) company-page scrape. Wellfound blocks
    most server-side requests — results are often empty, same as LinkedIn.
    Kept in the scanner for completeness; use individual URLs in Tracker if blocked.
    """
    status = {"source": "Wellfound", "ok": False, "count": 0, "error": ""}
    company_list = companies if companies is not None else WELLFOUND_COMPANIES
    kw_lower = [k.lower() for k in keywords] if keywords else []
    results: list = []

    async def _one(client: httpx.AsyncClient, name: str, slug: str) -> list:
        url = f"https://wellfound.com/company/{slug}/jobs"
        try:
            r = await client.get(url, headers={**BROWSER_HEADERS, "Referer": "https://www.google.com/"})
            if r.status_code in (403, 429):
                return []
            soup = BeautifulSoup(r.text, "html.parser")
            out = []
            for card in soup.select("div[data-test='JobSearchCard'], a[href*='/jobs/']")[:10]:
                title_el = card.select_one("h3, [class*='title']")
                title = title_el.get_text(strip=True) if title_el else ""
                if not title:
                    continue
                href = card.get("href") if card.name == "a" else ""
                if not href:
                    link = card.select_one("a[href*='/jobs/']")
                    href = link.get("href", "") if link else ""
                if href and not href.startswith("http"):
                    href = f"https://wellfound.com{href}"
                desc_el = card.select_one("p, [class*='desc']")
                desc = desc_el.get_text(strip=True)[:600] if desc_el else ""
                if not _kw_match(title, desc, kw_lower):
                    continue
                out.append({
                    "id":          job_id(href, title, name),
                    "title":       title,
                    "company":     name,
                    "location":    "",
                    "url":         href,
                    "description": desc,
                    "source":      f"Wellfound · {name}",
                    "posted_at":   "",
                })
            return out
        except Exception:
            return []

    try:
        sem = asyncio.Semaphore(PORTAL_CONCURRENCY)
        bounded = _bounded(sem, _one)
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            batches = await asyncio.gather(*[bounded(c, n, s) for n, s in company_list])
        for b in batches:
            results.extend(b)
        results = results[:60]
        if results:
            status.update({"ok": True, "count": len(results)})
        else:
            status["error"] = "Wellfound blocks automated scraping — paste job URLs into Tracker instead"
    except httpx.TimeoutException:
        status["error"] = "Request timed out"
    except Exception as e:
        status["error"] = str(e)[:80]
    return results[:60], status


# ── Registry ──────────────────────────────────────────────────────────────────

# Portal sources scan curated company lists on ATS platforms. They accept an
# optional `companies` kwarg so callers can override the default curated list.
PORTAL_SOURCE_FNS = {
    "greenhouse": fetch_greenhouse,
    "lever":      fetch_lever,
    "ashby":      fetch_ashby,
    "wellfound":  fetch_wellfound,
}

SOURCE_FNS = {
    "remotive":       fetch_remotive,
    "weworkremotely": fetch_weworkremotely,
    "arbeitnow":      fetch_arbeitnow,
    "adzuna":         fetch_adzuna,
    "indeed":         fetch_indeed_rss,
    "workingnomads":  fetch_working_nomads,
    "startupjobs":    fetch_startup_jobs,
    "remoteok":       fetch_remoteok,
    "glassdoor":      fetch_glassdoor,
    "gradcracker":    fetch_gradcracker,
    "linkedin":       fetch_linkedin,
    **PORTAL_SOURCE_FNS,
}


# ── Orchestrator ──────────────────────────────────────────────────────────────

async def discover_jobs(
    profile_name: str,
    profile_skills: list,
    profile_titles: list,
    role_family: str,
    sources: list[str],
    custom_keywords: list[str] = None,
    country: str = "global",
    portal_companies: dict[str, list[tuple[str, str]]] | None = None,
) -> dict:
    # Use custom keywords if provided, otherwise derive from profile
    if custom_keywords:
        keywords = custom_keywords
    else:
        # Use full titles instead of just first word, plus top 5 skills
        keywords = list(dict.fromkeys(
            profile_titles[:3] + profile_skills[:5]
        ))

    # Portal sources accept an optional `companies=` kwarg; everything else
    # takes plain (keywords) — dispatch accordingly.
    tasks = {}
    for src in sources:
        if src not in SOURCE_FNS:
            continue
        if src in PORTAL_SOURCE_FNS:
            override = (portal_companies or {}).get(src)
            tasks[src] = SOURCE_FNS[src](keywords, override)
        else:
            tasks[src] = SOURCE_FNS[src](keywords)

    gathered = await asyncio.gather(*tasks.values(), return_exceptions=True)

    all_jobs, statuses, seen = [], [], set()
    pindex = _profile_skill_index(profile_skills)  # Build once, reuse for every job

    for src, result in zip(tasks.keys(), gathered):
        if isinstance(result, Exception):
            statuses.append({"source": src, "ok": False, "count": 0, "error": str(result)[:80]})
            continue

        jobs, stat = result
        # Filter by country before processing
        jobs = _filter_by_country(jobs, country)
        statuses.append(stat)

        for job in jobs:
            if job["id"] not in seen and job.get("title"):
                seen.add(job["id"])
                job["match_score"] = quick_score(
                    job["title"], job["description"],
                    profile_skills, profile_titles,
                    custom_keywords=custom_keywords,
                )
                # Calculate skill gaps using the pre-built profile index
                job["skill_gaps"] = calculate_skill_gaps(
                    job["title"], job.get("description", ""),
                    profile_skills, profile_index=pindex,
                )
                job["profile_name"] = profile_name
                all_jobs.append(job)

    all_jobs.sort(key=lambda j: j["match_score"], reverse=True)
    return {"jobs": all_jobs[:60], "statuses": statuses, "total": len(all_jobs)}
