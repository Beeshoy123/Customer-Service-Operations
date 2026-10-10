import type { SheetTable, SkippedSheetInfo } from './types';
import { analyzeColumnValues, type ColumnFingerprint } from './columnFingerprinter';

export type { SkippedSheetInfo };

export interface SheetEvaluation {
  isLikelyData: boolean;
  reason: string;
}

export interface SheetSelectionResult {
  selectedSheets: SheetTable[];
  skippedSheets: SkippedSheetInfo[];
}

const excludedKeywords = [
  'summary',
  'notes',
  'readme',
  'cover',
  'instructions',
  'metadata',
  'lookup',
  'config',
  'settings',
];

const dataKeywords = [
  'agent',
  'employee',
  'rep',
  'representative',
  'name',
  'date',
  'time',
  'timestamp',
  'calls',
  'aht',
  'vxs',
  'csat',
  'resolve',
  'supervisor',
  'oam',
  'manager',
  'handle',
  'duration',
  'interaction',
  'ticket',
  'case',
  'queue',
  'channel',
  'status',
  'fcr',
  'hold',
  'talk',
  'acw',
];

const dataPattern = /\b(agent|employee|rep|representative|name|date|time|timestamp|calls|aht|vxs|csat|resolve|supervisor|manager|handle|duration|interaction|ticket|case|queue|channel|status|fcr|hold|talk|acw)\b/i;

/**
 * Evaluates whether a sheet is likely an operational data sheet,
 * returning a boolean flag and an explanatory reason.
 */
export const evaluateSheet = (sheet: SheetTable): SheetEvaluation => {
  if (!sheet || sheet.rowCount <= 0 || !sheet.rows || sheet.rows.length === 0) {
    return { isLikelyData: false, reason: 'Empty sheet (no data rows)' };
  }

  const name = String(sheet.sheetName ?? '').trim().toLowerCase();
  const matchedExcluded = excludedKeywords.find((keyword) => name.includes(keyword));
  if (matchedExcluded) {
    return {
      isLikelyData: false,
      reason: `Excluded by sheet name (contains "${matchedExcluded}")`,
    };
  }

  const rawHeaders = (sheet.headerRow ?? []) as unknown[];
  const nonEmptyHeaders = rawHeaders
    .map((cell) => String(cell ?? '').trim())
    .filter((cell) => cell !== '');

  if (nonEmptyHeaders.length === 0) {
    return { isLikelyData: false, reason: 'No header row or all header cells are blank' };
  }

  // 1. Lowered signal threshold: A sheet with >= 5 non-empty columns and > 5 rows
  // is retained by default.
  if (nonEmptyHeaders.length >= 5 && sheet.rowCount > 5) {
    return {
      isLikelyData: true,
      reason: `Sufficient tabular data shape (${nonEmptyHeaders.length} columns, ${sheet.rowCount} rows)`,
    };
  }

  const headerText = nonEmptyHeaders.map((c) => c.toLowerCase()).join(' ');

  // 2. Operational header keywords & regex matching (e.g. Rep, Interaction Date, Handle Time)
  const hasDataSignal = dataKeywords.some((keyword) => headerText.includes(keyword));
  const hasShape = dataPattern.test(headerText);
  if (hasDataSignal || hasShape) {
    return {
      isLikelyData: true,
      reason: 'Contains recognized operational header keywords',
    };
  }

  // 3. Column value fingerprinting integration via analyzeColumnValues
  const rows = sheet.rows ?? [];
  const sampleLimit = Math.min(rows.length, 30);
  const maxColsToCheck = Math.min(rawHeaders.length, 15);
  const detectedFingerprints: ColumnFingerprint[] = [];

  for (let colIdx = 0; colIdx < maxColsToCheck; colIdx += 1) {
    const samples: (string | number | null | undefined)[] = [];
    for (let r = 0; r < sampleLimit; r += 1) {
      const val = rows[r]?.[colIdx];
      samples.push(val as string | number | null | undefined);
    }
    const { fingerprint } = analyzeColumnValues(samples);
    if (
      fingerprint === 'date-like' ||
      fingerprint === 'name-like' ||
      fingerprint === 'employee-id-like' ||
      fingerprint === 'duration-seconds' ||
      fingerprint === 'call-id-like' ||
      fingerprint === 'percent-decimal' ||
      fingerprint === 'percent-whole' ||
      fingerprint === 'count-integer'
    ) {
      detectedFingerprints.push(fingerprint);
    }
  }

  const hasStrongPattern = detectedFingerprints.some((fp) =>
    ['date-like', 'name-like', 'employee-id-like', 'duration-seconds', 'call-id-like'].includes(fp)
  );

  if (hasStrongPattern || detectedFingerprints.length >= 2) {
    const uniqueSignals = Array.from(new Set(detectedFingerprints)).join(', ');
    return {
      isLikelyData: true,
      reason: `Recognized operational data patterns (${uniqueSignals}) via column fingerprinter`,
    };
  }

  // If no signals pass, provide a descriptive reason for skipping
  let reason = 'No operational keywords or recognizable data patterns found';
  if (sheet.rowCount <= 5 && nonEmptyHeaders.length < 5) {
    reason = 'Insufficient data size (fewer than 5 columns and 5 or fewer rows)';
  } else if (nonEmptyHeaders.length < 5) {
    reason = `Fewer than 5 columns (${nonEmptyHeaders.length}) and no recognized operational keywords or data patterns`;
  } else if (sheet.rowCount <= 5) {
    reason = `5 or fewer rows (${sheet.rowCount}) and no recognized operational keywords or data patterns`;
  }

  return { isLikelyData: false, reason };
};

/**
 * Checks if a sheet is likely an operational data sheet.
 */
export const isLikelyDataSheet = (sheet: SheetTable): boolean => {
  return evaluateSheet(sheet).isLikelyData;
};

/**
 * Partitions sheets into selected data sheets and skipped sheets with reasons.
 * When selectedNames is provided, explicitly selected sheets are included.
 */
export const selectSheetsWithDetails = (
  sheets: SheetTable[],
  selectedNames?: string[]
): SheetSelectionResult => {
  const selectedSet = selectedNames && selectedNames.length > 0 ? new Set(selectedNames) : null;
  const selectedSheets: SheetTable[] = [];
  const skippedSheets: SkippedSheetInfo[] = [];

  for (const sheet of sheets) {
    if (selectedSet) {
      if (selectedSet.has(sheet.sheetName)) {
        selectedSheets.push(sheet);
      } else {
        const evalResult = evaluateSheet(sheet);
        skippedSheets.push({
          sheetName: sheet.sheetName,
          workbookName: sheet.workbookName,
          reason: evalResult.reason,
          table: sheet,
        });
      }
    } else {
      const evalResult = evaluateSheet(sheet);
      if (evalResult.isLikelyData) {
        selectedSheets.push(sheet);
      } else {
        skippedSheets.push({
          sheetName: sheet.sheetName,
          workbookName: sheet.workbookName,
          reason: evalResult.reason,
          table: sheet,
        });
      }
    }
  }

  return { selectedSheets, skippedSheets };
};

/**
 * Retains only likely data sheets from the provided list.
 */
export const selectSheets = (sheets: SheetTable[], selectedNames?: string[]): SheetTable[] => {
  return selectSheetsWithDetails(sheets, selectedNames).selectedSheets;
};
