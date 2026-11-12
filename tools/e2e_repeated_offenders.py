import asyncio, json, sys
from playwright.async_api import async_playwright

# e2e_repeated_offenders.py: real-browser check of the Repeated Offenders tab. FAKE data only.
# Rule: missed target in 2+ of the LATEST 3 months loaded (not necessarily in a row).
# Run: npm run dev -- --port 5173 (leave running), then: python3 tools/e2e_repeated_offenders.py
# Months loaded: Jan-Apr, so the window is Feb, Mar, Apr.
SEED = {
  "agents": [
    {"ccms":"E100","name":"Alice Bad","supervisor":"Sam","oam":"OAM-1"},
    {"ccms":"E200","name":"Bob Good","supervisor":"Kim","oam":"OAM-1"},
    {"ccms":"E300","name":"Cara Long","supervisor":"Sam","oam":"OAM-1"},
    {"ccms":"E400","name":"Dina Gap","supervisor":"Kim","oam":"OAM-1"}
  ],
  "supervisors": ["Sam","Kim"],
  "oamName": "OAM-1",
  "hasUploadedData": True,
  "historicalData": {
    # Alice: vxs Jan miss, Feb miss, Mar miss, Apr pass -> window Feb,Mar,Apr = miss, miss, pass = 2 of 3.
    "E100": {f"2026-0{i}-15": {"calls":100,"vxs":70,"aht":900} for i in (1,2,3)} | {"2026-04-15":{"calls":100,"vxs":95,"aht":900}},
    # Bob: vxs Jan miss, Feb pass, Mar miss, Apr pass -> window = pass, miss, pass = 1 of 3 -> NOT flagged
    # (two misses in all, but one is older than the window).
    "E200": {"2026-01-15":{"calls":100,"vxs":70,"aht":900}, "2026-02-15":{"calls":100,"vxs":95,"aht":900},
             "2026-03-15":{"calls":100,"vxs":70,"aht":900}, "2026-04-15":{"calls":100,"vxs":95,"aht":900}},
    # Cara: AHT (reverse metric) missed Jan-Apr -> window = 3 of 3.
    "E300": {f"2026-0{i}-15": {"calls":100,"vxs":95,"aht":1250} for i in (1,2,3,4)},
    # Dina: vxs Jan pass, Feb miss, Mar pass, Apr miss -> window = miss, pass, miss = 2 of 3 (NOT back-to-back).
    "E400": {"2026-01-15":{"calls":100,"vxs":95,"aht":900}, "2026-02-15":{"calls":100,"vxs":70,"aht":900},
             "2026-03-15":{"calls":100,"vxs":95,"aht":900}, "2026-04-15":{"calls":100,"vxs":70,"aht":900}}
  }
}

async def main():
    results = []
    def check(name, ok): results.append((name, ok)); print(("PASS" if ok else "FAIL"), name)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://localhost:5173", wait_until="networkidle")
        await page.evaluate(f"""() => {{
            localStorage.setItem('customer-service-dashboard-state-v1', JSON.stringify({json.dumps(SEED)}));
            localStorage.setItem('customer-service-dashboard-view-v1', JSON.stringify({{selectedMonth:'all'}}));
        }}""")
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(800)
        # Navigate to the Repeated Offenders tab via the sidebar
        try:
            await page.get_by_text("Repeated Offenders", exact=False).first.click(timeout=5000)
        except Exception:
            pass
        await page.wait_for_timeout(600)
        body = await page.inner_text("body")
        check("the word 'Chronic' appears nowhere", "chronic" not in body.lower())
        check("tab shows Repeated Offenders heading", "Repeated Offenders" in body)
        check("summary card Total Repeated Offenders present", "total repeated offenders" in body.lower())  # card titles are CSS uppercase
        check("summary value = 3 offenders (Alice, Cara, Dina)", await page.locator("text=Total Repeated Offenders").locator("xpath=following-sibling::div[1]").inner_text() == "3")
        check("Missed Every Month card = 1 (Cara)", await page.locator("text=Missed Every Month").locator("xpath=following-sibling::div[1]").inner_text() == "1")
        check("primary issue area shown", "primary issue area" in body.lower())
        check("Alice listed (2 of 3 months)", "Alice Bad" in body)
        check("Cara listed (3 of 3 months)", "Cara Long" in body and "3 of 3 months" in body)
        check("Dina listed (miss, pass, miss = 2 of 3, not back-to-back)", "Dina Gap" in body)
        check("two rows say '2 of 3 months' (Alice, Dina)", body.count("2 of 3 months") == 2)
        check("Bob NOT listed (1 miss in the latest 3 months)", "Bob Good" not in body)
        rows = await page.locator("table tbody tr").count()
        check("three table rows", rows == 3)
        first_name = await page.locator("table tbody tr").first.inner_text()
        check("most misses first (Cara top)", "Cara Long" in first_name)
        check("month badges show misses and passes", ("Feb" in body and "❌" in body and "✅" in body))
        # Supervisor filter
        await page.select_option("[data-testid=offenders-supervisor-filter]", "Kim")
        await page.wait_for_timeout(300)
        check("filter Kim leaves only Dina", await page.locator("table tbody tr").count() == 1 and "Dina Gap" in await page.locator("table tbody").inner_text())
        await page.select_option("[data-testid=offenders-supervisor-filter]", "Sam")
        await page.wait_for_timeout(300)
        check("filter Sam leaves Alice and Cara", await page.locator("table tbody tr").count() == 2 and "Alice Bad" in await page.locator("table tbody").inner_text())
        await page.select_option("[data-testid=offenders-supervisor-filter]", "all")
        # KPI filter
        await page.select_option("[data-testid=offenders-kpi-filter]", "AHT")
        await page.wait_for_timeout(300)
        check("KPI filter AHT leaves only Cara", await page.locator("table tbody tr").count() == 1 and "Cara Long" in await page.locator("table tbody").inner_text())
        await page.select_option("[data-testid=offenders-kpi-filter]", "all")
        # Sort toggle
        await page.click("[data-testid=offenders-sort-toggle]")
        await page.wait_for_timeout(300)
        first_name_asc = await page.locator("table tbody tr").first.inner_text()
        check("sort toggle flips order (Dina top, Cara last)", "Dina Gap" in first_name_asc)
        await page.click("[data-testid=offenders-sort-toggle]")
        # Settings menu: the old tick-list is gone
        await page.locator("[aria-label=\"Toggle metrics\"]").first.click()
        await page.wait_for_timeout(300)
        menu = await page.inner_text(".column-menu-dropdown")
        check("Settings menu has no Repeated Offenders tick-list", "Repeated Offenders" not in menu and "consecutive" not in menu.lower())
        await page.keyboard.press("Escape")
        await page.mouse.click(5, 5)
        await page.wait_for_timeout(200)
        check("no page errors before the coaching button", len(errors) == 0)
        # Coaching button
        btn = page.locator("[data-testid='offenders-coach-btn-E100']")
        check("coaching button exists and enabled", await btn.count() == 1 and await btn.is_enabled())
        await btn.click()
        await page.wait_for_timeout(300)
        status = page.locator("[data-testid='offenders-action-status-E100']")
        check("action status becomes Coaching assigned", await status.count() == 1 and "Coaching assigned" in await status.inner_text())
        check("button disabled after assign", not await btn.is_enabled())
        check("no page errors after the coaching button (known bug X9 if this fails)", len(errors) == 0)
        await page.screenshot(path="/tmp/repeated_offenders.png", full_page=True)
        await browser.close()
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results)-len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

asyncio.run(main())
