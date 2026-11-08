import asyncio, glob
from playwright.async_api import async_playwright

async def main():
    results = []
    def check(name, ok): results.append((name, ok)); print(("PASS" if ok else "FAIL"), name)
    exe = sorted(glob.glob('/root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome'))[-1]
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=exe)
        ctx = await browser.new_context()
        await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin="http://localhost:5173")
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto("http://localhost:5173", wait_until="networkidle")

        out = await page.evaluate("""async () => {
            const React = (await import('/@id/react')).default ?? (await import('/@id/react'));
            const _RD = await import('/@id/react-dom/client');
            const RD = _RD.default ?? _RD;
            const { CopyReportButton } = await import('/src/components/shared.tsx');
            const root = RD.createRoot(document.body.appendChild(document.createElement('div')));
            root.render(React.createElement(CopyReportButton, { text: 'HELLO REPORT' }));
            await new Promise(r => setTimeout(r, 100));
            const btn = document.querySelector('button');
            const before = btn.textContent;
            btn.click();
            await new Promise(r => setTimeout(r, 300));
            const after = btn.textContent;
            let clip = null;
            try { clip = await navigator.clipboard.readText(); } catch (e) { clip = 'READ_DENIED:' + e.message; }
            // error path: force clipboard to fail
            const orig = navigator.clipboard.writeText;
            navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
            btn.click();
            await new Promise(r => setTimeout(r, 300));
            const failed = btn.textContent;
            navigator.clipboard.writeText = orig;
            await new Promise(r => setTimeout(r, 1800));
            const reset = btn.textContent;
            return { before, after, clip, failed, reset };
        }""")
        print(out)
        check("initial label is Copy", out["before"] == "Copy")
        check("click copies text", out["clip"] == "HELLO REPORT")
        check("shows Copied feedback", "Copied" in out["after"])
        check("shows failure message on reject", "Copy failed" in out["failed"])
        check("resets to idle after 1.5s", out["reset"] == "Copy")
        check("no page errors", not errors)
        await browser.close()
    fails = [n for n, ok in results if not ok]
    print("SUMMARY:", f"{len(results)-len(fails)}/{len(results)} passed", "| FAILS:", fails)

asyncio.run(main())
