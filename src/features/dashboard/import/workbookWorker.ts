import { parseWorkbookBuffer } from './workbookLoader';
import { selectSheets } from './sheetSelector';
import { mapTableToNormalizedRows } from './schemaNormalizer';
import { validateNormalizedRows } from './validation';
import { mergeNormalizedRows } from './mergeData';
import type {
  ImportOptions,
  ImportProgress,
  ImportSourceSummary,
  ImportWarning,
  NormalizedRow,
  SheetTable,
  WorkbookResult,
} from './types';

export type WorkerImportPayload = {
  rows: NormalizedRow[];
  sourceSummary: ImportSourceSummary[];
  warnings: ImportWarning[];
  skippedSheets: string[];
  totalSheets: number;
  sheets: SheetTable[];
};

export type WorkerInMessage =
  | {
      type: 'parse';
      arrayBuffer: ArrayBuffer;
      options?: Omit<ImportOptions, 'signal' | 'onProgress'>;
    }
  | {
      type: 'cancel';
    };

export type WorkerOutMessage =
  | {
      type: 'progress';
      progress: ImportProgress;
    }
  | {
      type: 'success';
      result: WorkerImportPayload | WorkbookResult;
    }
  | {
      type: 'error';
      error: string;
      name?: string;
    };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerInMessage>) => void) | null;
  postMessage(message: WorkerOutMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerInMessage>) => void): void;
}

let currentAbortController: AbortController | null = null;

const createAbortError = () => {
  const error = new Error('Import cancelled.');
  (error as Error & { name?: string }).name = 'AbortError';
  return error;
};

export const handleWorkerMessage = async (
  data: WorkerInMessage,
  postMessage: (message: WorkerOutMessage) => void
): Promise<void> => {
  if (!data) return;

  if (data.type === 'cancel') {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    return;
  }

  if (data.type === 'parse') {
    currentAbortController = new AbortController();
    const { arrayBuffer, options = {} } = data;
    const fileName = options.fileName || 'workbook.xlsx';
    const workerStartTime = performance.now();

    try {
      // Phase 1: Parse Workbook Buffer into sheets
      const workbookResult = await parseWorkbookBuffer(
        arrayBuffer,
        {
          ...options,
          signal: currentAbortController.signal,
        },
        (progress: ImportProgress) => {
          postMessage({ type: 'progress', progress });
        }
      );

      if (currentAbortController.signal.aborted) {
        throw createAbortError();
      }

      // Phase 2: Sheet Selection & Mapping inside worker thread
      const filteredSheets = selectSheets(workbookResult.sheets);
      const mergedRows: NormalizedRow[] = [];
      const sourceSummary: ImportSourceSummary[] = [];
      const warnings: ImportWarning[] = [];

      if (workbookResult.skippedSheets.length > 0) {
        warnings.push({
          fileName,
          message: `Skipped ${workbookResult.skippedSheets.length} noisy sheet(s) in the auto-recovered workbook: ${workbookResult.skippedSheets.join(', ')}.`,
          code: 'NOISY_SHEETS_SKIPPED',
        });
      }

      for (let sheetIndex = 0; sheetIndex < filteredSheets.length; sheetIndex += 1) {
        if (currentAbortController.signal.aborted) {
          throw createAbortError();
        }

        const sheet = filteredSheets[sheetIndex];
        postMessage({
          type: 'progress',
          progress: {
            phase: 'parsing',
            fileName,
            currentSheet: sheet.sheetName,
            currentSheetIndex: sheetIndex + 1,
            totalSheets: filteredSheets.length,
            percent: filteredSheets.length ? Math.round(((sheetIndex + 1) / filteredSheets.length) * 100) : 100,
            message: `Mapping sheet ${sheet.sheetName} (${sheetIndex + 1}/${filteredSheets.length})`,
          },
        });

        const mappedRows = mapTableToNormalizedRows(sheet, fileName);
        mergedRows.push(...mappedRows);
        for (let i = 0; i < mappedRows.length; i += 1) {
          mergedRows.push(mappedRows[i]);
        }
        sourceSummary.push({
          fileName,
          sheetName: sheet.sheetName,
          rowCount: mappedRows.length,
        });
      }

      if (currentAbortController.signal.aborted) {
        throw createAbortError();
      }

      // Phase 3: Validation inside worker thread
      postMessage({
        type: 'progress',
        progress: {
          phase: 'validating',
          fileName,
          percent: 95,
          message: `Validating ${mergedRows.length.toLocaleString()} rows...`,
        },
      });

      const validated = validateNormalizedRows(mergedRows, fileName);
      warnings.push(...validated.warnings);

      if (currentAbortController.signal.aborted) {
        throw createAbortError();
      }

      // Phase 4: Merging inside worker thread
      postMessage({
        type: 'progress',
        progress: {
          phase: 'validating',
          fileName,
          percent: 98,
          message: `Merging ${validated.rows.length.toLocaleString()} rows...`,
        },
      });

      const finalMergedRows = mergeNormalizedRows(validated.rows);

      postMessage({
        type: 'progress',
        progress: {
          phase: 'validating',
          fileName,
          percent: 100,
          message: `Import complete: ${finalMergedRows.length.toLocaleString()} rows normalized.`,
        },
      });

      const totalDuration = (performance.now() - workerStartTime).toFixed(1);
      console.log(`[WORKER] Pipeline complete in ${totalDuration}ms. Merged rows: ${finalMergedRows.length}. Posting success to main thread.`);

      // Post final processed result to main thread
      postMessage({
        type: 'success',
        result: {
          rows: finalMergedRows,
          sourceSummary,
          warnings,
          skippedSheets: workbookResult.skippedSheets,
          totalSheets: workbookResult.totalSheets,
          sheets: filteredSheets.map((s) => ({
            workbookName: s.workbookName,
            sheetName: s.sheetName,
            index: s.index,
            rowCount: s.rowCount,
            headerRow: s.headerRow,
            rows: [], // Omit raw rows across thread boundary to avoid memory duplication
          })),
        },
      });
    } catch (err: unknown) {
      const errorObj = err as Error | undefined;
      const isAbort = errorObj?.name === 'AbortError' || currentAbortController?.signal.aborted;
      postMessage({
        type: 'error',
        error: errorObj instanceof Error ? errorObj.message : String(err),
        name: isAbort ? 'AbortError' : errorObj?.name,
      });
    } finally {
      currentAbortController = null;
    }
  }
};

// If running in a Web Worker environment, wire up the listener
if (typeof self !== 'undefined' && typeof (self as unknown as WorkerScope).postMessage === 'function') {
  console.log('[DEBUG 4b-setup] Web Worker environment detected (self.postMessage is function). Attaching message listener.');
  const workerScope = self as unknown as WorkerScope;
  workerScope.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
    console.log('[DEBUG 4b - workbookWorker.ts] Worker addEventListener message received:', event.data?.type);
    void handleWorkerMessage(event.data, (msg) => workerScope.postMessage(msg));
  });
}


