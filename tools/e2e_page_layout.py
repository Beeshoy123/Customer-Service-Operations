# e2e_page_layout.py: real-browser check of the locked page layout (step 3 of
# docs/frontend-design.md). FAKE data only.
# Run: npm run dev -- --port 5173, then: python3 tools/e2e_page_layout.py
# Checks at 1366x768, 1920x1080 and 1024x768: the page never scrolls, the workspace
# does not scroll, the Team Roster table scrolls inside its own box with its header
# row sticking, every tab opens inside the panel with no sideways overflow.
import asyncio
from playwright.async_api import async_playwright

def seed(n_sup=14, per=3, months=3):
    agents, hist = [], {}
    for s in range(n_sup):
        for k in range(per):
            cid = f"F{s:02d}{k}"
            agents.append({"ccms": cid, "name": f"Fake Agent {s}-{k}", "supervisor": f"Sup {s:02d}", "oam": "Team A"})
            hist[cid] = {f"2026-{m:02d}-{d:02d}": {"calls": 80 + s, "vxs": 55 + (s * 3 + k) % 45, "aht": 700 + s * 12,
                         "resolve2hr": 70, "resolve3d": 85, "handoffs": 2} for m in range(1, months + 1) for d in (5, 15, 25)}
    return {"agents": agents, "supervisors": [f"Sup {s:02d}" for s in range(n_sup)], "oamName": "Team A",
            "hasUploadedData": True, "historicalData": hist}

STATE = """() => ({
  docH: document.documentElement.scrollHeight, winH: innerHeight,
  sw: document.documentElement.scrollWidth, iw: innerWidth,
  ws: (e => e ? [e.scrollHeight, e.clientHeight] : null)(document.querySelector('.main-workspace')),
  panel: (e => e ? [Math.round(e.getBoundingClientRect().height), e.scrollHeight, e.clientHeight] : null)(document.querySelector('.roster-container')),
})"""

async def main():
    res = []
    def check(name, ok, extra=""):
        res.append(ok); print(("PASS" if ok else "FAIL"), name, extra)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for (w, h) in [(1366, 768), (1920, 1080), (1024, 768)]:
            page = await b.new_page(viewport={"width": w, "height": h})
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            await page.goto("http://localhost:5173", wait_until="networkidle")
            await page.evaluate("""(d) => { localStorage.setItem('customer-service-dashboard-state-v1', JSON.stringify(d));
                localStorage.setItem('customer-service-dashboard-view-v1', JSON.stringify({selectedMonth:'all'})); }""", seed())
            await page.reload(wait_until="networkidle")
            await page.wait_for_selector(".workspace-title", timeout=60000)
            await page.wait_for_timeout(1200)
            tag = f"{w}x{h}"
            s = await page.evaluate(STATE)
            check(f"{tag} page does not scroll", s["docH"] == s["winH"], f"doc {s['docH']} / window {s['winH']}")
            check(f"{tag} workspace does not scroll", s["ws"][0] <= s["ws"][1] + 1, str(s["ws"]))
            check(f"{tag} roster panel has room (>=240 px)", s["panel"][0] >= 240, f"{s['panel'][0]} px")
            box = page.locator(".roster-container > .table-scroll-area")
            m = await box.evaluate("e => [e.scrollHeight, e.clientHeight]")
            check(f"{tag} roster table scrolls inside its own box", m[0] > m[1], str(m))
            top0 = await page.evaluate("document.querySelector('.roster-table th').getBoundingClientRect().top")
            await box.evaluate("e => { e.scrollTop = 120 }")
            await page.wait_for_timeout(150)
            top1 = await page.evaluate("document.querySelector('.roster-table th').getBoundingClientRect().top")
            check(f"{tag} header row sticks while scrolling", abs(top1 - top0) < 2, f"{top0:.0f} -> {top1:.0f}")
            check(f"{tag} cards stay put while table scrolls", await page.evaluate("document.querySelector('.metric-card').getBoundingClientRect().top") > 0)
            if (w, h) == (1366, 768):
                items = page.locator(".sidebar-item")
                n = await items.count()
                check("9 sidebar tabs found", n == 9, str(n))
                for i in range(n):
                    await items.nth(i).click()
                    await page.wait_for_timeout(450)
                    t = await page.evaluate(STATE)
                    label = (await items.nth(i).inner_text()).strip().split("\n")[0]
                    ok = t["docH"] == t["winH"] and t["sw"] <= t["iw"] and t["ws"][0] <= t["ws"][1] + 1
                    check(f"tab '{label}' fits: no page scroll, no sideways overflow", ok, str(t))
            check(f"{tag} no JavaScript errors", not errs, "; ".join(errs)[:200])
            await page.screenshot(path=f"/tmp/layout_{tag}.png")
            await page.close()
        await b.close()
    print(f"{sum(res)} of {len(res)} checks passed")

asyncio.run(main())
