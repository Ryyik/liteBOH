"""Test data management UI - take screenshots of all main sections."""
from playwright.sync_api import sync_playwright

SECTIONS = [
    ("overview", "http://localhost:5173/admin/data-management"),
    ("data", "http://localhost:5173/admin/data-management?section=data"),
    ("api-keys", "http://localhost:5173/admin/api-keys"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []

    # Capture console errors
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))

    for name, url in SECTIONS:
        print(f"\n=== {name} ===")
        try:
            page.goto(url, wait_until="networkidle", timeout=15000)
            page.wait_for_timeout(800)
            path = f"/tmp/dm-{name}.png"
            page.screenshot(path=path, full_page=False)
            print(f"  Screenshot: {path}")
            print(f"  Final URL: {page.url}")
        except Exception as e:
            print(f"  ERROR: {e}")

    if errors:
        print("\n=== Console / Page Errors ===")
        for err in errors[:30]:
            print(f"  {err}")
    else:
        print("\n=== No console errors ===")

    browser.close()
