import { parseDelimitedText } from './csvParser';
import { detectFileType, isSupportedImportType } from './fileTypeDetector';
import { convertWorkbookToSheets } from './workbookLoader';
import { normalizeCellValue, normalizeHeaderToField } from './schemaNormalizer';
import { mergeNormalizedRows } from './mergeData';
import { validateNormalizedRows } from './validation';
import type { ImportResult, ImportSourceSummary, ImportWarning, NormalizedRow, SheetTable } from './types';

const mapTableToNormalizedRows = (table: SheetTable, fileName: string): NormalizedRow[] => {
  const rawHeaders = table.headerRow ?? [];
  const headers = rawHeaders.length > 0 ? rawHeaders : table.rows[0] ?? [];

  if (!headers.length) {
    return [];
  }

  const rows = table.rows.slice(1);
  const normalizedRows: NormalizedRow[] = [];

  for (const rawRow of rows) {
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

const parseTextFile = async (file: File): Promise<{ rows: NormalizedRow[]; sourceSummary: ImportSourceSummary[] }> => {
  const text = await file.text();
  const { headers, rows } = parseDelimitedText(text);

  if (!headers.length) {
    return { rows: [], sourceSummary: [] };
  }

  const normalizedRows: NormalizedRow[] = [];

  for (const row of rows) {
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
  }

  return {
    rows: normalizedRows,
    sourceSummary: [{ fileName: file.name, sheetName: 'CSV', rowCount: normalizedRows.length }],
  };
};

const parseWorkbookFile = async (file: File): Promise<{ rows: NormalizedRow[]; sourceSummary: ImportSourceSummary[] }> => {
  const sheets = await convertWorkbookToSheets(file);
  const mergedRows: NormalizedRow[] = [];
  const sourceSummary: ImportSourceSummary[] = [];

  for (const sheet of sheets) {
    const mappedRows = mapTableToNormalizedRows(sheet, file.name);
    mergedRows.push(...mappedRows);
    sourceSummary.push({ fileName: file.name, sheetName: sheet.sheetName, rowCount: mappedRows.length });
  }

  return { rows: mergedRows, sourceSummary };
};

export const runImportService = async (files: File[]): Promise<ImportResult> => {
  const warnings: ImportWarning[] = [];
  const errors: ImportWarning[] = [];
  const aggregatedRows: NormalizedRow[] = [];
  const sourceSummary: ImportSourceSummary[] = [];

  for (const file of files) {
    if (!isSupportedImportType(file.name)) {
      errors.push({ fileName: file.name, message: 'Unsupported file type.' });
      continue;
    }

    try {
      const fileType = detectFileType(file.name);
      let parsedRows: NormalizedRow[] = [];
      let parsedSourceSummary: ImportSourceSummary[] = [];

      if (fileType === 'csv' || fileType === 'tsv' || fileType === 'txt') {
        const parsed = await parseTextFile(file);
        parsedRows = parsed.rows;
        parsedSourceSummary = parsed.sourceSummary;
      } else if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
        const parsed = await parseWorkbookFile(file);
        parsedRows = parsed.rows;
        parsedSourceSummary = parsed.sourceSummary;
      }

      const validated = validateNormalizedRows(parsedRows, file.name);
      warnings.push(...validated.warnings);
      aggregatedRows.push(...validated.rows);
      sourceSummary.push(...parsedSourceSummary);
    } catch (error) {
      errors.push({
        fileName: file.name,
        message: error instanceof Error ? error.message : 'Import failed unexpectedly.',
      });
    }
  }

  const mergedRows = mergeNormalizedRows(aggregatedRows);
  const sheetNames = new Set(
    sourceSummary
      .map((source) => source.sheetName)
      .filter((value) => value && value.trim().length > 0),
  );

  return {
    files: files.length,
    sheets: sheetNames.size || 1,
    rows: mergedRows,
    warnings,
    errors,
    sources: sourceSummary,
  } as ImportResult;
};
