import * as XLSX from 'xlsx';
import type { ImportOptions, ImportProgress, SheetTable, WorkbookResult } from './types';

export { type WorkbookResult };

export const DEFAULT_LARGE_SHEET_ROW_THRESHOLD = 50_000;
export const DEFAULT_BATCH_ROW_SIZE = 5_000;
export const DEFAULT_LARGE_FILE_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10 MB
export const MAX_SHEETS_TO_PROCESS = 12;
export const MAX_COLUMNS_PER_SHEET = 40;
export const MAX_TRAILING_BLANK_ROWS = 5;

export type ProgressCallback = (progress: ImportProgress) => void;

export interface SheetBatchOptions {
  batchSize?: number;
  signal?: AbortSignal;
  startRow?: number;
  endRow?: number;
}

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

const isMeaningfulRow = (row: unknown[]) => Array.isArray(row) && row.some((value) => value !== '' && value !== null && value !== undefined);

const normalizeSheetRow = (row: unknown[]): unknown[] => {
  if (!Array.isArray(row)) return [];
  const normalized = row.slice(0, MAX_COLUMNS_PER_SHEET).map((value) => value ?? '');
  return normalized;
};

const createAbortError = () => {
  const error = new Error('Import cancelled.');
  (error as Error & { name?: string }).name = 'AbortError';
  return error;
};

export const getSheetRowCountFromRef = (sheet: Record<string, any> | null | undefined): number => {
  const ref = sheet?.['!ref'];
  if (!ref || typeof ref !== 'string') return 0;
  try {
    const range = XLSX.utils.decode_range(ref);
    if (range.s.r < 0 || range.e.r < 0 || range.s.r > range.e.r) {
      return 0;
    }
    return Math.max(0, range.e.r - range.s.r + 1);
  } catch {
    return 0;
  }
};

export const isSheetOverThreshold = (
  sheet: Record<string, any> | null | undefined,
  options: {
    largeSheetRowThreshold?: number;
    largeFileSizeThreshold?: number;
    fileSize?: number;
  } = {}
): boolean => {
  const rowThreshold = options.largeSheetRowThreshold ?? DEFAULT_LARGE_SHEET_ROW_THRESHOLD;
  const fileThreshold = options.largeFileSizeThreshold ?? DEFAULT_LARGE_FILE_SIZE_THRESHOLD;

  if (typeof options.fileSize === 'number' && options.fileSize >= fileThreshold) {
    return true;
  }

  const rowCount = getSheetRowCountFromRef(sheet);
  return rowCount >= rowThreshold;
};

export async function* iterateSheetRowsBatched(
  sheet: Record<string, any> | null | undefined,
  options: SheetBatchOptions = {}
): AsyncGenerator<unknown[][], void, unknown> {
  const ref = sheet?.['!ref'];
  if (!sheet || !ref || typeof ref !== 'string') {
    return;
  }

  let range: XLSX.Range;
  try {
    range = XLSX.utils.decode_range(ref);
  } catch {
    return;
  }

  const batchSize = options.batchSize ?? DEFAULT_BATCH_ROW_SIZE;
  const startRow = options.startRow !== undefined ? Math.max(range.s.r, options.startRow) : range.s.r;
  const endRow = options.endRow !== undefined ? Math.min(range.e.r, options.endRow) : range.e.r;

  let currentStart = startRow;

  while (currentStart <= endRow) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    const currentEnd = Math.min(currentStart + batchSize - 1, endRow);
    const chunkRange = {
      s: { r: currentStart, c: range.s.c },
      e: { r: currentEnd, c: range.e.c },
    };

    const chunk = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: true,
      defval: '',
      range: chunkRange,
    }) as unknown[][];

    yield chunk;

    // Yield control back to event loop
    await yieldToEventLoop();

    currentStart = currentEnd + 1;
  }
}

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

  return meaningfulRows;
};

const convertSheetToRowsBatched = async (
  sheet: Record<string, any> | null,
  options: {
    batchSize?: number;
    signal?: AbortSignal;
    maxRows?: number;
    onBatchProgress?: (processedRows: number, totalRows: number) => void;
  } = {}
): Promise<unknown[][]> => {
  if (!sheet) {
    return [];
  }

  const meaningfulRows: unknown[][] = [];
  let trailingBlankRows = 0;
  let hasSeenData = false;
  let processedRowCount = 0;

  const totalRowsInSheet = getSheetRowCountFromRef(sheet);

  for await (const chunk of iterateSheetRowsBatched(sheet, options)) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    let hitMaxTrailingBlanks = false;

    for (const rawRow of chunk) {
      processedRowCount += 1;
      const normalizedRow = normalizeSheetRow(rawRow);
      const isMeaningful = isMeaningfulRow(normalizedRow);

      if (isMeaningful) {
        meaningfulRows.push(normalizedRow);
        hasSeenData = true;
        trailingBlankRows = 0;
        if (options.maxRows && meaningfulRows.length >= options.maxRows) {
          hitMaxTrailingBlanks = true;
          break;
        }
        continue;
      }

      if (!hasSeenData) {
        continue;
      }

      trailingBlankRows += 1;
      if (trailingBlankRows >= MAX_TRAILING_BLANK_ROWS) {
        hitMaxTrailingBlanks = true;
        break;
      }
    }

    options.onBatchProgress?.(processedRowCount, totalRowsInSheet);

    if (hitMaxTrailingBlanks) {
      break;
    }
  }

  return meaningfulRows;
};

const resolveOptionsAndProgress = (
  optionsOrProgress?: ImportOptions | ProgressCallback,
  progressCallback?: ProgressCallback
): { options: ImportOptions; onProgress?: ProgressCallback } => {
  let options: ImportOptions = {};
  let onProgress: ProgressCallback | undefined;

  if (typeof optionsOrProgress === 'function') {
    onProgress = optionsOrProgress;
  } else if (optionsOrProgress) {
    options = optionsOrProgress;
    onProgress = options.onProgress;
  }

  if (typeof progressCallback === 'function') {
    const directCb = progressCallback;
    const priorCb = onProgress;
    onProgress = (prog: ImportProgress) => {
      priorCb?.(prog);
      if (directCb !== priorCb) {
        directCb(prog);
      }
    };
  }

  return { options, onProgress };
};

export const parseWorkbookSheets = async (
  workbook: any,
  optionsOrProgress?: ImportOptions | ProgressCallback,
  progressCallback?: ProgressCallback
): Promise<WorkbookResult> => {
  const { options, onProgress } = resolveOptionsAndProgress(optionsOrProgress, progressCallback);

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
    const isOverThreshold = isSheetOverThreshold(sheet, options);
    const rowCountFromRef = getSheetRowCountFromRef(sheet);

    let rows: unknown[][];

    if (isOverThreshold) {
      rows = await convertSheetToRowsBatched(sheet, {
        batchSize: options.batchRowSize ?? DEFAULT_BATCH_ROW_SIZE,
        signal: options.signal,
        maxRows: options.maxRowsPerSheet,
        onBatchProgress: (processedRows, totalRows) => {
          const effectiveTotal = totalRows > 0 ? totalRows : rowCountFromRef;
          const sheetFraction = effectiveTotal > 0 ? Math.min(processedRows / effectiveTotal, 1) : 1;
          const percent = Math.round(((index + sheetFraction) / sheetNames.length) * 100);

          onProgress?.({
            phase: 'loading workbook',
            fileName: options.fileName || workbook.WorkbookName,
            currentSheet: sheetName,
            currentSheetIndex: index + 1,
            totalSheets: sheetNames.length,
            currentRow: processedRows,
            totalRows: effectiveTotal,
            percent: Math.min(percent, 99),
            message: `Processing sheet ${index + 1} of ${sheetNames.length}: ${processedRows.toLocaleString()} / ${effectiveTotal.toLocaleString()} rows`,
          });
        },
      });
    } else {
      rows = convertSheetToRows(sheet);
    }

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

    const finalRowCount = rows.length;
    const reportedTotal = rowCountFromRef > 0 ? rowCountFromRef : finalRowCount;

    onProgress?.({
      phase: 'loading workbook',
      fileName: options.fileName || workbook.WorkbookName,
      currentSheet: sheetName,
      currentSheetIndex: index + 1,
      totalSheets: sheetNames.length,
      currentRow: finalRowCount,
      totalRows: reportedTotal,
      percent: Math.round(((index + 1) / sheetNames.length) * 100),
      message: isOverThreshold
        ? `Processing sheet ${index + 1} of ${sheetNames.length}: ${finalRowCount.toLocaleString()} / ${reportedTotal.toLocaleString()} rows`
        : `Reading workbook sheets (${index + 1}/${sheetNames.length})`,
    });
  }

  return { sheets, skippedSheets, totalSheets: sheetNames.length };
};

export const convertWorkbookToSheets = async (
  file: File,
  optionsOrProgress?: ImportOptions | ProgressCallback,
  progressCallback?: ProgressCallback
): Promise<WorkbookResult> => {
  const { options, onProgress } = resolveOptionsAndProgress(optionsOrProgress, progressCallback);

  const fileSize = typeof file?.size === 'number' ? file.size : undefined;
  const fileThreshold = options.largeFileSizeThreshold ?? DEFAULT_LARGE_FILE_SIZE_THRESHOLD;

  if (fileSize && fileSize >= fileThreshold) {
    onProgress?.({
      phase: 'loading workbook',
      fileName: file.name,
      percent: 2,
      message: `Reading large workbook (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`,
    });
  }

  const arrayBuffer = await file.arrayBuffer();

  if (options.signal?.aborted) {
    throw createAbortError();
  }

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  if (options.signal?.aborted) {
    throw createAbortError();
  }

  return parseWorkbookSheets(
    workbook,
    { ...options, fileSize, fileName: file.name, onProgress },
    onProgress
  );
};
