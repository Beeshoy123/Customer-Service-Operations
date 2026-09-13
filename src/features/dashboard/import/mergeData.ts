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
  const grouped = new Map<string, NormalizedRow>();

  for (const row of rows) {
    const key = getRecordKey(row);
    const current = grouped.get(key) ?? {};

    for (const [field, value] of Object.entries(row)) {
      if (value === null || value === undefined || value === '') continue;

      const currentValue = current[field];
      if (currentValue === null || currentValue === undefined || currentValue === '') {
        current[field] = value;
        continue;
      }

      if (typeof currentValue === 'number' && typeof value === 'number') {
        if (sumFields.has(field)) {
          current[field] = Number(currentValue) + Number(value);
        } else if (averageFields.has(field)) {
          current[field] = (Number(currentValue) + Number(value)) / 2;
        } else {
          current[field] = choosePreferredValue(currentValue, value) as number;
        }
        continue;
      }

      current[field] = choosePreferredValue(currentValue, value) as string | number | null | undefined;
    }

    grouped.set(key, current);
  }

  return Array.from(grouped.values());
};
