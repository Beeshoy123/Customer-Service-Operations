"""End-to-end check for the detection-fallback account picker.

Seeds a saved account profile (Verizon Consumer) directly in localStorage,
uploads an UNRECOGNIZED csv so auto-detection fails, then verifies:
  1. the wizard card shows a visible dropdown WITH the saved account option,
  2. "Import for this account" is clickable even before choosing (helper text),
  3. picking Verizon Consumer and clicking resumes the paused import to success.
Also checks auto-detection still works for a RECOGNIZABLE file (no regression).
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
FAILURES = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        FAILURES.append(name)


CSV_UNRECOGNIZED = ("Date,Rep Name,Sentiment Score,Queue Depth,Ticket Age\n"
                    "2026-09-01,Rider A,4,12,3\n2026-09-02,Rider B,5,8,9\n2026-09-03,Rider C,3,20,15\n")
# Matches the seeded profile's remembered columns -> should auto-detect.
# Must also satisfy row validation (agent name + date) or the import errors out.
CSV_RECOGNIZABLE = ("Date,Agent Name,AHT,Calls Handle Time,Resolve Total Contacts\n"
                    "2026-09-01,Alice,312,45,30\n2026-09-02,Bob,298,52,41\n")

PROFILE = {
    "accountName": "Verizon Consumer",
    "kpi": {"data": {"matchedColumns": ["agent name", "aht", "calls handled", "resolve total contacts"]}},
}


def seed(page):
    page.evaluate(
        """(profile) => {
            localStorage.clear();
            localStorage.setItem('cs-ops:account-profile:' + profile.accountName, JSON.stringify(profile));
        }""",
        PROFILE,
    )
    page.reload(wait_until="networkidle")


def wait_card(page, timeout_ms=30000):
    try:
        page.wait_for_selector("text=could not recognize this data", timeout=timeout_ms)
        return True
    except Exception:
        return False


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 1000})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        # ---------- Scenario 1: unrecognized file -> picker + resume ----------
        page.goto(BASE, wait_until="networkidle")
        seed(page)
        page.set_input_files("input[type='file']",
                             {"name": "mystery_metrics.csv", "mimeType": "text/csv",
                              "buffer": CSV_UNRECOGNIZED.encode()})
        check("fallback card appears", wait_card(page))

        selects = page.locator("select[aria-label='Choose a saved account']")
        check("visible saved-accounts dropdown rendered", selects.count() >= 1,
              f"found {selects.count()} select(s)")
        sel = selects.first
        options = sel.locator("option").all_inner_texts()
        check("dropdown lists 'Verizon Consumer'", any("Verizon Consumer" in o for o in options), str(options))
        check("dropdown offers Other/new account", any("Other" in o or "new account" in o.lower() for o in options), str(options))

        btn = page.get_by_role("button", name="Import for this account").first
        check("button exists", btn.count() >= 1)
        check("button NOT disabled before choosing", not btn.is_disabled())
        btn.click()
        check("click without choice shows helper text",
              page.wait_for_selector("text=Pick an account above first", timeout=3000) is not None)

        sel.select_option(label="Verizon Consumer")
        btn.click()

        # Success signal: the KPI dashboard renders (agent table / stats appear)
        # and the paused-import card is gone. Import status toasts auto-clear,
        # so never assert on them.
        try:
            page.wait_for_function(
                """() => {
                    const t = document.body.innerText;
                    return !t.includes('could not recognize this data') &&
                           (t.includes('Agent') || t.includes('AHT') || t.includes('Overview') || t.includes('Floor'));
                }""",
                timeout=60000,
            )
            resumed = True
        except Exception:
            resumed = False
        check("resume completes import (dashboard rendered)", resumed,
              "body tail: " + page.locator("body").inner_text()[:400].replace("\n", " | "))
        body = page.locator("body").inner_text()
        check("no stale fallback card after resume", "could not recognize this data" not in body)
        check("no __account__ sentinel leaked", "__account__" not in body)

        # ---------- Scenario 2: auto-detection still works ----------
        page.goto(BASE, wait_until="networkidle")
        seed(page)
        page.set_input_files("input[type='file']",
                             {"name": "verizon_weekly.csv", "mimeType": "text/csv",
                              "buffer": CSV_RECOGNIZABLE.encode()})
        try:
            page.wait_for_function(
                """() => {
                    const t = document.body.innerText;
                    return t.includes('Recognized account') ||
                           (!t.includes('Drop workbooks here') && (t.includes('Agent') || t.includes('Floor')));
                }""",
                timeout=45000,
            )
            det = True
        except Exception:
            det = False
        check("auto-detection still fires for recognizable file", det)
        no_card = True
        try:
            page.wait_for_selector("text=could not recognize this data", timeout=2500)
            no_card = False
        except Exception:
            pass
        check("auto-detected path does NOT show account question", no_card)

        real_js_errors = [e for e in errors]
        check("zero uncaught page errors", len(real_js_errors) == 0, "; ".join(real_js_errors[:3]))
        print("--- console errors:", console_errors[:5])
        page.screenshot(path="e2e_final.png", full_page=False)
        browser.close()

    print("\n" + ("ALL CHECKS PASSED" if not FAILURES else f"FAILED: {FAILURES}"))
    sys.exit(0 if not FAILURES else 1)


if __name__ == "__main__":
    run()
