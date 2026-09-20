# Customer Service Operations Dashboard — Import Recommendations & Plan

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

## Status Overview

| Priority | Problem | Effort | Status |
|----------|---------|--------|--------|
| 🟡 Medium | Sheet selector silently drops valid sheets — user gets no feedback | Low | ✅ Completed |
| 🟡 Medium | Modal shows flat sheet list with no workbook grouping | Medium | ✅ Completed |
| 🟡 Medium | No "apply mapping to all matching sheets" shortcut | Medium | ✅ Completed |
| 🟢 Low | Blind averaging across workbooks / duplicate upload detection | Medium | ✅ Completed |
| 🔴 High | Bug 1: Progress bar resets to 0% after the mapping wizard | Low | ✅ Completed |
| 🔴 High | Bug 2: Progress stalls at 99% for a long time before the dashboard appears | Low | ✅ Completed |
| 🔴 High | Bug 3: HAND-OFFS column always shows 0.00 in the dashboard | Low | ✅ Completed |
| 🔴 High | Bug 4: 2HR column always shows 0.00 in the dashboard | Low | ⏳ Pending |

---

## Resolved Open Problems

### Problem 7: `mergeNormalizedRows` averages rate fields blindly across workbooks — ✅ COMPLETED

`mergeData.ts` treats `aht`, `vxs`, `resolve2hr`, etc., as simple averages when the same agent+date key appears more than once. When merging two workbooks from different scopes (e.g. phone AHT vs chat AHT for the same agent on the same day), the average blends metrics that should remain distinct.

Also, if a user accidentally uploads the same file twice, summed fields (like `calls`) will be doubled.

**Fix**:
- Track `sourceFile` + `sourceSheet` on each row and detect duplicate source uploads.
- Add an optional `mergeStrategy` parameter per field (sum, average, or last-seen for conflicting sources).

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
| `index.ts` | Public barrel export |

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

## Acceptance Criteria

The import system is complete when it can:

- [x] Upload multiple files at once
- [x] Accept CSV and Excel inputs
- [x] Detect and process multiple workbook sheets
- [x] Map fields from different export naming conventions
- [x] Merge data into one dashboard-compatible dataset
- [x] Show validation warnings before final import
- [x] Successfully import realistic team-lead metric exports without manual reformatting
- [x] Detect and reject/warn on duplicate file uploads
- [x] Support per-field merge strategies (sum vs average vs last-seen)

---

## Completed Improvements

- [x] **Recommendation 1: Intelligent Column Mapping** (Layers 1–6 complete):
  - `columnFingerprinter.ts`: Value pattern fingerprinter (dates, durations, percentages, IDs, false-positive blockers)
  - `importPolicy.ts`: Scored candidate matching engine combining headers, value patterns, and memory
  - `mappingMemory.ts`: LocalStorage persistence for user corrections with scope and global fallback
  - `ImportPreviewModal.tsx`: Ranked candidate suggestions dropdown, `🔁 Remembered` badges, pattern tags, bulk-ignore button, and `ManageMemoryModal` dialog
  - `schemaNormalizer.ts`: Value sample forwarding to auto-import paths, batch row normalization
- [x] **Recommendation 2 — Problem 1**: Unified Excel single-file drops and uploads with the preview modal (routes through `convertWorkbookToSheets`, `selectSheets`, and `openImportPreview` with progress and cancellation).
- [x] **Recommendation 2 — Problem 2**: Multi-file batch processing is now concurrent and non-blocking:
  - `importService.ts`: `runImportService` replaced sequential `for` loop with a concurrency-limited pool (`BATCH_CONCURRENCY = 4`) using `Promise.all`. All workbooks in a batch are routed through `convertWorkbookToSheetsViaWorker` via the new `forceWorker` option in `ImportOptions`, keeping the main thread free regardless of file size.
  - `types.ts`: Added `forceWorker?: boolean` to `ImportOptions`.
- [x] **Recommendation 2 — Problem 3**: Live progress reporting and cancel capability for multi-file batch loads:
  - `hooks.ts`: `handleMultipleFiles` rewritten — creates an `AbortController`, exposes a **Cancel** button in the status toast, processes up to 4 files concurrently via `convertWorkbookToSheetsViaWorker`, and emits live `"File N of M — filename — X%"` updates on every progress tick. Per-file errors are isolated and logged without aborting the rest of the batch.
- [x] **Recommendation 2 — Problem 4**: Intelligent Sheet Selector & Skipped Sheets Override Banner:
  - `sheetSelector.ts`: Lowered signal threshold (≥ 5 non-empty columns and > 5 rows retained by default), expanded operational keyword and regex matching (e.g. `Rep`, `Interaction Date`, `Handle Time`), and integrated column pattern fingerprinting via `analyzeColumnValues` from `columnFingerprinter.ts`.
  - Added `evaluateSheet` and `selectSheetsWithDetails` returning `selectedSheets` alongside `skippedSheets` carrying descriptive exclusion reasons and source table references.
  - `ImportPreviewModal.tsx`: Rendered a visible alert banner for skipped sheets displaying reasons and an **"+ Include Sheet"** manual override button that dynamically promotes skipped sheets to active import tabs with full column mapping and granularity confirmation.
  - `hooks.ts` & `App.tsx`: Captured and forwarded skipped sheet metadata into `ImportPreviewModal` across both single-file and concurrent multi-file batch uploads.
  - `sheetSelector.test.ts` & `ImportPreviewModal.test.ts`: Added 16 unit tests covering default shape retention, diverse account headers, column value fingerprinting detection, skipped sheet exclusion reasons, and override inclusion flows.
- [x] **Recommendation 2 — Problem 5**: Workbook Grouping for Multi-File & Multi-Sheet Preview:
  - `ImportPreviewModal.tsx`: Computed `workbookGroups` from loaded sheets. Grouped tab strips by workbook file with visual container cards and `📁 {workbookName}` header badges.
  - Section Headers: Updated Section 1 and Section 2 headers to display `{workbookName} › {sheetName}` for unambiguous sheet attribution.
  - Collision-Free Configs: Namespaced configurations and tab keys using `${sheet.workbookName}::${sheet.sheetName}` so workbooks with identical sheet names (e.g. `Sheet1`) never collide or overwrite each other.
  - `hooks.ts`: Updated `confirmImportPreview` to resolve configs using namespaced keys.
  - `ImportPreviewModal.test.ts`: Added unit tests verifying independent state and namespaced key generation across workbooks with identical sheet names.
- [x] **Recommendation 2 — Problem 6**: "Apply to all matching sheets" column mapping shortcut:
  - `ImportPreviewModal.tsx`: Added `findMatchingSheets` helper — compares sheets' normalized, sorted header arrays to detect same-schema sheets (order-insensitive, case-insensitive).
  - Added `applyMappingsToSheets` helper — propagates `mappedField`, `confidence`, `isLowConfidence`, and `matchType` from source sheet to all matching target sheets by normalized header name lookup.
  - Added `handleApplyMappingsToMatching` handler and `matchingSheetIndices` memo inside the modal component.
  - Added **"⚡ Apply to N matching sheets"** button in the Section 2 column mapping toolbar, visible only when multiple sheets are loaded. Button is disabled (greyed) when no other sheet shares the same header set, and shows the live match count when active.
  - Added a dismissible inline success notice that auto-hides after 4 seconds confirming how many sheets were updated.
  - `ImportPreviewModal.test.ts`: Added 6 unit tests covering match detection, source exclusion, no false positives, order-insensitivity, field propagation by normalized header, and partial-overlap safety.
- [x] **Recommendation 2 — Problem 7**: Per-field merge strategies & duplicate upload detection:
  - `mergeData.ts`: Implemented `detectDuplicateFiles` to identify duplicate uploads by filename and size and emit `DUPLICATE_FILE_UPLOAD` warnings. Implemented same-source deduplication in `mergeNormalizedRows` via `sourceFile` + `sourceSheet` tracking to prevent additive fields like `calls` from doubling upon re-upload. Added per-field `mergeStrategy` parameter (`sum`, `average`, `last-seen`, `first-seen`) allowing conflicting scope metrics (e.g. phone vs chat AHT) to be resolved explicitly without blind averaging. Exported `mergeNormalizedRowsWithDetails` returning rows, warnings, and duplicate count.
  - `importService.ts`: Filtered out duplicate file uploads at the batch ingestion level and wired `options.mergeStrategy` into `mergeNormalizedRows`.
  - `hooks.ts`: Added duplicate file filtering to `handleMultipleFiles` and collected merge warnings in `confirmImportPreview`.
  - `types.ts`: Added `MergeStrategy`, `MergeFieldStrategy`, `MergeOptions`, and updated `ImportOptions`.
  - `mergeData.test.ts`: Added 9 unit tests covering duplicate source deduplication, prevention of double-counting, per-field merge strategies (`last-seen`, `first-seen`, `sum`, `average`), `mergeNormalizedRowsWithDetails`, and `detectDuplicateFiles`.
- [x] **Recommendation 2 — Problem 8**: Zero-Dependency Scoped Styling for Import Preview Modal:
  - `ImportPreviewModal.css`: Created dedicated scoped CSS with solid backdrop overlay (`rgba(11, 15, 25, 0.85)` + backdrop-blur) and `z-index: 9999` to eliminate bleed-through from underlying dashboard elements (`Floor Details`, search bar, navigation tabs).
  - Constrained modal card dialog with `max-height: calc(100vh - 48px)` so header, tabs, and granularity sections remain visible without being clipped off the top of the viewport.
  - Replaced missing Tailwind CSS utility dependencies in `ImportPreviewModal.tsx` and `ManageMemoryModal` with dedicated `.ipm-*` classes.
  - Separated column headers and pattern fingerprint tags into clean, spaced badge elements to eliminate text concatenation (e.g. `RECOVERYKEYcount-Integer`).
  - Loaded styles through `main.tsx` so the browser bundle renders properly while Node.js test execution (`tsx --test`) remains free of CSS loader errors.

- [x] **Bug 1: Progress bar resets to 0% after the mapping wizard**:
  - `hooks.ts`: Updated `continueAutomaticImport` to capture and reuse the cached `pendingAutomaticImport` directly rather than invoking `handleAutomaticImport` and triggering a full file re-parse cycle. Applied user decisions (custom metrics, resolve windows, and customer experience choices) directly onto cached diagnostics and transitioned progress to 100% immediately while applying rows.
- [x] **Bug 2: Progress stalls at 99% for a long time before the dashboard appears**:
  - `hooks.ts`: Added live progress emissions inside `applyBatchImport` at every chunk yield point (`Applying rows... N / Total`) with dynamic percentage calculations. Emitted a bridging `Finalizing dashboard...` status (100%) and yielded right before setting `historicalData` so the UI paints smoothly without freezing at 99%.
- [x] **Bug 3: HAND-OFFS column always shows 0.00 in the dashboard**:
  - `importPolicy.ts`: Added missing transfer and handoff rate column aliases (`transfers %`, `net transfers`, `net transfers %`, `transfer pct`, `net transfer rate`, `net transfer %`, `hand off %`, `hand off pct`, `warm transfer rate`, `warm transfer %`) to `handoffs.aliases`. Moved `'net handoffs'` and `'transfers'` from `handoffsCount` to `handoffs` to resolve map collisions in `ALIAS_LOOKUP_MAP`. Added `'transfer'` and `'transfers'` to `HEADER_TOKEN_HINTS.handoffs`. Added canonical alias prioritization in `findPairedCountField` so explicit aliases in `FIELD_ALIASES` (such as `Transfer Count`) are not hijacked as dynamic paired count fields (`handoffs_Cnt`).
  - `importPolicy.test.ts`: Added unit tests verifying rate variants map to `handoffs` and count variants map to `handoffsCount`.


---

## Outstanding Bugs � Step-by-Step Fix Instructions
---

## ?? STANDING RULE � Mapping Fixes Always Go in `importPolicy.ts` Only

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

> Bugs 1, 2, and 3 were resolved and verified on 2026-09-20.
> Bug 4 remains diagnosed and ready for implementation.

---

### Bug 1 � Progress bar resets to 0% after the mapping wizard - [COMPLETED]

#### What the user sees
The import runs, the orb climbs from 0% to ~99%. Then the mapping wizard appears (the "?" screen asking the user to resolve ambiguous columns). The user answers and clicks **Finish and continue**. The orb immediately drops back to **0%** and runs all the way up again � so the user sees two full progress cycles for one import.

#### Root cause (code trace)

1. `handleAutomaticImport` in `src/features/dashboard/hooks.ts` (~line 610) calls `runImportService` which does the full file parse and emits progress 0 ? 99%.
2. When mapping review items are found, it stores the parsed result in `pendingAutomaticImport` state and sets `uploadStatus = null` (~line 687�691). The wizard appears.
3. `continueAutomaticImport` (~line 731) is called when the user finishes the wizard. It does this:
   ```
   setPendingAutomaticImport(null);
   setPendingAutomaticFiles([]);
   setMappingReview([]);
   await handleAutomaticImport(pendingAutomaticFiles, mappingOverrides, customMetricAnswers);
   ```
   It **throws away the already-parsed result** stored in `pendingAutomaticImport` and calls `handleAutomaticImport` again � which re-runs `runImportService` from scratch on the same files, resetting the orb to 0%.

#### The fix � skip the re-parse, reuse the cached result

Rewrite `continueAutomaticImport` so it takes the cached `pendingAutomaticImport` result directly and skips `handleAutomaticImport` entirely.

**Step-by-step for the AI model:**

1. Open `src/features/dashboard/hooks.ts`.
2. Find `continueAutomaticImport` (~line 731). It currently calls `handleAutomaticImport` with the original files.
3. Replace the body so it:
   - Captures the cached result before clearing: `const cachedResult = pendingAutomaticImport`
   - Clears pending state (`setPendingAutomaticImport(null)`, `setPendingAutomaticFiles([])`, `setMappingReview([])`)
   - Resolves mapping overrides the same way `handleAutomaticImport` already does � call `saveCustomMetricDecisions`, `saveResolveWindowChoices`, and `saveCustomerExperienceChoice` with the cached diagnostics and the user-supplied overrides (these helpers are already imported/used in the same file)
   - Sets `uploadStatus { type: 'info', message: 'Applying imported data...', progress: 100 }` immediately (parsing is already done, so show 100% at once)
   - Calls `await applyBatchImport(null, cachedResult)` directly � this is the same final step `handleAutomaticImport` calls at ~line 703
   - Wraps the whole thing in try/catch exactly as `handleAutomaticImport` does, setting an error toast on failure
4. Update the `useCallback` dependency array: add `applyBatchImport`, `accountName`, `accountProfile`, `setUploadStatus`, and the save-helper functions � **remove `handleAutomaticImport`** since it is no longer called.
5. No changes needed to `ImportLanding.tsx` or `importService.ts` for this fix.

**Expected result:** The orb will not reset. When the wizard is dismissed the orb stays at 100% while rows are being applied, then the dashboard loads.

---

### Bug 2 � Progress stalls at 99% for a long time before the dashboard appears - [COMPLETED]

#### What the user sees
After all files are parsed the orb reaches 99% and **freezes** � sometimes for several seconds � before the dashboard appears. Nothing on screen indicates that work is still happening.

#### Root cause (code trace)

**Cause A � parsing caps at 99% by design.**
In `src/features/dashboard/import/importService.ts`, `emitBatchProgress` (~line 273) hard-caps percent:
```
percent: Math.min(overallPercent, 99)
```
The orb never shows 100% during file parsing. This is intentional but creates a "stuck" appearance.

**Cause B � `applyBatchImport` processes rows with no progress updates.**
After parsing, `handleAutomaticImport` sets `progress: 100` and calls `await applyBatchImport(null, result)` (~line 703). Inside `applyBatchImport` (~line 463) there is a large synchronous loop:
```
for (let index = 0; index < rowsToApply.length; index += 1) {
  if (index > 0 && index % chunkSize === 0) {
    await new Promise((resolve) => setTimeout(resolve, 0)); // yields every 2500 rows
  }
  // ... row processing ...
}
```
This loop can run for several seconds on large files. During this entire time `uploadStatus` is frozen at `progress: 100` with a static message � the orb and subtitle do not update at all.

#### The fix � emit live row-apply progress inside `applyBatchImport`

**Step-by-step for the AI model:**

1. Open `src/features/dashboard/hooks.ts`.
2. Find `applyBatchImport` (~line 463) and locate the row-processing `for` loop (~line 512).
3. Inside the loop, at the yield point (where `await new Promise(...)` already exists), add a `setUploadStatus` call **before** the await so the UI re-renders before the thread yields:
   ```
   const applyPercent = Math.round((index / rowsToApply.length) * 100);
   setUploadStatus({
     type: 'info',
     message: `Applying rows� ${index.toLocaleString()} / ${rowsToApply.length.toLocaleString()}`,
     progress: applyPercent,
   });
   await new Promise((resolve) => setTimeout(resolve, 0));
   ```
4. After the loop ends, before calling `setHistoricalData`, emit one final bridging status:
   ```
   setUploadStatus({ type: 'info', message: 'Finalizing dashboard�', progress: 100 });
   await new Promise((resolve) => setTimeout(resolve, 0)); // let UI paint
   ```
5. Leave the existing success toast at the very end of `applyBatchImport` (~line 606) unchanged � it will replace the "Finalizing" status once `setHasUploadedData(true)` fires and the component re-renders.
6. No changes needed to `importService.ts`, `ImportLanding.tsx`, or any other file for this fix.

**Expected result:** Instead of freezing at 99%, the orb animates through a live "applying rows" counter (0% ? 100%) so the user can see real progress at every stage of the import.

---


---

### Bug 3 � HAND-OFFS column always shows 0.00 in the dashboard - [COMPLETED]

#### What the user sees
The dashboard shows 0.00 for every supervisor in the HAND-OFFS column even after a successful import. C-SAT and other metrics are populated correctly. The data files do contain a transfer/handoff column.

#### Root cause � full code trace

**Step 1 � What the dashboard displays.**
`handoffs` is rendered by the roster table using values from `aggregateRecords` (`src/features/dashboard/helpers.ts` ~line 110):
```
const handoffs = callsWithHandoffs > 0 ? (sumHandoffsCount / callsWithHandoffs) * 100 : null;
```
It returns `null` (shown as `-`) if `callsWithHandoffs` is 0, and it returns a percentage if there is data. The dashboard shows `0.00` � not `-` � which means `callsWithHandoffs > 0` IS true but `sumHandoffsCount` is 0. This tells us the field IS mapping and arriving on rows, but the VALUE being stored is 0.

**Step 2 � What feeds `sumHandoffsCount`.**
In `aggregateRecords` (~line 75�81):
```
if (d.handoffsCount != null) {
  sumHandoffsCount += d.handoffsCount;   // branch A: raw count field
  callsWithHandoffs += c;
} else if (d.handoffs != null) {
  sumHandoffsCount += (d.handoffs / 100) * c;  // branch B: rate field
  callsWithHandoffs += c;
}
```
Branch A is for `handoffsCount` (raw count like "12 transfers"), Branch B is for `handoffs` (rate like "3.5%").
Both are correct � but Branch B divides `handoffs` by 100 assuming it is already in percent form.

**Step 3 � What the import stores.**
In `hooks.ts` `applyBatchImport` (~line 582):
```
handoffs: toNumberOrNull(row.handoffs),
handoffsCount: toNumberOrNull(row.handoffsCount),
```
The `handoffs` field is stored as a raw number, and `normalizeCellValue` in `schemaNormalizer.ts` calls `normalizeImportedValue` which for `kind: 'percent'` fields does:
```
const normalizedPercent = rawPercentNumber <= 1 ? rawPercentNumber * 100 : rawPercentNumber;
```
So if the file contains `0.035` (decimal), it gets stored as `3.5`. If it contains `3.5` (whole-number percent), it stores `3.5` unchanged. This is correct.

**Step 4 � What "transfers" maps to.**
The FIELD_ALIASES for `handoffs` include `'transfer rate'` and `'transfer %'` � meaning a column called exactly "Transfer Rate" or "Transfer %" would map to `handoffs` (the rate field).

The FIELD_ALIASES for `handoffsCount` include `'transfers'` and `'transfer count'` � meaning a column called "Transfers" maps to `handoffsCount` (the integer count field).

**Step 5 � The real problem: "transfers" maps to `handoffsCount`, not `handoffs`.**
If the actual CSV column is named something like `"Transfers"` or `"Transfer Flag"`, it maps to `handoffsCount` (the count field) � **not** to `handoffs` (the rate field). The count is correctly accumulated in `sumHandoffsCount` (~line 76). HOWEVER � the final calculation at line 110 is:
```
const handoffs = callsWithHandoffs > 0 ? (sumHandoffsCount / callsWithHandoffs) * 100 : null;
```
This divides the raw count by total calls and multiplies by 100 to produce a rate � which is mathematically correct **only if** `handoffsCount` is actually the number of transferred calls (e.g. 12 out of 300 calls = 4%).

**The most likely scenario causing 0.00:**
The column in the actual file is named something like `"Transfer Flag"` or `"Transfers"` � it maps to `handoffsCount`. BUT the values in the column are binary flags (0 or 1 per row) that get aggregated (summed) to give a count. If the data coming in is already a per-agent RATE (e.g. `0.035` or `3.5`) stored in a column named `"Transfers"` or `"Net Handoffs"`, then:
- `handoffsCount` gets the rate value (e.g. `3.5`)
- `sumHandoffsCount` accumulates small float values like `3.5 + 3.1 + 2.8...`
- `(sumHandoffsCount / callsWithHandoffs) * 100` produces a tiny near-zero value

This is also consistent with the dashboard showing exactly `0.00` � a very small float rounded to 2 decimal places.

**Secondary scenario � "Net Handoffs" matches `handoffsCount`:**
The alias `'net handoffs'` is listed under `handoffsCount` (line 230 in importPolicy.ts). If the file has a column called `"Net Handoffs %"` it correctly goes to `handoffs` (rate). But `"Net Handoffs"` without the `%` goes to `handoffsCount` (count). If those values are rates expressed as whole numbers (e.g. `3.5`), the count-field path accumulates them and the math produces near-zero.

#### The fix needed � update mapping aliases in `importPolicy.ts`

The next AI model must NOT change any calculation logic. The fix is entirely in the alias lists in `FIELD_ALIASES` in `src/features/dashboard/import/importPolicy.ts`:

**Step-by-step for the AI model:**

1. Open `src/features/dashboard/import/importPolicy.ts`.
2. Find the `handoffs` entry (~line 211) with `kind: 'percent'`.
3. Add additional aliases that real Verizon/telecom exports use for the handoff/transfer RATE column. The current aliases cover `'transfer rate'` and `'transfer %'` but miss common variants. Add:
   - `'transfers %'`
   - `'net transfers'`
   - `'net transfers %'`
   - `'transfer pct'`
   - `'net transfer rate'`
   - `'net transfer %'`
   - `'hand off %'`
   - `'hand off pct'`
   - `'warm transfer rate'`
   - `'warm transfer %'`
4. Find the `handoffsCount` entry (~line 227) with `kind: 'number'`. Review whether `'net handoffs'` (without %) should stay there or be moved. If the file column is named `"Net Handoffs"` but its values are a rate (floats like `3.5`), it should map to `handoffs` instead. Consider moving `'net handoffs'` from `handoffsCount` to `handoffs` aliases.
5. Also check the `HEADER_TOKEN_HINTS` for `handoffs` (~line 456): currently only `['handoff', 'handoffs']`. Add `'transfer'` and `'transfers'` as token hints so the fuzzy scorer treats those words as signals for the `handoffs` field:
   ```
   handoffs: ['handoff', 'handoffs', 'transfer', 'transfers'],
   ```
6. No changes to `helpers.ts`, `hooks.ts`, `schemaNormalizer.ts`, or any dashboard display component.

**Expected result:** Columns named "Transfers", "Net Handoffs", or any transfer-rate variant will map to the correct `handoffs` (rate) or `handoffsCount` (count) field, and the dashboard HAND-OFFS column will show the real percentage instead of 0.00.

---

### Bug 4 � 2HR column always shows 0.00 in the dashboard

#### What the user sees
Every supervisor row shows `0.00` in the 2HR column even after importing a file that contains a 2-hour resolve/repeat metric. 3DR (3-day resolve) appears correct.

#### Root cause � full code trace

**Step 1 � What the dashboard displays.**
`resolve2hr` is rendered using values from `aggregateRecords` (`helpers.ts` ~line 109):
```
const resolve2hr = totalResContacts2hr > 0 ? (1 - totalRepeats2hr / totalResContacts2hr) * 100 : null;
```
It only computes if `totalResContacts2hr > 0`. If showing 0.00 rather than `-`, then `totalResContacts2hr > 0` � meaning data IS arriving but the math produces 0.

**Step 2 � How `totalResContacts2hr` and `totalRepeats2hr` are built** (~line 93�96):
```
const resContacts2hr = d.resolveTotalContacts2hr != null ? d.resolveTotalContacts2hr : resTotal;
if (d.resolve2hr != null) {
  totalResContacts2hr += resContacts2hr;
  totalRepeats2hr += resContacts2hr * ((100 - d.resolve2hr) / 100);
}
```
When `resolveTotalContacts2hr` is absent from the data (common � most exports don't include it), `resContacts2hr` falls back to `resTotal` (total contacts). This is the correct path.

**Step 3 � The percent normalization issue.**
`normalizeImportedValue` for `kind: 'percent'` (~importPolicy.ts line 1195�1200):
```
const rawPercentNumber = Number(stringValue.replace(/[%,$\s]/g, ''));
if (!Number.isNaN(rawPercentNumber)) {
  const normalizedPercent = rawPercentNumber <= 1 ? rawPercentNumber * 100 : rawPercentNumber;
  return normalizedPercent;
}
```
If the CSV cell is `0.035` (3.5% in decimal) ? stored as `3.5` ?
If the CSV cell is `3.5` ? stored as `3.5` ?
If the CSV cell is `100` ? stored as `100` ?

The math in `aggregateRecords`: `resContacts2hr * ((100 - d.resolve2hr) / 100)`
If `d.resolve2hr` is `100` ? repeats = 0 ? final rate = 100% (looks like no repeats � shows 100)
If `d.resolve2hr` is `3.5` ? that means 3.5% resolve rate ? dashboard shows 3.5% (very low)

**Step 4 � The column naming / mapping failure.**
Look at the `resolve2hr` aliases in `FIELD_ALIASES` (~line 128�131):
```
'resolve within 2hr', 'resolve 2hr', '2hr resolution', '2 hour resolve',
'2hr', '2-hour resolve', '2 hour resolve %', 'resolve within 2 hour',
'within 2hr', 'resolution rate', 'repeat rate', 'repeat callback rate',
'callback rate', 'rr', 'repeat callback', 'repeat callback %'
```
**Critical problem:** `'resolution rate'`, `'repeat rate'`, `'repeat callback rate'`, and `'callback rate'` are SHARED between `resolve2hr` (line 129) and `resolve3d` (line 137). Both fields list these generic aliases.

When two fields share the same alias in `ALIAS_LOOKUP_MAP` (built in `schemaNormalizer.ts` ~line 18�25), whichever field is iterated **last** in `Object.entries(FIELD_ALIASES)` wins the alias slot in the map. Since `resolve3d` is defined after `resolve2hr` in the object, `resolve3d` overwrites these shared aliases. A column called `"Repeat Callback Rate"` or `"Resolution Rate"` will map to `resolve3d` � never to `resolve2hr`.

**Step 5 � Additional missing aliases for the 2HR field.**
The `HEADER_TOKEN_HINTS` for `resolve2hr` (~line 446) are:
```
resolve2hr: ['resolve', '2hr', 'twohour', '2hour', '2 hour'],
```
Common real-world column names that get missed:
- `"2-Hour Repeat"` � normalized to `2 hour repeat`, tokens include `2`, `hour`, `repeat` � no match to `resolve2hr` hints since `repeat` is not in the list
- `"2hr Repeat Rate"` � similarly missed
- `"RR 2HR"` or `"2HR RR"` � missed entirely

#### The fix needed � clean up aliases in `importPolicy.ts`

**Step-by-step for the AI model:**

1. Open `src/features/dashboard/import/importPolicy.ts`.
2. Find the `resolve2hr` entry (~line 128). **Remove** the following generic aliases that are shared with `resolve3d` and cause the map collision:
   - `'resolution rate'`
   - `'repeat rate'`
   - `'repeat callback rate'`
   - `'callback rate'`
   - `'rr'`
   - `'repeat callback'`
   - `'repeat callback %'`
   These belong ONLY on `resolve3d` (as the default/longer-window repeat metric) or should not be on either without a disambiguating token.
3. Add new **unambiguous** 2HR-specific aliases to `resolve2hr`:
   - `'2hr repeat'`
   - `'2 hour repeat'`
   - `'2hr repeat rate'`
   - `'2 hour repeat rate'`
   - `'2hr rr'`
   - `'rr 2hr'`
   - `'2hr callback'`
   - `'2hr callback rate'`
   - `'within 2 hours'`
   - `'2 hour resolution rate'`
4. Similarly, find the `resolve3d` entry (~line 136) and **remove** the same shared generic aliases from it too:
   - `'resolution rate'`
   - `'repeat rate'`
   - `'repeat callback rate'`
   - `'callback rate'`
   - `'rr'`
   - `'repeat callback'`
   - `'repeat callback %'`
   Instead add proper 3DR-specific aliases like `'3dr repeat'`, `'3 day repeat rate'`, `'3d rr'`, `'rr 3d'`.
5. Update `HEADER_TOKEN_HINTS` for `resolve2hr` (~line 446) to include `'repeat'` and `'2'` as token hints:
   ```
   resolve2hr: ['resolve', '2hr', 'twohour', '2hour', '2 hour', '2', 'repeat', 'rr'],
   ```
   Be careful: adding `'repeat'` alone could score hits on 3DR columns too. Only add it when combined with the `2hr` context � or trust the alias fixes above to do the disambiguation.
6. No changes to `helpers.ts`, `hooks.ts`, or any dashboard display file.

**Expected result:** Columns unambiguously associated with the 2-hour window (`"2HR"`, `"2HR Repeat"`, `"2-Hour Repeat Rate"`) will map to `resolve2hr` instead of colliding with `resolve3d` aliases. The 2HR column in the dashboard will show the correct percentage instead of 0.00.

---
