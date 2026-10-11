import asyncio, json
from playwright.async_api import async_playwright

SEED = {
  "agents": [{"ccms":"E100","name":"Alice One","supervisor":"Sam","oam":"OAM-1"}],
  "supervisors": ["Sam"],
  "oamName": "OAM-1",
  "hasUploadedData": True,
  "historicalData": {"E100": {"2026-01-15": {"calls":100,"vxs":95,"aht":800}}}
}

async def main():
    results = []
    def check(name, ok): results.append((name, ok)); print(("PASS" if ok else "FAIL"), name)
    async with async_playwright() as p:
        import glob, os
        exe = sorted(glob.glob('/root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome'))[-1]
        browser = await p.chromium.launch(executable_path=exe)
        ctx = await browser.new_context()
        await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:5173")
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://localhost:5173", wait_until="networkidle")
        await page.evaluate(f"""() => {{
            localStorage.setItem('customer-service-dashboard-state-v1', JSON.stringify({json.dumps(SEED)}));
            localStorage.setItem('customer-service-dashboard-view-v1', JSON.stringify({{selectedMonth:'all'}}));
        }}""")
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(600)

        # Seed the AI report state directly (the real generator needs a backend; C1).
        # We inject a fake aiTools report by clicking tab and stubbing via React? Simpler:
        # use the app's own reset/setters is not exposed. Instead, test the component by
        # forcing reports into existence through the module: not possible from outside.
        # Fallback: verify button presence requires report text -> we monkeypatch
        # window.__setReport if available; otherwise assert graceful absence.

        for tab_label, tab_key in [("Floor Analysis", "analysis"), ("Integrity", "correlation"), ("Day-of-the-Week", "dow")]:
            try:
                await page.get_by_text(tab_label, exact=False).first.click(timeout=4000)
            except Exception as e:
                print("nav fail", tab_label, e)
            await page.wait_for_timeout(400)

        body = await page.inner_text("body")
        check("no page errors", len(errors) == 0)
        print("ERRORS:", errors[:3])
        # Copy buttons only render when a report exists; without a backend they should be absent,
        # but their ABSENCE must not crash (regression guard = no pageerror above).
        check("dashboard still rendered", "Alice One" in body or "roster" in body.lower())

        # Direct unit-style render test of CopyReportButton via Vite SSR-ish trick:
        html = await page.evaluate("""async () => {
            const mod = await import('/src/components/shared.tsx');
            return typeof mod.CopyReportButton;
        }""")
        check("CopyReportButton exported from shared.tsx", html == "object" or html == "function")

        await browser.close()
    fails = [n for n, ok in results if not ok]
    print("SUMMARY:", f"{len(results)-len(fails)}/{len(results)} passed", "| FAILS:", fails)

asyncio.run(main())
