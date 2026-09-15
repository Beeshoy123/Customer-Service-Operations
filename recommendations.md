# Recommendations — Customer Service Operations Dashboard

---

## Recommendation 1: Intelligent Column Mapping

> See original plan below this section.

---

## Recommendation 2: Multi-File & Multi-Sheet Import — Audit & Improvement Plan

### What the System Does Today

The pipeline has two separate code paths that behave differently depending on how many files you drop:

| Scenario | Code Path | Behaviour |
|----------|-----------|-----------|
| **1 file dropped (drag-and-drop)** | `handleFileDrop` → `processFile` → either CSV preview or `handleWorkbookImport` | For Excel: **skips the preview modal entirely**, goes straight to auto-import. For CSV: shows the modal. |
| **1 file via file picker** | `handleFileUpload` with `files.length === 1` → same `processFile` | Same split as above |
| **Multiple files via file picker** | `handleFileUpload` multi-file path | Loops through all files sequentially, combines sheets, shows the modal |

---

### The Problems — One by One

#### Problem 1: Excel drops silently bypass the preview modal

When you drag-and-drop **a single Excel file**, the code calls `handleWorkbookImport` which calls `runImportService` → `applyBatchImport` immediately — **no column mapping modal, no granularity check, no user confirmation.** The modal only appears for CSV files and multi-file batches.

This means:
- A workbook with wrong column names gets imported blindly with whatever the token-hint matcher guesses
- You have no chance to fix mappings before data lands in the dashboard
- Behavior is **inconsistent**: same Excel file shows modal if bundled with another file, skips it if dropped alone

**Fix**: Excel single-file drops should go through the same preview path as CSV — load the sheets, open the modal, let the user confirm, then commit.

---

#### Problem 2: Multi-file batch processing is fully sequential and blocking

In `handleFileUpload` (multi-file path), the loop is:
```
for (const file of files) {
  await convertWorkbookToSheets(file)   // ← waits for file 1 to finish
  await parseCsvFileText(file)          // before starting file 2
}
```
Files are processed **one at a time, on the main thread**. If you drop 5 Excel workbooks, they load in series. File 3 doesn't even start reading until Files 1 and 2 are fully parsed.

Also: `convertWorkbookToSheets` here is the **synchronous main-thread path** — it does not use the Web Worker. The worker path (`convertWorkbookToSheetsViaWorker`) is only triggered for single large files via `handleWorkbookImport`. So a batch of three medium-sized workbooks all parse synchronously on the main thread, freezing the UI.

**Fix**: Process files in parallel using `Promise.all` (or a concurrency-limited pool), and route large workbooks in a batch through the worker path.

---

#### Problem 3: No progress reporting during multi-file batch loading

When multiple files are loading, `setUploadStatus` is called once at the start ("Preparing N files...") and then nothing until everything is done. If you drop 4 files and it takes 20 seconds, the user sees a static spinner.

The single-file `handleWorkbookImport` path has rich progress: per-row, per-sheet, percent complete. The multi-file path has zero.

**Fix**: Aggregate per-file progress into a combined progress bar — e.g. "File 2 of 4 — Sheet 3 of 6 — 68%".

---

#### Problem 4: Sheet selector (`sheetSelector.ts`) is too narrow for multi-account use

`isLikelyDataSheet` filters sheets by checking if headers contain keywords like `agent`, `employee`, `name`, `date`, `calls`, `aht`, `vxs`, `supervisor`. Sheets are silently dropped if none of these are present.

With diverse account files this will silently skip perfectly valid data sheets that use different column naming — e.g. a sheet with headers `Rep`, `Interaction Date`, `Handle Time` passes zero keywords and gets rejected. The user never finds out a sheet was dropped. The warning only fires for the auto-recovered workbook case; normal sheet-skipping produces no feedback.

**Fix**: 
- Lower the signal threshold — a sheet with ≥ 5 non-empty columns and > 5 rows should be kept by default (not filtered out silently)
- Show a visible UI notice listing which sheets were skipped and why, so the user can override
- Eventually integrate with the fingerprinter (Recommendation 1) which will be much better at detecting data sheets

---

#### Problem 5: The modal shows all sheets from all files in one flat list — no workbook grouping

When you upload 3 workbooks with 4 sheets each, the modal shows 12 flat tabs with names like `Sheet1`, `Sheet1`, `Sheet1` — no indication which workbook each came from. Sheet names are not namespaced by filename.

The `SheetTable` type already carries `workbookName`, but the tab UI in `ImportPreviewModal.tsx` only renders `sheet.sheetName`. So if two workbooks both have a sheet called "Data", they're indistinguishable.

**Fix**: Group tabs by workbook in the modal. Show the filename as a section header, then its sheets underneath. Each tab should show both `workbookName` and `sheetName`.

---

#### Problem 6: Column mapping is configured per-sheet but applied identically

When the modal is open for multiple sheets, each sheet gets its own column mapping dropdown. However, if Sheet A and Sheet B from two different workbooks have the same structure (same column headers, same account format), the user has to configure mappings **twice** — once per sheet.

There is no "apply this mapping to all sheets with the same headers" shortcut.

**Fix**: Add a **"Apply to all matching sheets"** button on the mapping modal. When a user fixes a mapping on one sheet, check if any other loaded sheets share the same header name, and offer to apply the correction globally.

---

#### Problem 7: `mergeNormalizedRows` averages rate fields blindly across workbooks

`mergeData.ts` treats `aht`, `vxs`, `resolve2hr` etc. as simple averages when the same agent+date key appears more than once. This works fine when merging two sheets from the same data pull. But when merging two workbooks from **different time periods or metric scopes** (e.g. one workbook has phone AHT, another has chat AHT for the same agent on the same day), the average silently blends data that shouldn't be blended.

There is also no duplicate-source tracking — if the user accidentally uploads the same file twice, every value gets averaged with itself (result looks correct, but total `calls` for summed fields will be doubled).

**Fix**:
- Track `sourceFile` + `sourceSheet` on each row and detect when the exact same source appears twice (duplicate upload detection)
- Add an optional `mergeStrategy` parameter per field — eventually let the user choose whether to sum, average, or take last-seen for conflicting sources

---

### Summary: What to Build

| Priority | Problem | Effort |
|----------|---------|--------|
| 🔴 High | Excel single-drop bypasses modal — unify the two paths | Low |
| 🔴 High | Multi-file batch is sequential + main-thread blocking | Medium |
| 🔴 High | No progress feedback during multi-file load | Low |
| 🟡 Medium | Sheet selector silently drops valid sheets — user gets no feedback | Low |
| 🟡 Medium | Modal shows flat sheet list with no workbook grouping | Medium |
| 🟡 Medium | No "apply mapping to all matching sheets" shortcut | Medium |
| 🟢 Low | Blind averaging across workbooks / duplicate upload detection | Medium |

---

## Recommendation 1 (original): Intelligent Column Mapping Design Plan

### The Core Problem

The current mapper has **one signal**: does the column header text match a known alias or token?  
That's it. It knows nothing about what the data actually *looks like*, and it forgets everything after each session.

So when an account sends a file named `IVR_Call_ID` it false-matches to `employeeId` because it contains the token `id`. When someone calls AHT "Avg Talk Time" the system returns nothing. This will always fail at scale across diverse accounts.

---

### What a Truly Smart Mapper Needs

Three independent evidence sources, combined into a **weighted confidence score** per candidate field:

| Signal | What it looks at | Weight |
|--------|-----------------|--------|
| **Header Similarity** | Column name → fuzzy text match | medium |
| **Value Pattern Fingerprint** | Actual data values → what *kind* of data is this? | high |
| **Learned Memory** | Past user corrections stored in localStorage | highest |

When all three agree → auto-map with high confidence (no user prompt needed).  
When they conflict or are weak → show ranked suggestions in the UI and ask the user to pick.  
When the user picks → store it. Never ask again for that header.

---

### Open Questions

> [!IMPORTANT]
> **Do you want corrections to be per-account/per-filename, or global?**
> For example: a header called `Rep_ID` might be `employeeId` for Account A but `agentName` for Account B. If memory is global, one account's corrections could pollute another. Suggested approach: store memory scoped by a **filename prefix or account tag** that you define, with a global fallback. Let me know your preference.

> [!IMPORTANT]
> **Do you want an "auto-import skip the modal" mode for files you've imported before?**
> Once a file layout is 100% learned, the system could silently import without showing the modal at all. Or always show it as a review step. Your call.

---

### Proposed Changes

#### Layer 1 — Value Pattern Fingerprinting (New file: `columnFingerprinter.ts`)

This is the biggest intelligence upgrade. Instead of only looking at the header name, we analyze a sample of the **actual cell values** in each column and produce a `ColumnFingerprint`.

##### What it detects from values:

| Fingerprint | Detection logic | Maps to |
|-------------|----------------|---------|
| `name-like` | Values look like "LASTNAME, FIRSTNAME" or "First Last" | `agentName`, `supervisor`, `oam` |
| `employee-id-like` | 6-8 digit integers, no decimals, no leading zeros | `employeeId` |
| `date-like` | Values parse as dates, or are Excel serials in plausible range | `date` |
| `hour-of-day` | All integers 0–23, low cardinality | → **Unmapped** (irrelevant to dashboard) |
| `percent-decimal` | Values between 0.0–1.0 with decimals | `vxs`, `resolve2hr`, `resolve3d`, `handoffs`, etc. |
| `percent-whole` | Values between 0–100 with few unique values | same candidates |
| `count-integer` | Positive integers with high range | `calls`, `surveys`, `promoters`, etc. |
| `duration-seconds` | Integers in range 10–3600 | `aht`, `hold`, `dpc` |
| `call-id-like` | Alphanumeric with underscores, very high cardinality | → **Unmapped** (system ID, irrelevant) |
| `categorical-low` | < 10 unique string values (e.g. "CX Voice", "CXI") | → **Unmapped** (dept/group label) |
| `free-text` | Long strings, high cardinality | → **Unmapped** |

The fingerprint acts as a **blocker and booster**:
- A column with a `call-id-like` fingerprint **can never match** `employeeId`, even if the name contains "id" → eliminates false positives
- A column with a `percent-decimal` fingerprint **boosts** the score for `vxs`, `resolve2hr`, etc.

##### [NEW] `columnFingerprinter.ts`
Pure function, no side effects. Takes `sampleValues: string[]`, returns a `ColumnFingerprint` enum + stats (cardinality, min, max, nullRate, etc.).

---

#### Layer 2 — Multi-Signal Scoring Engine (Replaces current logic in `importPolicy.ts`)

Replace the current binary match/no-match with a **scored candidate list**.

##### Scoring per candidate field (0–100 points total):

```
headerScore      = fuzzy similarity of normalized header to each alias  (0–30 pts)
fingerprintScore = how compatible is the value fingerprint with this field  (0–50 pts)
memoryScore      = was this exact header previously mapped to this field?  (0–20 pts)
```

**Result per column:** a ranked list of `{ field, score, signals[] }` instead of a single winner.

- Score ≥ 85 → **Auto-map, Exact confidence** (green tick, no user input required)
- Score 50–84 → **Suggest, Low confidence** (amber, show top 3 ranked suggestions in dropdown)
- Score < 50 → **Unmapped** (grey, dropdown is empty but user can pick)

This replaces the current `detectColumnMappingWithConfidence()` function.

##### [MODIFY] `importPolicy.ts`
- Keep `FIELD_ALIASES` and `PAIRED_COUNT_FIELDS` (they become the alias bank for the header scorer)
- Remove the loose `tokenHintsMatch` function (this is what causes false positives today)
- Replace `detectColumnMappingWithConfidence()` with `scoreColumnMapping()` which accepts the fingerprint and memory as inputs

---

#### Layer 3 — Mapping Memory (New file: `mappingMemory.ts`)

A thin `localStorage` wrapper that remembers user corrections.

##### What gets stored:
```json
{
  "version": 1,
  "entries": [
    {
      "normalizedHeader": "rep id",
      "mappedField": "employeeId",
      "count": 4,
      "lastSeen": "2026-09-15"
    },
    {
      "normalizedHeader": "avg talk time",
      "mappedField": "aht",
      "count": 2,
      "lastSeen": "2026-09-10"
    }
  ]
}
```

##### [NEW] `mappingMemory.ts`
- `rememberMapping(header, field)` — called when user manually picks from the dropdown
- `recallMapping(header)` → `{ field, count } | null` — called during scoring
- `forgetMapping(header)` — in case user wants to reset a wrong memory
- `exportMemory()` / `importMemory(json)` — for backup/sharing across team

---

#### Layer 4 — Updated UI in `ImportPreviewModal.tsx`

The modal gets smarter to reflect the new scoring system.

##### Changes:
- **Ranked dropdown suggestions**: For low-confidence columns, the dropdown pre-sorts the options with the top 3 scored candidates at the top (with their score shown), followed by a divider, then the full list. No more guessing which option to pick.
- **"Remembered" badge**: When a mapping comes from memory, show a 🔁 "Remembered from previous import" badge instead of "Exact Match".
- **Bulk-ignore button**: "Ignore all Unmapped columns" — one click to set all unresolved columns to None, instead of manually doing each one.
- **Memory indicator in footer**: "🧠 12 mappings learned so far" with a "Manage Memory" link.

##### [MODIFY] `ImportPreviewModal.tsx`
- Wire `handleColumnMapChange` → call `rememberMapping()` on every user correction
- Pass fingerprint info and score breakdown into each row for display
- Add ranked options to the dropdown
- Add bulk-ignore button

---

#### Layer 5 — Updated Types (Minor additions to `types.ts`)

```typescript
// New confidence level for memory-based matches
export type ColumnMappingConfidence = 'exact' | 'remembered' | 'low' | 'none';

// New match type
export type ColumnMatchType = 'exact_alias' | 'paired_count' | 'scored_high' | 'remembered' | 'token_hint' | 'unmapped';

// Scored candidate — ranked list per column
export type MappingCandidate = {
  field: string;
  score: number;           // 0–100
  headerScore: number;
  fingerprintScore: number;
  memoryScore: number;
};

// Extended DetectedColumnMapping — adds ranked candidates + fingerprint
export type DetectedColumnMapping = {
  // ... existing fields ...
  fingerprint: ColumnFingerprint;   // NEW
  candidates: MappingCandidate[];   // NEW — ranked top suggestions
};
```

---

### Implementation Sequence (Order matters — no circular deps)

```
1. columnFingerprinter.ts   (pure, no deps)
2. mappingMemory.ts         (pure, localStorage only)
3. importPolicy.ts          (uses fingerprinter, uses memory)
4. types.ts                 (add new types)
5. ImportPreviewModal.tsx   (uses all of the above)
6. schemaNormalizer.ts      (use new scorer for auto-import path)
```

---

### What This Does NOT Require
- No external AI/LLM API calls — everything runs client-side, offline, instant
- No backend changes — memory lives in localStorage
- No new npm packages — pure TypeScript logic
