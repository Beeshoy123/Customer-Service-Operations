export type SupportedImportFormat = 'csv' | 'tsv' | 'txt' | 'xlsx' | 'xls' | 'xlsm' | 'unknown';

export type ImportProgress = {
  phase: 'preparing' | 'parsing' | 'loading workbook' | 'validating';
  fileName?: string;
  currentFile?: number;
  totalFiles?: number;
  currentSheet?: string;
  currentSheetIndex?: number;
  totalSheets?: number;
  currentRow?: number;
  totalRows?: number;
  percent?: number;
  message?: string;
};

export type ImportOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: ImportProgress) => void;
  largeSheetRowThreshold?: number;
  batchRowSize?: number;
  largeFileSizeThreshold?: number;
  maxRowsPerSheet?: number;
  fileSize?: number;
  fileName?: string;
};

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

export type WorkbookResult = {
  sheets: SheetTable[];
  skippedSheets: string[];
  totalSheets: number;
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

export type SheetGranularity = 'aggregate' | 'transaction' | 'unknown';

export type GranularityDetectionResult = {
  granularity: SheetGranularity;
  classification: SheetGranularity;
  averageRowsPerAgentDate: number;
  totalGroups: number;
  totalRows: number;
};

export type SheetGranularityResult = GranularityDetectionResult;

export type SheetHeaderMapping = {
  original: string;
  normalized: string;
  mappedField: string | null;
  index: number;
};

export type ColumnFieldMapping =
  | SheetHeaderMapping[]
  | Record<string | number, string | null | undefined>
  | Map<string | number, string | null | undefined>;

export type ColumnMappingConfidence = 'exact' | 'low' | 'none';

export type DetectedColumnMapping = {
  header: string;
  normalized: string;
  mappedField: string | null;
  confidence: ColumnMappingConfidence;
  isLowConfidence: boolean;
  matchType: 'exact_alias' | 'paired_count' | 'token_hint' | 'unmapped';
  sampleValues?: string[];
  index: number;
};

export type SheetPreviewData = {
  sheetName: string;
  workbookName: string;
  index: number;
  rowCount: number;
  table: SheetTable;
  detectedGranularity: SheetGranularity;
  granularityConfidence: 'high' | 'low';
  granularityReason?: string;
  selectedGranularity: SheetGranularity;
  isConfirmed: boolean;
  columnMappings: DetectedColumnMapping[];
};

export type ImportPreviewState = {
  isOpen: boolean;
  fileName: string;
  sheets: SheetPreviewData[];
  skippedSheets?: string[];
};
