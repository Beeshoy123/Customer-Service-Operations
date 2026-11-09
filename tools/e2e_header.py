# e2e_header.py: real-browser check of the workspace header (greeting, italic
# accent word, "need attention" chip). FAKE data only.
# Run: npm run dev (port 5173), then: python3 tools/e2e_header.py
import asyncio, json, re, sys, time, datetime
from playwright.async_api import async_playwright

def seed(agents, history):
    return {"agents": agents, "supervisors": ["Sam", "Kim"], "oamName": "Team A",
            "hasUploadedData": True, "historicalData": history}

SMALL_AGENTS = [{"ccms": "E100", "name": "Alice Bad", "supervisor": "Sam", "oam": "Team A"},
                {"ccms": "E200", "name": "Bob Good", "supervisor": "Kim", "oam": "Team A"},
                {"ccms": "E300", "name": "Cara Long", "supervisor": "Sam", "oam": "Team A"}]
SMALL = seed(SMALL_AGENTS, {
    "E100": {f"2026-0{i}-15": {"calls": 100, "vxs": 70, "aht": 900} for i in (1, 2, 3)},
    "E200": {f"2026-0{i}-15": {"calls": 100, "vxs": 70, "aht": 900} for i in (1, 2)},
    "E300": {f"2026-0{i}-15": {"calls": 100, "vxs": 95, "aht": 1250} for i in (1, 2, 3, 4)}})
NONE = seed(SMALL_AGENTS, {"E200": {f"2026-0{i}-15": {"calls": 100, "vxs": 70, "aht": 900} for i in (1, 2)}})

def big():
    agents, hist = [], {}
    for n in range(3000):
        cid = f"F{n:05d}"
        agents.append({"ccms": cid, "name": f"Fake Agent {n}", "supervisor": "Sam", "oam": "Team A"})
        bad = n % 10 == 0   # 300 agents miss VXS for 12 months
        hist[cid] = {f"2026-{m:02d}-15": {"calls": 100, "vxs": 70 if bad else 95, "aht": 900} for m in range(1, 13)}
    return seed(agents, hist)

async def load(page, data):
    await page.goto("http://localhost:5173", wait_until="networkidle")
    await page.evaluate("""(d) => {
        localStorage.setItem('customer-service-dashboard-state-v1', JSON.stringify(d));
        localStorage.setItem('customer-service-dashboard-view-v1', JSON.stringify({selectedMonth:'all'}));
    }""", data)
    t = time.time()
    await page.reload(wait_until="networkidle")
    await page.wait_for_selector(".workspace-title", timeout=60000)
    return time.time() - t

async def main():
    res = []
    def check(name, ok, extra=""):
        res.append(ok); print(("PASS" if ok else "FAIL"), name, extra)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width": 1366, "height": 768})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await load(page, SMALL)
        now = datetime.datetime.now()
        greet = (await page.inner_text(".workspace-greeting")).replace("\u00b7", "|")
        hr = now.hour
        want = "Good morning" if hr < 12 else "Good afternoon" if hr < 18 else "Good evening"
        check("greeting matches the clock", greet.startswith(want), greet)
        check("date shown day-first", f"{now.day} {now.strftime('%B')} {now.year}" in greet, greet)
        em = await page.eval_on_selector(".workspace-title-accent", "e => [e.textContent, getComputedStyle(e).fontStyle, getComputedStyle(e).fontFamily]")
        check("accent word 'Floor' is italic serif", em[0] == "Floor" and em[1] == "italic" and "Georgia" in em[2], str(em))
        check("title reads 'Team A Floor'", (await page.inner_text(".workspace-title")).strip() == "Team A Floor")
        chip = await page.inner_text(".attention-chip")
        check("attention chip counts 2 chronic agents (Alice, Cara; not Bob)", chip == "2 agents need attention", chip)
        # Same number as before this change: agents active on the selected date / all agents.
        check("headcount chip unchanged (1 / 3)", "1 / 3" in await page.inner_text(".headcount-chip"))
        check("date arrows and search still there", await page.locator(".date-step-btn").count() == 2 and await page.locator(".workspace-controls .search-input").count() == 1)
        await page.fill(".workspace-controls .search-input", "Alice")
        await page.wait_for_timeout(700)
        check("search still filters (Filtered chip shows)", await page.locator(".filtered-chip").count() == 1)
        await page.fill(".workspace-controls .search-input", "")
        await page.wait_for_timeout(900)
        ov = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        check("no sideways overflow at 1366x768", not ov)
        await page.screenshot(path="/tmp/header_1366.png")
        await page.set_viewport_size({"width": 390, "height": 800})
        await page.wait_for_timeout(300)
        ov = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        check("no sideways overflow at 390 wide", not ov)
        await page.screenshot(path="/tmp/header_390.png")
        await page.set_viewport_size({"width": 1366, "height": 768})
        # header survives tab switching
        for label in ("Chronic Offenders", "Team Roster"):
            try:
                await page.get_by_text(label, exact=False).first.click(timeout=4000)
                await page.wait_for_timeout(400)
                check(f"header still shown on tab '{label}'", await page.locator(".workspace-greeting").count() == 1)
            except Exception as e:
                check(f"tab '{label}' click", False, str(e)[:80])
        # no chronic agents -> no chip, greeting stays
        await load(page, NONE)
        check("no chronic agents: no attention chip (not '0 agents')", await page.locator(".attention-chip").count() == 0)
        check("no chronic agents: greeting still shown", await page.locator(".workspace-greeting").count() == 1)
        # scale
        secs = await load(page, big())
        chip = await page.inner_text(".attention-chip")
        check("3,000 agents x 12 months: chip says 300", chip == "300 agents need attention", f"{chip}; reload to header {secs:.1f}s")
        check("no page errors", not errs, str(errs[:2]))
        await b.close()
    print(f"{sum(res)}/{len(res)} passed")
    sys.exit(0 if all(res) else 1)
asyncio.run(main())
