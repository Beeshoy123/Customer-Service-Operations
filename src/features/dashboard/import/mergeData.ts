// ⚠️  STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE
// If a dashboard metric shows 0, null, or wrong values after import, the fix
// belongs in importPolicy.ts (FIELD_ALIASES), NOT here. This file handles
// merge strategies and deduplication; it does not contain and must not contain
// column-name or alias knowledge. See docs/suggestions.md §"STANDING RULE" and
// the banner in importPolicy.ts.

import type { ImportWarning, MergeOptions, MergeStrategy, NormalizedRow } from './types';

// Calculation convention: new account-specific merge/calculation styles are additive
// profile-selected options. Existing merge strategies remain active for other accounts
// and must not be replaced or deleted without explicit instruction.

// Merge key = agent (employee ID, else name) + date. Nothing else.
// Supervisor and location are attributes of the record, not part of the key, so a
// file without a Supervisor column still merges with one that has it (Step 2).
const normalizeAgentName = (row: NormalizedRow): string =>
  String(row.agentName ?? row.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeEmployeeId = (row: NormalizedRow): string =>
  String(row.employeeId ?? '').trim().toLowerCase();

// name -> the IDs seen with that name in this batch. A name-only row joins an ID
// only when the name belongs to exactly one ID (never guess between two people).
const buildNameToIds = (rows: NormalizedRow[]): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const id = normalizeEmployeeId(row);
    const name = normalizeAgentName(row);
    if (!id || !name) continue;
    const ids = map.get(name);
    if (ids) ids.add(id);
    else map.set(name, new Set([id]));
  }
  return map;
};

const getRecordKey = (row: NormalizedRow, nameToIds: Map<string, Set<string>>): string => {
  const date = String(row.date ?? '').trim();
  const id = normalizeEmployeeId(row);
  if (id) return `id:${id}|${date}`;

  const name = normalizeAgentName(row);
  const ids = nameToIds.get(name);
  if (ids && ids.size === 1) return `id:${[...ids][0]}|${date}`;
  return `name:${name}|${date}`;
};

const getSourceKey = (row: NormalizedRow): string => {
  const file = String(row.sourceFile ?? '').trim();
  const sheet = String(row.sourceSheet ?? '').trim();
  if (!file && !sheet) return '';
  return `${file.toLowerCase()}::${sheet.toLowerCase()}`;
};

const sumFields = new Set([
  'calls',
  'resolveTotalContacts',
  'resolveTotalContacts2hr',
  'resolveTotalContacts3d',
  'surveys',
  'promoters',
  'detractors',
  'phoneAdds',
  'vhi',
  'handoffsCount',
  'vttSent',
  'vttTransacted',
]);

// These are per-call rate/average fields — when the same agent+date appears in
// multiple source sheets, average them rather than sum.
const averageFields = new Set([
  'aht',
  'vxs',
  'resolve2hr',
  'resolve3d',
  'handoffs',
  'hold',
  'dpc',
  'viewTogether',
  'vtt',
  'netOcc',
  'creditFreq',
]);

const choosePreferredValue = (
  currentValue: string | number | null | undefined,
  newValue: string | number | null | undefined
) => {
  if (currentValue === null || currentValue === undefined || currentValue === '') return newValue;
  if (newValue === null || newValue === undefined || newValue === '') return currentValue;

  const currentIsNumber = typeof currentValue === 'number';
  const newIsNumber = typeof newValue === 'number';

  if (currentIsNumber && newIsNumber) {
    return Math.abs(Number(newValue)) > Math.abs(Number(currentValue)) ? newValue : currentValue;
  }

  return String(newValue).length > String(currentValue).length ? newValue : currentValue;
};

/**
 * Detects duplicate files based on filename and size to prevent accidental duplicate uploads
 * from entering the ingestion pipeline.
 */
export const detectDuplicateFiles = (
  files: File[]
): { uniqueFiles: File[]; duplicateWarnings: ImportWarning[] } => {
  const seenFileKeys = new Set<string>();
  const uniqueFiles: File[] = [];
  const duplicateWarnings: ImportWarning[] = [];

  for (const file of files) {
    const key = `${(file.name || '').trim().toLowerCase()}|${file.size ?? 0}`;
    if (seenFileKeys.has(key)) {
      duplicateWarnings.push({
        fileName: file.name,
        message: `Duplicate file upload detected: "${file.name}". Skipping duplicate file to prevent double-counting metrics.`,
        code: 'DUPLICATE_FILE_UPLOAD',
      });
    } else {
      seenFileKeys.add(key);
      uniqueFiles.push(file);
    }
  }

  return { uniqueFiles, duplicateWarnings };
};

/**
 * Merges a list of rows from the exact same source (same sourceFile + sourceSheet)
 * using last-seen strategy so duplicate rows in a sheet or duplicate uploads do not
 * multiply additive fields.
 */
const dedupeSameSourceRows = (sourceRows: NormalizedRow[]): NormalizedRow => {
  if (sourceRows.length === 1) return { ...sourceRows[0] };

  const allFields = new Set<string>();
  for (const row of sourceRows) {
    for (const field of Object.keys(row)) {
      allFields.add(field);
    }
  }

  const deduped: NormalizedRow = {};
  for (const field of allFields) {
    const definedValues = sourceRows
      .map((r) => r[field])
      .filter((v) => v !== null && v !== undefined && v !== '');

    if (definedValues.length > 0) {
      // Last-seen defined value
      deduped[field] = definedValues[definedValues.length - 1];
    }
  }

  return deduped;
};

// Step 2: the same agent + day + count reported in two files is ONE fact seen twice,
// so counts default to "newer file wins" instead of being added together. Adding is still
// available per account (explicit mergeStrategy) and when same-source rows are allowed
// (duplicateSourceHandling = 'allow'), where several rows per agent + day are meant to add up.
const getFieldStrategy = (
  field: string,
  overrides?: Record<string, MergeStrategy>,
  countsAdd = false
): MergeStrategy | null => {
  if (overrides && overrides[field]) {
    return overrides[field];
  }
  if (sumFields.has(field)) {
    return countsAdd ? 'sum' : 'last-seen';
  }
  if (averageFields.has(field)) {
    return 'average';
  }
  return null;
};

const RATE_DENOMINATORS: Record<string, string[]> = {
  vxs: ['surveys'],
  resolve2hr: ['resolveTotalContacts2hr', 'resolveTotalContacts'],
  resolve3d: ['resolveTotalContacts3d', 'resolveTotalContacts'],
  handoffs: ['calls'],
  aht: ['calls'],
  hold: ['calls'],
  dpc: ['calls'],
  viewTogether: ['calls'],
  vtt: ['calls'],
  netOcc: ['calls'],
  creditFreq: ['calls'],
};

const weightedAverage = (rows: NormalizedRow[], field: string): number | null => {
  const denominators = RATE_DENOMINATORS[field];
  if (!denominators) return null;

  let weightedTotal = 0;
  let denominatorTotal = 0;
  for (const row of rows) {
    const value = Number(row[field]);
    if (!Number.isFinite(value)) continue;

    let denominator = 0;
    for (const denominatorField of denominators) {
      const candidate = Number(row[denominatorField]);
      if (Number.isFinite(candidate) && candidate > 0) {
        denominator = candidate;
        break;
      }
    }

    if (denominator > 0) {
      weightedTotal += value * denominator;
      denominatorTotal += denominator;
    }
  }

  return denominatorTotal > 0 ? weightedTotal / denominatorTotal : null;
};

export const mergeNormalizedRows = (
  rows: NormalizedRow[],
  options: MergeOptions = {}
): NormalizedRow[] => {
  const { mergeStrategy, duplicateSourceHandling = 'dedupe', onWarning } = options;
  const groups = new Map<string, NormalizedRow[]>();
  const nameToIds = buildNameToIds(rows);
  const countsAdd = duplicateSourceHandling === 'allow';
  // field -> number of agent-days where two files gave different values (newer one was used)
  const conflicts = new Map<string, number>();

  for (const row of rows) {
    const key = getRecordKey(row, nameToIds);
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const result: NormalizedRow[] = [];

  for (const groupRows of groups.values()) {
    // Step 1: Same-source duplicate detection and deduplication
    let effectiveRows: NormalizedRow[] = groupRows;

    if (duplicateSourceHandling !== 'allow' && groupRows.length > 1) {
      const sourceMap = new Map<string, NormalizedRow[]>();
      const unsourcedRows: NormalizedRow[] = [];

      for (const row of groupRows) {
        const sKey = getSourceKey(row);
        if (!sKey) {
          unsourcedRows.push(row);
        } else {
          const list = sourceMap.get(sKey);
          if (list) {
            list.push(row);
          } else {
            sourceMap.set(sKey, [row]);
          }
        }
      }

      const dedupedList: NormalizedRow[] = [...unsourcedRows];

      for (const sRows of sourceMap.values()) {
        if (sRows.length > 1) {
          const sample = sRows[0];
          const agentName = String(sample.agentName ?? sample.name ?? 'Unknown');
          const date = String(sample.date ?? 'Unknown');
          const fileName = String(sample.sourceFile ?? 'unknown');
          const sheetName = String(sample.sourceSheet ?? '');
          const sheetSuffix = sheetName ? ` (${sheetName})` : '';

          const warning: ImportWarning = {
            fileName,
            sheetName: sheetName || undefined,
            message: `Duplicate source record detected for agent "${agentName}" on "${date}" in "${fileName}${sheetSuffix}". Deduplicated to prevent double-counting.`,
            code: 'DUPLICATE_SOURCE_RECORD',
          };

          if (onWarning) {
            onWarning(warning);
          }

          dedupedList.push(dedupeSameSourceRows(sRows));
        } else {
          dedupedList.push(sRows[0]);
        }
      }

      effectiveRows = dedupedList;
    }

    if (effectiveRows.length === 1) {
      result.push({ ...effectiveRows[0] });
      continue;
    }

    // Step 2: Merge across distinct sources with per-field strategy
    const allFields = new Set<string>();
    for (const row of effectiveRows) {
      for (const field of Object.keys(row)) {
        allFields.add(field);
      }
    }

    const merged: NormalizedRow = {};

    for (const field of allFields) {
      const values = effectiveRows
        .map((r) => r[field])
        .filter((v) => v !== null && v !== undefined && v !== '');

      if (values.length === 0) {
        continue;
      }

      const strategy = getFieldStrategy(field, mergeStrategy, countsAdd);

      if (
        strategy === 'last-seen' &&
        sumFields.has(field) &&
        !mergeStrategy?.[field] &&
        new Set(values).size > 1
      ) {
        conflicts.set(field, (conflicts.get(field) ?? 0) + 1);
      }

      if (strategy === 'sum') {
        const numValues = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
        if (numValues.length > 0) {
          merged[field] = numValues.reduce((sum, val) => sum + val, 0);
        } else {
          merged[field] = values.reduce((prev, curr) => choosePreferredValue(prev, curr));
        }
      } else if (strategy === 'average') {
        const weighted = options.rateMergeStyle === 'weighted-by-counts'
          ? weightedAverage(effectiveRows, field)
          : null;
        if (weighted !== null) {
          merged[field] = weighted;
          continue;
        }
        const numValues = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
        if (numValues.length > 0) {
          merged[field] = numValues.reduce((sum, val) => sum + val, 0) / numValues.length;
        } else {
          merged[field] = values.reduce((prev, curr) => choosePreferredValue(prev, curr));
        }
      } else if (strategy === 'last-seen') {
        merged[field] = values[values.length - 1];
      } else if (strategy === 'first-seen') {
        merged[field] = values[0];
      } else {
        merged[field] = values.reduce((prev, curr) => choosePreferredValue(prev, curr));
      }
    }

    result.push(merged);
  }

  if (onWarning) {
    for (const [field, agentDays] of conflicts) {
      onWarning({
        fileName: 'multiple files',
        message: `"${field}" differed between files for ${agentDays} agent-days. The newer file's value was used; nothing was added together.`,
        code: 'CONFLICTING_VALUES',
      });
    }
  }

  return result;
};

/**
 * Merges normalized rows and returns both the merged dataset and any warnings
 * produced (such as duplicate source records deduplicated).
 */
export const mergeNormalizedRowsWithDetails = (
  rows: NormalizedRow[],
  options: MergeOptions = {}
): { rows: NormalizedRow[]; warnings: ImportWarning[]; duplicateCount: number } => {
  const warnings: ImportWarning[] = [];
  let duplicateCount = 0;

  const internalOptions: MergeOptions = {
    ...options,
    onWarning: (warning) => {
      warnings.push(warning);
      if (warning.code === 'DUPLICATE_SOURCE_RECORD') duplicateCount += 1;
      if (options.onWarning) {
        options.onWarning(warning);
      }
    },
  };

  const merged = mergeNormalizedRows(rows, internalOptions);
  return { rows: merged, warnings, duplicateCount };
};
