// S4 extraction (move-only): pure preview-state helpers + LocalSheetState moved
// VERBATIM from ImportPreviewModal.tsx. See recommendations.md S4.
// Column-mapping policy stays in importPolicy.ts only (STANDING RULE).
import type {
  SheetTable,
  SheetGranularity,
  SheetHeaderMapping,
  DetectedColumnMapping,
} from './types';
import { detectGranularity, evaluateGranularityConfidence } from './granularityDetector';
import { CANONICAL_FIELD_OPTIONS, detectColumnMappingWithConfidence } from './importPolicy';
import { analyzeColumnValues } from './columnFingerprinter';
import type {
  CustomerExperienceConfig,
  DataLocation,
  TargetStyle,
} from '../../accountSetup/account-profile-schema';
// S11 (2026-10-12): buildAccountProfile moved next to its schema; re-exported
// here so existing import sites keep working through one stable path.
import type { AdditionalMetricKey, MetricDraftInput } from '../../accountSetup/account-profile-builder';
export { buildAccountProfile } from '../../accountSetup/account-profile-builder';
export type { AdditionalMetricKey, MetricDraftInput } from '../../accountSetup/account-profile-builder';

export interface LocalSheetState {
  sheetName: string;
  workbookName: string;
  index: number;
  rowCount: number;
  table: SheetTable;
  detectedGranularity: SheetGranularity;
  granularityConfidence: 'high' | 'low';
  granularityReason: string;
  selectedGranularity: SheetGranularity;
  isConfirmed: boolean;
  isManuallySet: boolean;
  columnMappings: DetectedColumnMapping[];
}

const FIELD_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CANONICAL_FIELD_OPTIONS.map((opt) => [opt.value, opt.label])
);

export const getCanonicalFieldLabel = (field: string): string => {
  return FIELD_LABEL_MAP[field] || field;
};

export const isReadyRateFingerprint = (fingerprint: string): boolean =>
  fingerprint === 'percent-decimal' || fingerprint === 'percent-whole';

export const extractSampleValues = (
  table: SheetTable,
  colIndex: number
): (string | number | null | undefined)[] =>
  (table.rows ?? [])
    .slice(0, 50)
    .map((row) => row?.[colIndex])
    .filter((val): val is string | number | null | undefined =>
      val !== undefined && val !== null && String(val).trim() !== ''
    );

export const buildDefaultCustomerExperienceConfig = (
  header: string,
  sampleValues: (string | number | null | undefined)[] = []
): CustomerExperienceConfig => {
  const { fingerprint } = analyzeColumnValues(sampleValues);
  const readyRate = isReadyRateFingerprint(fingerprint);

  return {
    label: 'Customer Experience',
    data: {
      shape: readyRate ? 'ready-rate' : 'raw-counts',
      matchedColumns: [header],
    } as DataLocation,
    ...(readyRate
      ? {}
      : {
          classification: {
            calcStyle: 'csat-percentage',
            scale: { min: 1, max: 5 },
            promoterRange: { min: 4, max: 5 },
            detractorRange: { min: 1, max: 1 },
          },
        }),
    target: 0,
  };
};

// S11: canonical key union now owned by account-profile-builder.ts (re-exported above).

export const getAdditionalMetricKey = (field: string | null): AdditionalMetricKey | null => {
  if (!field) return null;
  if (field === 'netOcc' || field === 'creditFreq') return 'credit';
  if (field === 'viewTogether' || field === 'vttSent' || field === 'vttTransacted') return 'vtt';
  const supported: AdditionalMetricKey[] = [
    'resolve2hr', 'resolve3d', 'phoneAdds', 'dataLines', 'fiber', 'vhi', 'hotspot',
    'handoffs', 'dpc', 'vtt', 'credit',
  ];
  return supported.includes(field as AdditionalMetricKey) ? field as AdditionalMetricKey : null;
};

// S11: the draft *shape* is owned by account-profile-builder.ts (the consumer);
// this preview-local type only tags which column produced the draft.
export interface AdditionalMetricDraft extends MetricDraftInput {}

const inferWindowLabel = (header: string, field: AdditionalMetricKey): string | undefined => {
  const normalized = header.toLowerCase();
  if (field === 'resolve2hr' && /2\s*[- ]?h(?:ou)?r?/.test(normalized)) return '2 hour';
  if (field === 'resolve3d' && /3\s*[- ]?d(?:ay)?/.test(normalized)) return '3 day';
  return undefined;
};

const inferRequiredMessages = (header: string): string[] => {
  const normalized = header.toLowerCase();
  const messages: string[] = [];
  if (normalized.includes('view together') || normalized.includes('vtt')) messages.push('view-together');
  if (normalized.includes('terms') || normalized.includes('condition')) messages.push('terms-and-conditions');
  if (normalized.includes('broadband') || normalized.includes('facts')) messages.push('broadband-facts');
  return messages;
};

export const buildAdditionalMetricDraft = (
  metric: AdditionalMetricKey,
  header: string,
  sampleValues: (string | number | null | undefined)[]
): AdditionalMetricDraft => {
  const fingerprint = analyzeColumnValues(sampleValues).fingerprint;
  const readyRate = isReadyRateFingerprint(fingerprint);
  const inferredWindow = inferWindowLabel(header, metric);
  const inferredMessages = inferRequiredMessages(header);
  const inferredCalcStyle = metric === 'credit'
    ? header.toLowerCase().includes('freq')
      ? 'frequency'
      : header.toLowerCase().includes('occ') || header.toLowerCase().includes('credit')
        ? 'per-call-average'
        : undefined
    : undefined;

  return {
    metric,
    header,
    data: {
      shape: readyRate ? 'ready-rate' : 'raw-counts',
      matchedColumns: [header],
    },
    target: 0,
    ...(inferredWindow ? { windowLabel: inferredWindow } : {}),
    ...(metric === 'resolve2hr' || metric === 'resolve3d'
      ? { windowLabel: inferredWindow }
      : {}),
    ...(metric === 'phoneAdds' || metric === 'dataLines' || metric === 'fiber' || metric === 'vhi' || metric === 'hotspot'
      ? { targetStyle: { kind: 'flat', value: 0 } as TargetStyle }
      : {}),
    ...(inferredCalcStyle ? { calcStyle: inferredCalcStyle } : {}),
    ...(metric === 'dpc' || metric === 'credit' ? { lowerIsBetter: true } : {}),
    ...(metric === 'vtt' ? { requiredMessages: inferredMessages } : {}),
  };
};

export const buildInitialSheetStates = (sheets: SheetTable[]): LocalSheetState[] => {
  return (sheets || []).map((table, index) => {
    const headerRow = table.headerRow ?? [];
    const rows = table.rows ?? [];

    const columnMappings: DetectedColumnMapping[] = headerRow.map((header, colIdx) => {
      const headerStr = String(header ?? '').trim();
      const sampleVals = rows
        .slice(0, 50)
        .map((r) => r?.[colIdx])
        .filter((val) => val !== undefined && val !== null && String(val).trim() !== '');

      return detectColumnMappingWithConfidence(
        headerStr,
        colIdx,
        sampleVals as (string | number | null | undefined)[]
      );
    });

    const headerMappings: SheetHeaderMapping[] = columnMappings.map((m) => ({
      original: m.header,
      normalized: m.normalized,
      mappedField: m.mappedField,
      index: m.index,
    }));

    const detected = detectGranularity(table, headerMappings);
    const confidence = evaluateGranularityConfidence(detected, columnMappings);

    const isHighConfidence = confidence.isHighConfidence;
    const selectedGranularity: SheetGranularity = isHighConfidence
      ? detected.classification
      : detected.classification !== 'unknown'
        ? detected.classification
        : 'unknown';

    return {
      sheetName: table.sheetName,
      workbookName: table.workbookName,
      index,
      rowCount: table.rowCount,
      table,
      detectedGranularity: detected.classification,
      granularityConfidence: isHighConfidence ? 'high' : 'low',
      granularityReason: confidence.reason,
      selectedGranularity,
      isConfirmed: isHighConfidence,
      isManuallySet: false,
      columnMappings,
    };
  });
};

/**
 * Returns the indices (in sheetStates) of sheets — other than sourceIdx — whose
 * header set matches the source sheet's headers (order-insensitive, case-insensitive).
 */
export const findMatchingSheets = (sourceIdx: number, sheetStates: LocalSheetState[]): number[] => {
  const source = sheetStates[sourceIdx];
  if (!source) return [];

  // NOTE (S7): this is NOT a fourth header-normalizer. `m.normalized` is already
  // output of importPolicy.normalizeHeader; this only lowercases/trims already
  // normalized field names for sheet-signature comparison. Different input,
  // different contract — do not "unify" it with normalizeHeader.
  const normalizeHeaders = (state: LocalSheetState): string =>
    state.columnMappings
      .map((m) => m.normalized.toLowerCase().trim())
      .sort()
      .join('|');

  const sourceKey = normalizeHeaders(source);

  return sheetStates.reduce<number[]>((acc, sheet, idx) => {
    if (idx !== sourceIdx && normalizeHeaders(sheet) === sourceKey) {
      acc.push(idx);
    }
    return acc;
  }, []);
};

/**
 * Clones sheetStates and applies the source sheet's mappedField values onto each
 * target sheet index, matching columns by their normalized header name. Also
 * carries over confidence/matchType so the UI reflects the applied state.
 */
export const applyMappingsToSheets = (
  sourceIdx: number,
  targetIndices: number[],
  sheetStates: LocalSheetState[]
): LocalSheetState[] => {
  const source = sheetStates[sourceIdx];
  if (!source) return sheetStates;

  // Build a lookup: normalizedHeader -> mapping info from source
  const sourceLookup = new Map(
    source.columnMappings.map((m) => [m.normalized.toLowerCase().trim(), m])
  );

  const next = [...sheetStates];

  for (const tIdx of targetIndices) {
    const target = { ...next[tIdx] };
    target.columnMappings = target.columnMappings.map((col) => {
      const srcCol = sourceLookup.get(col.normalized.toLowerCase().trim());
      if (!srcCol) return col;
      return {
        ...col,
        mappedField: srcCol.mappedField,
        confidence: srcCol.confidence,
        isLowConfidence: srcCol.isLowConfidence,
        matchType: srcCol.matchType,
      };
    });
    next[tIdx] = target;
  }

  return next;
};
