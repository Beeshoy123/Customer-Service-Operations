import * as XLSX from 'xlsx';
import type { ImportOptions, SheetTable } from './types';

const MAX_SHEETS_TO_PROCESS = 12;
const MAX_ROWS_PER_SHEET = 3000;
const MAX_COLUMNS_PER_SHEET = 40;
const MAX_TRAILING_BLANK_ROWS = 5;

const isMeaningfulRow = (row: unknown[]) => Array.isArray(row) && row.some((value) => value !== '' && value !== null && value !== undefined);

const normalizeSheetRow = (row: unknown[]): unknown[] => {
  if (!Array.isArray(row)) return [];
  const normalized = row.slice(0, MAX_COLUMNS_PER_SHEET).map((value) => value ?? '');
  return normalized;
};

const convertSheetToRows = (sheet: Record<string, any> | null): unknown[][] => {
  if (!sheet) {
    return [];
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    blankrows: true,
    defval: '',
  }) as unknown[][];

  const meaningfulRows: unknown[][] = [];
  let trailingBlankRows = 0;
  let hasSeenData = false;

  for (const rawRow of rawRows) {
    const normalizedRow = normalizeSheetRow(rawRow);
    const isMeaningful = isMeaningfulRow(normalizedRow);

    if (isMeaningful) {
      meaningfulRows.push(normalizedRow);
      hasSeenData = true;
      trailingBlankRows = 0;
      continue;
    }

    if (!hasSeenData) {
      continue;
    }

    trailingBlankRows += 1;

    if (trailingBlankRows >= MAX_TRAILING_BLANK_ROWS) {
      break;
    }
  }

  return meaningfulRows.slice(0, MAX_ROWS_PER_SHEET);
};

const createAbortError = () => {
  const error = new Error('Import cancelled.');
  (error as Error & { name?: string }).name = 'AbortError';
  return error;
};

export const parseWorkbookSheets = (workbook: any, options: ImportOptions = {}): { sheets: SheetTable[]; skippedSheets: string[]; totalSheets: number } => {
  if (!workbook || typeof workbook.SheetNames === 'undefined') {
    return { sheets: [], skippedSheets: [], totalSheets: 0 };
  }

  const sheetNames = workbook.SheetNames.slice(0, MAX_SHEETS_TO_PROCESS);
  const sheets: SheetTable[] = [];
  const skippedSheets: string[] = [];

  for (let index = 0; index < sheetNames.length; index += 1) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    const sheetName = sheetNames[index];
    const sheet = workbook.Sheets[sheetName];
    const rows = convertSheetToRows(sheet);
    const headerRow = rows[0] ?? [];
    const dataRows = rows.slice(1);

    if (rows.length > 0 && headerRow.length > 0) {
      sheets.push({
        workbookName: workbook.WorkbookName || 'Workbook',
        sheetName,
        index,
        rows: dataRows,
        headerRow,
        rowCount: dataRows.length,
      });
    } else {
      skippedSheets.push(sheetName);
    }

    options.onProgress?.({
      phase: 'loading workbook',
      currentSheet: sheetName,
      currentSheetIndex: index + 1,
      totalSheets: sheetNames.length,
      percent: Math.round(((index + 1) / sheetNames.length) * 100),
      message: `Reading workbook sheets (${index + 1}/${sheetNames.length})`,
    });
  }

  return { sheets, skippedSheets, totalSheets: sheetNames.length };
};

export const convertWorkbookToSheets = async (file: File, options: ImportOptions = {}): Promise<{ sheets: SheetTable[]; skippedSheets: string[]; totalSheets: number }> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  return parseWorkbookSheets(workbook, options);
};
