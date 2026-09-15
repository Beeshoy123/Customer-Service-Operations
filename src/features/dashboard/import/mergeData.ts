import type { NormalizedRow } from './types';

const getRecordKey = (row: NormalizedRow): string => {
  const agent = String(row.agentName ?? '').trim();
  const date = String(row.date ?? '').trim();
  const supervisor = String(row.supervisor ?? '').trim();
  const location = String(row.location ?? '').trim();
  const employeeId = String(row.employeeId ?? '').trim();

  return `${agent}|${employeeId || 'noid'}|${date}|${supervisor}|${location}`;
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

const choosePreferredValue = (currentValue: string | number | null | undefined, newValue: string | number | null | undefined) => {
  if (currentValue === null || currentValue === undefined || currentValue === '') return newValue;
  if (newValue === null || newValue === undefined || newValue === '') return currentValue;

  const currentIsNumber = typeof currentValue === 'number';
  const newIsNumber = typeof newValue === 'number';

  if (currentIsNumber && newIsNumber) {
    return Math.abs(Number(newValue)) > Math.abs(Number(currentValue)) ? newValue : currentValue;
  }

  return String(newValue).length > String(currentValue).length ? newValue : currentValue;
};

export const mergeNormalizedRows = (rows: NormalizedRow[]): NormalizedRow[] => {
  const groups = new Map<string, NormalizedRow[]>();

  for (const row of rows) {
    const key = getRecordKey(row);
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const result: NormalizedRow[] = [];

  for (const groupRows of groups.values()) {
    if (groupRows.length === 1) {
      result.push({ ...groupRows[0] });
      continue;
    }

    const allFields = new Set<string>();
    for (const row of groupRows) {
      for (const field of Object.keys(row)) {
        allFields.add(field);
      }
    }

    const merged: NormalizedRow = {};

    for (const field of allFields) {
      const values = groupRows
        .map((r) => r[field])
        .filter((v) => v !== null && v !== undefined && v !== '');

      if (values.length === 0) {
        continue;
      }

      if (sumFields.has(field)) {
        const numValues = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
        if (numValues.length > 0) {
          merged[field] = numValues.reduce((sum, val) => sum + val, 0);
        } else {
          merged[field] = values.reduce((prev, curr) => choosePreferredValue(prev, curr));
        }
      } else if (averageFields.has(field)) {
        const numValues = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
        if (numValues.length > 0) {
          merged[field] = numValues.reduce((sum, val) => sum + val, 0) / numValues.length;
        } else {
          merged[field] = values.reduce((prev, curr) => choosePreferredValue(prev, curr));
        }
      } else {
        merged[field] = values.reduce((prev, curr) => choosePreferredValue(prev, curr));
      }
    }

    result.push(merged);
  }

  return result;
};
