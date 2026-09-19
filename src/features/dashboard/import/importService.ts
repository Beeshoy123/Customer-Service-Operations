import { parseDelimitedText } from './csvParser';
import { detectFileType, isSupportedImportType } from './fileTypeDetector';
import { convertWorkbookToSheets, convertWorkbookToSheetsViaWorker, DEFAULT_LARGE_FILE_SIZE_THRESHOLD } from './workbookLoader';
import { selectSheets } from './sheetSelector';
import { mapTableToNormalizedRows, normalizeCellValue, normalizeHeaderToField } from './schemaNormalizer';
import { mergeNormalizedRows } from './mergeData';
import { validateNormalizedRows } from './validation';
import type { ImportOptions, ImportProgress, ImportResult, ImportSourceSummary, ImportWarning, NormalizedRow } from './types';

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

const createAbortError = () => {
  const error = new Error('Import cancelled.');
  (error as Error & { name?: string }).name = 'AbortError';
  return error;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

const notifyProgress = (options: ImportOptions, progress: ImportProgress) => {
  options.onProgress?.(progress);
};

const parseTextFile = async (file: File, options: ImportOptions = {}): Promise<{ rows: NormalizedRow[]; sourceSummary: ImportSourceSummary[] }> => {
  throwIfAborted(options.signal);

  const text = await file.text();
  const { headers, rows } = parseDelimitedText(text);

  if (!headers.length) {
    return { rows: [], sourceSummary: [] };
  }

  const normalizedRows: NormalizedRow[] = [];

  // Pre-resolve header mappings ONCE with sample values for pattern fingerprinting & memory
  const mappedHeaders: Array<{ index: number; mappedField: string }> = [];
  for (let i = 0; i < headers.length; i += 1) {
    const sampleVals = rows
      .slice(0, 50)
      .map((r) => r?.[i] as string | number | null | undefined)
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
    const mappedField = normalizeHeaderToField(headers[i], sampleVals);
    if (mappedField) {
      mappedHeaders.push({ index: i, mappedField });
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    throwIfAborted(options.signal);

    if (index > 0 && index % 250 === 0) {
      await yieldToEventLoop();
    }

    const row = rows[index];
    const mappedRow: NormalizedRow = {};
    for (let m = 0; m < mappedHeaders.length; m += 1) {
      const { index: colIdx, mappedField } = mappedHeaders[m];
      mappedRow[mappedField] = normalizeCellValue(row[colIdx], mappedField);
    }

    if (Object.keys(mappedRow).length > 0) {
      mappedRow.sourceFile = file.name;
      mappedRow.sourceSheet = 'CSV';
      normalizedRows.push(mappedRow);
    }

    if (index % 250 === 0 || index === rows.length - 1) {
      notifyProgress(options, {
        phase: 'parsing',
        fileName: file.name,
        currentRow: index + 1,
        totalRows: rows.length,
        percent: rows.length ? Math.round(((index + 1) / rows.length) * 100) : 100,
        message: `Parsing ${file.name} (${index + 1}/${rows.length})`,
      });
    }
  }

  return {
    rows: normalizedRows,
    sourceSummary: [{ fileName: file.name, sheetName: 'CSV', rowCount: normalizedRows.length }],
  };
};

const parseWorkbookFile = async (file: File, options: ImportOptions = {}): Promise<{ rows: NormalizedRow[]; sourceSummary: ImportSourceSummary[]; warnings: ImportWarning[] }> => {
  throwIfAborted(options.signal);

  const threshold = options.largeFileSizeThreshold ?? DEFAULT_LARGE_FILE_SIZE_THRESHOLD;
  const fileSize = options.fileSize ?? (typeof file?.size === 'number' ? file.size : undefined);
  const isLargeFile = typeof fileSize === 'number' && fileSize >= threshold;

  // Route through the worker when explicitly forced (batch mode) or when the file is large.
  if (options.forceWorker || isLargeFile) {
    const workerResult = await convertWorkbookToSheetsViaWorker(file, options, (progress) => {
      notifyProgress(options, progress);
    });

    return {
      rows: workerResult.rows || [],
      sourceSummary: workerResult.sourceSummary || [],
      warnings: workerResult.warnings || [],
    };
  }

  // Synchronous small-file fallback path:
  const { sheets, skippedSheets } = await convertWorkbookToSheets(file, options, (progress) => {
    notifyProgress(options, progress);
  });
  const filteredSheets = selectSheets(sheets);
  const mergedRows: NormalizedRow[] = [];
  const sourceSummary: ImportSourceSummary[] = [];
  const warnings: ImportWarning[] = [];

  if (skippedSheets.length > 0) {
    warnings.push({
      fileName: file.name,
      message: `Skipped ${skippedSheets.length} noisy sheet(s) in the auto-recovered workbook: ${skippedSheets.join(', ')}.`,
      code: 'NOISY_SHEETS_SKIPPED',
    });
  }

  for (let sheetIndex = 0; sheetIndex < filteredSheets.length; sheetIndex += 1) {
    throwIfAborted(options.signal);

    const sheet = filteredSheets[sheetIndex];
    const mappedRows = mapTableToNormalizedRows(sheet, file.name);
    for (let i = 0; i < mappedRows.length; i += 1) {
      mergedRows.push(mappedRows[i]);
    }
    sourceSummary.push({ fileName: file.name, sheetName: sheet.sheetName, rowCount: mappedRows.length });

    notifyProgress(options, {
      phase: 'parsing',
      fileName: file.name,
      currentSheet: sheet.sheetName,
      currentSheetIndex: sheetIndex + 1,
      totalSheets: filteredSheets.length,
      percent: filteredSheets.length ? Math.round(((sheetIndex + 1) / filteredSheets.length) * 100) : 100,
      message: `Processing workbook ${file.name} (${sheetIndex + 1}/${filteredSheets.length} sheets)`,
    });
  }

  return { rows: mergedRows, sourceSummary, warnings };
};

/** Maximum number of files parsed concurrently during a multi-file batch. */
const BATCH_CONCURRENCY = 4;

/**
 * Runs `fn` for each item in `items`, keeping at most `concurrency` promises
 * in-flight at the same time. Results are returned in the original order.
 */
const runConcurrently = async <T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await fn(items[i], i);
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
};

export const runImportService = async (files: File[], options: ImportOptions = {}): Promise<ImportResult> => {
  throwIfAborted(options.signal);

  const threshold = options.largeFileSizeThreshold ?? DEFAULT_LARGE_FILE_SIZE_THRESHOLD;
  const isMultiFile = files.length > 1;

  // Per-file progress tracking for unified status messages during concurrent loads.
  const filePercents: number[] = new Array(files.length).fill(0);

  const emitBatchProgress = (fileIndex: number, filePercent: number, fileName: string) => {
    filePercents[fileIndex] = filePercent;
    const completedFiles = filePercents.filter((p) => p >= 100).length;
    const overallPercent = Math.round(filePercents.reduce((sum, p) => sum + p, 0) / files.length);
    notifyProgress(options, {
      phase: 'parsing',
      fileName,
      currentFile: completedFiles + 1,
      totalFiles: files.length,
      percent: Math.min(overallPercent, 99),
      message: `File ${completedFiles + 1} of ${files.length} — ${fileName} — ${filePercent}%`,
    });
  };

  type FileResult = {
    rows: NormalizedRow[];
    sourceSummary: ImportSourceSummary[];
    warnings: ImportWarning[];
    errors: ImportWarning[];
    fileIndex: number;
  };

  notifyProgress(options, {
    phase: 'preparing',
    totalFiles: files.length,
    percent: 0,
    message: `Preparing ${files.length} file${files.length > 1 ? 's' : ''}...`,
  });

  const fileResults = await runConcurrently<File, FileResult>(
    files,
    BATCH_CONCURRENCY,
    async (file, fileIndex) => {
      const result: FileResult = {
        rows: [],
        sourceSummary: [],
        warnings: [],
        errors: [],
        fileIndex,
      };

      if (!isSupportedImportType(file.name)) {
        result.errors.push({ fileName: file.name, message: 'Unsupported file type.' });
        return result;
      }

      // Build per-file options: forward abort signal, wire per-file progress into
      // the batch aggregator, and force worker path for workbooks in multi-file batches.
      const fileOptions: ImportOptions = {
        ...options,
        forceWorker: isMultiFile ? true : options.forceWorker,
        onProgress: (progress) => {
          if (isMultiFile) {
            emitBatchProgress(fileIndex, progress.percent ?? 0, file.name);
          } else {
            notifyProgress(options, progress);
          }
        },
      };

      try {
        const fileType = detectFileType(file.name);

        if (fileType === 'csv' || fileType === 'tsv' || fileType === 'txt') {
          const parsed = await parseTextFile(file, fileOptions);
          const validated = validateNormalizedRows(parsed.rows, file.name);
          result.rows = validated.rows;
          result.sourceSummary = parsed.sourceSummary;
          result.warnings = validated.warnings;
        } else if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
          const fileSize = options.fileSize ?? (typeof file?.size === 'number' ? file.size : undefined);
          const isLargeFile = typeof fileSize === 'number' && fileSize >= threshold;

          const parsed = await parseWorkbookFile(file, fileOptions);
          if (isLargeFile || fileOptions.forceWorker) {
            // Worker already mapped, validated, and merged the rows.
            result.rows = parsed.rows;
            result.warnings = parsed.warnings;
            result.sourceSummary = parsed.sourceSummary;
          } else {
            const validated = validateNormalizedRows(parsed.rows, file.name);
            result.rows = validated.rows;
            result.warnings = [...parsed.warnings, ...validated.warnings];
            result.sourceSummary = parsed.sourceSummary;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        result.errors.push({
          fileName: file.name,
          message: error instanceof Error ? error.message : 'Import failed unexpectedly.',
        });
      }

      if (isMultiFile) {
        emitBatchProgress(fileIndex, 100, file.name);
      }

      return result;
    }
  );

  // Merge results in original file order.
  const warnings: ImportWarning[] = [];
  const errors: ImportWarning[] = [];
  const aggregatedRows: NormalizedRow[] = [];
  const sourceSummary: ImportSourceSummary[] = [];

  for (const result of fileResults) {
    warnings.push(...result.warnings);
    errors.push(...result.errors);
    aggregatedRows.push(...result.rows);
    sourceSummary.push(...result.sourceSummary);
  }

  const isSingleLargeFile = files.length === 1 && (typeof files[0]?.size === 'number' && files[0].size >= threshold);
  const mergedRows = isSingleLargeFile ? aggregatedRows : mergeNormalizedRows(aggregatedRows);
  const sheetNames = new Set(
    sourceSummary
      .map((source) => source.sheetName)
      .filter((value) => value && value.trim().length > 0),
  );

  notifyProgress(options, {
    phase: 'validating',
    totalFiles: files.length,
    percent: 100,
    message: `Import complete: ${mergedRows.length} rows normalized.`,
  });

  return {
    files: files.length,
    sheets: sheetNames.size || 1,
    rows: mergedRows,
    warnings,
    errors,
    sources: sourceSummary,
  } as ImportResult;
};