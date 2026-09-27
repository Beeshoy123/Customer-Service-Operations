// @ts-nocheck
// ============================================================================
// Recommendation 3 — Auto-Hide Empty Metric Columns After Import
// ============================================================================
// Pure detection helpers. No React state, no side effects, no import-pipeline
// knowledge — see recommendations.md §"Recommendation 3".
//
// Contract:
//   1. After an import batch is applied, `collectFieldsWithData` scans the
//      normalized rows and returns every row field that carried a real value
//      (null / undefined / '' do not count).
//   2. `computeAutoHiddenVisibleCols` merges that scan into the current
//      visible-column preferences: any currently-VISIBLE metric column whose
//      backing row fields are ALL absent is forced to hidden.
//   3. Already-hidden columns are never re-enabled, manual Settings toggles
//      made after the import are respected (this runs once per import), and
//      non-metric toggles (e.g. `trajectory`) and derived metrics that never
//      appear on rows (e.g. `ncw`, `bonus`) are untouched.
// ============================================================================

/**
 * Maps each toggleable metric column (by `stateKey`, matching COL_DEFINITIONS
 * and the `visibleCols` state keys) to the normalized-row fields that feed it.
 *
 * A column is hidden only when NONE of its source fields appear with a value
 * in the imported rows. Variants matter here:
 *  - `handoffs` renders from `handoffsCount` (raw count) OR `handoffs` (rate)
 *  - `vtt` renders from `viewTogether` / `vttSent` / `vttTransacted` / `vtt`
 *
 * Fields that are computed by helpers.aggregateRecords rather than read off
 * rows (e.g. `ncw` from calls, `bonus`, `calls`) are intentionally absent, so
 * those columns are never auto-hidden.
 */
export const METRIC_COLUMN_SOURCES = {
  vxs: ['vxs'],
  resolve2hr: ['resolve2hr'],
  resolve3d: ['resolve3d'],
  handoffs: ['handoffs', 'handoffsCount'],
  aht: ['aht'],
  hold: ['hold'],
  dpc: ['dpc'],
  vtt: ['viewTogether', 'vttSent', 'vttTransacted', 'vtt'],
  netOcc: ['netOcc'],
  creditFreq: ['creditFreq'],
  phoneAdds: ['phoneAdds'],
  vhi: ['vhi'],
};

/**
 * Collects the set of row fields that have at least one real (non-null,
 * non-undefined, non-empty-string) value across all rows.
 */
export const collectFieldsWithData = (rows) => {
  const fieldsWithData = new Set();
  for (const row of rows || []) {
    if (!row) continue;
    for (const key of Object.keys(row)) {
      const value = row[key];
      if (value !== null && value !== undefined && value !== '') {
        fieldsWithData.add(key);
      }
    }
  }
  return fieldsWithData;
};

/**
 * Returns the next visibleCols state: every visible metric column whose source
 * fields are all absent from the import becomes hidden. Everything else —
 * already-hidden columns, non-metric toggles, derived metrics — is preserved
 * as-is. Returns the original object unchanged (same reference) when nothing
 * needs to hide, so consumers can skip redundant state updates.
 */
export const computeAutoHiddenVisibleCols = (
  visibleCols,
  fieldsWithData,
  columnSources = METRIC_COLUMN_SOURCES,
) => {
  const data = fieldsWithData instanceof Set ? fieldsWithData : new Set();
  let next = visibleCols;
  let changed = false;

  for (const [colKey, sources] of Object.entries(columnSources)) {
    if (next[colKey] !== true) continue;
    const hasData = sources.some((field) => data.has(field));
    if (!hasData) {
      if (!changed) {
        next = { ...visibleCols };
        changed = true;
      }
      next[colKey] = false;
    }
  }

  return next;
};
