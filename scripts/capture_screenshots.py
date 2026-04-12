"""
Capture vibrant marketing screenshots of every major page in the app and save
them under docs/screenshots/. Used by README image gallery.

Run via:  py -3.11 scripts/capture_screenshots.py
Requires: playwright (chromium installed via `playwright install chromium`)
Assumes:  frontend dev server on http://localhost:3000 and backend on :8000.
"""
from __future__ import annotations

from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("dashboard.png",   "/",         3000),
    ("jobs.png",        "/jobs",     3000),
    ("resumes.png",     "/resumes",  3000),
    ("prep.png",        "/prep",     3000),
    ("settings.png",    "/settings", 3000),
]


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,  # retina output
        )
        page = ctx.new_page()

        for filename, route, settle_ms in PAGES:
            url = f"http://localhost:3000{route}"
            print(f"-> {url}")
            page.goto(url, wait_until="networkidle", timeout=30_000)
            page.wait_for_timeout(settle_ms)
            target = OUT / filename
            page.screenshot(path=str(target), full_page=True)
            print(f"   saved {target.relative_to(ROOT)}")

        # Discover tab — sub-view of the Jobs page
        print("-> /jobs (Discover tab)")
        page.goto("http://localhost:3000/jobs", wait_until="networkidle", timeout=30_000)
        page.wait_for_timeout(2000)
        try:
            page.get_by_role("button", name="Discover").click(timeout=5000)
        except Exception:
            page.get_by_text("Discover", exact=True).first.click(timeout=5000)
        page.wait_for_timeout(2500)
        page.screenshot(path=str(OUT / "discover.png"), full_page=True)
        print("   saved docs/screenshots/discover.png")

        browser.close()


if __name__ == "__main__":
    main()
