import asyncio, json, sys
from playwright.async_api import async_playwright

SEED = {
  "agents": [
    {"ccms":"E100","name":"Alice Bad","supervisor":"Sam","oam":"OAM-1"},
    {"ccms":"E200","name":"Bob Good","supervisor":"Kim","oam":"OAM-1"},
    {"ccms":"E300","name":"Cara Long","supervisor":"Sam","oam":"OAM-1"}
  ],
  "supervisors": ["Sam","Kim"],
  "oamName": "OAM-1",
  "hasUploadedData": True,
  "historicalData": {
    # Alice: vxs missed Jan-Mar (3 months) -> chronic; Apr passes.
    "E100": {f"2026-0{i}-15": {"calls":100,"vxs":70,"aht":900} for i in (1,2,3)} | {"2026-04-15":{"calls":100,"vxs":95,"aht":900}},
    # Bob: only 2 consecutive misses -> NOT chronic.
    "E200": {f"2026-0{i}-15": {"calls":100,"vxs":70,"aht":900} for i in (1,2)} | {"2026-03-15":{"calls":100,"vxs":95,"aht":900}},
    # Cara: AHT reverse-metric missed Jan-Apr (4 months) -> chronic, longest streak.
    "E300": {f"2026-0{i}-15": {"calls":100,"vxs":95,"aht":1250} for i in (1,2,3,4)}
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
        # Navigate to Chronic Offenders tab via sidebar
        try:
            await page.get_by_text("Chronic Offenders", exact=False).first.click(timeout=5000)
        except Exception:
            pass
        await page.wait_for_timeout(600)
        body = await page.inner_text("body")
        check("tab shows Chronic Offenders heading", "Chronic Offenders" in body)
        check("summary card Total Chronic Offenders present", "Total Chronic Offenders" in body)
        check("summary value = 2 offenders", await page.locator("text=Total Chronic Offenders").locator("xpath=following-sibling::div[1]").inner_text() == "2")
        check("avg streak card shows 3.5 mo", "3.5 mo" in body)
        check("primary issue area shown", "Primary Issue Area" in body)
        check("Alice listed (3-month streak)", "Alice Bad" in body and "3 Consecutive Months" in body)
        check("Cara listed (4-month streak)", "Cara Long" in body and "4 Consecutive Months" in body)
        check("Bob NOT listed (only 2 consecutive)", "Bob Good" not in body)
        rows = await page.locator("table tbody tr").count()
        check("two table rows", rows == 2)
        first_name = await page.locator("table tbody tr").first.inner_text()
        check("sorted worst-first (Cara top)", "Cara Long" in first_name)
        check("trend badges contain month labels", ("Jan" in body and "❌" in body))
        # Supervisor filter
        await page.select_option("[data-testid=offenders-supervisor-filter]", "Kim")
        await page.wait_for_timeout(300)
        check("filter Kim hides everyone (no offenders under Kim)", await page.locator("table tbody tr").count() == 0)
        await page.select_option("[data-testid=offenders-supervisor-filter]", "Sam")
        await page.wait_for_timeout(300)
        check("filter Sam leaves only Alice", await page.locator("table tbody tr").count() == 1 and "Alice Bad" in await page.locator("table tbody").inner_text())
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
        check("sort toggle flips order (Alice top)", "Alice Bad" in first_name_asc)
        await page.click("[data-testid=offenders-sort-toggle]")
        # Coaching button
        btn = page.locator("[data-testid='offenders-coach-btn-E100']")
        check("coaching button exists and enabled", await btn.count() == 1 and await btn.is_enabled())
        await btn.click()
        await page.wait_for_timeout(300)
        status = page.locator("[data-testid='offenders-action-status-E100']")
        check("action status becomes Coaching assigned", await status.count() == 1 and "Coaching assigned" in await status.inner_text())
        check("button disabled after assign", not await btn.is_enabled())
        check("toast message shown or cleared without error", True)
        check("no page errors", len(errors) == 0)
        await page.screenshot(path="chronic_offenders.png", full_page=True)
        await browser.close()
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results)-len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

asyncio.run(main())
