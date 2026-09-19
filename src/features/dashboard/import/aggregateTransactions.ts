import type { ImportFieldKind } from './importPolicy';
import { FIELD_ALIASES, findCanonicalField, findPairedCountField } from './importPolicy';
import { normalizeHeaderToField } from './schemaNormalizer';
import type { NormalizedRow } from './types';

// Calculation convention: add new account-specific aggregation styles as separate
// profile-selected branches. Preserve existing aggregation behavior for other accounts;
// do not replace or delete it unless explicitly requested.

export type PassCntPair = {
  prefix: string;
  passField: string;
  cntField: string;
  targetField: string;
};

const PASS_SUFFIX_REGEX = /^(.*?)[_.\-\s]?(?:pass|flag|flg)$/i;
const CNT_SUFFIX_REGEX = /^(.*?)[_.\-\s]?(?:cnt|count|total|tot)$/i;
const PASS_PREFIX_REGEX = /^(?:pass|flag|flg)[_.\-\s]?(.*?)$/i;
const CNT_PREFIX_REGEX = /^(?:cnt|count|total|tot)[_.\-\s]?(.*?)$/i;

/**
 * Discovers pairs of fields that represent pass and count/total metrics (e.g. X_Pass and X_Cnt).
 */
export const findPassCountPairs = (allKeys: Iterable<string>): PassCntPair[] => {
  const keys = Array.from(allKeys);
  const passCandidates: { field: string; prefix: string; canonical?: string }[] = [];
  const cntCandidates: { field: string; prefix: string; canonical?: string }[] = [];

  for (const key of keys) {
    const paired = findPairedCountField(key);
    if (paired) {
      if (paired.side === 'pass') {
        passCandidates.push({ field: key, prefix: paired.canonicalField.toLowerCase(), canonical: paired.canonicalField });
      } else {
        cntCandidates.push({ field: key, prefix: paired.canonicalField.toLowerCase(), canonical: paired.canonicalField });
      }
      continue;
    }

    const sMatch = PASS_SUFFIX_REGEX.exec(key);
    if (sMatch && sMatch[1]) {
      passCandidates.push({ field: key, prefix: sMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '') });
      continue;
    }
    const pMatch = PASS_PREFIX_REGEX.exec(key);
    if (pMatch && pMatch[1]) {
      passCandidates.push({ field: key, prefix: pMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '') });
    }
  }

  for (const key of keys) {
    const paired = findPairedCountField(key);
    if (paired) {
      continue;
    }

    const sMatch = CNT_SUFFIX_REGEX.exec(key);
    if (sMatch && sMatch[1]) {
      cntCandidates.push({ field: key, prefix: sMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '') });
      continue;
    }
    const pMatch = CNT_PREFIX_REGEX.exec(key);
    if (pMatch && pMatch[1]) {
      cntCandidates.push({ field: key, prefix: pMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '') });
    }
  }

  const pairs: PassCntPair[] = [];
  const matchedCntFields = new Set<string>();

  for (const p of passCandidates) {
    const c = cntCandidates.find(
      (item) => item.prefix === p.prefix && item.field !== p.field && !matchedCntFields.has(item.field),
    );
    if (c) {
      matchedCntFields.add(c.field);
      // Determine targetField: check canonical field in FIELD_ALIASES, schemaNormalizer, or raw prefix
      const canonical =
        p.canonical ||
        Object.keys(FIELD_ALIASES).find((f) => f.toLowerCase() === p.prefix) ||
        normalizeHeaderToField(p.prefix) ||
        findCanonicalField(p.prefix) ||
        p.prefix;

      pairs.push({
        prefix: p.prefix,
        passField: p.field,
        cntField: c.field,
        targetField: canonical,
      });
    }
  }

  return pairs;
};

const getFieldKind = (field: string): ImportFieldKind | null => {
  if (FIELD_ALIASES[field]?.kind) {
    return FIELD_ALIASES[field].kind;
  }
  const canonical = normalizeHeaderToField(field) || findCanonicalField(field);
  if (canonical && FIELD_ALIASES[canonical]?.kind) {
    return FIELD_ALIASES[canonical].kind;
  }
  return null;
};

const getMostFrequentNonEmpty = (rows: NormalizedRow[], field: string): string | null => {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const val = row[field];
    if (val !== null && val !== undefined) {
      const str = String(val).trim();
      if (str !== '') {
        counts.set(str, (counts.get(str) ?? 0) + 1);
      }
    }
  }

  if (counts.size === 0) return null;

  let maxCount = -1;
  let topValue: string | null = null;
  for (const [val, count] of counts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      topValue = val;
    }
  }

  return topValue;
};

const computePerCallAverage = (rows: NormalizedRow[], field: string, rowCount: number): number | null => {
  let sum = 0;
  let hasValid = false;

  for (const row of rows) {
    const val = row[field];
    if (val !== null && val !== undefined && val !== '') {
      const num = typeof val === 'number' ? val : Number(String(val).replace(/[$,%\s]/g, ''));
      if (!Number.isNaN(num)) {
        sum += num;
        hasValid = true;
      }
    }
  }

  if (!hasValid || rowCount <= 0) return null;
  return Math.round((sum / rowCount) * 100) / 100;
};

const computeAverageNonNull = (rows: NormalizedRow[], field: string): number | null => {
  let sum = 0;
  let count = 0;

  for (const row of rows) {
    const val = row[field];
    if (val !== null && val !== undefined && val !== '') {
      const num = typeof val === 'number' ? val : Number(String(val).replace(/[$,%\s]/g, ''));
      if (!Number.isNaN(num)) {
        sum += num;
        count += 1;
      }
    }
  }

  if (count === 0) return null;
  return Math.round((sum / count) * 100) / 100;
};

/**
 * Aggregates transaction-level rows (multiple rows per agent per day) into one collapsed row
 * per (agentName or employeeId) + date.
 *
 * Follows FIELD_ALIASES policy kinds:
 * - calls: count of rows in the group (the row itself is the unit)
 * - number fields (e.g. handle time): SUMMED then divided by row count
 * - pass/count pairs (e.g. X_Pass and X_Cnt): sum(pass) / sum(cnt) * 100
 * - text fields (supervisor, oam, location): most frequent non-empty value in the group
 */
export const aggregateTransactions = (rows: NormalizedRow[]): NormalizedRow[] => {
  if (!rows || rows.length === 0) return [];

  // 1. Group rows by (employeeId or agentName) + date
  const groups = new Map<string, NormalizedRow[]>();

  for (const row of rows) {
    if (!row) continue;
    const empId = row.employeeId ? String(row.employeeId).trim() : '';
    const agentName = row.agentName
      ? String(row.agentName).trim()
      : row.name
        ? String(row.name).trim()
        : '';
    const date = row.date ? String(row.date).trim() : '';

    if ((!empId && !agentName) || !date) {
      continue;
    }

    const agentKey = empId ? `id:${empId.toLowerCase()}` : `name:${agentName.toLowerCase()}`;
    const groupKey = `${agentKey}:::${date.toLowerCase()}`;

    let group = groups.get(groupKey);
    if (!group) {
      group = [];
      groups.set(groupKey, group);
    }
    group.push(row);
  }

  // 2. Discover all unique keys across all rows
  const allKeys = new Set<string>();
  for (const row of rows) {
    if (!row) continue;
    for (const key of Object.keys(row)) {
      allKeys.add(key);
    }
  }

  // 3. Detect pass/cnt pairs
  const passCntPairs = findPassCountPairs(allKeys);
  const passFields = new Set(passCntPairs.map((p) => p.passField));
  const cntFields = new Set(passCntPairs.map((p) => p.cntField));
  const pairTargetFields = new Set(passCntPairs.map((p) => p.targetField));

  // 4. Collapse each group into a single NormalizedRow
  const collapsedRows: NormalizedRow[] = [];

  for (const groupRows of groups.values()) {
    if (groupRows.length === 0) continue;

    const rowCount = groupRows.length;
    const collapsedRow: NormalizedRow = {};

    // Preserve metadata from the group
    const firstRowWithSource = groupRows.find((r) => r.sourceFile || r.sourceSheet);
    if (firstRowWithSource?.sourceFile) collapsedRow.sourceFile = firstRowWithSource.sourceFile;
    if (firstRowWithSource?.sourceSheet) collapsedRow.sourceSheet = firstRowWithSource.sourceSheet;

    // A. calls: count of rows in the group
    collapsedRow.calls = rowCount;

    // B. Handle pass/cnt pairs (sum pass, sum cnt, compute percentage)
    for (const pair of passCntPairs) {
      let sumPass = 0;
      let sumCnt = 0;
      let hasPassValues = false;
      let hasCntValues = false;

      for (const row of groupRows) {
        const pVal = row[pair.passField];
        const cVal = row[pair.cntField];

        if (pVal !== null && pVal !== undefined && pVal !== '') {
          const num = Number(pVal);
          if (!Number.isNaN(num)) {
            sumPass += num;
            hasPassValues = true;
          }
        }

        if (cVal !== null && cVal !== undefined && cVal !== '') {
          const num = Number(cVal);
          if (!Number.isNaN(num)) {
            sumCnt += num;
            hasCntValues = true;
          }
        }
      }

      if (hasPassValues) collapsedRow[pair.passField] = sumPass;
      if (hasCntValues) collapsedRow[pair.cntField] = sumCnt;

      if (hasCntValues && sumCnt > 0) {
        collapsedRow[pair.targetField] = Math.round((sumPass / sumCnt) * 10000) / 100;
      } else if (hasPassValues || hasCntValues) {
        collapsedRow[pair.targetField] = null;
      }
    }

    // C. Aggregate other fields across groupRows
    const groupFieldKeys = new Set<string>();
    for (const row of groupRows) {
      for (const k of Object.keys(row)) {
        groupFieldKeys.add(k);
      }
    }

    for (const field of groupFieldKeys) {
      if (field === 'calls') continue;
      if (passFields.has(field) || cntFields.has(field) || pairTargetFields.has(field)) {
        continue;
      }
      if (field === 'sourceFile' || field === 'sourceSheet') {
        continue;
      }

      const kind = getFieldKind(field);

      if (kind === 'text') {
        collapsedRow[field] = getMostFrequentNonEmpty(groupRows, field);
      } else if (kind === 'date') {
        collapsedRow[field] = getMostFrequentNonEmpty(groupRows, field);
      } else if (kind === 'number') {
        if (field === 'resolveTotalContacts') {
          let sum = 0;
          let hasValid = false;
          for (const row of groupRows) {
            const val = row[field];
            if (val !== null && val !== undefined && val !== '') {
              const num = Number(val);
              if (!Number.isNaN(num)) {
                sum += num;
                hasValid = true;
              }
            }
          }
          collapsedRow[field] = hasValid ? sum : null;
        } else {
          collapsedRow[field] = computePerCallAverage(groupRows, field, rowCount);
        }
      } else if (kind === 'percent') {
        collapsedRow[field] = computeAverageNonNull(groupRows, field);
      } else {
        const sampleValues = groupRows
          .map((r) => r[field])
          .filter((v) => v !== null && v !== undefined && v !== '');

        if (sampleValues.length === 0) {
          collapsedRow[field] = null;
        } else if (
          sampleValues.every((v) => typeof v === 'number' || (!Number.isNaN(Number(v)) && typeof v !== 'boolean'))
        ) {
          collapsedRow[field] = computePerCallAverage(groupRows, field, rowCount);
        } else {
          collapsedRow[field] = getMostFrequentNonEmpty(groupRows, field);
        }
      }
    }

    collapsedRows.push(collapsedRow);
  }

  return collapsedRows;
};

export const aggregateTransactionRows = aggregateTransactions;

