# Customer Service Operations Dashboard — Import Recommendations & Plan

> **Status: active backlog.** This file lists *open* work only. Completed recommendations, resolved bugs and finished refactor phases were removed on 2026-09-29 and live in commit history (`git log`, and the pre-purge revision of this file). Current open work: `## Critical` (4 P0/P1 defects), `## Architecture Fixes` (S1–S23), `## UX & Accessibility Findings` (U1–U6), and the open design items in `## Design Gap Analysis`.

## Objective

Upgrade the dashboard from a single-file CSV/text importer to a full mixed-format ingestion pipeline that can:

- Read multiple files in one upload
- Read CSV, TSV, TXT, XLS, and XLSX files
- Read multiple sheets inside each workbook
- Normalize inconsistent column names across sources
- Merge all data into one unified dataset
- Validate and preview before final import
- Keep compatibility with the current dashboard logic

---

## Architecture Reference

### Import folder structure (`src/features/dashboard/import/`)

| File | Responsibility |
|------|---------------|
| `fileTypeDetector.ts` | Detect file extension and format; reject unsupported types |
| `csvParser.ts` | Parse CSV/TSV/TXT safely — handles quoting, BOM, delimiter detection |
| `workbookLoader.ts` | Read Excel workbooks, enumerate sheets, convert to row arrays |
| `workbookWorker.ts` | Web Worker wrapper — keeps main thread free for large files |
| `sheetSelector.ts` | Filter out blank/non-data tabs; return selected + skipped sheets with reasons |
| `schemaNormalizer.ts` | Map incoming headers to canonical fields; normalize casing and whitespace |
| `importPolicy.ts` | Multi-signal scoring engine (header + fingerprint + memory) for column matching |
| `columnFingerprinter.ts` | Value pattern detection — dates, durations, percentages, IDs, false-positive blockers |
| `mappingMemory.ts` | LocalStorage persistence for user mapping corrections |
| `granularityDetector.ts` | Classify sheets as aggregate vs transaction granularity |
| `mergeData.ts` | Combine rows across workbooks; deduplicate by agent+date key; sum/average fields |
| `validation.ts` | Clean numeric values, fix date formats, flag missing/duplicate rows |
| `importService.ts` | Orchestrate full pipeline end-to-end with concurrency limit (4 files at a time) |
| `ImportPreviewModal.tsx` | Preview UI — workbook-grouped tabs, column mapping table, granularity confirmation |
| `aggregateTransactions.ts` | Roll up transaction-level rows to daily aggregates |
| `types.ts` | All shared import types and normalized record contract |
| `index.ts` | Public barrel export — ⚠ unused, and S5 proposes deleting it |

### Data flow

```
User selects files
  → fileTypeDetector     detect CSV / Excel
  → csvParser            parse text files
  → workbookLoader       expand Excel into sheets  (via Web Worker)
  → sheetSelector        filter blank/non-data tabs, surface skippedSheets
  → ImportPreviewModal   user verifies granularity + column mappings
      └─ importPolicy + columnFingerprinter + mappingMemory  (auto-map columns)
      └─ "Apply to N matching sheets" shortcut  (Problem 6 fix)
  → schemaNormalizer     normalize all rows to canonical fields
  → validation           clean values, flag issues
  → mergeData            deduplicate and merge across sources
  → dashboard state      agents / supervisors / historicalData
```

### Canonical field set

`agentName` · `supervisor` · `oam` · `employeeId` · `date` · `location` · `calls` · `aht` · `resolve2hr` · `resolve3d` · `vxs` · `satisfaction` · `handoffs` · `transferRate` · `sourceFile` · `sourceSheet`

### Risk areas and mitigations

| Risk | Mitigation |
|------|-----------|
| Sheet naming inconsistency across workbooks | `sheetSelector.ts` + skipped-sheet override banner in modal |
| Different delimiter standards in CSVs | `csvParser.ts` auto-detects comma / tab / semicolon |
| Column alias mismatches between data sources | Scored matching in `importPolicy.ts` + `mappingMemory.ts` |
| Duplicate records across files | Key-based deduplication in `mergeData.ts` |
| Numeric values with `%`, `$`, `,` separators | `validation.ts` cleaning |
| Hidden or summary tabs imported accidentally | Shape + keyword scoring in `sheetSelector.ts` |
| Invalid date values in Excel serial format | `workbookLoader.ts` serial-date conversion |
| Blind metric averaging across different scopes | `mergeStrategy` per-field overrides in `mergeData.ts` |
| Duplicate file upload doubling summed fields | `detectDuplicateFiles` & source deduplication in `mergeData.ts` |

---

## STANDING RULE — Mapping fixes always go in `importPolicy.ts` only

> **This rule applies to ALL future mapping-related bugs, forever. Any AI model working on this codebase must read this before touching any import-related code.**

When a dashboard metric (handoffs, 2HR, 3DR, CSAT, AHT, or any other field) shows incorrect values � zero, null, or wrong numbers � after an import, the **first and default assumption** must be that the column alias list is incomplete or wrong.

### The principle

This dashboard is designed to work with files from **many different source systems** � Verizon exports, third-party workforce management tools, custom Excel trackers, etc. Every system names its columns differently. The mapping layer (`importPolicy.ts`) is the single correct place to handle that variation.

**Do not fix mapping problems by:**
- Changing calculation logic in `helpers.ts`
- Changing how values are stored in `hooks.ts` `applyBatchImport`
- Changing value normalization in `schemaNormalizer.ts`
- Adding special-case logic anywhere in the dashboard rendering or aggregation pipeline

**Always fix mapping problems by:**
- Adding missing column name aliases to the relevant field's `aliases` array in `FIELD_ALIASES` inside `src/features/dashboard/import/importPolicy.ts`
- Removing ambiguous aliases that are shared between two fields (they cause silent overwrites in the lookup map)
- Adding or correcting token hints in `HEADER_TOKEN_HINTS` in the same file
- Updating `PAIRED_COUNT_FIELDS` if a pass/count column pair is not being detected

### Why only `importPolicy.ts`

The rest of the pipeline (`schemaNormalizer.ts`, `importService.ts`, `helpers.ts`, `hooks.ts`) is generic and correct. It does not know or care about Verizon-specific column names. `importPolicy.ts` is the **only** file that is supposed to know about real-world column name variations. Keeping all alias knowledge in one file makes it easy to audit, extend, and test without side effects anywhere else.

### Checklist before any mapping fix

1. Identify the exact column header string as it appears in the uploaded file (case-sensitive, including spaces and symbols).
2. Run the header through `normalizeHeader()` mentally (lowercase, strip non-alphanumeric to spaces, trim) and check if the result matches any existing alias in `FIELD_ALIASES` for the target field.
3. If it does not match � add it to the `aliases` array of the correct field.
4. Check that the same normalized string is NOT already listed in another field's aliases. If it is, remove it from the wrong field first.
5. If the header is ambiguous (e.g. "Repeat Rate" could be 2HR or 3DR), add the disambiguating version ("2HR Repeat Rate", "3DR Repeat Rate") and remove the ambiguous form from both.
6. Run the existing import tests to confirm no regressions.

---

> The four mapping bugs that motivated this rule (progress-reset, 99%-stall, HAND-OFFS zero, 2HR zero) were resolved and verified on 2026-09-20. Their full root-cause traces were removed from this file on 2026-09-29 and are preserved in commit history.

---

## Critical

Findings that are **live defects, not code smells** — things that are broken right now, or that will silently ship a secret or a customer dataset. Everything here was found by static reading of `src/` during the whole-codebase audit; **no code was changed and nothing was executed at runtime**, so step 0 of every fix is to reproduce the reported path in the browser before touching anything.

| # | Finding | Severity | Status |
|---|---|---|---|
| **C4** | `useAiTools` returns **13 of the 24** members the app calls — hard `TypeError` on modal close, on the Data Assistant, and on 3 of 8 tabs | **P0** | new — surfaced while writing this section |
| **C1** | AI requests go browser → `api.anthropic.com` with **no auth header and no backend in the project**; one effect auto-fires with the whole dataset | **P0** | open |
| **C2** | Gemini-named UI (`executeGeminiAction`, `GeminiLoader`, `.gemini-btn`) over an Anthropic endpoint | P1 | open |
| **C3** | 244 lines of untested bonus/aggregate/VSF math in a `@ts-nocheck` file | P1 | open |

Fix order: **C4 first** (it is the only one a user hits today), then C1, then C2, then C3. C1 and C4 are in the same subsystem and should be fixed in the same working session, C4 first — see C1's "do not" list, which is written assuming C4 is already closed.

---

### C4 — `useAiTools` returns 13 of the 24 members the app calls · **P0**

**Evidence.** `useAiTools` (`src/features/dashboard/hooks.ts:1419–1486`) is 68 lines and its return object (`:1471–1486`) exposes exactly **13** members: `report`, `loading`, `teamReport`, `loadingTeam`, `chartActionPlan`, `loadingChartActionPlan`, `setChartActionPlan`, `correlationReport`, `loadingCorrelation`, `apprenticeReport`, `loadingApprentice`, `dowReport`, `loadingDow`.

The app consumes **24** `aiTools.*` members across 12 files. **11 are `undefined` at every call site**, reached from **21 call sites**:

| Missing member | Call sites |
|---|---|
| `generateExpertReport` | `App.tsx:210`, `App.tsx:221`, `FloorRosterTab.tsx:100`, `FloorOutliersTab.tsx:18` (+1 in a dep array, `App.tsx:225`) |
| `generateTeamReport` | `FloorAnalysisTab.tsx:10` |
| `generateChartActionPlan` | `FloorTrendsTab.tsx:54` |
| `generateCorrelationReport` | `FloorCorrelationTab.tsx:10` |
| `generateApprenticeReport` | `FloorApprenticeTab.tsx:45` |
| `generateDowReport` | `FloorDowTab.tsx:12` |
| `resetAiStates` | `App.tsx:173`, `App.tsx:198`, `App.tsx:199` |
| `askAiQuery` / `setAskAiQuery` | `MainModal.tsx:29` / `MainModal.tsx:29` |
| `handleAskAiSubmit` | `MainModal.tsx:29`, `:31`, `:39` |
| `askAiLoading` | `MainModal.tsx:29`, `:31`, `:40`, `:48` |
| `askAiResponse` | `MainModal.tsx:52`, `:55` |

**Why no tool caught this.** `DashboardContext` is `createContext<any>(null)` (`hooks.ts:263`), so every consumer reads `any`; and `hooks.ts` is `@ts-nocheck`, so the hook's own return type is never compared against its consumers. The contract is enforced by *nothing*. (The `any` context was a deliberate Phase-1 trade-off to let the 12 extracted view files typecheck — it is correct for props, wrong for the provider value, and C4 is the bill coming due.)

**Concrete failure modes, most user-visible first.**

1. **The whole dashboard blanks when the user clicks "Data Assistant".** `TopNavbar.tsx:66` → `setActiveModal('askAi')` → `MainModal.tsx:402` renders `AskAiContent` → `MainModal.tsx:31` evaluates `!aiTools.askAiQuery.trim()` on `undefined` → **`TypeError: Cannot read properties of undefined (reading 'trim')` during render** → the nearest `<ErrorBoundary>` (`App.tsx:330`) replaces the entire dashboard with its fallback. (`MainModal.tsx:29` also makes the input uncontrolled: `value={undefined}`.)
2. **Every modal close throws.** The ✕ Close button and the backdrop (`MainModal.tsx:371`, `:377`) both call `uiHandlers.closeModal` → `App.tsx:198` `aiTools.resetAiStates()` → **`TypeError: aiTools.resetAiStates is not a function`**. This affects the supervisor modal too, so it is not confined to the AI feature.
3. **Three tabs throw on open, after any import.** `FloorAnalysisTab.tsx:10`, `FloorCorrelationTab.tsx:10` and `FloorDowTab.tsx:12` call their `generate*` inside a mount effect, guarded only on `dashData.hasUploadedData` — so once a workbook is imported, opening Analysis, Correlation or DOW throws in the effect and takes the dashboard down via the ErrorBoundary.
4. **Two silent failures (no crash, wrong behaviour).** `App.tsx:173` assigns `aiResetRef.current = undefined`, so the guard at `App.tsx:97` (`if (aiResetRef.current) aiResetRef.current()`) is permanently false and **stale AI reports are never cleared when a new file is uploaded**. `FloorTrendsTab.tsx:54` passes `onClick={undefined}`, which React silently ignores — a dead button with no error.

**Precisely what to do.** For each of the 11 members choose *implement* or *delete* — do not leave any consumer pointing at a member that does not exist:

- **Implement (9 members, 2 groups).** (a) Ask-AI chat state — `askAiQuery`, `setAskAiQuery`, `askAiResponse`, `askAiLoading`, `handleAskAiSubmit` — is a self-contained 5-member unit: one `useState` pair, one submit handler, one request through whatever C1 ends up building. (b) The six `generate*` functions plus `resetAiStates` — one `useCallback` each over the existing `executeGeminiAction` helper, each with its own system prompt; `resetAiStates` is the single place that nulls the six report states and their loading flags.
- **Delete (0 members).** Nothing here should be deleted: every one of the 11 has a live UI behind it (7 tabs, the Data Assistant modal, the close handler). If a feature is not wanted, delete the **UI** in the same change — never leave the button.
- **Then close the class of bug, not just the instance.** Replace `createContext<any>(null)` with `createContext<DashboardContextValue | null>(null)` and export an explicit `DashboardContextValue` interface composed of the three hook return types. Every one of the 12 view files is already checked by `tsc`, so the moment the interface exists, any other missing member becomes a compile error instead of a runtime `TypeError`. Expect this to surface further mismatches — that is the point, and it is the single highest-value change in this document.
- **Guard it with a test.** Add `src/features/dashboard/aiToolsShape.test.ts` (node:test + tsx, same as the 12 existing suites) asserting that the set of `aiTools.*` members consumed anywhere in `src/` is a subset of the keys `useAiTools` returns. It is a static check over source text, so it needs no React runtime, and it makes this regression impossible to reintroduce silently. **Target: 194 → ~197 tests.**
- **Do not** paper over the crashes with optional chaining (`aiTools.resetAiStates?.()`). That converts a loud failure into a dead button — exactly failure mode 4, which is how this bug stayed invisible.

**Verification.** (1) Reproduce all four failure modes in the browser first, so the fix is provable. (2) After the fix: open the Data Assistant, open and close the supervisor modal, and open Analysis / Correlation / DOW after an import — all must work with no console errors. (3) `npx tsc -b` exit 0, `npm test` 194 → ~197 all green, `npm run lint` 0 errors / ≤123 warnings, preview HTTP 200, Vite transform 200 for `hooks.ts` and all 12 view files.

---

### C1 — AI requests go browser → Anthropic with no auth header, and there is no backend · **P0**

**Evidence.** `hooks.ts:1353–1400` `executeGeminiAction` POSTs to `https://api.anthropic.com/v1/messages` from client code. The request sends **one** header — `Content-Type: application/json`. There is **no `x-api-key`, no `Authorization`, and no `anthropic-version`**. Body: `{ model: 'claude-sonnet-4-6', max_tokens: 1000, system, messages }`. Retries go through `fetchWithRetry` (`:1323`, 2 retries, 30 s timeout, exponential backoff) and cancellation through the module-level `_aiControllers` map (`:1319`).

There is **no server layer in this project at all**: no `api/`, `server/`, `functions/`, `netlify/`, or `vercel.json`, and `vite.config.ts` declares only the React plugin and `worker: { format: 'es' }` — **no `server.proxy`**. So the call cannot succeed: it 401s, and the browser blocks it on CORS before the status even matters. All 6 AI tools (expert report, team report, chart action plan, correlation, apprentice, DOW) are non-functional for this reason, independent of C4.

**The part that makes this urgent.** The effect at `hooks.ts:1449` has a 15-item dependency list and calls `executeGeminiAction` **on mount and on every change** to `agents`, `supervisors`, `oamName`, `historicalData`, `selectedDate`, `activeTimeframe`, `selectedWeek`, `selectedDow`, leader data, `supervisorStats`, `runChartData`, `allActiveDates` — with no user action, no opt-in, and no consent gate. Its prompt payload (`JSON.stringify`, `:1450–1464`) contains **`agents`, `supervisors`, `activeLeaderData`, `mtdLeaderData`, `supervisorStats`, `runChartData` and `allActiveDates`** — i.e. the full agent roster, every supervisor, and the underlying metric series, serialized into an outbound request body.

Today that request is inert because it 401s. **The moment anyone "fixes" the 401 by adding a key to the client, this app ships the entire workforce dataset to a third party on every state change** — including the 300 ms debounced search keystrokes described in S3.

**Precisely what to do.**

1. **Add a server-side proxy that holds the key.** The key must never enter the Vite bundle. In particular: **do not** use an `import.meta.env.VITE_*` variable — every `VITE_`-prefixed value is inlined into the client JavaScript and is readable by anyone who opens the page. The project is currently pure client-side (`react`, `react-dom`, `xlsx` only), so this is a genuinely new layer, not a refactor; pick the smallest thing that can hold a secret.
2. Move `executeGeminiAction`, `fetchWithRetry`, `delayForRetry` (`:1321`) and `_aiControllers` (`:1319`) to that server layer. The client keeps the `AbortController` cancellation semantics (`:1356–1359`) — a user-initiated request must remain cancellable.
3. Point the client at the proxy. The client must not know the provider URL or the model id; both belong on the server so a provider change is a server edit.
4. **Make the expert report user-triggered.** Remove the auto-fire at `hooks.ts:1449` and put it behind the existing explicit entry point (`App.tsx:210`/`:235` `handleAiLinkClick`, and the supervisor-modal action) — or, if an automatic summary is genuinely wanted, gate it behind a visible opt-in. An automatic outbound transfer of employee performance data on page load is not something to ship by default.
5. **Minimize the payload.** Send aggregates and the slices the prompt actually needs, not the raw roster and full time series. This is the same data-minimization argument as C3 below, applied to egress.
6. Handle the failure honestly: today every path ends in a `TypeError` or a silent no-op. A failed AI call should render a visible, non-destructive error state in the component that requested it, not a thrown exception.

**Do not:** add the key to the client; add a `VITE_`-prefixed key variable; "temporarily" bypass CORS with `mode: 'no-cors'`.

**Verification.** `grep -rn "api.anthropic.com" src` → **0 hits** (the provider string lives only on the server). The key exists only in server-side environment config, never in `dist/`. In the browser's Network panel: **no outbound AI request on page load with no user action**, and exactly one per user-initiated action. One real report generates and renders. Then the standard gate: `tsc -b` 0, 194/194, lint 0 errors / ≤123, preview 200.

---

### C2 — Gemini-named UI over an Anthropic endpoint · **P1**

**Evidence.** A half-finished provider migration left the old brand in the code while the endpoint changed:

| Old name | Location |
|---|---|
| `executeGeminiAction` | `hooks.ts:1353` (definition), called at `hooks.ts:1468` |
| `GeminiLoader` | `src/components/shared.tsx:17` (default `message = 'Cooking it up...'`), imported by `FloorApprenticeTab`, `FloorCorrelationTab`, `FloorDowTab` |
| `.gemini-btn` | defined in `src/styles/dashboard.css` (was `src/app/dashboardStyles.ts`), used in **7 files**: `FloorTrendsTab`, `FloorApprenticeTab`, `FloorCorrelationTab`, `FloorDowTab`, `FloorAnalysisTab`, `views/modals/MainModal`, `app/chartActionPlanModal` |

**Why it is more than cosmetic.** It is a debugging trap: a maintainer chasing a 401, a 429, a model-id error or a token-limit error will grep `gemini`, find the function that made the call, and conclude the wrong provider is in play. It is also inventory debt — `.gemini-btn` is one of the 189 hand-rolled classes, and Phase 2 has moved it into `src/styles/dashboard.css` (and scoped it under `.analyst-dashboard`), so the rename now touches exactly two places — that definition and the 7 usages — in one pass.

**Precisely what to do.** One mechanical pass, **after C1 and C4 land** so the rename does not sit inside a functional diff: `executeGeminiAction` → `executeAiAction`, `GeminiLoader` → `AiLoader`, `.gemini-btn` → `.ai-btn` (definition in `src/styles/dashboard.css` + all 7 usages). Add a one-line comment at each renamed symbol recording the rename and the date, so the next reader does not re-litigate it. Pick one neutral name and apply it everywhere — do not leave `.ai-btn` and `.gemini-btn` side by side.

**Verification.** `grep -rin "gemini" src` → **0 hits**. `tsc -b` 0, 194/194, lint 0 errors / ≤123 (unchanged — a rename cannot add warnings), and a visual pass over the 7 files to confirm the buttons still render (the class rename is the only thing that can break them).

---

### C3 — 244 lines of untested business math in a `@ts-nocheck` file · **P1**

**Evidence.** `src/features/dashboard/helpers.ts` is 358 lines, starts with `// @ts-nocheck` (`:1`), and exports 15 functions. Only **6 are covered** by `monthSelection.test.ts` (11 tests): `normalizeDate`, `getWeekNumber`, `dowFromDateStr`, `matchesSelectedMonth`, `collectLoadedMonths`, `monthLabel` — all date/month helpers.

**Untested: lines 40–283, 244 lines** — the functions that decide what people see and get paid:

| Function | Lines | Decides |
|---|---|---|
| `agentMatchesSearch` | 28–39 | roster search filtering |
| `calculateBonus` | 40–48 | **bonus payout** |
| `aggregateRecords` | 49–137 | per-agent metric rollup |
| `aggregateTeamMetrics` | 138–212 | **team/supervisor rollup** |
| `calculateWeightedVSF` | 213–271 | **weighted satisfaction score** |
| `calculateTrend` | 272–283 | trend arrows and deltas |

**Why it is critical rather than merely untested.** This is the only file in the project where a silent refactor can change numbers on screen with **zero signal from any gate**: `tsc` does not read it (`@ts-nocheck`) and no test exercises it. `calculateBonus` and `calculateWeightedVSF` are compensation-adjacent outputs. A typo in a threshold, an off-by-one in a day bucket, or a changed rounding rule would ship silently and plausibly.

**Precisely what to do** (test-first; production code is not expected to change):

1. Add `src/features/dashboard/helpers.test.ts` (node:test + tsx, matching the 12 existing suites) — **target ~20–25 new tests, 194 → ~219**.
2. Suggested cases: `calculateBonus` at each tier boundary and with missing/partial inputs; `aggregateRecords` on an empty array, a single row, and rows spanning multiple days/months (day-of-week bucketing is the classic off-by-one); `aggregateTeamMetrics` rollup totals matching the sum of its member agents (a property-style assertion, not a golden value); `calculateWeightedVSF` weighting math and division-by-zero when a denominator is 0; `calculateTrend` for flat, rising, falling and single-point series; `agentMatchesSearch` case-insensitivity and the `linkedEntities` name matching used by `handleAiLinkClick`; `formatName` / `shortenManagerName` on short, long and already-formatted names.
3. Assert against **values computed by hand from the current implementation**, not against the implementation itself — write the expectation, then confirm the code agrees. If they disagree, stop: that is a live bug, and it belongs in this document, not in a test rewrite.
4. Only after the tests are green, remove `// @ts-nocheck` from `helpers.ts` and fix what `tsc` reports. Expect the fixes to be type annotations only; treat any behavioral change as a defect to report.
5. `emptyColumns.ts` (96 lines) is the same situation in miniature: 10 tests pass but the file is still `@ts-nocheck`. Remove the suppression in the same pass.

**Do not** change any threshold, formula or rounding rule as part of this work. This item adds a safety net; it is not permission to tune the math.

**Verification.** 194 → ~219 tests, all green, **with zero production-code changes** in step 1–3. After step 4: `tsc -b` exit 0, lint 0 errors / ≤123. Audit note: once `helpers.ts` is type-checked, the `@ts-nocheck` count drops from 3,348 lines to ~2,990 across 7 files.

---

### Critical — verification notes

- All findings above come from **static reading**, not from running the app. The four C4 failure modes are derived from the call graph; reproduce each in the browser before fixing so the fix is provable rather than assumed.
- No code was changed while producing this section. The audit baseline it was measured against is recorded under **Structural Findings S1–S12** below: `tsc -b` exit 0, 194/194 tests, lint 0 errors / 123 warnings.
- C1 and C4 share a subsystem and a fix session; C1's data-egress decision should be made *after* C4, because C4 is what currently stops the auto-firing effect at `hooks.ts:1449` from reaching a live endpoint.
- The non-AI findings (S1–S12) are structural and can proceed independently at any point.

## Architecture Fixes

The 6-phase `App.tsx` split is **complete**. Four phases of pure move-only extraction (1, 3, 4, 5) were completed first, **Phase 6 landed on 2026-09-29** — `MODAL_INITIAL`, `UI_INITIAL`, `modalReducer` and `uiReducer` now live in `src/features/dashboard/uiReducer.ts`, covered by 13 unit tests — and **Phase 2 landed the same day (both steps)**: step 1 moved the 16,790-byte `DASHBOARD_STYLES` literal verbatim to `src/styles/dashboard.css` (killing the `dangerouslySetInnerHTML` injection and deleting `src/app/dashboardStyles.ts`), step 2 added the provenance banner, deleted the dead `.badge` rule and scoped the three live collision-prone names under `.analyst-dashboard :where(...)`. The Phase 6 write-up was removed from this file (commit history); Phase 2 keeps a short outcome record below because its two decisions govern all future styling work. What is left is the structural backlog (S1–S23). Current state: `App.tsx` is **372 lines** (386 at HEAD before Phases 6 + 2) — local state + `export default function App()` + the composition tree.

---

### How to work in this repository — read this before implementing anything below

This subsection is aimed at whoever (human or model) picks up the next item. Everything below it was written by static reading, so **re-verify the line numbers before you touch anything** — they are accurate as of commit `26c5661` + the documentation changes of 2026-09-29, and this file is the only place they are recorded.

**Baseline you are working against (2026-09-29).**

| File | Lines | Notes |
|---|---|---|
| `src/App.tsx` | 372 | `@ts-nocheck`; local state + composition. Reducer state moved out in Phase 6, stylesheet out in Phase 2 step 1 |
| `src/features/dashboard/uiReducer.ts` | 57 | **new (Phase 6)** — typed initial state, 2 reducers, 13 tests |
| `src/features/dashboard/hooks.ts` | 1,486 | `@ts-nocheck`; `useDashboardData` is lines 267–1317, `useAiTools` 1419–1486 |
| `src/features/dashboard/import/ImportPreviewModal.tsx` | 1,858 | `tsc`-checked; helpers 1–390, `ManageMemoryModal` 397–568, main component 580–1858 |
| `src/features/dashboard/metrics.ts` | 391 | `@ts-nocheck`; 10 unconditional `useMemo`s |
| `src/features/dashboard/helpers.ts` | 358 | `@ts-nocheck`; 244 lines of untested business math (see C3) |
| `src/styles/dashboard.css` | 53 | **new (Phase 2, steps 1+2)** — 17,463 bytes of dashboard CSS: the 16,790-byte verbatim extract of `src/app/dashboardStyles.ts`, plus banner, minus the dead `.badge` rule, plus 6 `:where()`-scoped selectors |

**The gate. A change is not done until all of these are true.**

```bash
npx tsc -b            # must exit 0   (note: `npx tsc -b | tail` HIDES the exit code — do not pipe it)
timeout 180 npm test  # 194/194 at baseline; count may only go UP, and no existing test may be edited
npm run lint          # 0 errors, and warnings <= 123 (the baseline; never above)
```

Then: preview returns HTTP 200 with no HMR errors, and **every touched module returns HTTP 200 when fetched through the Vite dev server** — `/src/App.tsx`, `/src/features/dashboard/hooks.ts`, and each new file. That last check is not optional; see trap 1.

**Ten traps. Each of these has already cost time in this repo.**

1. **`tsc` is blind to `App.tsx`, `hooks.ts`, `metrics.ts`, `helpers.ts`, `config.ts`, `emptyColumns.ts`, `shared.tsx`, `menus.tsx`** (3,348 lines, all `@ts-nocheck`). A clean `tsc -b` proves nothing about them. Verify those files by **requesting them through the Vite dev server** (`curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/src/App.tsx`) and by reading the diff. This is how the latent `ReferenceError` in `chartActionPlanModal` was caught in Phase 1, and it is how you will catch your own.
2. **The context value is `any`.** `DashboardContext = createContext<any>(null)` (`hooks.ts:263`) is what lets the 12 extracted view files typecheck without their own suppression. Consequence: **adding a member to a hook's return object is not checked against its consumers** — that is precisely how C4 shipped 11 undefined members across 21 call sites. If your change adds or removes a context member, grep every consumer.
3. **The 37-key object returned at `hooks.ts:1308` is a public contract.** It is consumed by 8 tabs, 3 chrome components, the modal and `App`. Do not rename, reorder-with-meaning, or drop a key as part of a refactor. Adding is fine; removing is a breaking change that must be grepped first.
4. **`str_replace`-style edits fail on the large `src/App.tsx`.** The working method is a **count-checked Node script**: assert the anchor appears exactly N times, compute the replacement, verify all post-conditions, *then* write. Several attempts have aborted with zero partial writes, which is the point of the pattern — keep it.
5. **The `import/` folder is layered and acyclic, and must stay that way:** `types → (importPolicy | schemaNormalizer | mergeData | columnFingerprinter | granularityDetector | mappingMemory | csvParser | fileTypeDetector | sheetSelector | validation)` → `importService` → `ImportPreviewModal`. Pure functions only below the UI line. The **STANDING RULE** above governs this folder: column-mapping and alias logic belongs in `importPolicy.ts` and nowhere else.
6. **There is no Tailwind.** `package.json` runtime deps are `react`, `react-dom`, `xlsx` and nothing else. The 189 "utility" classes are hand-rolled; Phase 2 moved them into `src/styles/dashboard.css`, where they stay (step 2 weighed replacing them with a real utility layer and rejected it as a visual-diff job). Do not add Tailwind, do not use `clsx`, and do not add a dependency to fix a style problem.
7. **S3 can produce stale data, not an error.** Memoizing the three hook returns is the highest-value change in this document and the only one whose mistake is invisible: a wrong dependency list simply keeps showing yesterday's numbers. Use a render counter and click through all 8 tabs plus a timeframe change.
8. **Rules of hooks are not optional.** Two real violations were fixed during the earlier phases (early `return null` above 8 `useMemo`s in `MainModal`; `supName` read from a possibly-undefined supervisor). When you move a component, check that every early return sits *below* every hook.
9. **The dev server is managed.** Do not start, stop or restart it; edit the files and the platform picks them up. Never `npm run dev` in the background.
10. **Every timer that calls `setState` needs an owner.** S2 exists because 16 of them did not. If you add a `setTimeout`, add the `clearTimeout` in the same edit.

**Suggested batching — one commit per line, each independently revertible.**

| Batch | Items | Why grouped |
|---|---|---|
| 1 | **S5** (delete 6 dead files), **S10** (10 specifiers), **S8** (`asyncUtils`), **S9** (debug logs) | Zero-risk mechanical work; grep proves S5, tests prove the rest |
| 2 | **S7.1** (duplicate `normalizeHeader`) | 15 minutes, byte-identical, proven by 60 existing tests |
| 3 | **S2** (`scheduleStatusClear`), **S12** (copy button) | Small, self-contained, both visible in the UI so verify by hand |
| 4 | **S6** (storage module), **S11** (`buildAccountProfile`) | Touch persisted data; both need a manual round trip |
| 5 | **S4** (ImportPreviewModal split) | Move-only; collect **S15/S16** inline while the file is open |
| 6 | **S1** (`useDashboardData`, steps a→b→e→c→d as five commits) | Biggest win, five separately revertible commits |
| 7 | **S13, S19, S21, S22** (render-path hot spots) | Each is a `useMemo`; land together, measure together |
| 8 | **S3** (memoize hook returns) | Alone, with a render counter, after batch 7 |
| 9 | **S14, S17, S18, S20, S23** (cosmetic/dup) | Opportunistic — fold into whatever you are already editing |

**Definition of done for a single item.** Copy this into your commit message and tick it:

```text
[ ] Anchors re-verified against the current file before editing
[ ] New file(s) created; no existing file deleted except dead code (justified)
[ ] No context member added/removed without grepping all 12 view files
[ ] npx tsc -b exits 0
[ ] npm test: no existing test edited, total count >= baseline
[ ] npm run lint: 0 errors, warnings <= 123
[ ] Every touched module returns 200 through the Vite dev server
[ ] Origin-diff audit: diff new file against its origin region; every hunk is a
    documented fix, nothing unexplained
[ ] This document updated (item struck, line count and file list corrected)
```

**Updating this document when you finish an item.** Per the Working rule at the end of this file: delete the item's entry rather than ticking it, correct any line counts that changed, and if the item was harder or easier than stated, leave one line saying which — that is the only feedback loop this file has.

### Phase 2 — `DASHBOARD_STYLES` → real CSS

> Status: **✅ Completed (2026-09-29) — both steps landed** (step 1: byte-identical move · step 2: utility block + name scoping)
> Approach: **byte-for-byte CSS move first, structure second** — no visual change is allowed in the same step as the reorganization.

**Problem (resolved by step 1).** `src/app/dashboardStyles.ts` was a TypeScript module whose only export was a template literal holding 16,790 bytes of CSS: ~9.6 KB of dashboard component rules (`.analyst-dashboard`, `.top-navbar`, `.glass-panel`, `.roster-table`, `.metric-card`, `.main-modal`, `.chat-*`, `.heatmap-table`, `.range-slider`, …) plus ~7.2 KB of a **hand-rolled Tailwind subset — 189 utility classes** (`.flex`, `.gap-4`, `.text-slate-700`, `.rounded-xl`, `.grid-cols-auto-110`, `.animate-slide-down`, …). It was injected on every render of `App`, so the stylesheet was re-parsed per keystroke, lived in a `.ts` file (no highlighting, no devtools "edit rule"), and produced a permanent `dangerouslySetInnerHTML` false-positive for security scanners.

**✅ Step 1 outcome (mechanical, byte-identical).**

| File | Actual result |
|---|---|
| `src/styles/dashboard.css` | **new** — 40 lines, **16,790 bytes**, extracted verbatim (component block then `/* UTILITIES */`), both `@keyframes` (`slideDown`, `spin`) preserved |
| `src/main.tsx` | +1 import placed **after** `index.css` and `ImportPreviewModal.css` so it wins same-specificity ties, matching the cascade the `<style>` in `<body>` had |
| `src/app/dashboardStyles.ts` | **deleted** (43 lines) |
| `src/App.tsx` | −1 import, −1 `<style>` element, +2 banner lines → **372 lines** (unchanged net; 386 at HEAD before Phases 6 + 2) |

**Proof of the byte-identity guard.** A count-checked Node script asserted the open marker was unique, the closing `` `; `` was the last thing in the file, the literal had **zero** `${}` interpolations, and both `@keyframes` were present — *before* writing; after writing it re-read `dashboard.css` and compared string-for-string: **16,790 = 16,790, `cmp` clean**. Served raw through the dev server (`?direct`) it is byte-identical to disk.

**Cascade — measured, not assumed.** The risk noted below predicted a flip in specificity order. Running the selector-set comparison showed **zero overlap** between `index.css` (11 selectors) and `dashboard.css` (275), and no real overlap with `ImportPreviewModal.css` either (the single hit is the `to` keyword inside a `@keyframes` block, a regex false positive). Order is therefore not load-bearing today, but the import is still deliberately last so it stays correct if the two sheets ever grow into each other.

**Verification.** `npx tsc -b` exit 0 · `npm test` **194/194** · `npm run lint` **0 errors / 123 warnings** (baseline) · preview HTTP 200 · Vite transforms 200 for `/`, `/src/main.tsx`, `/src/App.tsx`, `/src/styles/dashboard.css` · `main.tsx` transform shows the three CSS imports in the intended order · `App.tsx` transform shows **0** `dangerouslySetInnerHTML` and **0** `dashboardStyles` references · `cmp` on the served CSS: byte-identical.

⚠ **Dev-server staleness lesson.** After the edit, Vite kept serving the *pre-edit* `main.tsx` transform (the entry was pinned in `index.html` as `?src/main.tsx?t=<stamp>` and its module node was never invalidated), while `App.tsx` had already HMR'd — so a visitor would have got an **unstyled dashboard**: no CSS import, no `<style>` injection. `freebuff-preview restart` cleared it; after the restart `index.html` serves the plain `src="/src/main.tsx"` entry. **If you ever remove a style source from an entry module, re-fetch the entry transform through the dev server afterwards, not just the file you edited.**

**✅ Step 2 outcome (2026-09-29) — two decisions, both explicit.**

| File | Actual result |
|---|---|
| `src/styles/dashboard.css` | **40 → 53 lines, 16,790 → 17,463 bytes** — +14-line provenance/section/scope banner, −1 dead rule (`.badge`, 307 bytes), 6 selectors scoped; rule count 281 → 280 |

**Decision 1 — the 189-class utility block stays, verbatim.** Replacing it with a real utility layer (or migrating the usages onto `index.css` tokens) is a visual-diff job with no automated gate to catch a regression, so it was explicitly rejected for this phase. The block now sits under its `/* UTILITIES */` banner, with the file header recording that the project does **not** ship Tailwind; the maintenance trap is unchanged, only its address.

**Decision 2 — generic names are scoped under `.analyst-dashboard`, not renamed.** All four candidates were audited against `src/`:

| Class | Verdict | Action |
|---|---|---|
| `.badge` | **dead CSS** — `grep -x badge` over every className token, plus a JSX-wide search, both return 0 | **deleted** (−307 bytes) |
| `.close-btn` | live, 1 site (`MainModal.tsx:379`) | scoped — 2 selectors |
| `.gemini-btn` | live, 7 sites (the five `Floor*` tabs, `MainModal.tsx:31`, `chartActionPlanModal.tsx:33`); **C2** renames it later | scoped — 3 selectors |
| `.card-daily` | live, 1 site (`MainStatsRow.tsx:58`) | scoped — 1 selector |

The scope is `.analyst-dashboard :where(.name)` — `:where()` contributes **zero** specificity, so the cascade is provably unchanged: a specificity audit (a parser that strips `:where()` before comparing) found all 6 before/after pairs identical (`0,1,0` · `0,2,0` · `0,1,1`). The `ds-`-prefix rename was the alternative and was rejected: it edits 8 JSX sites for the same guarantee, and C2 touches `.gemini-btn` anyway.

**Why the flagged risks are now measured, not open.** Every one of the 8 usage sites renders inside the `.analyst-dashboard` div (`App.tsx:333`); the app has **zero** `createPortal` calls, so nothing can mount outside the container; and the landing page (`ImportLanding`, all `import-*`) shares **zero** class names with `dashboard.css` (class-level intersection with `index.css` and with `ImportPreviewModal.css` are both empty). The stacking/breakpoint risks that were listed for this step — `z-40` navbar / `z-50` roster header / `z-90` modal backdrop, the `::-webkit-scrollbar` rules, `min-width:800px` on `.roster-table`, the `850px` `.stats-row` breakpoint — were left untouched: no value in those rules changed. The only rendered-CSS delta is one proven-dead rule removed and 6 selectors gaining an ancestor requirement that every current usage site already satisfies. Residual check if the container ever shrinks: re-run the 8-site grep.

**Gate.** `npx tsc -b` exit 0 · `npm test` **194/194** · `npm run lint` **0 errors / 123 warnings** · preview HTTP 200 · served `dashboard.css` byte-identical to disk (**17,463 bytes**, 53 lines) · HMR log shows `hmr update /src/styles/dashboard.css` with no errors.

**Left behind (optional, not a Phase 2 item).** 48 classes are defined but never referenced — `.glass-panel`, `.tab-dropdown-*`, `.btn-dark`, `.btn-red-dark`, `.chat-container`, `.message-bubble`, `.bubble-*`, `.range-slider`, and utilities such as `justify-end`, `gap-5`, `py-10`, `z-50`, `grid-cols-5`. Deleting them is grep-provable and slots into the opportunistic batch.

---

### Structural Findings S1–S12 — whole-codebase audit (2026-09-29, no code changes)

Read-only sweep of all 64 files in `src/`. Baseline at time of audit: `npx tsc -b` exit 0 · `npm test` 181/181 (194/194 after Phase 6) · `npm run lint` **0 errors / 123 warnings** (53 `no-unused-vars`, 38 `react-hooks/exhaustive-deps`, 13 `no-useless-escape`, 9 `set-state-in-effect`, 4 `only-export-components`, 2 `no-this-alias`, 2 `react(refs)`, 1 `no-constant-condition`, 1 `no-constant-binary-expression`). 17,489 lines total, **3,348 of them (21%) under `@ts-nocheck`** across 8 files: `hooks.ts` 1,486 · `metrics.ts` 391 · `App.tsx` 386 · `helpers.ts` 358 · `shared.tsx` 274 · `config.ts` 234 · `menus.tsx` 123 · `emptyColumns.ts` 96.

These are **in addition to** Phases 2 and 6 above, and they are independent of them — S1–S12 can be executed in any order relative to the two phases.

#### S1 — `useDashboardData` is a 1,051-line hook · **HIGH (structure)**

**Evidence.** `src/features/dashboard/hooks.ts:267–1317` — a single function body containing 16 `useState`, 3 `useEffect`, 15 `useCallback`, 2 `useMemo`, 18 `setTimeout`, and a 37-key return object (`:1308–1317`). Splitting `App.tsx` down to 372 lines (386 when this audit ran) moved the real monolith one level down.

**Problem.** One hook owns upload, drag-drop, multi-file, automatic import, batch import, mapping review, import preview, account profile, rate-merge style, and all four time selectors. There is no seam to test any of it, and every unrelated feature shares one failure domain (a throw in the auto-import path unmounts the dashboard).

**Precisely what to do** — extract in this order, each a move-only step verified by the standard gate (`tsc -b` 0, 194/194, lint ≤123, preview 200, origin-diff parity audit):

| # | Region (current lines) | Extract to | Notes |
|---|---|---|---|
| a | 268–309 (16 `useState`, `accountProfile`, `loadedMonths`) | `src/features/dashboard/state.ts` → `useDashboardDataState()` | Pure state + initializers; takes `persistedState` as an argument. No behavior change. |
| b | 370–402 (both `localStorage` write effects + `resetDashboard` at 334) | `src/features/dashboard/persistence.ts` → `useDashboardPersistence(state)` | Must also absorb S6 (single storage module). |
| c | 403–574 `handleMultipleFiles` (172 lines) + 737–857 `handleAutomaticImport` (121) + 863–921 `continueAutomaticImport` / `handleAutomaticFileUpload` | `src/features/dashboard/import/uploadFlow.ts` → `useUploadFlow(deps)` | Largest pair; the automatic-import state machine lives here. |
| d | 575–736 `applyBatchImport` (162) + 922–1049 `confirmImportPreview` (128) + 1050–1179 `processFile` (130) | `src/features/dashboard/import/batchImport.ts` → `useBatchImport(deps)` | `processFile` owns steps 1–5 of the pipeline (comments at 940/1001/1016/1034) — keep those comments with the code. |
| e | 1217–1306 `agentDataCache` + `getAgentDataForTimeframe` + `getTopHeadlineMonth` (1302) | `src/features/dashboard/timeframe.ts` → `useTimeframeSelectors(state)` | Pure derivation over `historicalData`; the most testable slice — add tests in the same step. |

`useDashboardData` then becomes a ~60-line composition of (a)–(e) that keeps the identical 37-key return object, so **no consumer changes**. Order matters: do (a) and (b) first (they unblock everything), then (e) (pure, testable), then (c) and (d).

**Do not** change the return key names, add new context layers, or move keys into `App.tsx` — that would re-inflate the file this program just shrank.

**Verification.** Existing 194 tests unchanged; add ~12 tests for (e) covering `getAgentDataForTimeframe` across the four timeframes × `selectedDow`/`selectedWeek`/`selectedMonth` boundaries. Origin-diff audit must show zero logic changes.

#### S2 — 16 hand-rolled toast timers, none cleared on unmount · **MEDIUM (correctness + duplication)**

**Evidence.** `setTimeout(() => setUploadStatus(null), N)` appears **16 times** inside `useDashboardData` at lines **442, 544, 560, 579, 596, 734, 839, 848, 895, 1011, 1044, 1076, 1112, 1130, 1166, 1175** (22 total `setUploadStatus(null)` calls) with four ad-hoc durations: 9× 5000 ms, 3× 2000 ms, 2× 4000 ms, 2× 6000 ms. `hooks.ts` declares only two refs (`:304 importAbortControllerRef`, `:305 onImportColumnsScanRef`) — **no timer ref exists**, so a timer fired after unmount still calls `setState` on a dead component.

**Precisely what to do.** In the S1(a) module, add:

```ts
// one timer, one owner
const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const scheduleStatusClear = useCallback((ms = 5000) => {
  if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
  statusTimerRef.current = setTimeout(() => setUploadStatus(null), ms);
}, []);
useEffect(() => () => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current); }, []);
```

Then replace all 16 sites with `scheduleStatusClear(2000 | 4000 | 5000 | 6000)` — **keep each site's existing duration exactly**; do not normalize them in this change. Make the cleanup effect the one unmount-time cleanup in the hook (note: `importAbortControllerRef` at `:304` is not aborted on unmount either — audit that in the same step and abort it there if it is genuinely needed).

**Verification.** `grep -c "setTimeout(() => setUploadStatus(null)" src/features/dashboard/hooks.ts` → must be `0`; `scheduleStatusClear` call count → 16; behavior unchanged (toast still clears after the same delay). This change is visible in the UI, so verify by triggering one upload path per duration in the browser.

#### S3 — The context memo can never hit; all 12 view components re-render per keystroke · **HIGH (performance)**

**Evidence.** `App.tsx:240–243` wraps `ctxValue` in `useMemo` with deps `[dashData, metrics, aiTools, uiState, uiHandlers, normalizedAccountName, resetToLanding]`. But all three hook returns are **fresh object literals**: `hooks.ts:1308` (`useDashboardData`), `hooks.ts:1471` (`useAiTools`), `metrics.ts:380` (`useDashboardMetrics`). None is wrapped in `useMemo`, so three of the seven deps change identity on every render and **the memo never hits**. Amplifiers: the 300 ms debounced search input (`App.tsx:140–146`) and 10 unconditional `useMemo`s in `metrics.ts` that compute roster, pareto, burnout, DOW and chart data for the seven tabs that are *not* mounted (`App.tsx:355–362` mounts exactly one).

**Precisely what to do** (three small, independent edits — do them in this order and measure after each):

1. **Stabilize `dashData`.** Wrap the return at `hooks.ts:1308` in `useMemo` with deps equal to the values actually used. The object has 37 keys; the safe mechanical version is to memoize on the full state list already visible in the hook. Verify no consumer mutates the returned object (grep for `dashData.x =` — must be 0 hits) before memoizing; if any consumer mutates, fix the consumer, do not skip the memo.
2. **Stabilize `metrics` and `aiTools`.** Same treatment at `metrics.ts:380` and `hooks.ts:1471`. `useAiTools`'s value is the easiest win: most of its 30+ keys are `useState` primitives, so the memo deps are the state list, and the functions it returns are already `useCallback`-stable — verify that before memoizing, otherwise the memo will still miss.
3. **Do not add `mainTab` gating to `metrics.ts` in this change.** Gating the 10 memos on the active tab is a real follow-up win, but it changes what is computed and can surface latent ordering bugs; land 1–2, measure, then decide.

**Verification.** Add a temporary render counter to one extracted tab (e.g. `FloorRosterTab`) and confirm the count no longer increments on a search keystroke. Then: `tsc -b` 0, 194/194, lint ≤123, preview 200. **Risk: MEDIUM** — this is the one item in S1–S12 where a wrong dependency list causes *stale* data rather than a crash, so the render-counter check and a manual pass over all 8 tabs (each must still show live data after a timeframe/month change) are mandatory.

#### S4 — `ImportPreviewModal.tsx`: 1,858 lines, ~1,278 of them one component · **HIGH (structure)**

**Evidence.** Layout of `src/features/dashboard/import/ImportPreviewModal.tsx`: pure helpers `1–390` (well-factored, 14 tests) · `ManageMemoryModal` `397–568` (172 lines) · **`ImportPreviewModal` `580–1858` (1,278 lines)** with 11 `useState`, 6 `useEffect` (4 of which call `setState` synchronously — the source of the 9 `set-state-in-effect` warnings), 5 `useMemo`, 1 `useCallback`, and a large JSX body.

**Precisely what to do** — three move-only extractions into the same folder (keep the `.tsx` for components, `.ts` for logic — do not create a new feature folder, and do not touch `importPolicy.ts`):

| # | Region | Target | Notes |
|---|---|---|---|
| a | `1–390` helpers (keep exports as-is) | `src/features/dashboard/import/previewState.ts` | Pure move — `getCanonicalFieldLabel`, `buildInitialSheetStates`, `findMatchingSheets`, `applyMappingsToSheets` and friends. Re-point the 14 existing tests at the new path in the same commit. |
| b | `397–568` `ManageMemoryModal` | `src/features/dashboard/import/ManageMemoryModal.tsx` | Self-contained dialog; own file also removes one `only-export-components` warning. |
| c | `580–1858` internals → 3 hooks | `src/features/dashboard/import/useImportPreview.ts` | Split as: sheet/column state + the 3 mapping handlers (`handleColumnMapChange:687`, `handleBulkIgnoreUnmapped:767`, `handleIncludeSkippedSheet:662`); granularity + CX/additional-metric config (the 4 `setState`-in-effect sites at `602/613/621/639`); commit/confirm (`handleCommit`, `handleGranularityChange:674`). Leave the JSX in place. |

**Do not** "fix" the 4 `setState`-in-effect warnings while moving them — moving first, then addressing the effects as a separate change, keeps the diff reviewable. Two of the six effects derive config from `sheetStates` and should ultimately become derived values (computed during render) rather than effects.

**Verification.** `tsc -b` 0, 194/194 (14 of them re-pointed, none rewritten), lint ≤123 with **fewer** warnings (expect −1 `only-export-components`), preview 200, Vite transform 200 for all 4 touched modules, origin-diff parity audit against `26c5661`.

#### S5 — Dead modules and unused barrels · **LOW (pure deletion)**

**Evidence.** Verified zero importers for each:

| Path | Lines | Content | Action |
|---|---|---|---|
| `src/features/dashboard/index.ts` | 5 | barrel → config, helpers, hooks, metrics, import | **delete** (0 importers — grep `from './features/dashboard'` returns nothing) |
| `src/features/dashboard/import/index.ts` | 15 | barrel → 15 modules incl. the `ImportPreviewModal` **component** | **delete, but not free** — ⚠ see the correction below. Also a second Fast-Refresh boundary: a barrel that mixes a component with pure functions |
| `src/features/dashboard/reporting/index.ts` | 1 | `export const reportingSummary = () => 'reporting'` | **delete** (placeholder, 0 importers) |
| `src/features/dashboard/insights/index.ts` | 1 | `export const dashboardInsightSummary = () => 'insights'` | **delete** (placeholder, 0 importers) |
| `src/features/dashboard/upload/index.ts` | 3 | `uploadDashboardFile` returns the file unchanged | **delete** (0 importers). If the folder is expected to grow, delete only the file |
| `src/features/accountSetup/metric-detection-engine.ts` | 6 | comment-only tombstone, 0 code lines | **delete** (the comment it carries is already in `README.md`) |

**⚠ Correction (2026-09-29).** An earlier revision of this entry claimed every file had zero importers. That is wrong for **`import/index.ts`**: `src/features/dashboard/hooks.ts:33–45` imports **11 named symbols** from the `./import` barrel. Deleting the barrel without rewriting that import breaks the single largest file in the app. The other five are genuinely unreferenced.

**Precisely what to do.** Five files delete outright. The sixth requires a de-barrelling edit first — replace the single import at `hooks.ts:33–45` with direct module paths:

| Symbol (all currently via `./import`) | New source |
|---|---|
| `convertWorkbookToSheets`, `convertWorkbookToSheetsViaWorker` | `./import/workbookLoader` |
| `selectSheets`, `selectSheetsWithDetails` | `./import/sheetSelector` |
| `parseCsvFileText` | `./import/csvParser` |
| `aggregateTransactions` | `./import/aggregateTransactions` |
| `validateNormalizedRows` | `./import/validation` |
| `mergeNormalizedRows` | `./import/mergeData` |
| `runImportService` | `./import/importService` |
| `normalizeCellValue`, `normalizeHeaderToField` | `./import/schemaNormalizer` |

Then `grep -rn "from './import'" src` must return **zero** hits before the file is deleted, and the six deletions follow. Use the module-boundary convention already in the folder: no new import edges, no new exports, no re-exports to keep the barrel alive.

**Verification.** `tsc -b` 0, 194/194 (the import pipeline is covered by 10 of the 12 test suites), lint ≤123, preview 200, and `/src/features/dashboard/hooks.ts` returns 200 through the dev server — it is `@ts-nocheck`, so that request is the only thing that proves the de-barrelling resolves.

#### S6 — Four incompatible `localStorage` namespaces, no migration path · **MEDIUM (data risk)**

**Evidence.** Keys are hardcoded string literals in three files, with three different safety strategies:

| Key | File:line | Strategy |
|---|---|---|
| `cs-ops:account-profile:<name>` | `account-profile-storage.ts:9,23,29` | raw `localStorage.*` |
| `cs-ops:calculation-style:<name>` | `account-profile-storage.ts:10,47,52` | raw `localStorage.*` |
| `dashboard_column_mapping_memory_v1` | `mappingMemory.ts:14` | full storage shim + in-memory fallback (`:17–40`) |
| `customer-service-dashboard-state-v1` | `hooks.ts:61,232,376` | try/catch + `console.warn` |
| `customer-service-dashboard-view-v1` | `hooks.ts:66,241` | try/catch + `console.warn` |

**Precisely what to do.** Create `src/features/dashboard/storage.ts` exporting one `safeStorage` object (adopt `mappingMemory.ts`'s shim verbatim — it is the only complete implementation) and one `storageKeys` object. Change all three files to import it. **Do not rename any key in this step** — existing users have data under the current names and there is no migration code; renaming without a migration silently discards every learned mapping and account profile. Namespace adoption (`cs-ops:`) is a separate, later decision.

**Verification.** `grep -rn "localStorage" src --include=*.ts --include=*.tsx` must show direct access in `storage.ts` and `storageKeys` only (test mocks excepted). `mappingMemory.test.ts` (13 tests) and `emptyColumns`/`monthSelection` suites must pass unchanged — they already mock `globalThis.localStorage`, which is the behavior to preserve.

#### S7 — Header normalization exists in three variants; two Excel-serial thresholds disagree · **MEDIUM (STANDING RULE domain)**

**Evidence.**
- `importPolicy.ts:565` `export const normalizeHeader` and `schemaNormalizer.ts:11` `const normalizeHeader` are **byte-identical implementations** (same two camelCase regexes, lowercase, strip non-alphanumerics) — pure duplication inside the exact domain the STANDING RULE governs.
- `ImportPreviewModal.tsx:336` adds a third, weaker variant (`.map(m => m.normalized.toLowerCase().trim())`) for sheet matching.
- `EXCEL_SERIAL_MIN` is `1` at `importPolicy.ts:1267` but `35000` at `columnFingerprinter.ts:30` (with `MAX = 60000` in both). Both carry explanatory comments and the divergence is *arguably intentional* (convert-vs-classify), but it means a 5-digit serial in 1–34999 is converted to a date by the policy and is **not** classified as date-like by the fingerprinter — and neither file reveals the other.

**Precisely what to do.**
1. In `schemaNormalizer.ts`, delete the private copy and import the exported one from `./importPolicy` — **zero behavior change, byte-identical function**. Add a one-line comment pointing at `importPolicy` as the single owner of header normalization.
2. Leave `ImportPreviewModal.tsx:336` alone (it normalizes already-normalized field names — different input, different contract). Add a comment saying so, so the next reader does not "fix" it.
3. For the thresholds: **do not unify them in this step.** Instead, cross-reference the two constants in comments and record the known divergence window in this file. Unifying is a *behavioral* change to date detection and needs its own test pass (importPolicy has 42 tests; add cases for serials 1, 10000, 34999, 35000, 45383, 60000, 60001 to `importPolicy.test.ts` **before** touching either constant).

**Verification.** `tsc -b` 0, 194/194 — all 42 `importPolicy` tests and 18 `columnFingerprinter` tests must pass unchanged, which is what proves step 1 was byte-identical.

#### S8 — `createAbortError` ×3, `yieldToEventLoop` ×2 · **LOW (duplication)**

**Evidence.** `createAbortError`: `importService.ts:27`, `workbookLoader.ts:39`, `workbookWorker.ts:63`. `yieldToEventLoop`: `importService.ts:25`, `workbookLoader.ts:29`.

**Precisely what to do.** Extract both into `src/features/dashboard/import/asyncUtils.ts`. The `workbookWorker.ts` copy **must stay inline** — the worker is instantiated from a blob/URL and must not gain an import edge; leave a comment there saying so. Net result: 1 shared module, 2 call sites converted, 1 deliberate inline copy.

**Verification.** 194/194 (16 `workbookLoader` tests exercise the worker bridge and will catch a broken edge), `tsc -b` 0.

#### S9 — 13 leftover debug logs in the production import path · **LOW (hygiene)**

**Evidence.** `workbookLoader.ts:437, 482, 486, 488, 498, 520, 531, 560, 563, 568` (labels `[WORKER-LOADER]`, `[DEBUG 3d…3i]`) and `workbookWorker.ts:223, 260, 263` (labels `[WORKER]`). They fire on every workbook import. Meanwhile legitimate diagnostics use `console.warn` in `mappingMemory.ts:78,95,314` and `hooks.ts:249,254,377` — so debug and real warnings are indistinguishable.

**Precisely what to do.** Delete the 13 debug logs. For the three that carry operational value (`workbookLoader.ts:437` timing, `:520` worker error, `:531` `onerror`) keep them as `console.warn` with the `[import]` prefix; for the `[DEBUG 3*]` trace lines delete outright. Do not add a logging framework in this step — the goal is that a user reporting a failed import sees warnings, not a 13-line trace.

**Verification.** `grep -c "DEBUG 3" src/features/dashboard/import/workbookLoader.ts` → `0`. 194/194, preview 200, and one real workbook import exercised in the browser to confirm no diagnostics were lost.

#### S10 — Mixed module specifier conventions · **LOW (consistency)**

**Evidence.** 159 extensionless relative imports vs **10 with an explicit `.ts` extension**, all inside `import/`: `./schemaNormalizer.ts` ×3, `./importPolicy.ts` ×2, `./columnFingerprinter.ts` ×2, `./workbookLoader.ts`, `./validation.ts`, `./sheetSelector.ts`, `./mergeData.ts`, `./mappingMemory.ts`, `./granularityDetector.ts`, `./aggregateTransactions.ts`.

**Precisely what to do.** Drop the 10 extensions (Vite and `tsc` both resolve extensionless, and it matches the other 159). **Exception:** if any of those 10 are dynamic `import()` calls for the worker, leave them and comment why. Purely mechanical — no behavior change.

**Verification.** `tsc -b` 0, 194/194 (the 10 sites are all in tested modules), lint unchanged.

#### S11 — `AccountProfile` shape defined twice · **MEDIUM (data contract)**

**Evidence.** `src/features/accountSetup/account-profile-schema.ts` (235 lines, 17 exports) is the schema; `buildAccountProfile` at `ImportPreviewModal.tsx:201–274` (74 lines) constructs the object inline in the modal. A persisted, schema-versioned object with two sources of truth.

**Precisely what to do.** Move `buildAccountProfile` into `account-profile-schema.ts` as a pure builder next to the type it produces, and export it. This keeps the STANDING RULE intact (no mapping/alias logic is involved — it is object assembly from already-resolved fields). If any of its 74 lines turn out to be *policy* decisions (defaults, inferences), those lines belong in `importPolicy.ts` per the standing rule — audit the body before moving and split accordingly. Re-point the single import site; `ImportPreviewModal.test.ts` must pass untouched.

**Verification.** `tsc -b` 0, 194/194, preview 200, and a full import → account-profile save → reload round trip in the browser (this object is persisted, so a silent shape change is the risk).

#### S12 — Copy-to-clipboard button duplicated in 4 tabs · **LOW (duplication)**

**Evidence.** Identical `navigator.clipboard.writeText(aiTools.X)` + `.gemini-btn btn-alt` button in `FloorAnalysisTab.tsx`, `FloorApprenticeTab.tsx:157`, `FloorCorrelationTab.tsx:22`, `FloorDowTab.tsx:24`. None of the four handles clipboard-permission failure, so a denied permission is silent.

**Precisely what to do.** Add `<CopyReportButton text={aiTools.correlationReport} label="Copy" />` to `src/components/shared.tsx` (where `FormattedText` and `GeminiLoader` already live) with a `useState` "Copied ✓" confirmation that resets after ~1.5 s, plus a `catch` that surfaces "Copy failed — select the text manually". Replace the 4 sites. Note `shared.tsx` is `@ts-nocheck` — the new component should be typed explicitly anyway, and that file is already a candidate for having the suppression removed.

**Verification.** `tsc -b` 0, 194/194, lint ≤123, and a manual click in each of the 4 tabs including a denied-permission case.

---

### Implementation notes — exact contracts for the five highest-risk items

The entries above say *what* to change. This subsection says *how*, concretely enough to implement without re-deriving it. Each is still a **move-only** change: if you find yourself editing logic rather than relocating it, you are out of scope — stop and re-read the entry.

---

#### S1 — `useDashboardData` split: module contracts

Five new files, five commits, in this order. The composition hook at `hooks.ts:267` keeps its name, its 3 parameters and its **exact 37-key return object** (`hooks.ts:1308–1317`) — that object is the contract 13 consumer files depend on (trap 3).

**Step (a) → `src/features/dashboard/state.ts`**

```ts
// no @ts-nocheck. Takes no arguments; returns the 16 state values + their setters.
export const useDashboardDataState = (persistedState: PersistedState | null) => ({
  activeTimeframe, setActiveTimeframe, selectedWeek, setSelectedWeek,
  selectedDate, setSelectedDate, selectedDow, setSelectedDow,
  selectedMonth, setSelectedMonth,          // already the useCallback wrapper from :287
  selectedMonthChosen, agents, setAgents, supervisors, setSupervisors,
  oamName, setOamName, historicalData, setHistoricalData,
  hasUploadedData, setHasUploadedData, uploadStatus, setUploadStatus,
  batchImportSummary, setBatchImportSummary, importPreview, setImportPreview,
  mappingReview, setMappingReview, pendingAutomaticImport, setPendingAutomaticImport,
  pendingAutomaticFiles, setPendingAutomaticFiles,
  rateMergeStyle, setRateMergeStyleState, accountProfile, hasSavedAccountProfile,
  loadedMonths,
});
```

Move verbatim from `hooks.ts:268–309`. **Keep `setSelectedMonth`'s wrapper** (`:287`, the one that also flips `selectedMonthChosen`) intact — it is not a plain `setState` and is the one place where two states must change together.

**Step (b) → `src/features/dashboard/persistence.ts`** (also does S6 step 1)

```ts
export const useDashboardPersistence = (state: {
  agents, supervisors, oamName, historicalData, hasUploadedData,
  activeTimeframe, selectedWeek, selectedDate, selectedDow,
  selectedMonth, selectedMonthChosen,
}) => void;   // two effects today: the heavy payload (:370-378) and the view payload (:381+)
```

Move the two write effects verbatim. Keep the two key names **unchanged** — existing users have data under them and there is no migration code (S6).

**Step (c) → `src/features/dashboard/import/uploadFlow.ts`**

```ts
export const useUploadFlow = (deps: {
  accountName, setStatus, scheduleStatusClear, setPendingAutomaticImport,
  setPendingAutomaticFiles, setBatchImportSummary, setMappingReview,
  setRateMergeStyle, setImportPreview, onImportColumnsScan, importAbortControllerRef,
}) => ({ handleFileUpload, handleFileDrop, handleMultipleFiles,
         handleAutomaticImport, handleAutomaticFileUpload, continueAutomaticImport });
```

Sources: `handleMultipleFiles` `:403–574`, `handleAutomaticImport` `:737–857`, `handleAutomaticFileUpload` `:913–921`, `continueAutomaticImport` `:863–912`, `handleFileUpload` `:1180–1196`, `handleFileDrop` `:1197–1216`. Create the file in `import/` **only if** it imports nothing from `../hooks`; otherwise keep it at `src/features/dashboard/uploadFlow.ts` to avoid a cycle (trap 5). **It will** import `./import/*` — that is allowed and already the pattern.

**Step (d) → `src/features/dashboard/import/batchImport.ts`**

```ts
export const useBatchImport = (deps: { /* same shape as (c) plus setImportPreview, importPreview */ }) =>
  ({ applyBatchImport, confirmImportPreview, processFile });
```

Sources: `applyBatchImport` `:575–736`, `confirmImportPreview` `:922–1049`, `processFile` `:1050–1179`. **Carry the numbered pipeline comments with the code** — the comments at `:940`, `:1001`, `:1016`, `:1034` mark steps 1–5 of the import pipeline and are the only documentation of that ordering.

**Step (e) → `src/features/dashboard/timeframe.ts`** *(do this one second — it is pure, so it is testable)*

```ts
export const useTimeframeSelectors = (deps: {
  historicalData, hasUploadedData, activeTimeframe, selectedWeek,
  selectedDow, selectedMonth, agents,
}) => ({ agentDataCache, getAgentDataForTimeframe, getTopHeadlineMonth, monthLabel, handleDateChange });
```

Sources: `agentDataCache` `:1217–1253`, `getAgentDataForTimeframe` `:1254–1301`, `getTopHeadlineMonth` `:1302–1306`. This is the only step that is a **pure derivation**, so add its tests in the same commit: at least 4 timeframes × the `selectedDow` / `selectedWeek` / `selectedMonth` boundaries.

**Post-conditions for every step.** `hooks.ts` line count drops by exactly the moved block; the return object at `:1308` is byte-identical; no consumer file changed; `wc -l` of the new file equals the removed block ± 5.

---

#### S3 — Memoizing the three hook returns: how not to ship stale data

The whole point is that the `useMemo` at `App.tsx:240` currently never hits. The three returns to wrap are `hooks.ts:1308`, `hooks.ts:1471`, `metrics.ts:380`.

**Order matters — do them one at a time, measuring after each.**

1. **`dashData` (`hooks.ts:1308`).** Before memoizing, prove nothing mutates it: `grep -rn "dashData\.[a-zA-Z]* *=" src` must return **0 hits**. If it returns any, fix the mutator first. Then wrap the return with a dep list of every value referenced in the 37 keys. This is the largest and riskiest of the three — the dep list is long, and `getAgentDataForTimeframe` / `monthLabel` / `handleDateChange` are **functions**, so they must either be `useCallback`-wrapped (S1(e) gives you the seam) or omitted, which silently re-creates them and re-breaks the memo.
2. **`metrics` (`metrics.ts:380`).** Its 10 internal `useMemo`s already handle the expensive work; memoizing the *returned object* is cheap and safe. Dep list = the 10 memo results plus the few raw values returned directly.
3. **`aiTools` (`hooks.ts:1471`).** Easiest: nearly every key is a `useState` primitive. Verify each returned function is `useCallback`-stable first — if one is not, it will defeat the memo and the work is wasted.

**How to prove it worked** (a `tsc`-clean build proves nothing here):

```bash
# temporary, remove before committing
# add a module-level counter + console.log to FloorRosterTab's body
# 1. open the app, upload a file, land on the roster tab
# 2. type in the search box  -> counter must NOT increment per keystroke (300 ms debounce = 1 render)
# 3. switch timeframe, month, week, day, floor -> counter increments exactly once per change
# 4. click through all 8 tabs -> each renders live data, no stale numbers
```

If step 3 shows **zero** increments, the dep list is too wide (functions recreated). If a value is stale, the dep list is too narrow. Remove the counter in the same commit.

---

#### S4 — `ImportPreviewModal.tsx` split: file map and what must not move

| Target file | Source region | Export names preserved |
|---|---|---|
| `import/previewState.ts` | `:1–390` | `getCanonicalFieldLabel`, `buildInitialSheetStates`, `findMatchingSheets`, `applyMappingsToSheets` + the internal draft builders |
| `import/ManageMemoryModal.tsx` | `:397–568` | `ManageMemoryModal` + `ManageMemoryModalProps` |
| `import/useImportPreview.ts` | `:580–1858` internals | `ImportPreviewModal` stays in `ImportPreviewModal.tsx` |

**Four constraints.**

1. **Re-point the 14 tests, do not rewrite them.** `ImportPreviewModal.test.ts` imports four symbols from `'./ImportPreviewModal'`; change the import line to `'./previewState'` and change nothing else in the file. A rewritten test is a test that no longer proves what it proved.
2. **`only-export-components` warnings will not disappear for `previewState.ts`** — a `.ts` file with no components cannot have one. That is correct and expected; the warning moves, it does not go away.
3. **Do not fix the 4 `setState`-in-effect sites** (`:602`, `:613`, `:621`, `:639`) while moving. Two of them derive config from `sheetStates` and should eventually become render-time derivations — that is a separate behavioural commit with its own review.
4. **Keep the component in place.** Only its internals move; the JSX stays in `ImportPreviewModal.tsx`. Moving the JSX too is a fourth file and a much larger review.

---

#### S6 — `storage.ts`: exact surface, and the key rule

```ts
// src/features/dashboard/storage.ts — no @ts-nocheck
import { inMemoryStore } from './storageMemory';   // moved from mappingMemory.ts:18-21

// lift getStorage() VERBATIM from mappingMemory.ts:23-36 — the only complete
// storage-safety implementation in the repo: window.localStorage →
// globalThis.localStorage → null, all inside try/catch for SecurityError
// (restricted iframes, private browsing).
function getStorage(): Storage | null { /* …exact copy… */ }

// the facade every caller should use instead of touching storage directly
export const safeStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
// wrap getStorage() ?? inMemoryStore so every read/write has a working backing store

export const storageKeys = {
  accountProfile:    (name: string) => `cs-ops:account-profile:${name}`,
  calculationStyle:  (name: string) => `cs-ops:calculation-style:${name}`,
  mappingMemory:     'dashboard_column_mapping_memory_v1',
  dashboardState:    'customer-service-dashboard-state-v1',
  dashboardView:     'customer-service-dashboard-view-v1',
} as const;
```

**The key values above are the current values, deliberately unchanged.** Do **not** normalise them to the `cs-ops:` namespace in this change: there is no migration code, so renaming silently discards every learned mapping and every saved account profile. Namespace consolidation is a separate change that must ship with a migration.

Then convert `account-profile-storage.ts` (raw `localStorage` today) and `hooks.ts:228–262` (try/catch today) to the shared surface. `mappingMemory.ts` keeps `getStorage()` and the in-memory fallback — it just sources the key from `storageKeys` and calls the facade instead of `getStorage()` directly.

**Round trip to verify by hand:** import a file → account profile saves → reload the page → profile and learned mappings are still there.

---

#### S11 — `buildAccountProfile`: audit before you move it

`ImportPreviewModal.tsx:201–274` builds the persisted `AccountProfile` inline; the schema lives in `account-profile-schema.ts:1–235`. Move the builder next to its type — **but read all 74 lines first and split it.** Any line that makes a *policy* decision (a default value, an inference from a header, a fallback name) is mapping/domain logic and belongs in `importPolicy.ts` per the STANDING RULE. Any line that merely assembles already-resolved values moves. If you cannot cleanly separate them, stop and report it — do not move policy into the schema file.

---

### Remediation order for S1–S12

| Rank | Item | Effort | Risk | Why this position |
|---|---|---|---|---|
| 1 | S5 dead files | minutes | none | pure deletion, zero importers, shrinks the audit surface for everything after |
| 2 | S10 specifiers, S8 asyncUtils, S9 debug logs | ~1 h | none | mechanical; each verified by the existing 194 tests |
| 3 | S7.1 (remove duplicate `normalizeHeader`) | ~15 min | none | byte-identical, proven by 60 existing tests |
| 4 | S2 `scheduleStatusClear` | ~1 h | low | removes 16 sites and a real unmount leak; visible in the UI, so verify by hand |
| 5 | S12 copy button | ~1 h | low | small, self-contained |
| 6 | S6 storage module | ~2 h | medium | no key renames; touches 3 files, all with existing test coverage |
| 7 | S4 ImportPreviewModal split | ~4 h | low | move-only; expect the warning count to drop |
| 8 | S1 `useDashboardData` split (a→b→e→c→d) | ~1 day | low | the biggest win, but move-only and gated by the origin-diff audit |
| 9 | **S3 memoize hook returns** | ~3 h | **medium** | the largest runtime win, but a wrong dep list causes *stale* data, not a crash — do it after the extractions so the diff is small and the render counter is easy to reason about |
| 10 | S11 `buildAccountProfile` | ~2 h | medium | persisted shape; needs a manual round trip |
| 11 | S7.3 (unify Excel serial thresholds) | ~2 h | medium | **behavioral** — write the 7 new boundary tests first, then decide |

**Explicitly out of scope for S1–S12** (already known, unchanged, and each needs its own decision): the `if (false && !hasAccountName)` dead gate at `App.tsx:245` that makes the ~70-line account-setup screen unreachable; the ref-write-during-render at `App.tsx:173` and `hooks.ts:1447`; 53 `no-unused-vars`; and the `window.tailwind` shim at `App.tsx:57–60` — a global set for a Tailwind that is not installed, whose 189 hand-rolled substitute classes now live in `src/styles/dashboard.css` (Phase 2 above relocated them — they remain hand-rolled by design, per the step 2 decision).

---

### Structural Findings (continued) — S13–S23, imported from `todo-list.md` (2026-09-29)

`todo-list.md` was a hand-maintained backlog last edited on 2026-09-27 — **before** Phases 1/3/4/5. Its architecture and performance items are consolidated here so this file is the single source of reference; the file itself has been deleted. Every item below was **re-verified against current code** before import, and the full disposition of all 50 checklist lines (31 open + 19 completed) is recorded in the **Consolidation Record** at the end of this document.

| # | Finding | Verified evidence | Severity |
|---|---|---|---|
| **S13** | `searchedOams` computed 3× in 3 files | `FloorRosterTab.tsx:36`, `TopNavbar.tsx:27`, `metrics.ts:254` — byte-identical one-liner | MEDIUM |
| **S14** | `liveSupObj` computed in the modal render body | `MainModal.tsx:115` (inside JSX) — `supAgentsList` was already fixed into a `useMemo` at `:69` | LOW |
| **S15** | 154 inline `style={{}}` objects | `grep -rho "style={{" src --include=*.tsx` → 154 (backlog said 41) | LOW |
| **S16** | 62 inline arrow handlers in JSX | spread over 17 files; `ImportPreviewModal.tsx` 12, `MainModal.tsx` 8 (backlog said 47) | LOW |
| **S17** | MTD and Daily metric cards duplicate their JSX | `MainStatsRow.tsx:16` (`.card-mtd`) vs `:58` (`.card-daily`) — ~40 duplicated lines | LOW |
| **S18** | 21 conditional `className={… ? … : …}` chains | across the tab/modal/chrome files (backlog: "reduces readability without clsx") | LOW |
| **S19** | `supBurnoutList` filtered inside a JSX IIFE | `MainModal.tsx:267` — re-filters `metrics.orgBurnoutList` on every modal render | MEDIUM |
| **S20** | `COL_DEFINITIONS` referenced 23× across 8 files | `FloorRosterTab` 5, `MainModal` 6, `FloorDowTab` 3, `FloorBurnoutTab` 2, `menus` 2, `config` 3, `emptyColumns` 1, `metrics` 1 (backlog said 14) | LOW |
| **S21** | `Object.keys(uiState.visibleCols)` called 4× in one render body | `FloorRosterTab.tsx` — exactly 4, as reported | LOW |
| **S22** | `getWeekNumber` recomputed in a nested loop, uncached | `metrics.ts:295` — inside `finalDates.forEach(week) → dates.forEach(date)`, i.e. O(weeks × dates) string parses per recompute | MEDIUM |
| **S23** | `runChartData` rebuilds its date set from scratch | `metrics.ts:240–246` — iterates every value of `historicalData` on each recompute | LOW |

**Precisely what to do.** All eleven are render-path work with no behavior change, and they are independent of each other and of S1–S12:

- **S13** — move the one-liner into `src/features/dashboard/helpers.ts` as `resolveSearchedOams(agents, queries): string[]` and call it from all three sites. The three copies already diverge in what they do with the result (auto-select the OAM, set a header name, build an "(OAM Overall)" label), so the helper returns the list and each caller keeps its own rule.
- **S19 / S21** — hoist both into a `useMemo` at the top of their component with an explicit dep array. S19's dep is `metrics.orgBurnoutList` + `uiState.selectedSupervisorObj?.name`; S21's is `uiState.visibleCols`. These two are the only two in this batch that run on a hot path (a modal open and a keystroke-debounced roster render).
- **S22** — memoize the date→week map once per recompute (`new Map(dates.map(d => [d, getWeekNumber(d)]))`) and read from it inside the loop, or lift the map into the same `useMemo` that already owns `allActiveDates`. Pure speed-up, identical results.
- **S14 / S17** — S14 becomes a `useMemo` next to the existing `supAgentsList` one. S17 becomes a single `<MetricCard>` in `MainStatsRow` parameterised by the two datasets, replacing ~40 duplicated lines.
- **S15 / S16 / S18 / S20 / S23** — treat as **opportunistic**: fix the ones in code you are already editing for S1/S3/S4, and do not open a dedicated pass for the rest. S15 and S16 are heavily concentrated in the two files S4 rewrites (`ImportPreviewModal.tsx`, `MainModal.tsx`), so **do S4 first and collect them there**. S20 and S23 improve automatically if S3's memoization lands, because both recompute on the render path S3 stabilizes.

**Verification.** `tsc -b` 0, 194/194 (S13/S22 in particular are pure refactors — `helpers.test.ts` from C3 and the existing `monthSelection` suite are the proof), lint 0 errors / ≤123, preview 200, and a roster-search + modal-open + timeframe-switch pass in the browser with the roster results compared before/after.

---

## UX & Accessibility Findings (U1–U6)

`todo-list.md`'s Priority 3 bucket was the one dimension never covered by the restructure work or by any earlier section here, so it is imported in full. These are **usability and accessibility** items — none is a crash, none blocks a release, and none should be mixed into a correctness change. Treat them as a batch.

| # | Finding | Verified evidence | Severity |
|---|---|---|---|
| **U1** | Emoji are the entire icon system | **51** JSX text positions lead with an emoji glyph — `ImportPreviewModal.tsx` alone has 🧠 💡 📥 📁 ⚠️ 📋 📊 ✓ 🗺️ 🚫; `shared.tsx:17` `GeminiLoader` defaults to `icon = '✨'` | MEDIUM |
| **U2** | Hover-reveal buttons implemented in JS, not CSS | `TopNavbar.tsx:118–129` and `:87` set `opacity: 0.7` in markup and swap it via `onMouseOut`; on touch devices there is no hover, so these controls stay dimmed permanently | HIGH |
| **U3** | Red used as a neutral accent label colour | 10 `text-red-*` sites; red carries an universal error/danger meaning that this usage dilutes | LOW |
| **U4** | Comma-separated search syntax is placeholder-only | `FloorHeader.tsx:41` `placeholder="Search multiple (comma separated)..."` is the only affordance; no helper text, no chip/token rendering of the parsed terms | MEDIUM |
| **U5** | No loading/skeleton state for the initial metric cards | `MainStatsRow` renders immediately with no pending state; the app has no data-fetching phase, so this is the "empty vs not yet resolved" ambiguity | MEDIUM |
| **U6** | Inconsistent button affordance | pill-shaped icon buttons (`FloorHeader.tsx:34–35` ◀ ▶) sit beside labelled rectangular buttons (`:52–61` tabs) in the same header | LOW |

*(Six items, renumbered from the backlog's seven — see the Consolidation Record: the backlog's "no visible upload/empty-state guidance" item was verified false and retired, and its "no skeleton/loading state" item was listed **twice**, once under Priority 3 and once under Priority 4, and is carried once here as U5.)*

**Precisely what to do.**

- **U2 first** — it is the only one that makes a control genuinely hard to use. Replace the inline `opacity` + `onMouseOut` pattern with a real CSS `:hover`/`:focus-visible` rule in `src/styles/dashboard.css`, and keep the visible state at `opacity: 1` (the current `0.7` is the resting state, which is why it reads as disabled). Phase 2 is complete, so the ordering constraint is gone — the rule goes straight into the stylesheet.
- **U1** — do not rip out emoji. Introduce one `<Icon name="…" />` in `components/shared.tsx` with an inline SVG map, and migrate the **9 highest-traffic glyphs** (the tab-bar and navbar set) first; leave decorative in-card emoji until later. Pair it with C2, which already renames `GeminiLoader` → `AiLoader` in the same file.
- **U4** — render the parsed queries as removable chips under the input (`uiState.inputValue` is already comma-split by `helpers.ts`), so the syntax is visible rather than documented. This also makes the 300 ms debounce in S3 legible to the user.
- **U5** — add an explicit `isResolving` flag to the dashboard state rather than a fake skeleton timer; show a neutral placeholder card until the first `historicalData` lands. Only worth doing alongside S1(a), where the state module is created.
- **U3 / U6** — colour and shape decisions. Batch them into a single visual pass, ideally with the design work already proposed in `## Design Gap Analysis` below. Do not do either as a drive-by.

**Verification.** No automated gate exists for this section — `tsc`, tests and lint will not move. Verification is: keyboard-only pass over the navbar and header (U2, U5), a touch-device or DevTools touch emulation pass (U2, U6), and a screenshot review of the header before/after (U1, U3, U6). Record the before screenshots, or the change cannot be reviewed.

---

## Working rule

Carried over verbatim in substance from `todo-list.md` (which has been retired) so that the discipline survives the file:

- If a task is fixed or intentionally accepted, remove it from the active backlog immediately.
- Keep only open, actionable issues in the main list.
- Historical completed work belongs in commit history or a consolidation record, not in the active list.
- Revisit the backlog after each cleanup pass and delete stale or superseded items.

Applied to this document: `## Critical` and the S/U series are the active backlog; the Consolidation Record below is the archive; `recommendations.md` is now the **single source of reference** for known issues in this repository.

---

## Consolidation Record — `todo-list.md` (2026-09-29)

`todo-list.md` (80 lines, last edited 2026-09-27 in commit `b547a73`, i.e. before Phases 1/3/4/5) has been **merged into this file and deleted**. Nothing was dropped silently: every one of its **31 `- [ ]` lines** (27 real backlog items + the 4 Working-rule lines, now carried above) and **19 `- [x]` lines** is accounted for below. Counts were taken programmatically from the file, and every item was re-verified against current code rather than trusted.

**Imported as new findings (17):** S13 `searchedOams` ×3 · S14 `liveSupObj` in render · S15 154 inline styles · S16 62 inline arrow handlers · S17 MTD/Daily card duplication · S18 21 conditional `className` chains · S19 `supBurnoutList` IIFE filter · S20 `COL_DEFINITIONS` ×23 · S21 `Object.keys(visibleCols)` ×4 · S22 uncached `getWeekNumber` loop · S23 `runChartData` date-set rebuild · U1 emoji icon system · U2 JS hover-reveal buttons · U3 red as neutral accent · U4 comma-search affordance · U5 no loading state · U6 inconsistent button affordance. (The backlog's separate "no visible upload/empty-state guidance" item was verified false — see retired — and its "no skeleton/loading state" item was listed **twice**, once in Priority 3 and once in Priority 4, and is carried once as U5.)

**Already covered here — backlog item retired as duplicate (5):**

| Backlog item | Now documented as |
|---|---|
| No backend — all logic and storage client-side | **C1** (and the egress severity is worse than the backlog recorded) |
| No environment/config separation | **C1** step 1 |
| Business logic tightly coupled to React hooks | **S1** — quantified at 1,051 lines |
| `DASHBOARD_STYLES` re-injected every render | **Phase 2** ✅ (completed 2026-09-29) |
| 2 leaked `setTimeout`s on upload status | **S2** — re-verified at **16**, not 2 |

**Retired as stale — no longer matches the code (4):**

| Backlog item | Why retired |
|---|---|
| Hardcoded OAM names for phase detection | No OAM name list exists anywhere in `src/`; `config.ts` contains none. Either fixed before the file was written or never real. |
| 8 navigation destinations hidden behind one unlabeled icon button | False. `FloorHeader.tsx:52–61` renders a visible, labelled 8-tab bar. |
| `DASHBOARD_STYLES` defined inside the App render tree | False since Phase 1 — it was a module export. The remaining part (per-render *injection*) was removed in Phase 2 step 1 and step 2's restructure landed the same day; the CSS now lives in `src/styles/dashboard.css` (53 lines / 17,463 bytes). Nothing open. |
| No visible upload/empty-state guidance for first-time users | Largely false. `App.tsx:309` routes the no-data state to `ImportLanding` (566 lines) with a drop zone, account selector and mapping review. The genuine gap — the missing *loading* state after import — is carried as U5. |

**Archived as completed — 17 of 19 verified against current code:** memoize `getAgentDataForTimeframe` (⚠ see correction below); extract `agentMatchesSearch` to top level ✓ `helpers.ts:28`; fix the double `calculateTrend` call ✓ one call site, `metrics.ts:63`; remove dead `LEADERSHIP_DATA` and `apiKey` ✓ zero hits repo-wide; `React.memo` on always-mounted components ✓ `FloorHeader`, `MainStatsRow`, `TopNavbar`, `MainModal`; stable `uiState`/`uiHandlers` references ✓ `App.tsx:157`, `:242`; `searchQuery` parsed 12× per render ✓ `parsedQueries` memoized, `metrics.ts:37`; `agents.filter(agentMatchesSearch)` 6× per render ✓ memoized, `metrics.ts:43`; `closeModal` fired 14 sequential `setState` calls ✓ single dispatch, `App.tsx:196`; 12 UI states → one `useReducer` ✓ 13 `dispatchUi` sites, one reducer; `SupervisorModalContent` filter/sort in render ✓ 7 `useMemo`s; `FloorApprenticeTab` filtering in render ✓ memoized at `:24`, `:28`, `:33`; `days` array defined twice ✓ single `DAYS_OF_WEEK` import from `config.ts`; `colors` array inside the `runChartData` memo ✓ uses `CHART_COLORS` from config; prop drilling of 5 prop bundles ✓ every view file now reads `useDashboard()`; add drag-to-upload zone ✓ `src/components/dropZone.tsx`; `new Date()` per date per agent in `agentDataCache` ✓ zero occurrences in `hooks.ts:1217–1254`; **AI resilience layer** ✓ `fetchWithRetry` with 2 retries / 30 s timeout / exponential backoff (`hooks.ts:1323`) plus `importAbortControllerRef` (`:304`, aborted at `:335`, `:406`).

**⚠ Two of the 19 `[x]` claims did not survive verification and are re-opened rather than archived:**

1. **"Memoize `getAgentDataForTimeframe`" — done by other means, not as described.** `hooks.ts:1254` is a plain function, not a `useCallback`; the memoization lives one level down in the `agentDataCache` `useMemo` (`:1217`). Effective intent achieved, claim imprecise. No new work item — but it is the reason S3's dependency work must not assume this function is referentially stable.
2. **"Guard AI auto-triggers + reset on re-upload" — NOT done; re-opened under C4.** The only guard on the auto-firing effect (`hooks.ts:1449`) is `if (!agents.length) return;`; it still fires on all 15 of its dependencies with no opt-in, and the reset half is inert because `aiTools.resetAiStates` is `undefined` (`App.tsx:173`, `:212`). This item is therefore **not** archived — it is part of C4's failure mode 4 and C1's data-egress finding.

**One side observation from the verification:** `App.tsx:12` still imports `agentMatchesSearch` and never uses it — a dead import left behind by the L20 extraction, part of the 53 `no-unused-vars` already noted as out of scope above.

**Two counts in the backlog were materially understated** and are corrected above: inline styles 41 → **154**, inline arrow handlers 47 → **62**, `COL_DEFINITIONS` 14 → **23**, leaked timeouts 2 → **16**.

**One backlog item was better than this document's own audit:** the leaked-upload-timer entry is the original source of finding S2.

## Design Gap Analysis — landing page vs dashboard (open)

> Comparison basis: `ImportLanding.tsx` / `ImportLanding.css` (the loading page) vs `App.tsx` / `App.css` (the main dashboard).
> These are ideas only, ordered by impact vs effort. Nothing here has been implemented.

#### 1. Dark atmospheric background
The landing uses `#0b0b0a` + a radial blue glow (`rgba(55, 138, 221, 0.12)`) that gives it depth and warmth. The dashboard sits on a flat `bg-slate-50` / white base — it reads as a standard enterprise spreadsheet tool.

**Idea:** Replace the dashboard body/card backgrounds with the same dark palette (`#0b0f19`, `#111827`) that the error boundary and navbar already use. The KPI cards and table already carry slate-900 — unify that dark theme all the way through.

---

#### 2. The morphing orb as brand DNA
The animated blob (`border-radius` morph + scale pulse + warm gold-to-blue radial gradient) is the most distinctive element of the landing. The dashboard has no ambient motion or visual brand anchor.

**Idea:** Bring a smaller, static version of the orb aesthetic — the gold/blue gradient and soft blob shape — into the top navbar as a brand mark where the plain "CSO" text badge currently sits. No animation needed in the dashboard, but the visual DNA would carry through.

---

#### 3. Color palette continuity
The landing uses a deliberate 3-color language that the dashboard completely ignores:

| Role | Landing color | Dashboard equivalent |
|---|---|---|
| Accent / "good" | `#5dcaa5` (mint green) | `emerald-400` (different green) |
| Warning / highlight | `#f0c674` (warm gold) | `amber-*` (inconsistent) |
| Background glow | `#378add` (blue) | `sky-500` / Tailwind defaults |

**Idea:** Remap the dashboard's "good" metric color from Tailwind `emerald-400` to the landing's `#5dcaa5`, and the accent/glow from Tailwind blue to `#378add`. Two color swaps, immediately makes the dashboard feel like the same product.

---

#### 4. Typography weight and tone
The landing uses `font-weight: 600` and `clamp(22px, 4vw, 30px)` headlines — editorial and confident. The dashboard's KPI headings are `text-xl` with dense `text-xs uppercase tracking-wide` section labels — utilitarian and cramped.

**Idea:** Give "Month to Date" and "Daily Spotter" the same large, fluid `clamp()` sizing as the landing's h1. Let them breathe.

---

#### 5. Card border style
The landing's cards use `border: 1px solid #2c2c2a` — subtle, dark, warm-tinted. The dashboard's cards use `border-slate-200` — cold light gray that visually clashes with the dark navbar above.

**Idea:** Unify to one border treatment: `rgba(255,255,255,0.08)` on dark sections, `#e2e8f0` on any remaining light sections. Or go fully dark and drop the light-card areas entirely.

---

#### 6. Tab bar contrast flip
The landing's active states use a glow/selection pattern (mint border + tinted background). The dashboard tab bar inverts to white-on-slate — fine in isolation but feels like a different component library.

**Idea:** Restyle the tab bar container to the landing's dark-card treatment (`background: #151512`, `border: 1px solid #2c2c2a`). Active tabs get a `#5dcaa5` bottom border or subtle mint glow instead of a white background.

---

#### 7. Radial gradient spotlight (zero-effort depth)
The landing has a radial gradient spotlight from the top center. The dashboard is completely flat — no gradients, no visual hierarchy anchors.

**Idea:** Add one CSS rule — a subtle radial gradient (`rgba(55, 138, 221, 0.07)`) behind the KPI stats row. One line, instantly makes the top of the dashboard feel premium.

---

#### 8. Micro-motion
The landing has `translateY(-2px)` hover lift on the dropzone, stagger-delay list animations, and the orb morph. The dashboard has `hover:-translate-y-1` on roster rows (good) but nothing else.

**Idea:** Add the same hover lift + `box-shadow` to the KPI cards, and a `opacity 0 → 1` fade-in on the stats row when data loads — mirroring the landing's `importReviewRise` keyframe.

---

### Priority Order

| # | Idea | Visual Impact | Effort |
|---|---|---|---|
| 1 | Unify dark background across dashboard body | High | Low |
| 2 | Remap accent colors to landing's mint + gold palette | High | Low |
| 3 | Radial gradient glow behind KPI row | High | Very low (1 CSS rule) |
| 4 | Tab bar dark treatment (dark card + mint active border) | Medium | Medium |
| 5 | Headline fluid sizing with `clamp()` on KPI headings | Medium | Low |
| 6 | KPI card hover lift (match landing's dropzone hover) | Low | Very low |
| 7 | Orb mark in navbar (static, brand continuity) | Low | Medium |

> Items 1 + 2 + 3 alone would close ~70% of the visual gap with zero risk to functionality.

---

