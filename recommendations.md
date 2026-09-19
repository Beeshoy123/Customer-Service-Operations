# Recommendations — Customer Service Operations Dashboard

## Multi-File & Multi-Sheet Import — Improvement Plan

### Summary of Remaining Work

| Priority | Problem | Effort | Status |
|----------|---------|--------|--------|
| 🟡 Medium | Sheet selector silently drops valid sheets — user gets no feedback | Low | Pending |
| 🟡 Medium | Modal shows flat sheet list with no workbook grouping | Medium | Pending |
| 🟡 Medium | No "apply mapping to all matching sheets" shortcut | Medium | Pending |
| 🟢 Low | Blind averaging across workbooks / duplicate upload detection | Medium | Pending |

---

### Remaining Problems & Implementation Details

#### Problem 4: Sheet selector (`sheetSelector.ts`) is too narrow for multi-account use

`isLikelyDataSheet` filters sheets by checking if headers contain keywords like `agent`, `employee`, `name`, `date`, `calls`, `aht`, `vxs`, `supervisor`. Sheets are silently dropped if none of these are present.

With diverse account files, valid data sheets with headers like `Rep`, `Interaction Date`, `Handle Time` pass zero keywords and get rejected with no user feedback.

**Fix**:
- Lower the signal threshold: a sheet with ≥ 5 non-empty columns and > 5 rows should be retained by default.
- Show a visible UI notice or banner in the preview modal listing which sheets were skipped and why, allowing users to override/include them.
- Integrate detection with `analyzeColumnValues` from the column fingerprinter.

---

#### Problem 5: The modal shows all sheets from all files in one flat list — no workbook grouping

When uploading 3 workbooks with 4 sheets each, the modal renders 12 flat tabs with names like `Sheet1`, `Sheet1`, `Sheet1` without clear workbook attribution. Sheet names are not namespaced by filename.

The `SheetTable` type carries `workbookName`, but the tab UI in `ImportPreviewModal.tsx` only displays `sheet.sheetName`.

**Fix**:
- Group tabs by workbook in the preview modal.
- Show the filename as a section header or badge, with sheets grouped underneath.
- Display both `workbookName` and `sheetName` on each tab.

---

#### Problem 6: Column mapping is configured per-sheet but applied identically

When the modal is open for multiple sheets with the same schema (e.g., weekly files across teams or accounts), the user currently has to configure mappings repeatedly on each sheet.

**Fix**:
- Add an **"Apply to all matching sheets"** button in the modal.
- When a user corrects or verifies a mapping on one sheet, check if any other loaded sheets share matching headers and apply the mapping across all matching sheets.

---

#### Problem 7: `mergeNormalizedRows` averages rate fields blindly across workbooks

`mergeData.ts` treats `aht`, `vxs`, `resolve2hr`, etc., as simple averages when the same agent+date key appears more than once. When merging two workbooks from different scopes (e.g. phone AHT vs chat AHT for the same agent on the same day), the average blends metrics that should remain distinct.

Also, if a user accidentally uploads the same file twice, summed fields (like `calls`) will be doubled.

**Fix**:
- Track `sourceFile` + `sourceSheet` on each row and detect duplicate source uploads.
- Add an optional `mergeStrategy` parameter per field (sum, average, or last-seen for conflicting sources).

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
