"""End-to-end reproduction of the 'Import for this account' button bug.

Scenario: saved accounts exist (Verizon Consumer with a real matchedColumns
fingerprint + AT&T Fios with an EMPTY fingerprint), an unrecognized CSV is
uploaded, detection fails, and the wizard must show BOTH the saved-accounts
datalist AND an enabled, working 'Import for this account' button.
"""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"

PROFILE_PREFIX = "cs-ops:account-profile:"


def make_profile(name: str, matched_columns: list[str]) -> str:
    sections = {
        "customerExperience": {"label": "C-Sat", "data": {"shape": "ready-rate", "matchedColumns": matched_columns}, "target": 88},
        "resolveRate": {
            "shortTerm": {"tracked": True, "windowLabel": "2 hour", "data": {"shape": "ready-rate", "matchedColumns": [c for c in matched_columns if "resolve" in c]}, "target": 92},
            "longTerm": {"tracked": True, "windowLabel": "3 day", "data": {"shape": "ready-rate", "matchedColumns": []}, "target": 80},
        },
        "handoffs": {"label": "Hand-offs", "data": {"shape": "ready-rate", "matchedColumns": []}, "target": 10},
    }
    return json.dumps({"accountName": name, "createdAt": "", "updatedAt": "", **sections})


CSV_CONTENT = "Agent Name,Tickets Opened,Average Talk Time\nAlice,12,301\nBob,9,412\nAlice,15,288\n"

with sync_playwright() as p:
    import os
    exe = "/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome"
    if not os.path.exists(exe):
        exe = None
    browser = p.chromium.launch(headless=True, executable_path=exe)
    page = browser.new_page(viewport={"width": 1400, "height": 1000})
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    page.goto(BASE)
    # Seed localStorage BEFORE any app code runs on every navigation.
    page.add_init_script(f"""
      () => {{
        try {{
          localStorage.clear();
          localStorage.setItem('{PROFILE_PREFIX}Verizon Consumer', `{make_profile('Verizon Consumer', ['vxs','resolve2hr','phoneAdds','handoffs'])}`);
          localStorage.setItem('{PROFILE_PREFIX}AT&T Fios', `{make_profile('AT&T Fios', [])}`);
        }} catch (e) {{}}
      }}
    """)
    page.goto(BASE)
    page.wait_for_timeout(1500)

    # Upload an unrecognized CSV via the hidden file input.
    page.set_input_files("input[type='file']", files=[{"name": "mystery_q3.csv", "mimeType": "text/csv", "buffer": CSV_CONTENT.encode()}])

    # Landing UI has a 3s artificial delay before calling onFiles; then dry-run scan.
    paused = page.get_by_text("I could not recognize this data as any account I know yet")
    try:
        paused.wait_for(state="visible", timeout=25000)
    except Exception:
        print("RESULT: PAUSE CARD NEVER APPEARED")
        print("BODY:", page.content()[:2000])
        print("ERRORS:", errors)
        browser.close(); sys.exit(1)
    print("STEP 1 OK: detection failed -> pause card visible")

    # --- Check 1: datalist populated with saved accounts ---
    options = page.locator("#import-account-options option")
    n_opts = options.count()
    opt_vals = [options.nth(i).get_attribute("value") for i in range(n_opts)]
    print(f"STEP 2: datalist options = {opt_vals}")
    assert n_opts >= 2, "BUG: saved-accounts dropdown list is empty/missing"

    # --- Check 2: pick "Verizon Consumer" from the dropdown and see the input fill ---
    page.select_option("#import-account-options", "Verizon Consumer")
    val = page.input_value("input[list='import-account-options']")
    print(f"STEP 3: after select_option, input value = {val!r}")

    # --- Check 3: button must be clickable ---
    btn = page.get_by_role("button", name="Import for this account")
    assert btn.count() > 0, "BUG: 'Import for this account' button missing"
    disabled = btn.is_disabled()
    print(f"STEP 4: button disabled = {disabled}")
    if disabled:
        print("RESULT: REPRODUCED — button stays DISABLED after picking a saved account")
        page.screenshot(path="repro_disabled.png", full_page=True)
        browser.close(); sys.exit(2)

    # --- Check 4: clicking completes the import ---
    btn.click()
    page.wait_for_selector("text=/Recognized|Import complete|Loaded/i", timeout=5000) if False else None
    try:
        page.wait_for_function("document.body.innerText.includes('Verizon Consumer') || !!document.querySelector('.analyst-dashboard')", timeout=20000)
        ok = page.evaluate("!!document.querySelector('.analyst-dashboard')")
    except Exception:
        ok = False
    print(f"STEP 5: dashboard rendered after resume = {ok}")
    page.screenshot(path="repro_after_click.png", full_page=True)
    if errors:
        print("PAGE ERRORS:", errors[:6])
    if not ok:
        print("RESULT: REPRODUCED — button enabled but click did NOT complete the import")
        browser.close(); sys.exit(3)

    print("RESULT: ALL CHECKS PASSED — dropdown present, button enabled, import resumed")
    browser.close()
