import type { ColumnFingerprint } from './columnFingerprinter';

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

export type MergeStrategy = 'sum' | 'average' | 'last-seen' | 'first-seen';
export type MergeFieldStrategy = MergeStrategy;
export type RateMergeStyle = 'arithmetic-average' | 'weighted-by-counts';

export type MergeOptions = {
  /** Per-field merge strategy overrides */
  mergeStrategy?: Record<string, MergeStrategy>;
  /** Selects how already-calculated rate fields are combined across sources. */
  rateMergeStyle?: RateMergeStyle;
  /**
   * How to handle duplicate entries from the exact same source (same sourceFile + sourceSheet):
   * - 'dedupe' (default): Keep last-seen value and avoid double-counting additive metrics.
   * - 'allow': Merges same-source rows according to field merge strategies.
   */
  duplicateSourceHandling?: 'dedupe' | 'allow';
  /** Optional callback triggered when duplicate source records or files are detected */
  onWarning?: (warning: ImportWarning) => void;
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
  /** When true, workbook files are always parsed via the Web Worker regardless of file size. */
  forceWorker?: boolean;
  /** Keep raw sheet rows when the worker result will be opened in the verification preview. */
  includeRawRowsForPreview?: boolean;
  mappingOverrides?: Record<string, string | null>;
  /** Optional per-field merge strategy overrides for mergeNormalizedRows */
  mergeStrategy?: Record<string, MergeStrategy>;
  /** Account-selected style for combining calculated rate fields across files. */
  rateMergeStyle?: RateMergeStyle;
  /** Whether to detect and skip duplicate file uploads (defaults to true) */
  detectDuplicateFiles?: boolean;
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

export type SkippedSheetInfo = {
  sheetName: string;
  workbookName?: string;
  reason: string;
  table?: SheetTable;
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
  mappingDiagnostics?: MappingDiagnostic[];
};

export type MappingDiagnostic = {
  fileName: string;
  sheetName: string;
  header: string;
  mappedField: string | null;
  confidence: ColumnMappingConfidence;
  score?: number;
  candidates?: MappingCandidate[];
  collisionWith?: string[];
  componentGroup?: 'credit' | 'vtt';
  componentRole?: string;
  resolveWindow?: string;
  choiceGroup?: string;
  choiceOptions?: string[];
  choiceQuestion?: string;
  unrecognizedPlausible?: boolean;
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
export type ColumnMappingConfidence = 'exact' | 'remembered' | 'low' | 'none';

export type ColumnMatchType =
  | 'exact_alias'
  | 'paired_count'
  | 'scored_high'
  | 'remembered'
  | 'token_hint'
  | 'unmapped';

export type MappingCandidate = {
  field: string;
  score: number;
  headerScore: number;
  fingerprintScore: number;
  memoryScore: number;
  signals?: string[];
};

export type DetectedColumnMapping = {
  header: string;
  normalized: string;
  mappedField: string | null;
  confidence: ColumnMappingConfidence;
  isLowConfidence: boolean;
  matchType: ColumnMatchType;
  sampleValues?: string[];
  index: number;
  fingerprint?: ColumnFingerprint;
  candidates?: MappingCandidate[];
  score?: number;
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
  skippedSheets?: (string | SkippedSheetInfo)[];
};
