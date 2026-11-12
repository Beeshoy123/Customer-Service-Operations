"""End-to-end check for the header's + Add workbook button (FAKE data only).

Loads one tiny workbook on the landing page, then adds a second one from the header and
checks that nothing is reset: the dashboard stays open and both months end up in the
timeframe menu. An unsupported file is ignored.
Run: npm run dev -- --port 5173, then python3 tools/e2e_add_workbook.py
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
FAILURES = []

def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  ({detail})" if detail else ""))
    if not cond:
        FAILURES.append(name)

HEAD = "Date,Agent Name,AHT,Calls,Resolve Total Contacts\n"
SEPT = HEAD + "2026-09-01,Alice,312,45,30\n2026-09-02,Bob,298,52,41\n"
OCT = HEAD + "2026-10-01,Alice,300,40,35\n2026-10-02,Carl,310,50,20\n"
NOV = "Date,Agent Name,AHT,Calls Handle Time,Resolve Total Contacts\n2026-11-01,Alice,305,42,33\n2026-11-02,Bob,299,48,40\n"
PROFILE = {"accountName": "Verizon Consumer",
           "kpi": {"data": {"matchedColumns": ["agent name", "aht", "calls handled", "resolve total contacts"]}}}

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1366, "height": 768})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="networkidle")
    page.evaluate("""() => new Promise((r) => { const q = indexedDB.deleteDatabase('cs-ops-data'); q.onsuccess = q.onerror = q.onblocked = () => r(); })""")
    page.evaluate("""(pr) => { localStorage.clear(); localStorage.setItem('cs-ops:account-profile:' + pr.accountName, JSON.stringify(pr)); }""", PROFILE)
    page.reload(wait_until="networkidle")

    page.set_input_files("input[type='file']", {"name": "sept.csv", "mimeType": "text/csv", "buffer": SEPT.encode()})
    page.wait_for_selector(".floor-header", timeout=30000)
    page.wait_for_timeout(800)
    def months():
        page.locator('[aria-label="Timeframe filter"]').click(); page.wait_for_timeout(350)
        t = page.locator(".column-menu-dropdown").inner_text()
        page.keyboard.press("Escape"); page.mouse.click(5, 400); page.wait_for_timeout(200)
        return t
    m1 = months()
    check("after the first workbook only September is loaded", "September" in m1 and "October" not in m1, m1[:120].replace("\n", " | "))
    page.set_input_files(".header-tools input[type=file]", {"name": "notes.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4"})
    page.wait_for_timeout(500)
    check("an unsupported file is ignored (dashboard still open)", page.locator(".floor-header").count() == 1)
    check("add button explains the last import in its tooltip", "last import" in (page.locator('[aria-label="Add workbook"]').get_attribute("title") or ""))

    # Add the second workbook from the header
    page.set_input_files(".header-tools input[type=file]", {"name": "oct.csv", "mimeType": "text/csv", "buffer": OCT.encode()})
    page.wait_for_timeout(2500)
    check("dashboard stayed open (no return to the landing page)", page.locator(".floor-header").count() == 1 and page.locator(".kpi-switch-card").count() == 1)
    menu = months()
    check("timeframe menu lists both months after adding (September and October)", "September" in menu and "October" in menu, menu[:160].replace("\n", " | "))

    # A workbook with a column the app does not know opens the review screen on top, in place
    page.set_input_files(".header-tools input[type=file]", {"name": "nov.csv", "mimeType": "text/csv", "buffer": NOV.encode()})
    try:
        page.wait_for_selector(".import-review-overlay", timeout=20000)
        shown = True
    except Exception:
        shown = False
    check("a new unknown column opens the review screen over the dashboard", shown)
    if shown:
        page.locator(".import-review-overlay select").filter(has=page.locator("option", has_text="Ignore this column")).first.select_option(label="Ignore this column")
        page.get_by_role("button", name="Continue with answers").first.click()
        page.wait_for_timeout(3000)
        check("after answering, the overlay closes and November is added", page.locator(".import-review-overlay").count() == 0 and "November" in months(), "")
    check("no uncaught page errors", not errors, "; ".join(errors)[:200])
    page.screenshot(path="/tmp/add_workbook.png")
    browser.close()

print(f"\n{'ALL CHECKS PASSED' if not FAILURES else str(len(FAILURES)) + ' FAILED'}")
