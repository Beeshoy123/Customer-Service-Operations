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
