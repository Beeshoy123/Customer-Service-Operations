# e2e_page_layout.py: real-browser check of the locked page layout (step 3 of
# docs/frontend-design.md). FAKE data only.
# Run: npm run dev -- --port 5173, then: python3 tools/e2e_page_layout.py
# Checks at 1366x768, 1920x1080 and 1024x768: the page never scrolls, the workspace
# does not scroll, the Team Roster table scrolls inside its own box with its header
# row sticking, every tab opens inside the panel with no sideways overflow, plus the
# sidebar edge toggle, the assistant box, the one-card KPI switch, the Outliers toggle
# and the rounded table header row.
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
            box = page.locator(".roster-container .tab-content")
            m = await box.evaluate("e => [e.scrollHeight, e.clientHeight]")
            check(f"{tag} roster table scrolls inside its own box", m[0] > m[1], str(m))
            top0 = await page.evaluate("document.querySelector('.roster-table th').getBoundingClientRect().top")
            await box.evaluate("e => { e.scrollTop = 120 }")
            await page.wait_for_timeout(150)
            top1 = await page.evaluate("document.querySelector('.roster-table th').getBoundingClientRect().top")
            check(f"{tag} header row sticks while scrolling", abs(top1 - top0) < 2, f"{top0:.0f} -> {top1:.0f}")
            check(f"{tag} cards stay put while table scrolls", await page.evaluate("document.querySelector('.kpi-switch-card').getBoundingClientRect().top") > 0)
            # --- sidebar edge toggle, assistant box, top bar
            check(f"{tag} header has no assistant button (it lives in the sidebar)", await page.locator('.floor-header [title="Data Assistant"]').count() == 0)
            icons = await page.evaluate("document.querySelectorAll('.header-tools svg').length")
            check(f"{tag} header tools use line icons (4 svg, no emoji)", icons == 4 and not await page.evaluate("/\\p{Extended_Pictographic}/u.test(document.querySelector('.header-tools').textContent)"), f"{icons} svg")
            check(f"{tag} add-workbook button and hidden file input exist", await page.locator('.header-tools [aria-label="Add workbook"]').count() == 1 and await page.locator('.header-tools input[type=file][multiple]').count() == 1)
            lab = (await page.locator(".date-step-label").inner_text()).strip()
            check(f"{tag} period shown between the date arrows", len(lab) > 0, lab)
            fh = await page.evaluate("[getComputedStyle(document.querySelector('.floor-header')).borderTopLeftRadius, Math.round(document.querySelector('.floor-header').getBoundingClientRect().height)]")
            check(f"{tag} floating header is rounded and compact (<= 150 px)", fh[0] == "28px" and fh[1] <= 150, str(fh))
            edge = page.locator(".sidebar-edge-toggle")
            if await edge.count():
                bb = await edge.bounding_box()
                check(f"{tag} edge toggle fully on screen", bb is not None and bb["x"] >= 0 and bb["x"] + bb["width"] <= w and bb["y"] >= 0, str(bb))
                await edge.click(); await page.wait_for_timeout(500)
                check(f"{tag} edge toggle collapses the sidebar", await page.locator(".sidebar-nav.collapsed").count() == 1)
                bb2 = await edge.bounding_box()
                check(f"{tag} edge toggle follows the panel edge", bb2 is not None and bb2["x"] < bb["x"], f"{bb['x']:.0f} -> {bb2['x']:.0f}")
                await edge.click(); await page.wait_for_timeout(500)
                check(f"{tag} edge toggle expands it again", await page.locator(".sidebar-nav.collapsed").count() == 0)
            await page.locator(".sidebar-ask").click(); await page.wait_for_timeout(500)
            check(f"{tag} assistant box opens the Data Assistant window", await page.locator(".modal-backdrop.open").count() == 1)
            await page.keyboard.press("Escape")
            if await page.locator(".modal-backdrop.open").count():
                await page.locator(".modal-backdrop.open .close-btn").first.click()
            await page.wait_for_timeout(400)
            # --- one KPI card with a Month-End / Daily switch
            t0 = await page.locator(".kpi-switch-title").inner_text()
            await page.get_by_role("button", name="Daily", exact=True).click(); await page.wait_for_timeout(300)
            t1 = await page.locator(".kpi-switch-title").inner_text()
            saved = await page.evaluate("localStorage.getItem('cs-ops:kpi-view')")
            check(f"{tag} KPI switch changes the card and is remembered", t0 != t1 and saved == "daily", f"'{t0}' -> '{t1}', saved={saved}")
            await page.get_by_role("button", name="Month-End", exact=True).click(); await page.wait_for_timeout(200)
            ch = await page.evaluate("document.querySelector('.kpi-switch-card').getBoundingClientRect().height")
            check(f"{tag} KPI card stays slim (<= 110 px)", ch <= 110, f"{ch:.0f} px")
            r = await page.evaluate("getComputedStyle(document.querySelector('.roster-table th')).borderTopLeftRadius")
            check(f"{tag} table header row is rounded", r == "14px", r)
            # --- Floor Outliers: toggle, three tiles, no scrolling of the panel
            await page.locator(".sidebar-item", has_text="Floor Outliers").click(); await page.wait_for_timeout(500)
            g = page.locator(".outliers-grid")
            check(f"{tag} outliers shows 3 tiles (offenders)", await g.count() == 1 and await g.locator("> *").count() == 3 and "is-offenders" in (await g.get_attribute("class")))
            pm = await page.evaluate("(e => [e.scrollHeight, e.clientHeight])(document.querySelector('.roster-container'))")
            check(f"{tag} outliers panel does not scroll", pm[0] <= pm[1] + 1, str(pm))
            await page.get_by_role("button", name="Top performers", exact=True).click(); await page.wait_for_timeout(400)
            check(f"{tag} Top performers toggle shows the other 3 tiles", "is-performers" in (await page.locator(".outliers-grid").get_attribute("class")))
            await page.get_by_role("button", name="Below performers", exact=True).click(); await page.wait_for_timeout(300)
            await page.locator(".sidebar-item", has_text="Team Roster").click(); await page.wait_for_timeout(400)
            if (w, h) == (1366, 768):
                items = page.locator(".sidebar-item")
                n = await items.count()
                check("7 sidebar tabs found (the 2 AI-only tabs are hidden while AI is off)", n == 7, str(n))
                for i in range(n):
                    await items.nth(i).click()
                    await page.wait_for_timeout(450)
                    t = await page.evaluate(STATE)
                    label = (await items.nth(i).inner_text()).strip().split("\n")[0]
                    ok = t["docH"] == t["winH"] and t["sw"] <= t["iw"] and t["ws"][0] <= t["ws"][1] + 1
                    check(f"tab '{label}' fits: no page scroll, no sideways overflow", ok, str(t))
                    fr = await page.evaluate("(() => { const t = document.querySelector('.tab-frame .tab-title'); return t ? [!!t.querySelector('.tab-icon svg'), /\\p{Extended_Pictographic}/u.test(t.textContent)] : null })()")
                    check(f"tab '{label}' uses the standard frame (icon, no emoji in title)", bool(fr) and fr[0] and not fr[1], str(fr))
                    rh = await page.evaluate("(() => { const th = document.querySelector('.tab-frame table th'); return th ? getComputedStyle(th).borderTopLeftRadius : null })()")
                    if rh is not None:
                        check(f"tab '{label}' table header row is rounded", rh == "14px", str(rh))
            check(f"{tag} no JavaScript errors", not errs, "; ".join(errs)[:200])
            await page.screenshot(path=f"/tmp/layout_{tag}.png")
            await page.close()
        await b.close()
    print(f"{sum(res)} of {len(res)} checks passed")

asyncio.run(main())
