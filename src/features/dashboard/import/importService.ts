import { parseDelimitedText } from './csvParser';
import { detectFileType, isSupportedImportType } from './fileTypeDetector';
import { convertWorkbookToSheets, convertWorkbookToSheetsViaWorker, DEFAULT_LARGE_FILE_SIZE_THRESHOLD } from './workbookLoader';
import { selectSheets } from './sheetSelector';
import { normalizeCellValue, normalizeHeaderToField } from './schemaNormalizer';
import { mergeNormalizedRows } from './mergeData';
import { validateNormalizedRows } from './validation';
import type { ImportOptions, ImportProgress, ImportResult, ImportSourceSummary, ImportWarning, NormalizedRow, SheetTable } from './types';

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

const mapTableToNormalizedRows = (table: SheetTable, fileName: string): NormalizedRow[] => {
  const headers = table.headerRow ?? [];

  if (!headers.length) {
    return [];
  }

  const normalizedRows: NormalizedRow[] = [];

  for (const rawRow of table.rows) {
    const row: NormalizedRow = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = String(headers[i] ?? '').trim();
      const mappedField = normalizeHeaderToField(header);
      if (!mappedField) continue;

      const value = rawRow?.[i];
      const normalizedValue = normalizeCellValue(value, mappedField);
      row[mappedField] = normalizedValue;
    }

    if (Object.keys(row).length > 0) {
      row.sourceFile = fileName;
      row.sourceSheet = table.sheetName;
      normalizedRows.push(row);
    }
  }

  return normalizedRows;
};

const parseTextFile = async (file: File, options: ImportOptions = {}): Promise<{ rows: NormalizedRow[]; sourceSummary: ImportSourceSummary[] }> => {
  throwIfAborted(options.signal);

  const text = await file.text();
  const { headers, rows } = parseDelimitedText(text);

  if (!headers.length) {
    return { rows: [], sourceSummary: [] };
  }

  const normalizedRows: NormalizedRow[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    throwIfAborted(options.signal);

    if (index > 0 && index % 250 === 0) {
      await yieldToEventLoop();
    }

    const row = rows[index];
    const mappedRow: NormalizedRow = {};
    for (let i = 0; i < headers.length; i += 1) {
      const mappedField = normalizeHeaderToField(headers[i]);
      if (!mappedField) continue;
      mappedRow[mappedField] = normalizeCellValue(row[i], mappedField);
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
  console.log('[DEBUG 2 - parseWorkbookFile] Size threshold check:', { fileName: file.name, fileSize, threshold, isLargeFile: typeof fileSize === 'number' && fileSize >= threshold });
  const isLargeFile = typeof fileSize === 'number' && fileSize >= threshold;

  const loaderFn = isLargeFile ? convertWorkbookToSheetsViaWorker : convertWorkbookToSheets;
  console.log('[DEBUG 2b - parseWorkbookFile] Selected loader function:', isLargeFile ? 'convertWorkbookToSheetsViaWorker' : 'convertWorkbookToSheets (SYNC)');
  const { sheets, skippedSheets, totalSheets } = await loaderFn(file, options, (progress) => {
    notifyProgress(options, progress);
  });
  console.log('[DEBUG 7 - parseWorkbookFile] loaderFn finished! Returned sheets count:', sheets?.length, 'totalSheets:', totalSheets);
  void totalSheets;
  const filteredSheets = selectSheets(sheets);
  console.log('[DEBUG 7a - parseWorkbookFile] Filtered sheets selected:', filteredSheets.map((s) => `${s.sheetName} (${s.rowCount} rows)`));
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

    if (sheetIndex > 0 && sheetIndex % 5 === 0) {
      await yieldToEventLoop();
    }

    const sheet = filteredSheets[sheetIndex];
    console.log(`[DEBUG 7b - parseWorkbookFile] Mapping sheet ${sheet.sheetName} with ${sheet.rows.length} rows on main thread...`);
    const mapStart = performance.now();
    const mappedRows = mapTableToNormalizedRows(sheet, file.name);
    console.log(`[DEBUG 7c - parseWorkbookFile] Finished mapping sheet ${sheet.sheetName} in ${(performance.now() - mapStart).toFixed(1)}ms. Mapped rows: ${mappedRows.length}`);
    mergedRows.push(...mappedRows);
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

export const runImportService = async (files: File[], options: ImportOptions = {}): Promise<ImportResult> => {
  const warnings: ImportWarning[] = [];
  const errors: ImportWarning[] = [];
  const aggregatedRows: NormalizedRow[] = [];
  const sourceSummary: ImportSourceSummary[] = [];

  throwIfAborted(options.signal);

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];

    throwIfAborted(options.signal);

    if (!isSupportedImportType(file.name)) {
      errors.push({ fileName: file.name, message: 'Unsupported file type.' });
      continue;
    }

    notifyProgress(options, {
      phase: 'preparing',
      fileName: file.name,
      currentFile: fileIndex + 1,
      totalFiles: files.length,
      percent: files.length ? Math.round(((fileIndex + 1) / files.length) * 100) : 100,
      message: `Preparing ${file.name} (${fileIndex + 1}/${files.length})`,
    });

    try {
      const fileType = detectFileType(file.name);
      let parsedRows: NormalizedRow[] = [];
      let parsedSourceSummary: ImportSourceSummary[] = [];
      let parsedWarnings: ImportWarning[] = [];

      if (fileType === 'csv' || fileType === 'tsv' || fileType === 'txt') {
        const parsed = await parseTextFile(file, options);
        parsedRows = parsed.rows;
        parsedSourceSummary = parsed.sourceSummary;
      } else if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
        const parsed = await parseWorkbookFile(file, options);
        parsedRows = parsed.rows;
        parsedSourceSummary = parsed.sourceSummary;
        parsedWarnings = parsed.warnings;
      }

      console.log(`[DEBUG 7d - runImportService] Starting validateNormalizedRows with ${parsedRows.length} rows on main thread...`);
      const valStart = performance.now();
      const validated = validateNormalizedRows(parsedRows, file.name);
      console.log(`[DEBUG 7e - runImportService] Finished validateNormalizedRows in ${(performance.now() - valStart).toFixed(1)}ms. Validated rows: ${validated.rows.length}, warnings: ${validated.warnings.length}`);
      warnings.push(...parsedWarnings, ...validated.warnings);
      aggregatedRows.push(...validated.rows);
      sourceSummary.push(...parsedSourceSummary);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      errors.push({
        fileName: file.name,
        message: error instanceof Error ? error.message : 'Import failed unexpectedly.',
      });
    }
  }

  console.log(`[DEBUG 7f - runImportService] Starting mergeNormalizedRows with ${aggregatedRows.length} rows on main thread...`);
  const mergeStart = performance.now();
  const mergedRows = mergeNormalizedRows(aggregatedRows);
  console.log(`[DEBUG 7g - runImportService] Finished mergeNormalizedRows in ${(performance.now() - mergeStart).toFixed(1)}ms. Merged rows: ${mergedRows.length}`);
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
