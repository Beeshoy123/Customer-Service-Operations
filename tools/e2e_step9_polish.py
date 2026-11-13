# e2e_step9_polish.py: real-browser checks for the step 9 polish (header search icon,
# compact roster rows, Repeated Offenders / Behavioral Scan look, sticky header rows on
# the Apprentice, Day of Week and Repeated Offenders tables). FAKE data only.
# Run: npm run dev -- --port 5173, then: python3 tools/e2e_step9_polish.py
import asyncio
from playwright.async_api import async_playwright

_src = open(__file__.replace("e2e_step9_polish.py", "e2e_page_layout.py"), encoding="utf8").read().split("STATE = ")[0]
_ns = {}
exec(_src.replace("asyncio.run(main())", ""), _ns)
seed = _ns["seed"]

async def load(b, w, h):
    page = await b.new_page(viewport={"width": w, "height": h})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    await page.goto("http://localhost:5173", wait_until="networkidle")
    await page.evaluate("""(d) => { localStorage.setItem('customer-service-dashboard-state-v1', JSON.stringify(d));
        localStorage.setItem('customer-service-dashboard-view-v1', JSON.stringify({selectedMonth:'all'})); }""", seed())
    await page.reload(wait_until="networkidle")
    await page.wait_for_selector(".workspace-title", timeout=60000)
    await page.wait_for_timeout(1000)
    return page, errs

async def tab(page, tip):
    await page.locator(f'.sidebar-item[data-tip^="{tip}"]').first.click()
    await page.wait_for_timeout(500)

async def main():
    res = []
    def check(name, ok, extra=""):
        res.append(ok); print(("PASS" if ok else "FAIL"), name, extra)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # --- header: one row where the search is an icon, roster rows compact
        for (w, h) in [(1366, 768), (1920, 1080), (1024, 768)]:
            page, errs = await load(b, w, h)
            hdr = await page.evaluate("document.querySelector('.floor-header').getBoundingClientRect().height")
            check(f"{w}x{h} header is one row (<=110 px)", hdr <= 110, f"{hdr:.0f} px")
            row = await page.evaluate("document.querySelector('.roster-table tbody tr.roster-row').getBoundingClientRect().height")
            check(f"{w}x{h} roster row is compact (<=56 px)", row <= 56, f"{row:.0f} px")
            check(f"{w}x{h} roster row has no 'N Agents' second line", await page.locator(".roster-table tbody tr.roster-row .roster-agent-count").count() > 0)
            await page.close()
        # --- search icon opens the box and filters (narrow screen)
        page, errs = await load(b, 1024, 768)
        check("1024 search icon visible, box hidden", await page.locator(".header-search-btn").is_visible() and not await page.locator(".header-search").is_visible())
        await page.locator(".header-search-btn").click()
        await page.wait_for_timeout(200)
        check("tap on icon opens the search box under the header", await page.locator(".header-search").is_visible())
        check("search box is focused", await page.evaluate("document.activeElement && document.activeElement.classList.contains('search-input')"))
        await page.keyboard.type("Fake Agent 3-0")
        await page.wait_for_timeout(500)
        check("typing filters (Filtered chip + icon dot)", await page.locator(".filtered-chip").count() == 1 and await page.locator(".header-search-btn.has-value").count() == 1)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        check("Escape closes the box, filter stays", not await page.locator(".header-search").is_visible() and await page.locator(".filtered-chip").count() == 1)
        check("no page errors (search)", len(errs) == 0, str(errs[:1]))
        await page.close()
        page, errs = await load(b, 1366, 768)
        check("1366 search box shown, icon hidden", await page.locator(".header-search").is_visible() and not await page.locator(".header-search-btn").is_visible())
        # --- Repeated Offenders: fits the panel, one-line rows, no emoji
        await tab(page, "Repeated")
        o = await page.evaluate("""() => { const t = document.querySelector('.offenders-table'); const h = t.closest('.tab-content');
            const bad = []; t.querySelectorAll('tbody tr').forEach((tr, ri) => { if (ri > 5) return; [...tr.children].forEach((td, ci) => { const k = [...td.children]; if (!k.length) return;
              const last = Math.max(...k.map(x => x.getBoundingClientRect().right)); if (last > td.getBoundingClientRect().right - 6 + 0.5) bad.push([ri, ci]); }); });
            return { scrollW: h.scrollWidth, clientW: h.clientWidth, row: t.querySelector('tbody tr').getBoundingClientRect().height, bad }; }""")
        check("offenders: no sideways scroll at 1366", o["scrollW"] <= o["clientW"], f"{o['scrollW']} / {o['clientW']}")
        check("offenders: rows are one compact line (<=64 px)", o["row"] <= 64, f"{o['row']:.0f} px")
        check("offenders: no clipped cells in the first rows", not o["bad"], str(o["bad"][:3]))
        txt = await page.locator("table").inner_text()
        check("offenders: no emoji in the table", not any(c in txt for c in "❌✅🔁⚠"))
        # --- Behavioral Scan: two columns, tap opens tiles full width
        await tab(page, "Behavioral")
        two = await page.evaluate("(() => { const c = document.querySelectorAll('.scan-card'); return c.length > 1 && Math.abs(c[0].getBoundingClientRect().top - c[1].getBoundingClientRect().top) < 2; })()")
        check("scan: cards sit in two columns", two)
        await page.locator(".scan-head").first.click()
        await page.wait_for_timeout(300)
        wide = await page.evaluate("(() => { const c = document.querySelector('.scan-card.is-open'); const g = document.querySelector('.scan-grid'); return c && c.getBoundingClientRect().width >= g.getBoundingClientRect().width - 2 && c.querySelectorAll('.scan-tile').length > 0; })()")
        check("scan: tapped card opens full width with metric tiles", wide)
        check("scan: no emoji", "#" not in await page.locator(".scan-grid").inner_text())
        check("no page errors (tabs)", len(errs) == 0, str(errs[:1]))
        await page.close()
        # --- sticky header rows on the three tables (short window so the table has to scroll)
        page, errs = await load(b, 1366, 480)
        for tip, name in [("Apprentice", "Apprentice"), ("DOW", "Day of Week"), ("Repeated", "Repeated Offenders")]:
            await tab(page, tip)
            box = page.locator(".tab-content").first
            m = await box.evaluate("e => [e.scrollHeight, e.clientHeight]")
            check(f"{name}: table scrolls inside its box (test is valid)", m[0] > m[1], str(m))
            await box.evaluate("e => { e.scrollTop = 600 }")
            await page.wait_for_timeout(200)
            pos = await page.evaluate("[document.querySelector('.cso-table th').getBoundingClientRect().top, document.querySelector('.tab-content').getBoundingClientRect().top]")
            moved = await box.evaluate("e => e.scrollTop")
            check(f"{name}: header row sticks at the top of the box after scrolling {moved:.0f} px", moved > 0 and abs(pos[0] - pos[1]) < 2, f"header {pos[0]:.0f}, box top {pos[1]:.0f}")
        check("no page errors (sticky)", len(errs) == 0, str(errs[:1]))
        await page.close()
        await b.close()
    print(f"{sum(res)} of {len(res)} checks passed")

asyncio.run(main())
