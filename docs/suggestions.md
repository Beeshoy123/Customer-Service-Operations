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
4. **UI:** dark theme with color-coding. Never design without confirmation: show an HTML mock-up first.
5. **Mapping and alias fixes go only in `importPolicy.ts`** (the repo's standing rule, full text in the Reference section below).
6. **Before every commit run** `tsc -b`, `npm test`, `npm run lint` and `npm run build`. Baseline on 2026-11-08: tsc clean, 274/274 tests pass, lint 0 errors.
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
| A second file for the same agent and day **replaces** the first | This is why you merge everything into one CSV by hand |
| Data is saved in the browser's small storage (~5 MB). Yours needs ~10 MB. | When it's full, the browser forgets silently. That is probably why you re-upload. |
| Counts get divided by the number of calls | 2 handoffs in 10 calls is saved as 0.2. That is the Transfer_logs bug. |
| Same agent and day in two files doesn't merge if one file lacks Supervisor | Rows stay split and numbers come out wrong |
| Only call-center metrics exist | Sales, Absenteeism, AUX and floor-level VOC have nowhere to go |
| Rows with no agent name are deleted | Floor-level VOC and Sales would disappear |
| Three tabs try to send dashboard data to an AI service when you open them | Breaks your "agent data stays on my PC" rule. It fails today only because there is no key. |

**What I suggest:** protect the math with tests (step 0), fix the foundation (steps 1–4), then add recipes, the folder link and live refresh (steps 5–7), then the new data types and the new look (steps 8–9). Cleanup runs alongside.

**What I need from you:** the answers in "Decisions needed".

---

## Priority board (most critical first)

| Rank | Level | Work | Why this position |
|---|---|---|---|
| 1 | ⛔ P0 | **Step 0**: tests around bonus, weighted-satisfaction and trend math | Nothing guards the numbers that decide bonuses. Tests only, no behavior change. Must exist before steps 1–2 touch the math. |
| 2 | ⛔ P0 | **Step 1**: counts stay counts | Wrong numbers on screen today |
| 3 | ⛔ P0 | **Step 2**: merge without losing data | A second upload erases the first; rows don't merge |
| 4 | ⛔ P0 | **Step 3**: dates | `September 2026` becomes Aug 31 in Cairo |
| 5 | ⛔ P0 | **Step 4**: storage (silent data loss) **and AI off by default** (data leaving the PC) | Both break a rule of yours |
| 6 | 🟡 P1 | **Steps 5–7b**: recipes, folder link, live refresh, Google Sheets | The goal features, built on the fixed foundation |
| 7 | 🟡 P1 | **Step 8**: Sales, Absenteeism, AUX, floor-level rows | New data types |
| 8 | 🟢 P2 | **Step 9**: combined view and redesign (includes the UX and design-gap items) | Look and usability; do after the data is right |
| 9 | 🟢 P3 | **Step 10**: cleanup (`@ts-nocheck`, renames, file splits, root clutter) | Rolling; touch each file when a step already edits it |

---

## Checklist: what must change (cross off when done)

Format: `[ ]` open · `[x]` done. Codes in brackets point to sections below: **B** = blocker (Backend scorecard), **K** = known bug, **X** = extra finding, **F** = frontend, **C** = AI/safety item, **U** = usability item.

### Step 0: Safety net for the math (tests only)
- [ ] Tests for `calculateBonus`: every tier boundary, missing and partial inputs [C3]
- [ ] Tests for `calculateWeightedVSF`: weighting math, zero denominator [C3]
- [ ] Tests for `calculateTrend`: flat, rising, falling, single point [C3]
- [ ] Tests for `agentMatchesSearch`, `formatName`, `shortenManagerName` [C3]
- Rule: expected values computed by hand first. If the code disagrees, stop and report a bug. Do not change any threshold, formula or rounding. Today `helpers.test.ts` covers only hand-offs (8 tests) (ran).

### Step 1: Counts stay counts
- [x] `aggregateTransactions` no longer divides count fields by row count (handoffs, resolve 2Hr/3Day, surveys, promoters, etc.) [K1, K2, B5]
- Done 2026-11-08: 18 count fields are now summed (`SUMMED_COUNT_FIELDS`); `aht`, `hold`, `dpc` and all rates stay averaged. Tested at 300K rows in Chromium: 3000 of 3000 agent-days correct (ran).
- Still open, not part of this step: the 2HR gauge stays empty unless the file has a pass column or a percent column. A count alone does not fill it (ran).

### Step 2: Merge without losing data
- [ ] Merge key = agent ID or name + date only; supervisor and location become attributes [K2, B3]
- [ ] `calls` is not summed across files for the same agent+day [K2]
- [ ] `applyBatchImport` merges into the existing day instead of replacing it [B1]
- [ ] Missing values stay null for calls, AHT, VXS, resolve2hr, resolve3d (not 0) [X2]
- [ ] Remove invented survey counts (the 5% rule in `helpers.ts`) [X3]

### Step 3: Dates
- [x] `September 2026`, `Sep-26`, `Sep 5, 2026`, `9/2026` parse to the correct date in Cairo time [X1]
- [ ] Sheet name (e.g. "Sep") can supply the month [X1]
- [ ] Per-file date-format setting (DD/MM vs MM/DD) [X7]. Done: the order is read from the file's own dates (any `13/09` or `9/13`), default day first, and the importer accepts a user choice (`dateOrder`). Open: the switch in the import preview (mock-up first), and a warning when a file gives no proof

### Step 4: Storage and privacy
- [ ] Data lives in IndexedDB, not `localStorage` (no 5 MB cap, no silent loss) [B4]
- [ ] AI off by default: a visible switch, default off; no AI request without a click [C1]
- [ ] Remove the three auto-calls on tab open: `FloorAnalysisTab`, `FloorCorrelationTab`, `FloorDowTab` each call their report function inside a mount effect [C1]
- [ ] Remove the browser → `api.anthropic.com` call (`hooks.ts`, `executeGeminiAction`). If AI is ever wanted: a small server holds the key, never a `VITE_` variable (those end up readable in the page); send aggregates, not the roster; show a visible error state on failure [C1]
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
Show an HTML mock-up and get his OK before building any of this.
- [ ] One dashboard: floor × month × agent for Sales, VOC, Absenteeism, AUX
- [ ] One briefing hero instead of two identical KPI cards; the two cards' duplicated markup becomes one component [F1, S17]
- [ ] "Needs you" action queue [F2]
- [ ] Data Health panel (files, rows, last modified, status) [F3]
- [ ] Real trend (delta vs prior month plus sparkline) instead of always +0.00% [F4, X5]
- [ ] One dark canvas, 4 domain colors, SVG icons instead of emoji (about 51 emoji-led labels, per the old audit) [F5, U1]
- [ ] Collapsible icon rail [F6]
- [ ] Bar charts, sparklines, daily drill-down, 4 domain tiles [F7]
- [ ] Hover effects work. Hover dimming is done in JavaScript (`onMouseOver`/`onMouseOut`) in `TopNavbar`, `MainModal`, `FloorBurnoutTab`; on touch screens the buttons stay dim. Move to CSS `:hover`/`:focus-visible`, resting state fully visible [F8, U2]
- [ ] Search by comma: show the typed terms as removable chips under the box. Today the only hint is the placeholder in `FloorHeader.tsx` [U4]
- [ ] A loading state for the first metric cards (a real "resolving" flag, no fake timer) [U5]
- [ ] Red is for problems only: about 10 places use red as a neutral label color (old audit count, recheck) [U3]
- [ ] One button shape in the header (round ◀ ▶ next to rectangular tabs) [U6]
- [ ] Merge the two offender systems (Chronic 3+ vs Repeated 2+) into one rule set [X6]
- [ ] Frontend debt: undefined Tailwind-style classes, 74 inline styles, Vite template CSS, dead `if (false …)` block in `App.tsx` (line 308, hides a ~60-line account-setup screen), a ref written during render (`aiResetRef.current = …`, `App.tsx` line 224), unused CSS classes (about 48 per the old audit, recheck)
- Collect while rewriting these files, do not open a separate pass: 74 inline `style={{}}`, many inline arrow handlers, conditional `className` chains.

### Step 10: Cleanup (rolling, alongside steps 1–9)
Remove `@ts-nocheck` [K5], file by file (8 files, 2,529 lines). Best done when a step already edits the file; the UI files get rewritten in step 9, so skip them until then.
- [x] `helpers.ts` (do after step 0 tests are green)
- [x] `emptyColumns.ts`
- [x] `config.ts`
- [ ] `metrics.ts`
- [ ] `hooks.ts`
- [ ] `components/shared.tsx`
- [ ] `components/menus.tsx`
- [ ] `App.tsx`

Other cleanup:
- [ ] Typed dashboard context: replace `createContext<any>` in `hooks.ts` with a real type, and add a test that fails if a component uses an AI member the hook does not return [C4]
- [ ] Rename Gemini names to neutral ones: `executeGeminiAction` → `executeAiAction`, `GeminiLoader` → `AiLoader`, `.gemini-btn` → `.ai-btn` (28 hits in 10 files). Do it with step 4 if the AI code stays [C2]
- [ ] Split `ImportPreviewModal.tsx` (1,347 lines) further: move its state and handlers into a hook. Move only; do not fix its 4 `setState`-in-effect warnings in the same commit [S4]
- [ ] `COL_DEFINITIONS` is referenced from 25 places in 8 files; tidy only when touching them [S20]
- [ ] `runChartData` rebuilds its date list on every recompute (`metrics.ts`); only if it measures slow [S23]
- [ ] Decide: should an in-flight import be aborted when the page unmounts? Not done today; it changes visible behavior, so needs his OK
- [x] Repo root cleaned: Python scripts, PNGs, `.tmp_test` moved or removed; `.gitignore` blocks `*.csv`, `*.xlsx`, `*.xls`; README says 9 tabs and no longer mentions Gemini [X8]
- [x] `recommendations.md` merged into this file and deleted (2026-11-08). The 29 code comments that pointed at it now point here or to git history.

---

## Decisions needed from Beeshoy

1. **Order:** is 0 → 10 OK, or do you want recipes earlier?
2. **AI reports:** do you use them? If not, step 4 deletes them (simplest). If yes, they stay behind an off-by-default switch.
3. **Samples (needed before step 8 only):** one file per type (VOC, Sales, Absenteeism, AUX) with headers and 3–5 rows. Fake the agent names if you like.
4. **Look:** do you confirm a dark canvas with the hero, action queue and Data Health panel? An HTML mock-up comes first, before any UI is built.
5. **Policy (before step 7b):** does the company allow agent-level data in Google Sheets? Which Google account holds the sheets: personal or company?

---

## The five known bugs

Test used: 2 agents × 10 calls per file.

| # | Bug | Status | Verified cause |
|---|---|---|---|
| 1 | Resolve 2Hr/3Day counts vanish | 🟡 half-fixed | The old dead-tag cause is already guarded: `Resolve_2Hr_Count` now maps to `resolveTotalContacts2hr`. The live cause is that `aggregateTransactions` divides counts by row count, so 8 flagged of 10 calls becomes **0.8**. With no pass column the 2HR % never computes and the gauge stays empty. |
| 2 | Transfer_logs handoffs wrong after merge | 🔴 open | Three causes stack. Handoffs count 2 becomes **0.2**. The Transfer file has no Supervisor, so its merge key differs and 6 rows become 4 (expected 2). `calls` is summed across files: 10 + 10 = **20**. A later upload then overwrites (B1). |
| 3 | Mapping prompts for obvious fields | 🟢 mostly fixed | Only "Calls Handle Time" still asks. Your e2e screenshot pre-selects "Calls" while the engine's own guess is AHT. Two mapping engines (preview scoring vs importer) can disagree: with text-like sample values, CCMS is unmapped in one and `employeeId` in the other. |
| 4 | Pivot CSVs not detected | 🔴 open | `Row Labels`, `Sum of Calls`, `Average of CSAT` all map to nothing with no warning. The sheet selector keeps a sheet named "Pivot". |
| 5 | `@ts-nocheck` hides code from `tsc` | 🟡 open | **8 files, 2,529 of 20,275 lines (12%)** (ran, counted on 2026-11-08): `shared.tsx`, `menus.tsx`, `App.tsx`, `hooks.ts`, `helpers.ts`, `config.ts`, `metrics.ts`, `emptyColumns.ts`. "tsc clean" does not cover them. (My first audit said 13 files and 27%. That was wrong: it counted files that only mention the word in a comment.) |

---

## Backend scorecard

| | Area | Evidence |
|---|---|---|
| ⛔ | **B1** A second upload replaces the same agent+day | `batchImport.ts:183` assigns the whole record (read) |
| ⛔ | **B2** Rows with no agent name are deleted | `validation.ts` drops them (read) |
| ⛔ | **B3** Merge key includes supervisor + location + ID | the same agent+day from two files doesn't merge (ran) |
| ⛔ | **B4** `localStorage` cap | ~10.7 MB for 100 agents × 12 months vs ~5 MB cap. On overflow it keeps data in RAM only and loses it on reload (ran, size measured on synthetic data) |
| ⛔ | **B5** Count fields divided by row count | see bugs 1 and 2 (ran) |
| ⛔ | **C1** AI: data leaves the browser | `hooks.ts:236` posts dashboard data (roster, supervisors, series) to `api.anthropic.com` from the browser, with no key and no backend. Three tabs fire it on open (read). The old effect that fired on every state change is gone. |
| 🔴 | File System Access API, IndexedDB, `lastModified` polling, recipes | 0 hits in the repo (ran) |
| 🔴 | Sales, absenteeism, AUX, floor-level VOC | `Sales`, `Absent Days`, `AUX Break`, `Login Hours` map to nothing (ran) |
| 🔴 | Floor or month-keyed rows | the model is agent × day only (read) |
| 🟡 | Bonus, weighted satisfaction, trend math | untested (see step 0) (read) |
| 🟡 | Month selector | derived from `YYYY-MM-DD` keys; no monthly-only rows (read) |
| 🟡 | `mappingMemory` | stores header→field only. No sheet, header row, date format or filename detection, so it is not a recipe (read) |
| 🟡 | Account profile | closest thing to a recipe, but per account, not per file type (read) |
| 🟡 | Main-thread work | confirm path = 0.87 s CPU at 300K rows in Node. Expect a 1–3 s hitch in Chrome; to be measured there (ran) |
| 🟢 | Quality gates | `tsc` clean, 274/274 tests pass, lint warnings only (ran) |
| 🟢 | Worker XLSX parse, Excel serial dates, sheet filtering | ran |
| 🟢 | Repeated and Chronic Offenders modules | pure functions with tests (read) |
| 🟢 | Alias engine in `importPolicy.ts` | only 1 of 11 real headers still prompts (ran) |
| 🟢 | Storage facade, AI-tools members, memoized hook returns, import-folder structure | landed since the old audit; no action (read, plus 274 tests) |

---

## Also found (not on your list)

| Sev | Finding | Evidence |
|---|---|---|
| ⛔ | **X1 Month-label dates land in the wrong month in Cairo time.** `September 2026` → **2026-08-31**. `Sep-26` → 2001-09-25. `Sep 5, 2026` → Sep 4. `9/2026` → null. A VOC sheet named "Sep" is never read as the month. **Update:** the date text is now parsed correctly (step 3, change 1, `import/dateText.ts`, 14 tests); the sheet-name part is still open. | ran |
| 🔴 | **X2 Missing is saved as 0** for calls, AHT, VXS, resolve2hr, resolve3d. A Sales-only file would write VXS 0 and AHT 0. | read |
| 🔴 | **X3 Invented survey counts.** When only a VXS % exists, `helpers.ts` sets surveys = max(1, round(calls × 5%)), which skews weighted CSAT. | read |
| 🟡 | **X4** `isOff = calls === 0` drops absent and AUX-only days from rollups. | read |
| 🟡 | **X5** Trend column compares a period with itself in monthly view, so it always shows "STABLE +0.00%". VXS only. | ran, seen live |
| 🟡 | **X6** Two offender systems with different rules: Chronic Offenders (3+ months) and Repeated Offenders (2+ consecutive). | read |
| 🟡 | **X7** Dates default to DD/MM silently, with no per-file setting. **Update:** order is now detected per sheet (`import/dateText.ts`, `detectDateOrder`); a sheet with no proof still defaults to DD/MM, and the preview switch is not built yet. | ran |
| 🟡 | **X8** Repo hygiene: 5 Python scripts, 3 PNGs and `.tmp_test` in the root. README says 8 tabs; there are 9. | ran |

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
| F5 | Beige canvas (`#f5f2eb`), dark cards and emoji icons are mixed. | One card system, one icon set | Your rule: one dark canvas, 4 domain colors, SVG icons. |
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
| 0 | Tests around bonus, weighted-satisfaction, trend math (no behavior change) | C3 | S |
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
| `dashboard/persistence.ts`, `storage.ts`, `storageMemory.ts` | Save/load to browser storage, one safe facade plus key registry, in-memory fallback |
| `dashboard/timeframe.ts` | Month/week/day/DOW selectors and the agent-data cache |
| `dashboard/uploadFlow.ts` | Drag/drop, multi-file, automatic import routing |
| `dashboard/batchImport.ts` | `applyBatchImport`, `confirmImportPreview`, `processFile` (owns the replace-on-upload code, step 2) |
| `dashboard/metrics.ts`, `helpers.ts`, `config.ts`, `emptyColumns.ts` | Floor metrics, rollups, bonus/VSF math, column definitions |
| `dashboard/chronicOffenders.ts`, `repeatOffenders.ts` | The two offender rule sets (X6) |
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
