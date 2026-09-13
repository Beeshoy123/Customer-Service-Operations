export type SupportedImportFormat = 'csv' | 'tsv' | 'txt' | 'xlsx' | 'xls' | 'xlsm' | 'unknown';

export type ImportWarning = {
  fileName: string;
  sheetName?: string;
  message: string;
  code?: string;
  row?: number;
};

export type SheetTable = {
  workbookName: string;
  sheetName: string;
  index: number;
  rows: unknown[][];
  headerRow: unknown[];
  rowCount: number;
};

export type NormalizedRow = Record<string, string | number | null | undefined>;

export type ImportSourceSummary = {
  fileName: string;
  sheetName: string;
  rowCount: number;
};

export type ImportSummary = {
  files: number;
  sheets: number;
  rows: number;
  warnings: ImportWarning[];
  errors: ImportWarning[];
  sources: ImportSourceSummary[];
};

export type ImportResult = ImportSummary & {
  rows: NormalizedRow[];
};
