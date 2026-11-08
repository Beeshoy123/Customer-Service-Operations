# Suggestions: Customer-Service-Operations

Audit date: 2026-11-08. No code was changed. This file is the saved copy of the audit and the plan.

Legend: 🟢 solid · 🟡 weak · 🔴 missing · ⛔ blocking
Evidence: **ran** = I executed it and saw the result. **read** = I read the code but did not run it.

---

## 0. In plain English (read this first)

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

**What I suggest:** fix the foundation first (steps 1–4), then add recipes, the folder link and live refresh (steps 5–7), then the new data types and the new look (steps 8–9).

**What I need from you:** three answers (section 7).

---

## Checklist: what must change (cross off when done)

Format: `[ ]` open · `[x]` done. Codes in brackets point to the sections below: **B** = blocker (§2), **K** = known bug (§3), **X** = extra finding (§4), **F** = frontend (§5).

### Step 1: Counts stay counts
- [ ] `aggregateTransactions` no longer divides count fields by row count (handoffs, resolve 2Hr/3Day, surveys, promoters, etc.) [K1, K2, B5]

### Step 2: Merge without losing data
- [ ] Merge key = agent ID or name + date only; supervisor and location become attributes [K2, B3]
- [ ] `calls` is not summed across files for the same agent+day [K2]
- [ ] `applyBatchImport` merges into the existing day instead of replacing it [B1]
- [ ] Missing values stay null for calls, AHT, VXS, resolve2hr, resolve3d (not 0) [X2]
- [ ] Remove invented survey counts (the 5% rule in `helpers.ts`) [X3]

### Step 3: Dates
- [ ] `September 2026`, `Sep-26`, `Sep 5, 2026`, `9/2026` parse to the correct date in Cairo time [X1]
- [ ] Sheet name (e.g. "Sep") can supply the month [X1]
- [ ] Per-file date-format setting (DD/MM vs MM/DD) [X7]

### Step 4: Storage and privacy
- [ ] Data lives in IndexedDB, not `localStorage` (no 5 MB cap, no silent loss) [B4]
- [ ] AI features off by default, so agent-level data never leaves the PC [§2 AI row]

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
- [ ] One dashboard: floor × month × agent for Sales, VOC, Absenteeism, AUX
- [ ] One briefing hero instead of two identical KPI cards [F1]
- [ ] "Needs you" action queue [F2]
- [ ] Data Health panel (files, rows, last modified, status) [F3]
- [ ] Real trend (delta vs prior month plus sparkline) instead of always +0.00% [F4, X5]
- [ ] One dark canvas, 4 domain colors, SVG icons [F5]
- [ ] Collapsible icon rail [F6]
- [ ] Bar charts, sparklines, daily drill-down, 4 domain tiles [F7]
- [ ] Hover effects work [F8]
- [ ] Merge the two offender systems (Chronic 3+ vs Repeated 2+) into one rule set [X6]
- [ ] Frontend debt: undefined Tailwind-style classes, 74 inline styles, Vite template CSS, dead `if (false …)` block in `App.tsx`

### Step 10: Cleanup (rolling, alongside steps 1–9)
- [ ] Remove `@ts-nocheck` [K5]: `uploadFlow.ts`
- [ ] `batchImport.ts`
- [ ] `hooks.ts`
- [ ] `metrics.ts`
- [ ] `App.tsx`
- [ ] `helpers.ts`
- [ ] `components/shared.tsx`
- [ ] `config.ts`
- [ ] `persistence.ts`
- [ ] `state.ts`
- [ ] `timeframe.ts`
- [ ] `components/menus.tsx`
- [ ] `emptyColumns.ts` (and `monthSelection.test.ts`)
- [ ] Repo root cleaned: Python scripts, PNGs, `.tmp_test` moved or removed; README says 9 tabs [X8]
- [ ] `recommendations.md` trimmed or archived (124 KB)

---

## 1. Data flow: today vs target

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

## 2. Backend scorecard

| | Area | Evidence |
|---|---|---|
| 🟢 | Quality gates | `tsc` clean, 274/274 tests pass, lint warnings only (ran) |
| 🟢 | Worker XLSX parse, Excel serial dates, sheet filtering | ran |
| 🟢 | Repeated Offenders module | pure functions, 22 tests (read) |
| 🟢 | Alias engine in `importPolicy.ts` | only 1 of 11 real headers still prompts (ran) |
| 🟡 | Month selector | derived from `YYYY-MM-DD` keys; no monthly-only rows (read) |
| 🟡 | `mappingMemory` | stores header→field only. No sheet, header row, date format or filename detection, so it is not a recipe (read) |
| 🟡 | Account profile | closest thing to a recipe, but per account, not per file type (read) |
| 🟡 | Main-thread work | confirm path = 0.87 s CPU at 300K rows in Node. Expect a 1–3 s hitch in Chrome; to be measured there (ran) |
| 🟡 | AI calls | the browser posts to `api.anthropic.com` with dashboard data and no key. Conflicts with your "no cloud" rule for agent-level data (read) |
| 🔴 | File System Access API, IndexedDB, `lastModified` polling, recipes | 0 hits in the repo (ran) |
| 🔴 | Sales, absenteeism, AUX, floor-level VOC | `Sales`, `Absent Days`, `AUX Break`, `Login Hours` map to nothing (ran) |
| 🔴 | Floor or month-keyed rows | the model is agent × day only (read) |
| ⛔ | **B1** A second upload replaces the same agent+day | `batchImport.ts:183` assigns the whole record (read) |
| ⛔ | **B2** Rows with no agent name are deleted | `validation.ts` drops them (read) |
| ⛔ | **B3** Merge key includes supervisor + location + ID | the same agent+day from two files doesn't merge (ran) |
| ⛔ | **B4** `localStorage` cap | ~10.7 MB for 100 agents × 12 months vs ~5 MB cap. On overflow it keeps data in RAM only and loses it on reload (ran, size measured on synthetic data) |
| ⛔ | **B5** Count fields divided by row count | see bugs 1 and 2 (ran) |

---

## 3. The five known bugs

Test used: 2 agents × 10 calls per file.

| # | Bug | Status | Verified cause |
|---|---|---|---|
| 1 | Resolve 2Hr/3Day counts vanish | 🟡 half-fixed | The old dead-tag cause is already guarded: `Resolve_2Hr_Count` now maps to `resolveTotalContacts2hr`. The live cause is that `aggregateTransactions` divides counts by row count, so 8 flagged of 10 calls becomes **0.8**. With no pass column the 2HR % never computes and the gauge stays empty. |
| 2 | Transfer_logs handoffs wrong after merge | 🔴 open | Three causes stack. Handoffs count 2 becomes **0.2**. The Transfer file has no Supervisor, so its merge key differs and 6 rows become 4 (expected 2). `calls` is summed across files: 10 + 10 = **20**. A later upload then overwrites (B1). |
| 3 | Mapping prompts for obvious fields | 🟢 mostly fixed | Only "Calls Handle Time" still asks. Your e2e screenshot pre-selects "Calls" while the engine's own guess is AHT. Two mapping engines (preview scoring vs importer) can disagree: with text-like sample values, CCMS is unmapped in one and `employeeId` in the other. |
| 4 | Pivot CSVs not detected | 🔴 open | `Row Labels`, `Sum of Calls`, `Average of CSAT` all map to nothing with no warning. The sheet selector keeps a sheet named "Pivot". |
| 5 | `@ts-nocheck` | 🔴 open | 13 source files, 4,282 of 15,581 lines (27%): `uploadFlow`, `batchImport`, `hooks`, `metrics`, `helpers`, `config`, `state`, `persistence`, `timeframe`, `App`. "tsc clean" does not cover them. |

---

## 4. Also found (not on your list)

| Sev | Finding | Evidence |
|---|---|---|
| ⛔ | **Month-label dates land in the wrong month in Cairo time.** `September 2026` → **2026-08-31**. `Sep-26` → 2001-09-25. `Sep 5, 2026` → Sep 4. `9/2026` → null. A VOC sheet named "Sep" is never read as the month. | ran |
| 🔴 | **Missing is saved as 0** for calls, AHT, VXS, resolve2hr, resolve3d. A Sales-only file would write VXS 0 and AHT 0. (My earlier note said all 19 fields keep null. That was wrong.) | read |
| 🔴 | **Invented survey counts.** When only a VXS % exists, `helpers.ts` sets surveys = max(1, round(calls × 5%)), which skews weighted CSAT. | read |
| 🟡 | `isOff = calls === 0` drops absent and AUX-only days from rollups. | read |
| 🟡 | Trend column compares a period with itself in monthly view, so it always shows "STABLE +0.00%". VXS only. | ran, seen live |
| 🟡 | Two offender systems with different rules: Chronic Offenders (3+ months) and Repeated Offenders (2+ consecutive). | read |
| 🟡 | Dates default to DD/MM silently, with no per-file setting. | ran |
| 🟡 | Repo hygiene: 5 Python scripts, 3 PNGs and `.tmp_test` in the root. `recommendations.md` is 124 KB. README says 8 tabs; there are 9. | ran |

---

## 5. Frontend audit

Method: I seeded 24 synthetic agents × 3 months and screenshotted the live app. I compared it with your two references.

- **Reference 1, vendor-risk "briefing" dashboard:** one dark hero card with a headline and big number, a "Waiting for you" queue with action buttons, "Evidence health" bars with expiry chips, a bar chart, and a stat with a delta and sparkline.
- **Reference 2, "Dashboard V22":** slim icon rail, tinted glass cards, stat cards with gradient icons and green delta chips, hover lift.

| # | What I see | Reference does | Fix direction |
|---|---|---|---|
| F1 | Two KPI cards show **identical numbers** in monthly view. 430 px tall, repeated on all 9 tabs, so real content starts below the fold. | One hero with a sentence headline | One briefing hero. Tabs get the space. |
| F2 | No "what needs me" surface. Offenders are buried in tabs. | "Waiting for you" queue | Action queue: repeat misses, absence spikes, AUX over target. |
| F3 | No data freshness or file status. | "Evidence health" bars | **Data Health panel**: file, rows, last modified, status. This is the folder-link UI. |
| F4 | Trend is always +0.00%. | Delta plus sparkline | Real delta vs prior month, plus a sparkline per tile. |
| F5 | Beige canvas, dark cards and emoji icons are mixed. | One card system, one icon set | Your rule: one dark canvas, 4 domain colors, SVG icons. |
| F6 | 272 px fixed text sidebar. | Slim icon rail | Collapsible rail. |
| F7 | Only chart is a hand-rolled ring; labels truncate ("HAND-OF…"). No bars, no daily drill-down. | Bar chart, stat cards with delta chips | Sparklines and bars, a daily drill-down, 4 domain tiles (Sales, VOC, Absence, AUX). |
| F8 | Hover effects don't work. | Hover lift | CSS only. |

Frontend debt (ran):
- Classes like `hover:-translate-y-1`, `bg-[#fff1f2]`, `text-[10px]`, `bg-opacity-20` are used in the TSX but defined in no CSS, so they do nothing. The CSS is 189 hand-written utility classes imitating Tailwind.
- 74 inline `style={{}}` blocks.
- Leftover Vite template CSS: global `text-align:center`, 56 px `h1`.
- `App.tsx` has a dead `if (false && …)` block of about 60 lines.
- No UI tests.

---

## 6. Plan (one idea per step, smallest first)

Foundation first. Recipes on a model that overwrites and divides wrongly would automate the bugs.

| # | One idea | Fixes | Size |
|---|---|---|---|
| 1 | Count fields stay counts, not divided by rows | bug 1, bug 2 (part), B5 | S |
| 2 | Merge key = agent ID or name + date only. `calls` not summed across files. Merge into the existing day instead of replacing. Missing stays null. | bug 2, B1, B3, missing = 0 | M |
| 3 | Fix month-label dates. Add a per-file date-format setting. | date bugs | S |
| 4 | Move data storage from `localStorage` to IndexedDB. AI calls off by default. | B4, privacy | M |
| 5 | Recipes v1: per file type, saves sheet, header row, mapping, date format and metric meaning. Auto-applies by filename or headers. Pivot files get flagged. | recipes, bug 3, bug 4 | M |
| 6 | Folder link: File System Access API, handle in IndexedDB, one click per session | goal 1 | M |
| 7 | Live refresh: poll `lastModified` every 30 s, re-read changed or new files only, in the worker, with per-file status | goal 4 | M |
| 7b | Google Sheets reader (private sheet via Sheets API). Excel on the web needs no step: sync the OneDrive library and use the folder link. | Sheets live data | M |
| 8 | New metric types and floor+month rows (Sales, VOC floor, Absenteeism, AUX). Daily → month rollup with daily drill-down. | B2, goal 3 | L |
| 9 | Combined view (floor × month × agent) plus the F1–F8 redesign | goal 5 | L |
| 10 | Remove `@ts-nocheck` file by file, as each file is touched in steps 1–9 | bug 5 | rolling |

Each step: test with real-scale data in a real browser, run `tsc` and the tests, short report.

---

## 7. Decisions needed from Beeshoy

1. **Order:** is 1 → 10 OK, or do you want recipes earlier?
2. **Samples (needed before step 8 only):** one file per type (VOC, Sales, Absenteeism, AUX) with headers and 3–5 rows. Fake the agent names if you like.
3. **Look:** do you confirm a dark canvas with the hero, action queue and Data Health panel? An HTML mock-up comes first, before any UI is built.
4. **Policy (before step 7b):** does the company allow agent-level data in Google Sheets? Which Google account holds the sheets: personal or company?

---

## Appendix: how this was checked

- Repo unzipped into its own folder. `npm ci`, `tsc -b`, `npm test` (274 pass), `oxlint` (warnings only).
- Probes with the repo's own functions: header mapping, 3-file transaction merge, date parsing, pivot headers, mapping confidence, 100K and 300K row timing.
- Live app in Chromium (Cairo timezone) with synthetic data, for the screenshots and the storage-size estimate.
- Not yet checked: real 300K-row timing in the browser, and the overwrite behaviour across two real uploads. Both are planned for steps 1–2.
