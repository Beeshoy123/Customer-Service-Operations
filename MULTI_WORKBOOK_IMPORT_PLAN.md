# Multi-Workbook / Multi-Sheet Import Implementation Plan

## Objective

Upgrade the dashboard from a single-file CSV/text importer to a full mixed-format ingestion pipeline that can:

- read multiple files in one upload
- read CSV, TSV, TXT, XLS, and XLSX files
- read multiple sheets inside each workbook
- normalize inconsistent column names across sources
- merge all data into one unified dataset
- validate and preview before final import
- keep compatibility with the current dashboard logic

This plan does not change the dashboard behavior yet. It prepares the exact architecture and required changes before coding begins.

---

## Extra deliverable: implementation checklist

This section adds the practical execution sequence so the work can be implemented in order without guessing.

### Phase 1: prep and architecture

1. Confirm that current upload flow in src/features/dashboard/hooks.ts handles only one file and one flat table.
2. Add a new import domain folder: src/features/dashboard/import/.
3. Define the canonical output schema for normalized rows.
4. Define file-type support matrix: CSV, TSV, TXT, XLS, XLSX, XLSM.
5. Define import summary response shape: files, sheets, rows, warnings, errors.

### Phase 2: foundation modules

1. Create fileTypeDetector.ts
   - detect extension and file format
   - reject unreadable formats
2. Create csvParser.ts
   - parse delimited text files safely
   - handle quoting and BOM issues
3. Create workbookLoader.ts
   - read Excel files and expose workbook/sheet data
4. Create types.ts
   - define import types and normalized record contract

### Phase 3: user selection and preview

1. Update App.tsx upload input to allow multi-file selection.
2. Add a list of selected files with statuses.
3. Add workbook sheet list for Excel imports.
4. Add a preview panel before final import.
5. Add validation warnings and skip actions.

### Phase 4: normalization and merge logic

1. Create schemaNormalizer.ts
   - match alias names to canonical fields
   - normalize whitespace, punctuation, and casing
2. Create validation.ts
   - clean numbers and dates
   - flag missing values and duplicates
3. Create mergeData.ts
   - merge rows across files and sheets
   - apply duplicate resolution rules
4. Create importService.ts
   - orchestrate the whole pipeline end-to-end

### Phase 5: dashboard integration

1. Replace the monolithic `processFile` logic in hooks.ts with `importService.runImport(files)`.
2. Keep the output contract compatible with the existing `agents`, `supervisors`, `historicalData`, and dashboard state.
3. Preserve localStorage persistence and current filters.
4. Validate that charts, KPI cards, and roster logic still render without changes.

### Phase 6: quality and release

1. Test single CSV import.
2. Test multi-file CSV import.
3. Test XLSX workbook with multiple sheets.
4. Test mixed CSV + Excel batches.
5. Test duplicate records and merge rules.
6. Test invalid files and edge cases.
7. Verify the dashboard still builds successfully.

---

## Current state in this app

The app currently supports one file at a time through the existing upload flow:

- App upload UI: src/App.tsx
- Import handling: src/features/dashboard/hooks.ts
- Parsing and metric logic: src/features/dashboard/helpers.ts
- Dashboard config: src/features/dashboard/config.ts

The current flow reads a single text file and expects one flat dataset table. It is not designed for:

- workbook-level import
- multi-sheet parsing
- mixed file batches
- merging multiple sheets or workbooks
- column alias normalization across different exports

---

## Target state

The app should behave like a unified data ingestion pipeline:

1. user selects many files
2. system detects file type for each file
3. Excel files expose all workbook sheets
4. system allows sheet selection or automatic inclusion
5. CSV/text files are parsed row-by-row
6. columns are mapped to canonical dashboard names
7. data is merged into a single normalized master dataset
8. preview shows validation issues and duplicate conflicts
9. final dataset is saved and loaded by the dashboard

---

## High-level architecture

Create a dedicated import layer separate from dashboard metrics logic.

New folder structure:

src/
  features/
    dashboard/
      import/
        fileTypeDetector.ts
        csvParser.ts
        workbookLoader.ts
        sheetSelector.ts
        schemaNormalizer.ts
        mergeData.ts
        validation.ts
        importService.ts
        types.ts

This import layer sits in front of the existing dashboard logic and outputs the same kind of normalized records the current dashboard already expects.

---

## Required file-level changes

### File-by-file change map

### 1) src/App.tsx

Change the upload UI from “single file” to “batch upload”.

Required changes:

- replace single-file input with multi-file input
- support drag-and-drop for multiple files
- show list of imported files
- show workbook sheet selection area
- show import preview panel before final commit
- show validation summary and warnings
- keep the existing dashboard area and charts untouched once data is ready

UI requirements:

- file queue with file name + file type + status
- sheet picker for Excel tabs
- import summary panel
- validation warning list
- button states: select, preview, import, cancel

Notes:

- keep the current dashboard UI structure intact
- add import orchestration flow without altering report rendering behavior

### 2) src/features/dashboard/hooks.ts

Exact responsibilities:

- keep `useDashboardData` state model
- replace raw upload parsing with import orchestration
- call `importService.runImport` or equivalent
- convert normalized rows into the existing dashboard record format
- preserve current timeframe and selection logic
- maintain `uploadStatus` messaging for import success/failure

### 3) src/features/dashboard/helpers.ts

This file should become the orchestration layer for import, not a raw parser.

Required refactor:

- extract current `processFile` logic into import service calls
- handle multiple files sequentially or in a batch
- call `importService.runImport(files)`
- update local state with final merged dataset
- preserve localStorage persistence behavior
- keep existing state fields: agents, supervisors, historicalData, selectedTimeframe, etc.

Important rule:

- do not rewrite the dashboard metrics engine yet
- keep output shape compatible with the existing app contract

### 3) src/features/dashboard/helpers.ts

This file should be kept mostly intact, but its raw parsing responsibility should be reduced.

Expected changes:

- remove or isolate CSV parsing logic that is currently embedded in the upload flow
- keep metric aggregation, trend logic, and formatting functions
- treat this as the downstream calculation layer, not the data ingestion layer

This reduces long-term maintenance issues and keeps analytics logic separate from import logic.

### 4) src/features/dashboard/config.ts

Add import metadata and alias table here for consistency:

- canonical names mapping
- accepted aliases per field
- date parsing patterns
- numeric cleaning patterns
- field priority ranking for ambiguous matches

### 5) new import folder modules

Create the modules below and wire them together.

---

## Import pipeline design

May need an import schema map extension.

New additions:

- canonical field names
- alias mappings for common agent metric labels
- accepted synonyms for each dashboard metric
- date-format patterns
- numeric value cleaners

Example structure:

- canonicalMetricFieldMap
- acceptedAliases.name
- acceptedAliases.supervisor
- acceptedAliases.date
- acceptedAliases.calls
- acceptedAliases.aht
- acceptedAliases.vxs
- acceptedAliases.resolve3d

### 5) new import folder modules

Create the modules below and wire them together.

---

## Import pipeline design

---

## Step-by-step implementation details

### Step A: File discovery

Input:

- selected file list from uploader

Output:

- file records with name, extension, type, status

Example fields:

- fileName
- fileType
- extension
- size
- isSupported
- sheets[] (for Excel files)

---

### Step B: File type detection

Implementation detail:

- use file extension as the first discriminator
- fallback to content sniffing for TXT-like files
- reject unsupported types with a clear message

### Step C: Workbook and sheet extraction

Module: fileTypeDetector.ts

Responsibilities:

- detect CSV, TSV, TXT, XLS, XLSX, XLSM
- detect delimiter for text files
- detect if file is empty or unreadable
- return structured metadata

Rules:

- .csv, .txt, .tsv → text file
- .xls, .xlsx, .xlsm → Excel workbook
- unknown type → mark invalid

---

### Step C: Workbook and sheet extraction

Module: workbookLoader.ts

Responsibilities:

- read Excel workbook
- enumerate all sheets
- convert each sheet into rows
- preserve sheet names and metadata
- detect blank sheets

Output shape:

- workbookName
- sheetName
- headers
- rows
- rowCount
- sourceMetadata

This is where multi-sheet support is implemented.

---

### Step D: Text parsing

Implementation detail:

- read to UTF-8 and strip BOM
- detect tab, comma, semicolon delimiters
- parse CSV safely with quoted values
- do not assume only two columns or one fixed structure

### Step E: Sheet and column selection

Module: csvParser.ts

Responsibilities:

- parse commas, tabs, semicolons, or custom delimiters
- preserve quoted values correctly
- return clean two-dimensional row data
- detect header row

Important:

- this should replace the current ad hoc `parseCSVLine` usage from the upload flow
- the parser should be reusable for both CSV and TSV slices

---

### Step E: Sheet and column selection

Module: sheetSelector.ts

Responsibilities:

- let user pick which sheets to import
- allow “all sheets” or “selected sheets” mode
- skip blank or obviously non-data tabs
- display sheet summary to user

Example decisions:

- sheet names like “Summary”, “Notes”, “README” should be flagged as non-data
- actual metric sheets should be included

---

### Step F: Schema normalization

Implementation detail:

- normalize header strings: lowercase, trim, remove punctuation
- compare against canonical alias list
- if a sheet contains multiple unrelated datasets, split or reject it
- record a confidence score for each mapping

### Step G: Row-level validation and cleaning

Module: schemaNormalizer.ts

Responsibilities:

- map all incoming column names to canonical fields
- normalize casing, spacing, punctuation
- match synonyms and close variants
- store mapping confidence

Canonical fields should match the dashboard’s expected data model.

Example canonical field set:

- agentName
- supervisor
- oam
- employeeId
- date
- location
- calls
- aht
- resolve2hr
- resolve3d
- vxs
- satisfaction
- handoffs
- transferRate
- sourceFile
- sourceSheet

Alias examples:

- `Agent Name`, `Employee Name`, `Name`, `Agent` -> `agentName`
- `Supervisor`, `Manager`, `Team Lead` -> `supervisor`
- `Date`, `Work Date`, `Report Date` -> `date`
- `Calls`, `Call Volume`, `Total Calls` -> `calls`

This is the most critical step for supporting different workbooks from different teams.

---

### Step G: Row-level validation and cleaning

Module: validation.ts

Responsibilities:

- clean numeric values: commas, currencies, percent symbols
- fix date format issues
- flag missing required values
- identify rows with incomplete data
- detect invalid duplicates
- report warnings without failing the whole import

Examples:

- “$1,234.56” -> 1234.56
- “78%” -> 78
- “01/02/2025” -> normalized date object/value
- blank name row -> skip with warning

---

### Step H: Merge and dedupe

Implementation detail:

- merge by agent/date when rows describe the same record
- sum additive fields like calls and handled contacts
- prefer non-empty values for fixed properties like supervisor or location
- keep `sourceFile` and `sourceSheet` as metadata for auditability

### Step I: Final import orchestration

Module: mergeData.ts

Responsibilities:

- combine rows across workbooks and sheets
- deduplicate entries by agent + date + metric context
- preserve source metadata
- merge additive metrics correctly
- create a master dataset for the dashboard

Merge logic should not just append rows blindly.

Rules:

- if same record is duplicated across workbooks, choose rule-based merging
- if values are additive metrics, sum them
- if values are single-value metrics, prefer the non-empty / most recent / highest-confidence version
- preserve all source traceability fields

---

### Step I: Final import orchestration

Module: importService.ts

Responsibilities:

- orchestrate file detection, parsing, validation, normalization, and merge
- output final normalized master dataset
- return summary and errors
- return import preview for confirmation
- send final result to dashboard state

Pseudo-flow:

1. load files
2. detect file types
3. parse each file
4. resolve workbook sheets
5. normalize columns
6. validate rows
7. merge rows
8. return final dataset summary
9. commit to app state

---

## Data flow summary

Detailed flow:

1. user uploads files
2. each file is checked for type
3. text files are parsed into row arrays
4. Excel files are expanded into sheet rows
5. sheet selection filters out blank/irrelevant tabs
6. column names are normalized to canonical fields
7. each row is validated and cleaned
8. records are merged and deduplicated
9. final dataset arrives at existing dashboard logic
10. dashboard renders updated metrics without needing a redesign

---

## Implementation risk log

1. Sheet names may differ across workbooks; need alias-based handling.
2. Some files may contain summary tabs that should not be imported.
3. Excel date values may be numeric serials and not readable text.
4. CSV parsing can fail if quoted values include delimiters.
5. Duplicate agent/date rows may appear across files and must be merged carefully.
6. Unmapped column names could silently produce bad data if not validated.

This list should be used as the validation checklist during each phase.

---

## Data flow summary

Raw external file
  -> detect type
  -> parse rows
  -> select relevant sheets
  -> normalize columns
  -> clean values
  -> merge/dedupe
  -> final master dataset
  -> existing dashboard metrics engine

This design keeps the dashboard logic stable while upgrading ingestion.

---

## Required user-facing flow

### Import UX flow

1. Click upload
2. Select multiple files
3. app detects file types
4. Excel files show discovered sheets
5. user reviews detected sheets and confirms selection
6. system auto-maps columns
7. preview appears with sample rows
8. warnings show missing / invalid / duplicate records
9. user confirms import
10. dashboard refreshes with merged dataset

This should feel like a clean data import wizard rather than a raw CSV drop box.

---

## Error handling requirements

The new import flow must be resilient.

Handle these clearly:

- unsupported file type
- empty workbook
- empty sheet
- no matching headers
- no required columns found
- corrupted Excel file
- mismatched delimiters
- duplicate identifiers
- date parsing failures
- inconsistent numeric values
- extremely large files

Each error should show:

- file name
- issue type
- row or sheet number where it occurs
- suggested action

---

## Validation and quality gates

Before final implementation, validate all of the following with sample files:

### CSV / TXT scenarios

- standard CSV with header row
- CSV with extra whitespace
- CSV with tabs
- semicolon-delimited export
- quoted values containing commas

### Excel workbook scenarios

- single-sheet workbook
- multi-sheet workbook
- workbook with hidden irrelevant tabs
- workbook with summary tabs
- workbook with blank tabs
- workbook with formulas not evaluated
- workbook with date columns stored as Excel serial dates

### Mixed import scenarios

- CSV + XLSX in same batch
- different workbooks with same columns but different naming
- different teams using different names for same metrics
- duplicate agent/date records across files
- out-of-order dates and missing values

---

## Acceptance criteria

The import system is complete when it can:

- upload multiple files at once
- accept CSV and Excel inputs
- detect and process multiple workbook sheets
- map fields from different export naming conventions
- merge data into one dashboard-compatible dataset
- show validation warnings before final import
- successfully import realistic team-lead metric exports without manual Excel reformatting

---

## Recommended MVP scope

To keep release risk low, build the first version around the following:

1. multi-file upload
2. CSV + XLSX support
3. multi-sheet workbook handling
4. automatic field alias mapping
5. duplicate and validation checks
6. import preview
7. final unified dataset merge

Skip extra complexity for first release:

- custom mapping UI for every field
- complex AI-based schema inference
- file folder drag-and-drop
- custom merge conflict editing
- multi-dataset versioning

Those can be added after the importer is stable.

---

## Recommended implementation sequence

### Phase 1: importer foundation

- add batch upload UI
- add file type detection
- add CSV parser
- add Excel workbook loader
- add workbook sheet enumeration

### Phase 2: normalizer and validation

- add schema alias matching
- add numeric/date normalization
- add validation warnings and row cleanup
- add preview view

### Phase 3: merge and integration

- add merge/dedupe engine
- integrate with dashboard state
- verify output shape matches current data expectations
- preserve localStorage and persistence behavior

### Phase 4: polish and edge cases

- public warnings and invalid row summaries
- duplicate handling rules
- large file support checks
- error reporting user experience

---

## Risk areas to watch

1. workbook sheet naming inconsistency
2. different delimiter standards across CSV exports
3. column alias mismatches between data sources
4. duplicate records across multiple files
5. numeric values stored with percent, dollar signs, or comma separators
6. hidden or summary tabs being imported accidentally
7. invalid date values in Excel exports
8. dashboard expecting a specific schema shape

These should all be handled by the import pipeline before the data reaches the dashboard.

---

## Final recommendation

This app should be upgraded from a single-file CSV parser into a proper data ingestion system.

The important architectural principle is:

- keep the dashboard analytics logic as-is
- replace the importer with a stronger normalization and merge pipeline

That gives the app the ability to ingest mixed-format, multi-workbook, multi-sheet operational data without destabilizing the reports and KPI calculations.

---

## Summary of exact changes required

- Add multi-file upload support in src/App.tsx
- Refactor file processing flow in src/features/dashboard/hooks.ts
- Extract raw import logic into new modules under src/features/dashboard/import/
- Expand schema mapping in src/features/dashboard/config.ts
- Keep metric calculations in src/features/dashboard/helpers.ts
- Add preview, validation, and merge logic before final dataset commit
- Preserve the existing dashboard rendering logic

This is the cleanest and lowest-risk path to make the tool capable of handling all the real-world data sources your team-lead workflow throws at it.
