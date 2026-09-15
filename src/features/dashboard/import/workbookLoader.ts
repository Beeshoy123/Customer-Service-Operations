import * as RawXLSX from 'xlsx';
import type { ImportOptions, ImportProgress, SheetTable, WorkbookResult } from './types';
import type { WorkerInMessage, WorkerOutMessage } from './workbookWorker';

const resolveXlsx = (moduleRef: any): typeof RawXLSX => {
  return moduleRef.read ? moduleRef : (moduleRef.default ?? moduleRef);
};
const XLSX = resolveXlsx(RawXLSX);

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

  let range: RawXLSX.Range;
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

export const parseWorkbookBuffer = async (
  arrayBuffer: ArrayBuffer,
  optionsOrProgress?: ImportOptions | ProgressCallback,
  progressCallback?: ProgressCallback
): Promise<WorkbookResult> => {
  const { options, onProgress } = resolveOptionsAndProgress(optionsOrProgress, progressCallback);

  const fileSize = options.fileSize ?? arrayBuffer.byteLength;
  const fileThreshold = options.largeFileSizeThreshold ?? DEFAULT_LARGE_FILE_SIZE_THRESHOLD;

  if (fileSize >= fileThreshold) {
    onProgress?.({
      phase: 'loading workbook',
      fileName: options.fileName,
      percent: 2,
      message: `Reading large workbook (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`,
    });
    // Yield to the event loop so progress event can be flushed before synchronous XLSX.read
    await yieldToEventLoop();
  }

  if (options.signal?.aborted) {
    throw createAbortError();
  }

  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  if (options.signal?.aborted) {
    throw createAbortError();
  }

  return parseWorkbookSheets(
    workbook,
    { ...options, fileSize, fileName: options.fileName, onProgress },
    onProgress
  );
};

export const convertWorkbookToSheets = async (
  file: File,
  optionsOrProgress?: ImportOptions | ProgressCallback,
  progressCallback?: ProgressCallback
): Promise<WorkbookResult> => {
  const { options, onProgress } = resolveOptionsAndProgress(optionsOrProgress, progressCallback);
  const fileSize = typeof file?.size === 'number' ? file.size : undefined;

  const arrayBuffer = await file.arrayBuffer();

  return parseWorkbookBuffer(
    arrayBuffer,
    { ...options, fileSize, fileName: file.name, onProgress },
    onProgress
  );
};

export const convertWorkbookToSheetsViaWorker = async (
  file: File,
  optionsOrProgress?: ImportOptions | ProgressCallback,
  progressCallback?: ProgressCallback
): Promise<WorkbookResult> => {
  const { options, onProgress } = resolveOptionsAndProgress(optionsOrProgress, progressCallback);

  console.log('[DEBUG 3a - convertWorkbookToSheetsViaWorker] Entered. typeof Worker:', typeof Worker, 'fileSize:', file?.size);
  if (typeof Worker === 'undefined') {
    console.warn('[DEBUG 3a-WARN] Worker is undefined in this environment! Falling back to convertWorkbookToSheets.');
    return convertWorkbookToSheets(file, options, onProgress);
  }

  const fileSize = typeof file?.size === 'number' ? file.size : undefined;
  const fileThreshold = options.largeFileSizeThreshold ?? DEFAULT_LARGE_FILE_SIZE_THRESHOLD;

  if (fileSize && fileSize >= fileThreshold) {
    onProgress?.({
      phase: 'loading workbook',
      fileName: file.name,
      percent: 1,
      message: `Reading large workbook (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`,
    });
  }

  if (options.signal?.aborted) {
    throw createAbortError();
  }

  console.log('[DEBUG 3b - convertWorkbookToSheetsViaWorker] Calling await file.arrayBuffer()...');
  const bufferStartTime = performance.now();
  const arrayBuffer = await file.arrayBuffer();
  const bufferDuration = (performance.now() - bufferStartTime).toFixed(1);
  console.log(`[DEBUG 3c - convertWorkbookToSheetsViaWorker] file.arrayBuffer() resolved in ${bufferDuration}ms! byteLength: ${arrayBuffer.byteLength}`);

  if (options.signal?.aborted) {
    throw createAbortError();
  }

  return new Promise<WorkbookResult>((resolve, reject) => {
    let worker: Worker | null = null;
    let isSettled = false;
    let isCancelled = false;

    const cleanup = () => {
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };

    const onAbort = () => {
      if (isSettled || isCancelled) return;
      isCancelled = true;
      isSettled = true;
      if (worker) {
        try {
          worker.postMessage({ type: 'cancel' } as WorkerInMessage);
        } catch {
          // ignore
        }
      }
      cleanup();
      reject(createAbortError());
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      console.log('[DEBUG 3d - convertWorkbookToSheetsViaWorker] Right before new Worker(...)');
      worker = new Worker(new URL('./workbookWorker.ts', import.meta.url), {
        type: 'module',
      });
      console.log('[DEBUG 3e - convertWorkbookToSheetsViaWorker] Worker instance created successfully!');
    } catch (err) {
      console.error('[DEBUG 3-CATCH] Worker creation threw an exception! Falling back to synchronous parseWorkbookBuffer on MAIN THREAD:', err);
      cleanup();
      return parseWorkbookBuffer(
        arrayBuffer,
        { ...options, fileSize, fileName: file.name, onProgress },
        onProgress
      ).then(resolve, reject);
    }

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      console.log('[DEBUG 3f - Main thread received worker onmessage]:', event.data?.type);
      if (isCancelled || isSettled) {
        return;
      }

      const data = event.data;
      if (!data) return;

      if (data.type === 'progress') {
        if (!isCancelled && !isSettled) {
          onProgress?.(data.progress);
        }
      } else if (data.type === 'success') {
        if (!isCancelled && !isSettled) {
          isSettled = true;
          cleanup();
          console.log('[DEBUG 3f-SUCCESS] Worker finished parsing successfully! Resolving promise.');
          resolve(data.result);
        }
      } else if (data.type === 'error') {
        if (!isCancelled && !isSettled) {
          isSettled = true;
          cleanup();
          console.error('[DEBUG 3f-ERROR] Worker returned error message:', data.error);
          const err = new Error(data.error || 'Workbook worker failed.');
          if (data.name) {
            err.name = data.name;
          }
          reject(err);
        }
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error('[DEBUG 3g - Main thread worker.onerror fired]:', event.message, event);
      if (isCancelled || isSettled) {
        return;
      }
      isSettled = true;
      cleanup();
      reject(new Error(event.message || 'Worker error occurred during workbook parsing.'));
    };

    const transferableOptions: Omit<ImportOptions, 'signal' | 'onProgress'> = {
      largeSheetRowThreshold: options.largeSheetRowThreshold,
      batchRowSize: options.batchRowSize,
      largeFileSizeThreshold: options.largeFileSizeThreshold,
      maxRowsPerSheet: options.maxRowsPerSheet,
      fileSize,
      fileName: file.name,
    };

    const parseMessage: WorkerInMessage = {
      type: 'parse',
      arrayBuffer,
      options: transferableOptions,
    };

    console.log('[DEBUG 3h - convertWorkbookToSheetsViaWorker] Calling worker.postMessage with transferable arrayBuffer...');
    worker.postMessage(parseMessage, [arrayBuffer]);
    console.log('[DEBUG 3i - convertWorkbookToSheetsViaWorker] worker.postMessage returned. Main thread is free.');
  });
};
