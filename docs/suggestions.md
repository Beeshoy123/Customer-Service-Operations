# Suggestions: Customer-Service-Operations

This is the one plan file for the repo. It holds the audit, the checklist and the reference rules. It was merged with the old `recommendations.md` on 2026-11-08; everything already built was dropped, and what was still open was moved in here, ordered by how critical it is. The old file is in git history (last copy at commit `d34eb57`).

Legend: 🟢 solid · 🟡 weak · 🔴 missing · ⛔ blocking
Evidence: **ran** = I executed it and saw the result. **read** = I read the code but did not run it.

---

## 📌 Note to any AI assistant working on this repo (read before doing anything)

The owner (Beeshoy) is a call-center team leader and a **beginner at coding**. He wants this app built *for* him, step by step, without being overwhelmed. These are his standing rules. Follow them in every chat.

**How to talk to him**

| Rule | In practice |
|---|---|
| Brief and direct | Short replies. Tables and small diagrams instead of paragraphs. |
| Visual first | Lead with a diagram, table or example, then explain in a few lines. |
| One idea at a time | Never dump many rules or many changes at once. When teaching, give one small practice question after each idea. |
| Plain words | Explain jargon the first time. Say "browser storage", not only "localStorage". |
| Numbers, not adjectives | Show before/after numbers. Mark each claim **ran** (you executed it) or **read** (code only). |
| Honest | Give honest feedback on what already exists before proposing new work. Admit mistakes plainly. |

**How to change the code**

1. **Propose first, wait for his OK.** No code changes before he approves. One checklist step at a time.
2. **Confirm data and math first.** Test with real-scale data (300K+ rows) in a real browser, not only mocks or unit tests.
3. **Edit the existing code. Do not rebuild.** No rewrites he didn't ask for.
4. **UI:** follow `docs/frontend-design.md` (light mint look, his choice on 2026-11-09), keep color-coding. Never design without confirmation: show an HTML mock-up first.
5. **Mapping and alias fixes go only in `importPolicy.ts`** (the repo's standing rule, full text in the Reference section below).
6. **Before every commit run** `tsc -b`, `npm test`, `npm run lint` and `npm run build`. Baseline on 2026-11-14 (after removing the Bonus Score): tsc clean, 468/468 tests pass, lint 0 errors (104 warnings).
7. **Commit straight to `main`. No branches, no pull requests** (his decision). One commit per step. Tick that step's `[ ]` box in this file in the same commit.
8. If a step changes the plan, update this file and say so.

**Safety (this repo is PUBLIC)**

- Never commit real agent data: no CSV, XLSX or XLS files, no real names, IDs or screenshots of real data. Use fake names only.
- Never commit secrets, keys or tokens. Never ask him to paste a token into a chat.
- Do not put his employer's name or account details in the repo.
- Agent-level attendance, AUX and sales data must stay on his PC: no cloud upload, and AI calls stay off by default.
- If `git push` fails, attach the repo with push access and tell him plainly. Do not work around it.

**Traps already found (do not repeat them)**

- Count columns must stay counts. Dividing them by row count broke handoffs and resolve metrics (steps 1–2).
- Merge by agent + date only. Extra columns such as supervisor in the merge key stop files from merging.
- A missing value is not 0. Keep it null.
- Dates: his timezone is Africa/Cairo. Month labels like `Sep 2026` must not land on Aug 31. Day-first dates (DD/MM) are normal for him.
- Do not invent numbers (the old "5% of calls = surveys" rule).

---

## In plain English (read this first)

**What you want:** put a folder of files in one place. The app finds them, reads them, merges them and keeps itself up to date. No hand-merging, no re-uploading.

**Why it doesn't work today:** the app is like a notebook where every new file **erases the page before it**.

| Today | What it means for you |
|---|---|
| ✅ Fixed in step 2: a second file for the same agent and day **replaces** the first | This is why you merge everything into one CSV by hand |
| ✅ Fixed in step 4 (storage part): data was saved in the browser's small storage (~5 MB). Yours needs ~10 MB. | When it was full, the browser forgot silently. That is why you re-uploaded. Now it goes to IndexedDB. |
| ✅ Fixed in step 1: counts get divided by the number of calls | 2 handoffs in 10 calls is saved as 0.2. That is the Transfer_logs bug. |
| ✅ Fixed in step 2: same agent and day in two files doesn't merge if one file lacks Supervisor | Rows stay split and numbers come out wrong |
| Only call-center metrics exist | Sales, Absenteeism, AUX and floor-level VOC have nowhere to go |
| Rows with no agent name are deleted | Floor-level VOC and Sales would disappear |
| Three tabs try to send dashboard data to an AI service when you open them | Breaks your "agent data stays on my PC" rule. It fails today only because there is no key. |

**What I suggest:** protect the math with tests (step 0), fix the foundation (steps 1–4), then add recipes, the folder link and live refresh (steps 5–7), then the new data types and the new look (steps 8–9). Cleanup runs alongside.

**What I need from you:** the answers in "Decisions needed".

---

## Priority board (most critical first)

| Rank | Level | Work | Why this position |
|---|---|---|---|
| 1 | ⛔ P0 | **Step 0**: tests around weighted-satisfaction and trend math | Nothing guards these numbers. Tests only, no behavior change. Must exist before steps 1–2 touch the math. |
| 2 | ✅ done | **Step 1** (2026-11-08): counts stay counts | Wrong numbers on screen today |
| 3 | ✅ done | **Step 2** (2026-11-09): merge without losing data | A second upload erases the first; rows don't merge |
| 4 | ✅ done | **Step 3** (2026-11-09): dates | `September 2026` becomes Aug 31 in Cairo |
| 5 | ⛔ P0 | **Step 4**: ✅ storage done (2026-11-09); **AI off by default** (data leaving the PC) still open | The open half breaks a rule of yours |
| 6 | 🟡 P1 | **Steps 5–7b**: recipes, folder link, live refresh, Google Sheets | The goal features, built on the fixed foundation |
| 7 | 🟡 P1 | **Step 8**: Sales, Absenteeism, AUX, floor-level rows | New data types |
| 8 | 🟢 P2 | **Step 9**: combined view and redesign (includes the UX and design-gap items) | Look and usability; do after the data is right |
| 9 | 🟢 P3 | **Step 10**: cleanup (`@ts-nocheck`, renames, file splits, root clutter) | Rolling; touch each file when a step already edits it |

### Architecture fix order (the items that came from the old `recommendations.md`)

Most critical first. Codes in bold are the old item numbers; the checklist below uses the same codes. Sizes: S under 1 hour, M a few hours, L a day or more. Evidence: **ran** or **read**. Counts marked "old audit" were not rechecked.

**⛔ Critical: do these first**

| # | Code | What | Why it matters | Fix | Size | Step |
|---|---|---|---|---|---|---|
| 1 | **C3** | No tests on the weighted-satisfaction and trend math | These numbers feed the dashboard figures. `helpers.test.ts` covers only hand-offs. (ran) | Tests only. Compute expected values by hand. Change no formula. If the code disagrees, report a bug. | S | 0 |
| 2 | **C1** | AI sends dashboard data out | `hooks.ts` posts the roster, supervisors and series to `api.anthropic.com` from the browser. `FloorAnalysisTab`, `FloorCorrelationTab` and `FloorDowTab` each fire it when opened. It fails today only because there is no key. (read) | AI off by default behind a visible switch. Remove the three auto-calls and the browser call. Or delete the AI code if it is not used. | M | 4 **Frozen 2026-11-09 (interim):** switched off, features show "Under construction"; see Step 4. |

**🟡 Medium: real risks, small to fix**

| # | Code | What | Why it matters | Fix | Size | Step |
|---|---|---|---|---|---|---|
| 3 | **C4** | Dashboard context typed `any` | A missing member is invisible to `tsc`; that is how the old blank-screen crashes happened. All 25 members are fine today. (ran) | A real type for the context, plus a test that fails if a component uses a member the hook doesn't return. | S–M | 10 |
| 4 | — | Dead `if (false …)` block (`App.tsx` ~line 308) | Hides a ~60-line account-setup screen nobody can reach. (read) | Delete it, or restore it on purpose (his decision). | S | 9 |
| 5 | — | Ref written during render (`aiResetRef.current = …`, `App.tsx` ~line 224) | Breaks a React rule and can show stale values. (read) | Move the write into an effect or an event handler. | S | 9 |
| 6 | — | An in-flight import is not aborted when the page closes | A late import can write into state that is gone. Changes visible behavior, so needs his OK. (read) | Abort on unmount. | S | 10 |
| 7 | **U2** | Hover dimming done in JavaScript (`TopNavbar`, `MainModal`, `FloorBurnoutTab`) | On touch screens the buttons stay dim. (read) | CSS `:hover` and `:focus-visible`; resting state fully visible. | S | 9 |

**🟢 Low: usability and look (all inside Step 9)**

| # | Code | What | Fix | Size |
|---|---|---|---|---|
| 8 | **U4** | The comma-search hint is only a placeholder (`FloorHeader.tsx`) | Show the typed terms as removable chips | S |
| 9 | **U5** | No loading state on the first metric cards | A real "resolving" flag, no fake timer | S |
| 10 | **S17** | Two identical KPI cards (`MainStatsRow.tsx`) | One component, one briefing hero | M |
| 11 | **U3** | Red used as a neutral label color in about 10 places (old audit) | Red for problems only | S |
| 12 | **U6** | Round ◀ ▶ next to rectangular tabs | One button shape | S |
| 13 | **S15** | 74 inline `style={{}}` blocks (ran) | Move to CSS while rewriting each file | M |
| 14 | **S16** | Many inline arrow handlers | Name them or lift them while rewriting | M |
| 15 | **S18** | ✅ Done 2026-11-09: long conditional `className` chains | Named class constants instead of long inline strings | S |
| 16 | **Design gap** | Beige canvas with dark cards and mixed icons | The light mint look in `docs/frontend-design.md` (build order and prompts are there). HTML mock-up first. | L |

**⚪ Cosmetic: only when already editing the file**

| # | Code | What | Fix | Size | Step |
|---|---|---|---|---|---|
| 17 | **C2** | ✅ Done 2026-11-10: "Gemini" names (30 hits in 11 files) | Renamed to `executeAiAction`, `AiLoader`, `.ai-btn` | S | 10 |
| 18 | **S4c** | `ImportPreviewModal.tsx` is 1,347 lines | Move its state and handlers into a hook. Move only. | M | 10 |
| 19 | **S20** | `COL_DEFINITIONS` used in 25 places in 8 files | Tidy only when touching them | S | 10 |
| 20 | **S23** | `runChartData` rebuilds its date list each time (`metrics.ts`) | Only if it measures slow | S | 10 |
| 21 | **U1** | About 51 emoji-led labels (old audit) | SVG icons, with the Step 9 redesign | M | 9 |
| 22 | — | About 48 unused CSS classes (old audit) | Delete after confirming they are unused | S | 10 |

Suggested sequence: 1 → 2 → 3, then 4–7 as one small cleanup, then everything in Step 9 together. Tick items in the checklist below as they are done.

---

## Checklist: what must change (cross off when done)

Format: `[ ]` open · `[x]` done. Codes in brackets point to sections below: **B** = blocker (Backend scorecard), **K** = known bug, **X** = extra finding, **F** = frontend, **C** = AI/safety item, **U** = usability item.

### Bugs found during work (fix when he approves)
- [x] **Bonus Score removed** (his decision 2026-11-14: no bonus calculation and no bonus ranking in the dashboard). Done: `calculateBonus`, the `bonus` field on every aggregate, the `bonus` entry in `METRIC_CONFIG` and its imports and comments are gone. The Trends tab now starts on C-Sat (`vxs`) instead of Bonus Score, and the dropdown no longer lists it. **Behavior change, approved:** Repeated Offenders used to include Bonus Score as a metric (target 100), so an agent with C-Sat, 3DR and hand-offs below target could be flagged on it; now it is not (ran: the new test fails on the old code). Unchanged: no roster column, KPI tile or ranking ever used bonus (the only ranking code is the AHT/Hold/DPC/Net OCC burnout list), and saved data had no bonus field. 4 new tests in `noBonus.test.ts`. Checks (ran): tsc clean, 468/468 tests, lint 0 errors (104 warnings), build OK, `tools/e2e_repeated_offenders.py` 24/25 (X9 only), throwaway Trends check on fake data: starts on C-Sat, no Bonus option, no JavaScript errors. Note: on that fake seed the Trends heatmap shows only the OAM row with no values, the same before and after this change, so bonus was not the cause of the empty heatmap.
- [ ] **X9** Repeated Offenders (tab was called Chronic) coaching-plan button crashes: `setUploadStatus is not a function` (`FloorOffendersTab.tsx:80`). Make the hook return `setUploadStatus` and `scheduleStatusClear`, add a test, then re-check every tab for the same kind of missing member. Details in "Also found". **Status 2026-11-10: still open. He chose "not now" (deferred); do not fix until he asks.** Small fix: about one function hand-out in the hook plus a test. The browser test `tools/e2e_repeated_offenders.py` shows it as its 1 failing check (23/24) until then.
- [ ] **X10 (found 2026-11-10, not fixed)** The Timeframe menu (the calendar button in the top bar) opens underneath the page header card: its top part, with the Monthly / Weekly / Daily / Day of Week buttons, is blurred and cannot be clicked with the mouse; only the month box at the bottom works. Same result before and after the menu.tsx change, so it is older (ran, Chromium 1366x768, fake data: the point at the menu's top edge belongs to `.workspace-header`). Probe: the top bar is `position: static` with z-index 40, the menu has z-index 100 (read from computed styles). Likely cause is the stacking order from the glass header (step 9); not diagnosed. The Metrics menu (gear button) is probably covered the same way: a mouse click on its first tick box timed out in the same test. Needs a fix in CSS only, with his OK. Update 2026-11-13 (ran, 1366x768): the menu now opens on top and is clickable (the element at its top edge is the menu itself); the Monthly / Weekly / Daily / Day of Week buttons look washed out (screenshot). Still not fixed.

### Step 0: Safety net for the math (tests only)
- [ ] Tests for `calculateWeightedVSF`: weighting math, zero denominator [C3]
- [ ] Tests for `calculateTrend`: flat, rising, falling, single point [C3]
- [ ] Tests for `agentMatchesSearch`, `formatName`, `shortenManagerName` [C3]
- Rule: expected values computed by hand first. If the code disagrees, stop and report a bug. Do not change any threshold, formula or rounding. Today `helpers.test.ts` covers only hand-offs (8 tests) (ran).

### Step 1: Counts stay counts
- [x] `aggregateTransactions` no longer divides count fields by row count (handoffs, resolve 2Hr/3Day, surveys, promoters, etc.) [K1, K2, B5]
- Done 2026-11-08: 18 count fields are now summed (`SUMMED_COUNT_FIELDS`); `aht`, `hold`, `dpc` and all rates stay averaged. Tested at 300K rows in Chromium: 3000 of 3000 agent-days correct (ran).
- Still open, not part of this step: the 2HR gauge stays empty unless the file has a pass column or a percent column. A count alone does not fill it (ran).

### Step 2: Merge without losing data
- [x] Merge key = agent ID or name + date only; supervisor and location become attributes [K2, B3]. Done in `import/mergeData.ts`: ID if present, else lower-cased name; a name-only row joins an ID only when that name has exactly one ID in the batch.
- [x] `calls` is not summed across files for the same agent+day [K2]. Done in `import/mergeData.ts`: all count fields (calls, surveys, promoters, handoffsCount, resolve contacts, ...) default to "newer file wins"; a value missing in the newer file keeps the older one; one `CONFLICTING_VALUES` warning per field when files disagree. Adding is still possible per account (`mergeStrategy`) or with `duplicateSourceHandling: 'allow'`. Rate fields (AHT, VXS, ...) still follow the account's rate-merge style; revisit with the "merge into existing day" box.
- [x] `applyBatchImport` merges into the existing day instead of replacing it [B1]. Done: `mergeDayRecord` in `dashboard/dayRecord.ts` (a new value wins, a missing value keeps the stored one, `isOff` recomputed, stored record copied not edited). Re-applying the same data changes nothing, so a re-upload does not double numbers. Also in this box: a file without a Supervisor/OAM column no longer wipes the stored one (`keepKnown`), and across uploads a name-only row joins the one stored agent with that name, and a row with an ID adopts the one stored agent with that name and no ID (`dashboard/agentIndex.ts`).
- [x] Missing values stay null for calls, AHT, VXS, resolve2hr, resolve3d (not 0) [X2]. Done in new `dashboard/dayRecord.ts` (`buildDayRecord`, moved out of `batchImport.ts` so it can be tested): a missing value, `-`, `n/a` or other non-number text is null; a real 0 stays 0. A day with no `calls` is no longer marked off (`isOff` only when calls is a real 0). Full `isOff` rework stays in Step 8.
- [x] Remove invented survey counts (the 5% rule in `helpers.ts`) [X3]. Done in `aggregateRecords`: a day with only a VXS % adds no surveys or promoters. The agent still shows the plain mean of the reported % when it has no real counts at all; floor and supervisor rollups use real counts only and show blank when there are none. Fake-data check: floor 53.6% -> 50.0%, and a 1,000-call VXS-only agent 70% -> 50%.
- Done 2026-11-09: tested in Chromium with two overlapping fake files (300K rows, 225,000 agent-days, 75,000 shared): upload A, then B. Before Step 2: 6,000 agents, 300,000 agent-days, calls 7,350,000 (doubled), 3,000 supervisors turned "Unknown". After: 3,000 agents, 225,000 agent-days, calls 5,512,500, A's surveys, promoters and supervisors all kept, B's handoffs added (ran). Re-run: `tools/make-fake-overlap-files.mjs` + `tools/e2e_merge_scale.mjs` (header of the second file says how).
- Still open, not part of this step: once data is loaded the app has no visible "add another file" button (the landing page shows only when there is no data). The browser test passes file B to the same import function the landing page uses (`dashData.handleAutomaticImport`).
- [ ] **PARKED 2026-11-09 (he is not sure yet; do not build until he says OK): rate fields across two files.** AHT, VXS, resolve 2hr/3d, hold and similar rates still follow the "Rate calculation" dropdown when two files give a value for the same agent + day.
  - His rule: new files bring different metrics; the same KPI in two files only differs when one is an update, so the newer file is the latest number.
  - Today (ran, fake data): file A AHT 300, VXS 80, hold 20 and file B AHT 400, VXS 90, hold 30, uploaded together, give AHT 350, VXS 85, hold 25 for both dropdown settings. Uploaded one after the other, the newer wins (400, 90, 30). So the result depends on the upload order.
  - Proposal: add a third style "Newer file wins" and make it the default; keep "Arithmetic average" and "Weighted by counts" as options. A value missing in the newer file keeps the older one. Expected: 400, 90, 30 either way.
  - Where (read): `import/mergeData.ts` (rate strategy about lines 170-180, average branch about 343-357), `config.ts` line 71, `account-profile-schema.ts` line 238, `ImportLanding.tsx` lines 34 and 345. The dropdown is used only in `mergeData.ts` line 344.
  - Tests to write first: A 300 then B 400 gives 400; missing in B keeps A; average and weighted still work when chosen.
  - Risk: an account that already saved "Arithmetic average" keeps averaging until it switches (check how the saved choice is stored).

### Step 3: Dates
- [x] `September 2026`, `Sep-26`, `Sep 5, 2026`, `9/2026` parse to the correct date in Cairo time [X1]
- [x] Sheet name (e.g. "Sep") can supply the month [X1]. Only for a sheet with no date column; year from the file name (one distinct 20xx) or from the sheet name ("Sep-26"); otherwise rows stay undated with a visible warning. The import preview also asks for the year when it is missing (pick this year, the 2 before, or skip)
- [x] Per-file date-format setting (DD/MM vs MM/DD) [X7]. The order is read from the file's own dates (any `13/09` or `9/13`), default day first. The import preview has a Dates section per sheet: it shows how dates are read with 3 examples, warns when the file cannot prove the order, and lets you switch. Not yet checked in a real browser

### Step 4: Storage and privacy
- [x] Data lives in IndexedDB, not `localStorage` (no 5 MB cap, no silent loss) [B4]. Done 2026-11-09: new `idbStore.ts` (tiny IndexedDB helper); `persistence.ts` saves the big data (agents, supervisors, daily history) there, newest save wins; `main.tsx` loads it before the first screen (`preloadPersistedDashboardState`); an older save in localStorage is copied over once, then removed; a refused save shows a red message instead of silence. Small keys (view choices, learned mappings, account profiles, sidebar) stay in localStorage. Browser test, 150,000 fake agent-days, reload the page (ran): before 0 of 150,000 survived (localStorage held 105 bytes); after 150,000 of 150,000 and calls 3,675,000 = 3,675,000. Two-file 300K merge test still 10/10. 14 new unit tests (`idbStore.test.ts`, `persistence.test.ts`, with the `fake-indexeddb` dev package). Re-run: `tools/e2e_storage_reload.mjs` (header says how). Not tested: a real browser with real data on your PC.
- [x] **AI frozen as "under construction" (interim, his decision 2026-11-09).** `dashboard/aiSwitch.ts` has `AI_ENABLED = false`. `executeAiAction` and `fetchWithRetry` (the only network call in the app) stop before any request is built. The 7 AI features stay in the app (team report, supervisor report, action plan, correlation, day-of-week, apprentice, Ask AI) and show "Under construction: this feature is not yet developed. Nothing from your data is sent to any AI." Tests in `aiSwitch.test.ts`: zero `fetch` calls, the only network call in `src/` sits behind the switch, no provider address anywhere else. Browser check with fake data (ran): 0 requests to outside servers while opening Floor Analysis, Integrity Match Up (the correlation tab), DOW and the Data Assistant; before the freeze, opening Floor Analysis sent 2 POSTs with agent names to `api.anthropic.com`. Not clicked in the browser (they need richer data) but they use the same guarded function: Apprentice, Create Action Plan, supervisor report.
- [ ] AI off by default: a visible switch, default off; no AI request without a click [C1] (still open: the final design is not decided; the freeze above is the interim state)
- [ ] Remove the three auto-calls on tab open: `FloorAnalysisTab`, `FloorCorrelationTab`, `FloorDowTab` each call their report function inside a mount effect [C1]
- [ ] Remove the browser → `api.anthropic.com` call (`hooks.ts`, `executeAiAction`). If AI is ever wanted: a small server holds the key, never a `VITE_` variable (those end up readable in the page); send aggregates, not the roster; show a visible error state on failure [C1] (still open; frozen in the meantime)
- Alternative (see Decisions): if he does not use the AI reports, delete the AI tabs and code instead. Simplest and safest.

### Step 5: Recipes
- [ ] Recipe per file type (VOC, Sales, Absenteeism, AUX): sheet, header row, column mapping, date format, metric meaning
- [ ] Recipe auto-applies by filename or headers; no mapping prompts for known files
- [ ] Pivot-table files are detected and flagged ("Row Labels", "Sum of …") [K4]
- [ ] One mapping engine instead of two; "Calls Handle Time" maps to AHT [K3]

### Step 6: Folder link
- [ ] Pick one folder with the File System Access API (Chrome/Edge on PC)
- [ ] Folder handle remembered in IndexedDB; one permission click per session
- [ ] OneDrive-synced Excel files work through this folder (no extra code)

### Step 7: Live refresh
- [ ] Check `lastModified` about every 30 s
- [ ] Re-read only changed or new files, in the Web Worker
- [ ] Per-file status (rows, last modified, ok/error)
- [ ] A new month's file dropped in the folder appears by itself

### Step 7b: Google Sheets reader (added later)
- [ ] Company policy checked: is agent-level data allowed in Google Sheets?
- [ ] Reader for a private sheet via the Sheets API (read-only sign-in)
- [ ] Publish-to-web CSV only if the data is not sensitive

### Step 8: New data types
- [ ] Rows without an agent name are kept as floor-level rows, not deleted [B2]
- [ ] Floor + month keyed rows for Sales and VOC
- [ ] Absenteeism and AUX (daily, per agent) with month rollup and daily drill-down
- [ ] Replace `isOff = calls === 0` so absent and AUX-only days are not dropped [X4]

### Step 9: Combined view and redesign
Design direction and ready-to-use build prompts for the look (colors, sidebar, layout, cards, headers, animation) are in [`docs/frontend-design.md`](frontend-design.md). Update that file as each part is built. **Decided 2026-11-09:** he chose this light mint look (forest green, mint glow, peach) instead of a dark theme. Still no building without an HTML mock-up and his OK.
Show an HTML mock-up and get his OK before building any of this.
- [ ] One dashboard: floor × month × agent for Sales, VOC, Absenteeism, AUX
- [ ] One briefing hero instead of two identical KPI cards; the two cards' duplicated markup becomes one component [F1, S17]
- [ ] "Needs you" action queue [F2]
- [ ] Data Health panel (files, rows, last modified, status) [F3]
- [ ] Real trend (delta vs prior month plus sparkline) instead of always +0.00% [F4, X5]
- [ ] One light mint canvas with forest green, mint glow and peach accents (per `docs/frontend-design.md`), 4 domain colors, SVG icons instead of emoji (about 51 emoji-led labels, per the old audit) [F5, U1]. In progress 2026-11-09: 1a and 1b done (shared `--cso-` colors, background gradient, top bar, cards, table header and blue accents recolored, sidebar already on SVG icons). Still open in this box: the other emoji labels, the 4 domain colors, the 19 inline colors listed in `docs/frontend-design.md`
- [x] Collapsible icon rail [F6]. Done 2026-11-09 (sidebar only; the rest of Step 9 is still open): floating forest-green panel, one round toggle between full (264 px) and a slim icon pill (76 px), choice remembered in browser storage (`storageKeys.sidebarCollapsed`), hover and keyboard-focus names in the pill, 9 line SVG icons instead of emoji, narrow screens (1024 px and below) always show the pill, and the workspace now moves with the panel (before, it sat under the panel on narrow screens). Optional number badge supported but none shown, because the app has no number for it. Search box and profile block were left out: the app has no data for them. Checked in Chromium on fake data: 30 of 30 checks passed (ran).
- [x] Animation layer, parts A and B (frontend-design.md section 6). Done 2026-11-09: two KPI cards and the tab panel rise in, the tab panel fades in on every tab change, one mint glow slides to the active sidebar item, KPI numbers count up over 800ms (`CountUp.tsx`); all of it off for reduced motion. Checked in Chromium on fake data: 15 of 15 checks passed (ran). Part C (sparkline draw-in) is parked until sparklines exist (F4/F7).
- [x] Workspace header, first part of frontend-design.md section 5. Done 2026-11-09: greeting by the clock + today's date, the word "Floor" in italic serif, a "N agents need attention" chip (it now counts Repeated Offenders, hidden when it cannot be known), glass card look. 7 new unit tests; Chromium check on fake data 16 of 16, including 3,000 agents x 12 months (ran). Open: italic touch on the stat cards (waits for Cards, step 4).
- [x] Cards, section 4 of frontend-design.md (cards only). Done 2026-11-09: both KPI cards are frosted glass with 28px corners, soft shadow and a 5px hover lift (off for reduced motion); header chips and a visible peach label tag; gauges with light-card ring colors and an On/Off target tag; metric tiles mint/peach/white with a "vs target" line; one `KpiTile` component instead of two copied blocks. Checked in Chromium on fake data (ran). **Still to run:** `npx tsc -b`, `npm test`, `npm run lint`, `npm run build` (the session had no `node_modules`). Left open on purpose: trend badge and sparkline (no real trend data, F4/X5), italic accent word on the stat cards.
- [x] Page layout, section 3 of frontend-design.md (shell, table box, compact cards). Done 2026-11-09: page locked to the screen height, only the tab panel scrolls, Team Roster table scrolls in its own box with a sticky header row, KPI cards 496 px to 281 px and header 149 px to 108 px at 1366x768. Browser check on fake data 31 of 31 (`tools/e2e_page_layout.py`, ran); tsc clean, 447/447 tests, lint 0 errors, build OK (ran). Open: bento tiles for the 5 chart tabs, sticky header row in Apprentice, Day of Week and Offenders.
- [x] Sidebar edge toggle + assistant box, one slim KPI card with Month-End / Daily switch, Floor Outliers 3-tile view with Below / Top performers toggle, rounded table headers and top bar. Done 2026-11-10: panel 265 px to 451 px at 1366x768. Browser check 66 of 66; tsc clean, 447/447 tests, lint 0 errors, build OK (ran). Open: sticky header in Apprentice, Day of Week, Offenders; unused `.donut-*` / `.kpi-tile*` CSS.
- [x] Header and the 8 design changes (approved mock-up). Done 2026-11-12: floating forest header with line icons and Add workbook, one standard tab frame on every tab, Outliers bar rows, Repeated Offenders summary tiles in a row, one table look, period label between the date arrows, two button styles, empty states, AI-only tabs hidden while AI is off. Browser checks: layout 85/85, add workbook all pass, header 16/16; tsc clean, 460/460 tests, lint 0 errors, build OK (ran). Open: X9, unused CSS sweep, month badges still use emoji marks.
- [x] Step 9 polish, items 3, 6 and 7 (approved mock-ups). Done 2026-11-13: search icon below 1320 px, compact roster rows (53 px), Repeated Offenders one-line rows with tick/cross month chips, Behavioral Scan two-column cards, soft AI report cards, sticky header rows tested on three more tables. Browser checks: step9 polish 31/31, layout 85/85, header 16/16, add workbook all pass, offenders 24/25 (X9); tsc clean, 460/460 tests, lint 105 warnings 0 errors (same as baseline), build OK (ran). Open: header still wraps 1100-1249 px, Trends heatmap empty on fake data, leftover emoji elsewhere, unused CSS sweep.
- [x] Step 9 polish, item 4 (approved mock-up). Done 2026-11-14: roster badges and trend chips, toast, AI loader and Copy button use line icons (5 new icons). Modal emoji go with item 5. Browser checks: step9 polish 38/38, layout 85/85, header 16/16, add workbook all pass, offenders 24/25 (X9); tsc clean, 464/464 tests, lint 105 warnings, build OK (ran). Found: `ImportPreviewModal.tsx`, `ManageMemoryModal.tsx`, `DatesSection.tsx` and `ImportPreviewModal.css` are unreachable since 2026-09-20 (see frontend-design.md); delete in step 10 only with his OK.
- [ ] Bar charts, sparklines, daily drill-down, 4 domain tiles [F7]
- [ ] Hover effects work. Hover dimming is done in JavaScript (`onMouseOver`/`onMouseOut`) in `TopNavbar`, `MainModal`, `FloorBurnoutTab`; on touch screens the buttons stay dim. Move to CSS `:hover`/`:focus-visible`, resting state fully visible [F8, U2]
- [ ] Search by comma: show the typed terms as removable chips under the box. Today the only hint is the placeholder in `FloorHeader.tsx` [U4]
- [ ] A loading state for the first metric cards (a real "resolving" flag, no fake timer) [U5]
- [ ] Red is for problems only: about 10 places use red as a neutral label color (old audit count, recheck) [U3]
- [ ] One button shape in the header (round ◀ ▶ next to rectangular tabs) [U6]
- [x] Merge the two offender systems into one rule set [X6]. Done 2026-11-09, his decision: ONE concept named "Repeated" (the word "Chronic" is gone from the app). Rule: missed target in 2 or more of the LATEST 3 months loaded, not necessarily back-to-back, on every metric that has a target. Edge cases (his OK): a month with no data is not a miss; only 2 months loaded and both missed = flagged; only 1 month = never flagged; equal to target passes; a month nobody loaded is skipped. What changed: `repeatOffenders.ts` holds the one rule (`chronicOffenders.ts` and its tests deleted); it is computed once in `metrics.ts` and read by the roster badge, the agent modal, the Repeated Offenders tab and the header chip, so they cannot disagree; the Settings tick-list is removed (an old saved `repeatOffenderMetrics` value is ignored). Tab: cards Total Repeated Offenders / Missed Every Month / Primary Issue Area, column "Misses" ("2 of 3 months") and per-month ✅/❌ badges. 43 offender unit tests (worked out by hand first) plus 2 new header tests; Chromium on fake data: `tools/e2e_repeated_offenders.py` 23/24 (the 1 failure is X9), `tools/e2e_header.py` 16/16 including 3,000 agents x 12 months = 300 flagged (ran); the rule takes 96 ms for 225,000 agent-days (ran, Node). Test scripts that reload the page now clear IndexedDB first. Still open: past months are judged against today's targets (parked); the rule is fixed at 2 of 3 (not a setting).
- [ ] Frontend debt: undefined Tailwind-style classes, 74 inline styles, Vite template CSS, dead `if (false …)` block in `App.tsx` (line 308, hides a ~60-line account-setup screen), a ref written during render (`aiResetRef.current = …`, `App.tsx` line 224), unused CSS classes (about 48 per the old audit, recheck)
- Collect while rewriting these files, do not open a separate pass: 74 inline `style={{}}` [S15], many inline arrow handlers [S16].
- [x] Long conditional `className` chains → named class constants [S18] (done 2026-11-09, ahead of Step 9 at his request): 12 long chains in `menus.tsx`, `shared.tsx`, `MainModal.tsx` and `FloorRosterTab.tsx` now use named constants. Class output is identical: live-app crawl of 206 screen states / 76,192 elements, 0 differences before vs after (ran). The 10 short chains (`x${on ? ' active' : ''}` style in `SidebarNav`, `ImportLanding`, `ImportPreviewModal`, `FloorApprenticeTab`, `MainStatsRow`) were left as they are readable.

### Step 10: Cleanup (rolling, alongside steps 1–9)
Remove `@ts-nocheck` [K5], file by file (9 files, 3,477 lines, counted 2026-11-10). Best done when a step already edits the file; the UI files get rewritten in step 9, so skip them until then.
- [x] `helpers.ts` (do after step 0 tests are green)
- [x] `emptyColumns.ts`
- [x] `config.ts`
- [ ] `metrics.ts`
- [ ] `hooks.ts`
- [ ] `components/shared.tsx`
- [x] `components/menus.tsx`. Done 2026-11-10: types for both menus (`TimeframeMenu`, `SettingsMenu`), unused `React` import removed, nothing else changed. `SettingsMenu` keeps `closeMenu` as an optional prop that it does not use (TopNavbar still passes it). tsc clean with the file now checked, 460/460 tests, lint 0 errors, build OK (ran). Chromium on fake data, a throwaway script (not committed): 24 of 24 checks, covering every timeframe control, the metric tick boxes and no JavaScript errors (ran).
- [ ] `App.tsx`
- [ ] `batchImport.ts`, `persistence.ts`, `state.ts`, `timeframe.ts`, `uploadFlow.ts` (missing from this list until 2026-11-10; counted: 10 files in all, ran)

Other cleanup:
- [ ] Typed dashboard context: replace `createContext<any>` in `hooks.ts` with a real type, and add a test that fails if a component uses an AI member the hook does not return [C4]
- [x] Rename Gemini names to neutral ones: `executeGeminiAction` → `executeAiAction`, `GeminiLoader` → `AiLoader`, `.gemini-btn` → `.ai-btn` [C2]. Done 2026-11-10: names only, no logic change. 30 lines in 11 files (`hooks.ts`, `shared.tsx`, the 6 AI tabs and modals, `chartActionPlanModal.tsx`, `aiSwitch.test.ts`, `dashboard.css`); 0 "gemini" left in `src/` (ran). tsc clean, 460/460 tests, lint 0 errors, build OK (ran). Chromium on fake data: `tools/e2e_page_layout.py` 66 of 66 incl. no JavaScript errors (ran); built CSS holds `.ai-btn`, built CSS and JS hold no "gemini" (ran). Not run: `tools/e2e_s12_copy_button.py` (hard-coded browser path), and the AI buttons were not clicked (the AI is frozen).
- [ ] Split `ImportPreviewModal.tsx` (1,347 lines) further: move its state and handlers into a hook. Move only; do not fix its 4 `setState`-in-effect warnings in the same commit [S4]
- [ ] `COL_DEFINITIONS` is referenced from 25 places in 8 files; tidy only when touching them [S20]
- [ ] `runChartData` rebuilds its date list on every recompute (`metrics.ts`); only if it measures slow [S23]
- [ ] Decide: should an in-flight import be aborted when the page unmounts? Not done today; it changes visible behavior, so needs his OK
- [x] Repo root cleaned: Python scripts, PNGs, `.tmp_test` moved or removed; `.gitignore` blocks `*.csv`, `*.xlsx`, `*.xls`; README says 9 tabs and no longer mentions Gemini [X8]
- [x] `recommendations.md` merged into this file and deleted (2026-11-08). The 29 code comments that pointed at it now point here or to git history.

---

## Decisions needed from Beeshoy

1. **Order:** is 0 → 10 OK, or do you want recipes earlier?
2. **AI reports (FROZEN by his decision 2026-11-09):** the features stay in the app, switched off and showing "Under construction", until he decides how the AI should work. Options: (A) a local model, nothing leaves his PC; (B) the app builds an anonymous brief and he pastes it into a chat himself, no API key in the app; (C) a paid API with anonymous totals only. If he goes back to Gemini: the free API tier lets Google use the prompts to improve its products, the paid tier does not (web search 2026); Claude's API is not used for training by default, retention window to be confirmed. Raw named data to any cloud AI is not an option. Also check the company's rules before any outside AI.
3. **Samples (needed before step 8 only):** one file per type (VOC, Sales, Absenteeism, AUX) with headers and 3–5 rows. Fake the agent names if you like.
4. ✅ **Look (decided 2026-11-09):** the light mint design in `docs/frontend-design.md`, not a dark canvas. Still to confirm: the hero, action queue and Data Health panel on that look. An HTML mock-up comes first, before any UI is built. Note: `docs/frontend-design.md` proposes a light mint-grey base with forest green and peach instead of a dark canvas. Which look do you want: dark or the light mint one?
5. **Policy (before step 7b):** does the company allow agent-level data in Google Sheets? Which Google account holds the sheets: personal or company?
6. **Rates across files (parked, see Step 2):** should "newer file wins" be the default for AHT, VXS and other rates when two files give the same agent + day? He said same KPI in two files means an update, but is not sure about changing the default yet.

---

## The five known bugs

Test used: 2 agents × 10 calls per file.

| # | Bug | Status | Verified cause |
|---|---|---|---|
| 1 | Resolve 2Hr/3Day counts vanish | 🟢 fixed (step 1) | The old dead-tag cause is already guarded: `Resolve_2Hr_Count` now maps to `resolveTotalContacts2hr`. The live cause is that `aggregateTransactions` divides counts by row count, so 8 flagged of 10 calls becomes **0.8**. With no pass column the 2HR % never computes and the gauge stays empty. **Update 2026-11-08:** step 1 stopped the division; counts are summed (`SUMMED_COUNT_FIELDS`). The 2HR gauge still needs a pass or percent column (see Step 1). |
| 2 | Transfer_logs handoffs wrong after merge | 🟢 fixed (steps 1–2) | Three causes stack. Handoffs count 2 becomes **0.2**. The Transfer file has no Supervisor, so its merge key differs and 6 rows become 4 (expected 2). `calls` is summed across files: 10 + 10 = **20**. A later upload then overwrites (B1). **Update 2026-11-09:** all three causes fixed (counts stay counts, merge key = agent + date, `calls` not summed). Browser-tested with two overlapping 300K-row fake files (ran). |
| 3 | Mapping prompts for obvious fields | 🟢 mostly fixed | Only "Calls Handle Time" still asks. Your e2e screenshot pre-selects "Calls" while the engine's own guess is AHT. Two mapping engines (preview scoring vs importer) can disagree: with text-like sample values, CCMS is unmapped in one and `employeeId` in the other. |
| 4 | Pivot CSVs not detected | 🔴 open | `Row Labels`, `Sum of Calls`, `Average of CSAT` all map to nothing with no warning. The sheet selector keeps a sheet named "Pivot". |
| 5 | `@ts-nocheck` hides code from `tsc` | 🟡 open | **8 files, 2,529 of 20,275 lines (12%)** (ran, counted on 2026-11-08): `shared.tsx`, `menus.tsx`, `App.tsx`, `hooks.ts`, `helpers.ts`, `config.ts`, `metrics.ts`, `emptyColumns.ts`. "tsc clean" does not cover them. (My first audit said 13 files and 27%. That was wrong: it counted files that only mention the word in a comment.) **Update 2026-11-09 (ran):** now 10 files, 3,547 lines: `App.tsx`, `menus.tsx`, `shared.tsx`, `batchImport.ts`, `hooks.ts`, `metrics.ts`, `persistence.ts`, `state.ts`, `timeframe.ts`, `uploadFlow.ts`. `helpers.ts`, `config.ts` and `emptyColumns.ts` are cleaned. The list of 8 above missed `batchImport.ts`, `persistence.ts`, `state.ts`, `timeframe.ts` and `uploadFlow.ts`. |

---

## Backend scorecard

| | Area | Evidence |
|---|---|---|
| ✅ | **B1** A second upload replaces the same agent+day | `batchImport.ts:183` assigns the whole record (read) **Fixed 2026-11-09** (step 2): `mergeDayRecord` merges into the stored day; browser-tested (ran). |
| ⛔ | **B2** Rows with no agent name are deleted | `validation.ts` drops them (read) |
| ✅ | **B3** Merge key includes supervisor + location + ID | the same agent+day from two files doesn't merge (ran) **Fixed 2026-11-09** (step 2): key = agent (ID or name) + date (ran). |
| ✅ | **B4** `localStorage` cap | ~10.7 MB for 100 agents × 12 months vs ~5 MB cap. On overflow it kept data in RAM only and lost it on reload (ran, size measured on synthetic data) **Fixed 2026-11-09** (step 4): big data now in IndexedDB; 150,000 of 150,000 agent-days survive a reload (ran). |
| ✅ | **B5** Count fields divided by row count | see bugs 1 and 2 (ran) **Fixed 2026-11-08** (step 1) (ran). |
| ⛔ | **C1** AI: data leaves the browser | `hooks.ts:236` posts dashboard data (roster, supervisors, series) to `api.anthropic.com` from the browser, with no key and no backend. Three tabs fire it on open (read). The old effect that fired on every state change is gone. **Frozen 2026-11-09 (interim):** `AI_ENABLED = false`; zero outside requests in a browser check with fake data (ran). Final design still open (Decision 2). |
| 🔴 | File System Access API, IndexedDB, `lastModified` polling, recipes | 0 hits in the repo (ran) |
| 🔴 | Sales, absenteeism, AUX, floor-level VOC | `Sales`, `Absent Days`, `AUX Break`, `Login Hours` map to nothing (ran) |
| 🔴 | Floor or month-keyed rows | the model is agent × day only (read) |
| 🟡 | Weighted satisfaction, trend math | untested (see step 0) (read) |
| 🟡 | Month selector | derived from `YYYY-MM-DD` keys; no monthly-only rows (read) |
| 🟡 | `mappingMemory` | stores header→field only. No sheet, header row, date format or filename detection, so it is not a recipe (read) |
| 🟡 | Account profile | closest thing to a recipe, but per account, not per file type (read) |
| 🟡 | Main-thread work | confirm path = 0.87 s CPU at 300K rows in Node. Expect a 1–3 s hitch in Chrome; to be measured there (ran) |
| 🟢 | Quality gates | `tsc` clean, 429/429 tests pass (2026-11-09), lint warnings only (ran) |
| 🟢 | Worker XLSX parse, Excel serial dates, sheet filtering | ran |
| 🟢 | Repeated Offenders module (the one offender rule since 2026-11-09) | pure functions with tests (ran) |
| 🟢 | Alias engine in `importPolicy.ts` | only 1 of 11 real headers still prompts (ran) |
| 🟢 | Storage facade, AI-tools members, memoized hook returns, import-folder structure | landed since the old audit; no action (read, plus 274 tests) |

---

## Also found (not on your list)

| Sev | Finding | Evidence |
|---|---|---|
| ⛔ | **X1 Month-label dates land in the wrong month in Cairo time.** `September 2026` → **2026-08-31**. `Sep-26` → 2001-09-25. `Sep 5, 2026` → Sep 4. `9/2026` → null. A VOC sheet named "Sep" is never read as the month. **Update:** the date text is now parsed correctly (step 3, change 1, `import/dateText.ts`, 14 tests); the sheet-name part is fixed too (change 3, `import/sheetMonth.ts`); the import preview now shows the order and asks for a missing year (`DatesSection.tsx`). | ran |
| ✅ | **X2 Missing is saved as 0** for calls, AHT, VXS, resolve2hr, resolve3d. A Sales-only file would write VXS 0 and AHT 0. | read **Fixed 2026-11-09** (step 2): `buildDayRecord` in `dayRecord.ts`; missing, `-` and `n/a` stay null, a real 0 stays 0 (ran). |
| ✅ | **X3 Invented survey counts.** When only a VXS % exists, `helpers.ts` sets surveys = max(1, round(calls × 5%)), which skews weighted CSAT. | read **Fixed 2026-11-09** (step 2): the 5% rule is gone; floor figures use real counts only (ran). |
| 🟡 | **X4** `isOff = calls === 0` drops absent and AUX-only days from rollups. | read |
| 🟡 | **X5** Trend column compares a period with itself in monthly view, so it always shows "STABLE +0.00%". VXS only. | ran, seen live |
| ✅ | **X6** Two offender systems with different rules (Chronic 3+ in a row, Repeated 2+ in a row). **Fixed 2026-11-09**: one rule, named Repeated, 2 of the latest 3 months. | ran |
| 🟡 | **X7** Dates default to DD/MM silently, with no per-file setting. **Update:** order is now detected per sheet (`import/dateText.ts`, `detectDateOrder`); a sheet with no proof still defaults to DD/MM, but the import preview now warns and lets you switch (`DatesSection.tsx`). | ran |
| ✅ | **X8** Repo hygiene: 5 Python scripts, 3 PNGs and `.tmp_test` in the root. README says 8 tabs; there are 9. | ran **Fixed** (step 10, commit 5108eb0): scripts moved to `tools/`, PNGs and `.tmp_test` removed, README says 9 tabs. |
| ⛔ | **X9 (new, found 2026-11-09)** In the Repeated Offenders tab (then named Chronic), clicking the coaching-plan button throws `TypeError: setUploadStatus is not a function` (`FloorOffendersTab.tsx:80`). Confirmed again in a real browser after the X6 change. The tab reads `setUploadStatus` and `scheduleStatusClear` from the dashboard data, but the hook's returned object does not include them. Same failure class as C4, on `dashData` instead of `aiTools`. Not fixed yet; he deferred it on 2026-11-10 ("not now"), so it waits for his OK. | ran |

---

## Data flow: today vs target

```
TODAY
 Excel/CSV (you hand-merge → 1 CSV) ──► drop files
   └─► Worker parses XLSX   (CSV is parsed on the main thread)
        └─► Preview modal (mapping prompts)
             └─► map → aggregate → validate → merge   (main thread)
                  └─► applyBatchImport: history[agent][day] = {19 fixed fields}  ⛔ REPLACES
                       └─► localStorage JSON (~5 MB cap)                          ⛔ fails silently
                            └─► 9 tabs, agent × day only

TARGET
 📁 Folder (picked once · handle in IndexedDB · 1 click per session)
   └─► poll lastModified every 30 s → changed/new files only
        └─► Recipe match (filename | headers) → Worker: parse + map + aggregate
             └─► IndexedDB store  keyed  agent+day  │  floor+month
                  ├─ Sales, VOC            (month, floor)
                  └─ Absenteeism, AUX      (daily, agent) → month rollup + daily drill-down
                       └─► One view: floor × month × agent  +  Data Health panel
```

---

## Frontend audit

Method: I seeded 24 synthetic agents × 3 months and screenshotted the live app. I compared it with your two references.

- **Reference 1, vendor-risk "briefing" dashboard:** one dark hero card with a headline and big number, a "Waiting for you" queue with action buttons, "Evidence health" bars with expiry chips, a bar chart, and a stat with a delta and sparkline.
- **Reference 2, "Dashboard V22":** slim icon rail, tinted glass cards, stat cards with gradient icons and green delta chips, hover lift.

| # | What I see | Reference does | Fix direction |
|---|---|---|---|
| F1 | Two KPI cards show **identical numbers** in monthly view. 430 px tall, repeated on all 9 tabs, so real content starts below the fold. | One hero with a sentence headline | One briefing hero. Tabs get the space. |
| F2 | No "what needs me" surface. Offenders are buried in tabs. | "Waiting for you" queue | Action queue: repeat misses, absence spikes, AUX over target. |
| F3 | No data freshness or file status. | "Evidence health" bars | **Data Health panel**: file, rows, last modified, status. This is the folder-link UI. |
| F4 | Trend is always +0.00%. | Delta plus sparkline | Real delta vs prior month, plus a sparkline per tile. |
| F5 | Beige canvas (`#f5f2eb`), dark cards and emoji icons are mixed. | One card system, one icon set | One canvas, 4 domain colors, SVG icons, in the light mint look from `docs/frontend-design.md`. |
| F6 | 272 px fixed text sidebar. | Slim icon rail | Collapsible rail. |
| F7 | Only chart is a hand-rolled ring; labels truncate ("HAND-OF…"). No bars, no daily drill-down. | Bar chart, stat cards with delta chips | Sparklines and bars, a daily drill-down, 4 domain tiles (Sales, VOC, Absence, AUX). |
| F8 | Hover effects don't work. | Hover lift | CSS only. |

Frontend debt (ran):
- Classes like `hover:-translate-y-1`, `bg-[#fff1f2]`, `text-[10px]`, `bg-opacity-20` are used in the TSX but defined in no CSS, so they do nothing. The CSS is 189 hand-written utility classes imitating Tailwind. Do not add Tailwind or a class-name library to fix this.
- 74 inline `style={{}}` blocks.
- Leftover Vite template CSS: global `text-align:center`, 56 px `h1`.
- `App.tsx` has a dead `if (false && …)` block of about 60 lines.
- No UI tests.

### Design ideas to carry into step 9 (from the landing page vs dashboard comparison)

**Superseded 2026-11-09:** he chose the light mint look in `docs/frontend-design.md`. Ideas 1–4 below assumed a dark canvas and no longer apply. Ideas 5–7 (fluid headings, card hover lift, brand mark) can carry over.

The landing page already has the look you want: `#0b0b0a` background with a soft blue glow, cards with a `#2c2c2a` border on `#151512`, mint `#5dcaa5` for "good", gold `#f0c674` for warnings, blue `#378add` for glow. The dashboard ignores all of it. Ideas, ordered by impact against effort; none is built yet:

| # | Idea | Impact | Effort |
|---|---|---|---|
| 1 | One dark background for the whole dashboard (`#0b0f19` / `#111827`) | High | Low |
| 2 | Map "good" to mint `#5dcaa5`, warning to gold `#f0c674`, glow to blue `#378add` | High | Low |
| 3 | Soft radial blue glow behind the KPI row | High | Very low (1 CSS rule) |
| 4 | Tab bar as a dark card, active tab marked with a mint bottom border | Medium | Medium |
| 5 | Larger fluid headings (`clamp()`) for "Month to Date" and "Daily Spotter" | Medium | Low |
| 6 | KPI card hover lift, fade-in when data loads | Low | Very low |
| 7 | Small static version of the landing orb as the navbar brand mark | Low | Medium |

Ideas 1–3 alone should close most of the visual gap with no risk to functionality. All of it still needs the mock-up and his OK first.

---

## Plan table (one idea per step, smallest first)

Foundation first. Recipes on a model that overwrites and divides wrongly would automate the bugs.

| # | One idea | Fixes | Size |
|---|---|---|---|
| 0 | Tests around weighted-satisfaction, trend math (no behavior change) | C3 | S |
| 1 | Count fields stay counts, not divided by rows | bug 1, bug 2 (part), B5 | S |
| 2 | Merge key = agent ID or name + date only. `calls` not summed across files. Merge into the existing day instead of replacing. Missing stays null. | bug 2, B1, B3, missing = 0 | M |
| 3 | Fix month-label dates. Add a per-file date-format setting. | date bugs | S |
| 4 | Move data storage from `localStorage` to IndexedDB. AI off by default, no auto-calls. | B4, C1, privacy | M |
| 5 | Recipes v1: per file type, saves sheet, header row, mapping, date format and metric meaning. Auto-applies by filename or headers. Pivot files get flagged. | recipes, bug 3, bug 4 | M |
| 6 | Folder link: File System Access API, handle in IndexedDB, one click per session | goal 1 | M |
| 7 | Live refresh: poll `lastModified` every 30 s, re-read changed or new files only, in the worker, with per-file status | goal 4 | M |
| 7b | Google Sheets reader (private sheet via Sheets API). Excel on the web needs no step: sync the OneDrive library and use the folder link. | Sheets live data | M |
| 8 | New metric types and floor+month rows (Sales, VOC floor, Absenteeism, AUX). Daily → month rollup with daily drill-down. | B2, goal 3 | L |
| 9 | Combined view (floor × month × agent) plus the F1–F8, U1–U6 and design-idea work | goal 5 | L |
| 10 | Remove `@ts-nocheck` file by file, plus the other cleanup items | bug 5 | rolling |

Each step: test with real-scale data in a real browser, run `tsc` and the tests, short report.

---

## Reference: rules and map for anyone touching the code

### STANDING RULE: mapping fixes always go in `importPolicy.ts` only

> **This rule applies to ALL future mapping-related bugs, forever. Any AI model working on this codebase must read this before touching any import-related code.**

When a dashboard metric (handoffs, 2HR, 3DR, CSAT, AHT, or any other field) shows incorrect values (zero, null, or wrong numbers) after an import, the **first and default assumption** must be that the column alias list is incomplete or wrong.

**The principle.** This dashboard is designed to work with files from **many different source systems**: Verizon-style exports, third-party workforce management tools, custom Excel trackers, etc. Every system names its columns differently. The mapping layer (`importPolicy.ts`) is the single correct place to handle that variation.

**Do not fix mapping problems by:**
- Changing calculation logic in `helpers.ts`
- Changing how values are stored in `applyBatchImport` (`batchImport.ts`)
- Changing value normalization in `schemaNormalizer.ts`
- Adding special-case logic anywhere in the dashboard rendering or aggregation pipeline

**Always fix mapping problems by:**
- Adding missing column name aliases to the relevant field's `aliases` array in `FIELD_ALIASES` inside `src/features/dashboard/import/importPolicy.ts`
- Removing ambiguous aliases that are shared between two fields (they cause silent overwrites in the lookup map)
- Adding or correcting token hints in `HEADER_TOKEN_HINTS` in the same file
- Updating `PAIRED_COUNT_FIELDS` if a pass/count column pair is not being detected

**Why only `importPolicy.ts`.** The rest of the pipeline (`schemaNormalizer.ts`, `importService.ts`, `helpers.ts`, the hooks) is generic and correct. It does not know or care about specific column names. `importPolicy.ts` is the **only** file that is supposed to know about real-world column name variations. Keeping all alias knowledge in one file makes it easy to audit, extend, and test without side effects anywhere else.

**Checklist before any mapping fix**
1. Identify the exact column header string as it appears in the uploaded file (case-sensitive, including spaces and symbols).
2. Run the header through `normalizeHeader()` mentally (lowercase, strip non-alphanumeric to spaces, trim) and check if the result matches any existing alias in `FIELD_ALIASES` for the target field.
3. If it does not match, add it to the `aliases` array of the correct field.
4. Check that the same normalized string is NOT already listed in another field's aliases. If it is, remove it from the wrong field first.
5. If the header is ambiguous (e.g. "Repeat Rate" could be 2HR or 3DR), add the disambiguating version ("2HR Repeat Rate", "3DR Repeat Rate") and remove the ambiguous form from both.
6. Run the existing import tests to confirm no regressions.

### Working traps (each already cost time here)

1. **`tsc` is blind to the 8 `@ts-nocheck` files.** A clean `tsc -b` proves nothing about them. Check them by reading the diff and by requesting them through the Vite dev server (the page must still load).
2. **The dashboard context is typed `any`** (`DashboardContext` in `hooks.ts`). Adding or removing a member of a hook's return object is not checked against its users. Search every consumer when you change one.
3. **The object returned by `useDashboardData` is a public contract.** Many components read its keys. Adding a key is fine; renaming or removing one needs a search of every user first.
4. **The `import/` folder is layered and must stay acyclic:** `types` → (`importPolicy` | `schemaNormalizer` | `mergeData` | `columnFingerprinter` | `granularityDetector` | `mappingMemory` | `csvParser` | `fileTypeDetector` | `sheetSelector` | `validation`) → `importService` → `ImportPreviewModal`. Pure functions only below the UI line. `workbookWorker.ts` keeps its own inline helper copy and `.ts` import extensions on purpose (the worker loads outside the bundler).
5. **Every `setTimeout` that calls `setState` needs an owner that clears it.** Use `scheduleStatusClear` in `state.ts` for upload-status toasts.
6. **Rules of hooks:** every early `return` sits below every hook call.
7. **Saved-data keys in browser storage must not be renamed** without a migration; renaming silently discards learned mappings and account profiles. All access goes through `storage.ts`.
8. **Memoized hook returns** (`useMemo` on `useDashboardData`, `useAiTools`, `useDashboardMetrics`): a wrong dependency list shows stale numbers with no error. After touching them, click through all 9 tabs and change timeframe and month.

### Code map

| Folder / file | What it does |
|---|---|
| `dashboard/hooks.ts` | Composes the pieces below; `useAiTools`; the dashboard context |
| `dashboard/state.ts` | The `useState` values, import-preview wrappers, `scheduleStatusClear` |
| `dashboard/persistence.ts`, `idbStore.ts`, `storage.ts`, `storageMemory.ts` | Big data saves to IndexedDB (`idbStore.ts`, loaded before first render from `main.tsx`); small values use the safe localStorage facade plus key registry, in-memory fallback |
| `dashboard/timeframe.ts` | Month/week/day/DOW selectors and the agent-data cache |
| `dashboard/uploadFlow.ts` | Drag/drop, multi-file, automatic import routing |
| `dashboard/batchImport.ts` | `applyBatchImport`, `confirmImportPreview`, `processFile` (owns the replace-on-upload code, step 2) |
| `dashboard/metrics.ts`, `helpers.ts`, `config.ts`, `emptyColumns.ts` | Floor metrics, rollups, VSF math, column definitions |
| `dashboard/repeatOffenders.ts` | The one offender rule: 2 of the latest 3 months (X6, done) |
| `dashboard/uiReducer.ts` | Modal and UI reducers |
| `dashboard/views/{chrome,tabs,modals}` | The 9 tabs, navbar, header, stats row, main modal |
| `dashboard/import/fileTypeDetector`, `csvParser`, `workbookLoader`, `workbookWorker`, `sheetSelector` | Read files; Excel parsing runs in a Web Worker |
| `dashboard/import/importPolicy`, `columnFingerprinter`, `mappingMemory`, `accountDetector`, `excelSerialRange` | Column mapping engine, value-pattern detection, learned mappings, Excel serial-date ranges |
| `dashboard/import/schemaNormalizer`, `validation`, `aggregateTransactions`, `mergeData`, `granularityDetector`, `importService`, `asyncUtils`, `types` | Normalize, clean, roll up per-call rows to agent-day, merge, orchestrate |
| `dashboard/import/ImportPreviewModal.tsx`, `previewState.ts`, `ManageMemoryModal.tsx` | Preview and mapping UI |
| `accountSetup/` | Account profile schema, builder and storage |
| `src/styles/dashboard.css` | Dashboard CSS (hand-written, includes 189 utility classes) |

Canonical field set: `agentName` · `supervisor` · `oam` · `employeeId` · `date` · `location` · `calls` · `aht` · `resolve2hr` · `resolve3d` · `vxs` · `satisfaction` · `handoffs` · `transferRate` · `sourceFile` · `sourceSheet`

---

## Test data: a fake quarter for a big floor

Run `node tools/make-fake-floor.mjs` (from the repo, after `npm install`). It writes `fake-floor-2026Q3/` (git-ignored, about 33 MB, 2 s, same files every run). All names and IDs are invented.

| What | Size |
|---|---|
| Agents / floors / supervisors | 350 / 3 / 35 |
| Call rows (Jul–Sep 2026, 3 monthly files) | about 290,000 |
| Also | transfer log, sales, pivot export, floor VOC, absenteeism, AUX, answer keys |

`answer_key_agent_month.csv` and `answer_key_floor_month.csv` hold the true totals. Steps 1–3 and 8 should compare the app's numbers against them. `README.txt` in the output folder lists the built-in traps (supervisor change on Aug 15, overlapping re-export, mixed date formats, blank survey cells, training days with zero calls, pivot export, junk rows). Do not commit the generated files; commit changes to the script instead.

---

## Appendix: how this was checked

- Repo unzipped into its own folder. `npm ci`, `tsc -b`, `npm test` (274 pass), `oxlint` (warnings only).
- Probes with the repo's own functions: header mapping, 3-file transaction merge, date parsing, pivot headers, mapping confidence, 100K and 300K row timing.
- Live app in Chromium (Cairo timezone) with synthetic data, for the screenshots and the storage-size estimate.
- 2026-11-08: the old `recommendations.md` was checked item by item against the code (greps, file listings, `tsc`, tests). Done items were dropped; open items were merged above. Counts marked "old audit" were not rechecked.
- Not yet checked: real 300K-row timing in the browser, and the overwrite behaviour across two real uploads. Both are planned for steps 1–2.
