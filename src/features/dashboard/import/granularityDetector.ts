import type {
  ColumnFieldMapping,
  GranularityDetectionResult,
  SheetGranularity,
  SheetHeaderMapping,
  SheetTable,
} from './types';
import { normalizeCellValue, normalizeSheetHeaders } from './schemaNormalizer';

export const DEFAULT_AGGREGATE_THRESHOLD = 1.5;

export type GranularityDetectorOptions = {
  threshold?: number;
};

const resolveColumnIndices = (
  table: SheetTable,
  columnMapping?: ColumnFieldMapping | null,
): { agentColIdx: number; empColIdx: number; dateColIdx: number } => {
  let agentColIdx = -1;
  let empColIdx = -1;
  let dateColIdx = -1;

  const headerRow = (table.headerRow ?? []).map((h) => String(h ?? '').trim());

  const findHeaderIndex = (nameOrIdx: string | number): number => {
    if (typeof nameOrIdx === 'number' && Number.isInteger(nameOrIdx) && nameOrIdx >= 0) {
      return nameOrIdx;
    }
    const str = String(nameOrIdx).trim();
    if (/^\d+$/.test(str)) {
      return parseInt(str, 10);
    }
    return headerRow.findIndex((h) => h.toLowerCase() === str.toLowerCase());
  };

  const assignField = (field: string | null | undefined, colIdx: number) => {
    if (!field || colIdx < 0) return;
    if (field === 'agentName' && agentColIdx === -1) {
      agentColIdx = colIdx;
    } else if (field === 'employeeId' && empColIdx === -1) {
      empColIdx = colIdx;
    } else if (field === 'date' && dateColIdx === -1) {
      dateColIdx = colIdx;
    }
  };

  if (Array.isArray(columnMapping)) {
    for (const item of columnMapping as SheetHeaderMapping[]) {
      if (!item || !item.mappedField) continue;
      const colIdx =
        typeof item.index === 'number' && item.index >= 0
          ? item.index
          : item.original !== undefined
            ? findHeaderIndex(item.original)
            : -1;
      assignField(item.mappedField, colIdx);
    }
  } else if (columnMapping instanceof Map) {
    for (const [key, value] of columnMapping.entries()) {
      if (!key || !value) continue;
      const fieldCandidates = ['agentName', 'employeeId', 'date'];

      if (fieldCandidates.includes(String(value))) {
        const colIdx = findHeaderIndex(key);
        assignField(String(value), colIdx);
      } else if (fieldCandidates.includes(String(key))) {
        const colIdx = findHeaderIndex(value);
        assignField(String(key), colIdx);
      }
    }
  } else if (columnMapping && typeof columnMapping === 'object') {
    for (const [key, value] of Object.entries(columnMapping)) {
      if (!key || value === null || value === undefined) continue;
      const fieldCandidates = ['agentName', 'employeeId', 'date'];

      if (fieldCandidates.includes(String(value))) {
        const colIdx = findHeaderIndex(key);
        assignField(String(value), colIdx);
      } else if (fieldCandidates.includes(String(key))) {
        const colIdx = findHeaderIndex(value as string | number);
        assignField(String(key), colIdx);
      }
    }
  } else {
    // If no mapping passed, derive from header row using normalizeSheetHeaders
    const autoMappings = normalizeSheetHeaders(headerRow);
    for (const item of autoMappings) {
      assignField(item.mappedField, item.index);
    }
  }

  return { agentColIdx, empColIdx, dateColIdx };
};

/**
 * Pure function that determines whether a parsed SheetTable represents daily-aggregate data
 * (approximately 1 row per agent per day) or transaction-level data (multiple rows per agent per day).
 *
 * @param table Already-parsed SheetTable containing headerRow and rows
 * @param columnMapping Optional column-to-field mapping (from schemaNormalizer or dictionary)
 * @param options Optional configuration including threshold (default: 1.5)
 */
export const detectGranularity = (
  table: SheetTable,
  columnMapping?: ColumnFieldMapping | null,
  options: GranularityDetectorOptions = {},
): GranularityDetectionResult => {
  const threshold = options.threshold ?? DEFAULT_AGGREGATE_THRESHOLD;

  if (!table || !table.headerRow) {
    return {
      granularity: 'unknown',
      classification: 'unknown',
      averageRowsPerAgentDate: 0,
      totalGroups: 0,
      totalRows: 0,
    };
  }

  const { agentColIdx, empColIdx, dateColIdx } = resolveColumnIndices(table, columnMapping);

  // If no column maps to agentName or employeeId, or no column maps to date, return 'unknown'.
  if ((empColIdx === -1 && agentColIdx === -1) || dateColIdx === -1) {
    return {
      granularity: 'unknown',
      classification: 'unknown',
      averageRowsPerAgentDate: 0,
      totalGroups: 0,
      totalRows: 0,
    };
  }

  const rows = table.rows ?? [];
  if (rows.length === 0) {
    return {
      granularity: 'unknown',
      classification: 'unknown',
      averageRowsPerAgentDate: 0,
      totalGroups: 0,
      totalRows: 0,
    };
  }

  const groupCounts = new Map<string, number>();
  let totalDataRows = 0;

  for (const row of rows) {
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    const empVal = empColIdx !== -1 ? normalizeCellValue(row[empColIdx], 'employeeId') : null;
    const agentVal = agentColIdx !== -1 ? normalizeCellValue(row[agentColIdx], 'agentName') : null;

    const agentKey =
      empVal !== null && empVal !== undefined && String(empVal).trim() !== ''
        ? String(empVal).trim().toLowerCase()
        : agentVal !== null && agentVal !== undefined && String(agentVal).trim() !== ''
          ? String(agentVal).trim().toLowerCase()
          : null;

    const dateVal = dateColIdx !== -1 ? normalizeCellValue(row[dateColIdx], 'date') : null;
    const dateKey =
      dateVal !== null && dateVal !== undefined && String(dateVal).trim() !== ''
        ? String(dateVal).trim()
        : null;

    if (!agentKey || !dateKey) {
      continue;
    }

    totalDataRows += 1;
    const groupKey = `${agentKey}:::${dateKey}`;
    groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1);
  }

  if (groupCounts.size === 0 || totalDataRows === 0) {
    return {
      granularity: 'unknown',
      classification: 'unknown',
      averageRowsPerAgentDate: 0,
      totalGroups: 0,
      totalRows: 0,
    };
  }

  const rawAverage = totalDataRows / groupCounts.size;
  const averageRowsPerAgentDate = Math.round(rawAverage * 100) / 100;
  const classification: SheetGranularity =
    averageRowsPerAgentDate <= threshold ? 'aggregate' : 'transaction';

  return {
    granularity: classification,
    classification,
    averageRowsPerAgentDate,
    totalGroups: groupCounts.size,
    totalRows: totalDataRows,
  };
};

export const detectSheetGranularity = detectGranularity;

