import React, { useState, useMemo, useEffect } from 'react';
import type {
  SheetTable,
  SheetGranularity,
  SheetHeaderMapping,
  DetectedColumnMapping,
  SkippedSheetInfo,
} from './types';
import { detectGranularity, evaluateGranularityConfidence } from './granularityDetector';
import { CANONICAL_FIELD_OPTIONS, detectColumnMappingWithConfidence } from './importPolicy';
import { analyzeColumnValues } from './columnFingerprinter';
import type {
  AccountProfile,
  CustomerExperienceConfig,
  DataLocation,
  TargetStyle,
} from '../../accountSetup/account-profile-schema';
import { DEFAULT_ACCOUNT_PROFILE } from '../config';
import {
  rememberMapping,
  forgetMapping,
  getLearnedMappingsCount,
  getAllLearnedMappings,
  clearMemory,
  type MappingMemoryEntry,
} from './mappingMemory';

export interface ImportPreviewModalProps {
  isOpen: boolean;
  accountName: string;
  sheets: SheetTable[];
  skippedSheets?: (string | SkippedSheetInfo)[];
  fileName?: string;
  onConfirm: (config: {
    sheetConfigs: Record<
      string,
      {
        granularity: SheetGranularity;
        columnMappings: Record<string, string | null>;
      }
    >;
    accountProfile?: AccountProfile;
  }) => void;
  onCancel: () => void;
}

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

const isReadyRateFingerprint = (fingerprint: string): boolean =>
  fingerprint === 'percent-decimal' || fingerprint === 'percent-whole';

const extractSampleValues = (
  table: SheetTable,
  colIndex: number
): (string | number | null | undefined)[] =>
  (table.rows ?? [])
    .slice(0, 50)
    .map((row) => row?.[colIndex])
    .filter((val): val is string | number | null | undefined =>
      val !== undefined && val !== null && String(val).trim() !== ''
    );

const buildDefaultCustomerExperienceConfig = (
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

type AdditionalMetricKey =
  | 'resolve2hr'
  | 'resolve3d'
  | 'phoneAdds'
  | 'dataLines'
  | 'fiber'
  | 'vhi'
  | 'hotspot'
  | 'handoffs'
  | 'dpc'
  | 'vtt'
  | 'credit';

const getAdditionalMetricKey = (field: string | null): AdditionalMetricKey | null => {
  if (!field) return null;
  if (field === 'netOcc' || field === 'creditFreq') return 'credit';
  if (field === 'viewTogether' || field === 'vttSent' || field === 'vttTransacted') return 'vtt';
  const supported: AdditionalMetricKey[] = [
    'resolve2hr', 'resolve3d', 'phoneAdds', 'dataLines', 'fiber', 'vhi', 'hotspot',
    'handoffs', 'dpc', 'vtt', 'credit',
  ];
  return supported.includes(field as AdditionalMetricKey) ? field as AdditionalMetricKey : null;
};

interface AdditionalMetricDraft {
  metric: AdditionalMetricKey;
  header: string;
  data: DataLocation;
  target: number;
  windowLabel?: string;
  targetStyle?: TargetStyle;
  calcStyle?: 'per-call-average' | 'total-amount' | 'frequency';
  lowerIsBetter?: boolean;
  requiredMessages?: string[];
}

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

const buildAdditionalMetricDraft = (
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

const buildAccountProfile = (
  accountName: string,
  customerExperience: CustomerExperienceConfig | null,
  drafts: AdditionalMetricDraft[]
): AccountProfile => {
  const profile = JSON.parse(JSON.stringify(DEFAULT_ACCOUNT_PROFILE)) as AccountProfile;
  profile.accountName = accountName.trim() || DEFAULT_ACCOUNT_PROFILE.accountName;
  profile.createdAt = new Date().toISOString();

  if (customerExperience) profile.customerExperience = customerExperience;

  const first = (metric: AdditionalMetricKey): AdditionalMetricDraft | undefined =>
    drafts.find((draft) => draft.metric === metric);
  const resolve2hr = first('resolve2hr');
  const resolve3d = first('resolve3d');
  const handoffs = first('handoffs');
  const dpc = first('dpc');
  const vtt = first('vtt');
  const credit = first('credit');

  if (resolve2hr) {
    profile.resolveRate.shortTerm = {
      tracked: true,
      windowLabel: resolve2hr.windowLabel || '2 hour',
      data: resolve2hr.data,
      target: resolve2hr.target,
    };
  }
  if (resolve3d) {
    profile.resolveRate.longTerm = {
      tracked: true,
      windowLabel: resolve3d.windowLabel || '3 day',
      data: resolve3d.data,
      target: resolve3d.target,
    };
  }
  if (handoffs) {
    profile.handoffs = { label: 'Hand-offs', data: handoffs.data, target: handoffs.target };
  }
  profile.dpc = dpc
    ? { tracked: true, data: dpc.data, target: dpc.target }
    : { tracked: false };
  profile.vtt = vtt
    ? { tracked: true, requiredMessages: (vtt.requiredMessages || []) as never, data: vtt.data, target: vtt.target }
    : { tracked: false, requiredMessages: [] };
  if (credit) {
    profile.credit = {
      calcStyle: credit.calcStyle || 'frequency',
      label: credit.calcStyle === 'per-call-average' ? 'Net OCC' : 'Credit',
      data: credit.data,
      target: credit.target,
      lowerIsBetter: credit.lowerIsBetter ?? true,
    };
  }

  profile.sales.mobile.smartphones = { tracked: false, label: 'Phone Lines', targetStyle: { kind: 'flat', value: 0 } };
  profile.sales.mobile.dataLines = { tracked: false, label: 'Data Lines', targetStyle: { kind: 'flat', value: 0 } };
  profile.sales.internet.fiber = { tracked: false, label: 'Fiber', targetStyle: { kind: 'flat', value: 0 } };
  profile.sales.internet.fixedWireless = { tracked: false, label: 'VHI', targetStyle: { kind: 'flat', value: 0 } };
  profile.sales.internet.hotspot = { tracked: false, label: 'Hotspot', targetStyle: { kind: 'flat', value: 0 } };

  for (const draft of drafts) {
    const targetStyle = draft.targetStyle || { kind: 'flat', value: draft.target };
    const line = { tracked: true, label: draft.header, matchedColumn: draft.header, targetStyle };
    if (draft.metric === 'phoneAdds') profile.sales.mobile.smartphones = line;
    if (draft.metric === 'dataLines') profile.sales.mobile.dataLines = line;
    if (draft.metric === 'fiber') profile.sales.internet.fiber = line;
    if (draft.metric === 'vhi') profile.sales.internet.fixedWireless = line;
    if (draft.metric === 'hotspot') profile.sales.internet.hotspot = line;
  }

  return profile;
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

export interface ManageMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMemoryChange?: () => void;
}

export const ManageMemoryModal: React.FC<ManageMemoryModalProps> = ({
  isOpen,
  onClose,
  onMemoryChange,
}) => {
  const [entries, setEntries] = useState<MappingMemoryEntry[]>(() => getAllLearnedMappings());
  const [filterText, setFilterText] = useState('');

  const refreshEntries = React.useCallback(() => {
    setEntries(getAllLearnedMappings());
    onMemoryChange?.();
  }, [onMemoryChange]);

  useEffect(() => {
    if (isOpen) {
      refreshEntries();
    }
  }, [isOpen, refreshEntries]);

  if (!isOpen) return null;

  const filteredEntries = entries.filter((e) => {
    const search = filterText.toLowerCase();
    return (
      e.normalizedHeader.toLowerCase().includes(search) ||
      e.mappedField.toLowerCase().includes(search) ||
      getCanonicalFieldLabel(e.mappedField).toLowerCase().includes(search)
    );
  });

  const handleDelete = (header: string, scope?: string) => {
    forgetMapping(header, scope);
    refreshEntries();
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all learned column mappings?')) {
      clearMemory();
      refreshEntries();
    }
  };

  return (
    <div className="ipm-memory-backdrop">
      <div
        className="ipm-memory-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ipm-memory-header">
          <div>
            <h3 className="ipm-section-title">
              <span>🧠</span> Learned Column Mappings
            </h3>
            <p className="ipm-section-desc">
              These mappings are saved in your browser from previous manual corrections.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ipm-close-btn"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="ipm-memory-toolbar">
          <input
            type="text"
            placeholder="Search learned mappings..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="ipm-memory-input"
          />
          {entries.length > 0 && (
            <button
              onClick={handleClearAll}
              className="ipm-clear-btn"
            >
              Clear All Memory
            </button>
          )}
        </div>

        {/* Table Body */}
        <div className="ipm-memory-body">
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
              <span style={{ fontSize: '1.8rem', display: 'block', marginBottom: '8px' }}>💡</span>
              No learned mappings yet. Whenever you manually map a column in the preview modal, it will be remembered here!
            </div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
              No mappings match &quot;{filterText}&quot;.
            </div>
          ) : (
            <table className="ipm-table">
              <thead>
                <tr>
                  <th>Header</th>
                  <th>Mapped Field</th>
                  <th style={{ textAlign: 'center' }}>Uses</th>
                  <th>Last Seen</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((item) => (
                  <tr key={`${item.normalizedHeader}-${item.scope || 'global'}`}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                        {item.normalizedHeader}
                      </span>
                      {item.scope && (
                        <span className="ipm-pattern-badge" style={{ marginLeft: '6px' }}>
                          {item.scope}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{getCanonicalFieldLabel(item.mappedField)}</span>{' '}
                      <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.7rem' }}>({item.mappedField})</span>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', color: '#64748b' }}>
                      {item.count}
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.75rem' }}>
                      {item.lastSeen || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(item.normalizedHeader, item.scope)}
                        style={{
                          fontSize: '0.75rem',
                          color: '#e11d48',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: '4px'
                        }}
                        title="Forget this mapping"
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {entries.length} total mapping{entries.length === 1 ? '' : 's'} stored
          </span>
          <button
            onClick={onClose}
            className="ipm-btn-cancel"
            style={{ padding: '6px 14px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const normalizeSkippedSheet = (item: string | SkippedSheetInfo): SkippedSheetInfo => {
  if (typeof item === 'string') {
    return {
      sheetName: item,
      reason: 'Empty sheet or non-data content',
    };
  }
  return item;
};

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  isOpen,
  accountName,
  sheets,
  skippedSheets,
  fileName,
  onConfirm,
  onCancel,
}) => {
  const [sheetStates, setSheetStates] = useState<LocalSheetState[]>([]);
  const [skippedList, setSkippedList] = useState<SkippedSheetInfo[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [showManageMemory, setShowManageMemory] = useState(false);
  const [learnedCount, setLearnedCount] = useState<number>(() => getLearnedMappingsCount());
  const [applyAllNotice, setApplyAllNotice] = useState<string | null>(null);
  const [customerExperienceConfigByHeader, setCustomerExperienceConfigByHeader] = useState<
    Record<string, CustomerExperienceConfig | null>
  >({});
  const [additionalMetricDrafts, setAdditionalMetricDrafts] = useState<Record<string, AdditionalMetricDraft>>({});

  const currentSheet = sheetStates[activeSheetIndex];

  useEffect(() => {
    if (isOpen && sheets && sheets.length > 0) {
      setSheetStates(buildInitialSheetStates(sheets));
      setActiveSheetIndex(0);
      setLearnedCount(getLearnedMappingsCount());
    } else {
      setSheetStates([]);
      setActiveSheetIndex(0);
    }
  }, [isOpen, sheets]);

  useEffect(() => {
    if (isOpen && skippedSheets && skippedSheets.length > 0) {
      setSkippedList(skippedSheets.map(normalizeSkippedSheet));
    } else {
      setSkippedList([]);
    }
  }, [isOpen, skippedSheets]);

  useEffect(() => {
    if (!isOpen || !currentSheet) return;

    setCustomerExperienceConfigByHeader((prev) => {
      const next = { ...prev };
      for (const col of currentSheet.columnMappings) {
        if (col.mappedField !== 'vxs') continue;
        const header = String(col.header ?? '').trim();
        if (!header) continue;
        if (!next[header]) {
          const sampleValues = extractSampleValues(currentSheet.table, col.index);
          next[header] = buildDefaultCustomerExperienceConfig(header, sampleValues);
        }
      }
      return next;
    });
  }, [currentSheet, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentSheet) return;

    setAdditionalMetricDrafts((prev) => {
      const next = { ...prev };
      for (const col of currentSheet.columnMappings) {
        const metric = getAdditionalMetricKey(col.mappedField);
        if (!metric) continue;
        const header = String(col.header ?? '').trim();
        if (!header) continue;
        const key = `${metric}:${header}`;
        if (!next[key]) {
          next[key] = buildAdditionalMetricDraft(
            metric,
            header,
            extractSampleValues(currentSheet.table, col.index)
          );
        }
      }
      return next;
    });
  }, [currentSheet, isOpen]);

  const handleIncludeSkippedSheet = (item: SkippedSheetInfo) => {
    if (!item.table) return;

    const [newSheetState] = buildInitialSheetStates([item.table]);
    if (!newSheetState) return;

    const newIndex = sheetStates.length;
    setSheetStates((prev) => [...prev, newSheetState]);
    setSkippedList((prev) => prev.filter((s) => s.sheetName !== item.sheetName));
    setActiveSheetIndex(newIndex);
  };

  const handleGranularityChange = (sheetIdx: number, newGranularity: string) => {
    setSheetStates((prev) => {
      const next = [...prev];
      const target = { ...next[sheetIdx] };
      const parsedGranularity = newGranularity as SheetGranularity;
      target.selectedGranularity = parsedGranularity;
      target.isConfirmed = parsedGranularity !== 'unknown';
      target.isManuallySet = true;
      next[sheetIdx] = target;
      return next;
    });
  };

  const handleColumnMapChange = (sheetIdx: number, colIndex: number, newField: string) => {
    setSheetStates((prev) => {
      const next = [...prev];
      const target = { ...next[sheetIdx] };
      const updatedMappings = [...target.columnMappings];
      const col = { ...updatedMappings[colIndex] };

      const isClearing = !newField || newField === '' || newField === 'none';

      if (isClearing) {
        forgetMapping(col.header);
        col.mappedField = null;
        col.confidence = 'none';
        col.isLowConfidence = false;
        col.matchType = 'unmapped';
      } else {
        rememberMapping(col.header, newField);
        col.mappedField = newField;
        col.confidence = 'remembered';
        col.isLowConfidence = false;
        col.matchType = 'remembered';

        if (newField === 'vxs') {
          const header = String(col.header ?? '').trim();
          const sampleValues = extractSampleValues(target.table, col.index);
          setCustomerExperienceConfigByHeader((prev) => ({
            ...prev,
            [header]: prev[header] ?? buildDefaultCustomerExperienceConfig(header, sampleValues),
          }));
        } else if (newField) {
          const metric = getAdditionalMetricKey(newField);
          if (metric) {
            const header = String(col.header ?? '').trim();
            setAdditionalMetricDrafts((prev) => ({
              ...prev,
              [`${metric}:${header}`]: prev[`${metric}:${header}`] ?? buildAdditionalMetricDraft(
                metric,
                header,
                extractSampleValues(target.table, col.index)
              ),
            }));
          }
        }
      }

      updatedMappings[colIndex] = col;
      target.columnMappings = updatedMappings;

      const headerMappings: SheetHeaderMapping[] = updatedMappings.map((m) => ({
        original: m.header,
        normalized: m.normalized,
        mappedField: m.mappedField,
        index: m.index,
      }));

      // Re-evaluate granularity detection with updated mappings
      const detected = detectGranularity(target.table, headerMappings);
      target.detectedGranularity = detected.classification;
      const confidence = evaluateGranularityConfidence(detected, updatedMappings);
      target.granularityConfidence = confidence.isHighConfidence ? 'high' : 'low';
      target.granularityReason = confidence.reason;

      // If not manually set, update selected granularity and confirmation
      if (!target.isManuallySet) {
        if (confidence.isHighConfidence) {
          target.selectedGranularity = detected.classification;
          target.isConfirmed = true;
        } else {
          target.selectedGranularity = detected.classification !== 'unknown' ? detected.classification : 'unknown';
          target.isConfirmed = false;
        }
      }

      next[sheetIdx] = target;
      return next;
    });

    setLearnedCount(getLearnedMappingsCount());
  };

  const handleBulkIgnoreUnmapped = (sheetIdx: number) => {
    setSheetStates((prev) => {
      const next = [...prev];
      const target = { ...next[sheetIdx] };
      const updatedMappings = target.columnMappings.map((col) => {
        if (!col.mappedField) {
          return {
            ...col,
            mappedField: null,
            confidence: 'none' as const,
            isLowConfidence: false,
            matchType: 'unmapped' as const,
          };
        }
        return col;
      });

      target.columnMappings = updatedMappings;

      const headerMappings: SheetHeaderMapping[] = updatedMappings.map((m) => ({
        original: m.header,
        normalized: m.normalized,
        mappedField: m.mappedField,
        index: m.index,
      }));

      const detected = detectGranularity(target.table, headerMappings);
      target.detectedGranularity = detected.classification;
      const confidence = evaluateGranularityConfidence(detected, updatedMappings);
      target.granularityConfidence = confidence.isHighConfidence ? 'high' : 'low';
      target.granularityReason = confidence.reason;

      if (!target.isManuallySet) {
        if (confidence.isHighConfidence) {
          target.selectedGranularity = detected.classification;
          target.isConfirmed = true;
        } else {
          target.selectedGranularity = detected.classification !== 'unknown' ? detected.classification : 'unknown';
          target.isConfirmed = false;
        }
      }

      next[sheetIdx] = target;
      return next;
    });
  };

  const handleApplyMappingsToMatching = () => {
    const targets = findMatchingSheets(activeSheetIndex, sheetStates);
    if (targets.length === 0) return;
    setSheetStates((prev) => applyMappingsToSheets(activeSheetIndex, targets, prev));
    setApplyAllNotice(
      `Mappings applied to ${targets.length} matching sheet${targets.length > 1 ? 's' : ''}.`
    );
    setTimeout(() => setApplyAllNotice(null), 4000);
  };

  const matchingSheetIndices = useMemo(
    () => findMatchingSheets(activeSheetIndex, sheetStates),
    [activeSheetIndex, sheetStates]
  );

  const allConfirmed = useMemo(() => {
    if (!sheetStates.length) return false;
    return sheetStates.every((sheet) => sheet.isConfirmed && sheet.selectedGranularity !== 'unknown');
  }, [sheetStates]);

  const confirmedCount = useMemo(() => {
    return sheetStates.filter((sheet) => sheet.isConfirmed && sheet.selectedGranularity !== 'unknown').length;
  }, [sheetStates]);

  const workbookGroups = useMemo(() => {
    const groups: {
      workbookName: string;
      sheets: { sheet: LocalSheetState; globalIndex: number }[];
    }[] = [];
    const map = new Map<string, { workbookName: string; sheets: { sheet: LocalSheetState; globalIndex: number }[] }>();

    sheetStates.forEach((sheet, globalIndex) => {
      const wbName = sheet.workbookName || 'Workbook';
      let group = map.get(wbName);
      if (!group) {
        group = { workbookName: wbName, sheets: [] };
        map.set(wbName, group);
        groups.push(group);
      }
      group.sheets.push({ sheet, globalIndex });
    });

    return groups;
  }, [sheetStates]);

  if (!isOpen || (!sheetStates.length && !skippedList.length)) {
    return null;
  }

  const unmappedCount = currentSheet ? currentSheet.columnMappings.filter((c) => !c.mappedField).length : 0;
  const vxsColumns = currentSheet ? currentSheet.columnMappings.filter((c) => c.mappedField === 'vxs') : [];
  const additionalColumns = currentSheet
    ? currentSheet.columnMappings.filter((col) => getAdditionalMetricKey(col.mappedField))
    : [];

  const handleCustomerExperienceFieldChange = (
    header: string,
    patch: Partial<CustomerExperienceConfig>
  ) => {
    setCustomerExperienceConfigByHeader((prev) => {
      const current = prev[header] ?? buildDefaultCustomerExperienceConfig(header, []);
      return {
        ...prev,
        [header]: {
          ...current,
          ...patch,
          data: {
            ...current.data,
            matchedColumns: [header],
          },
        },
      };
    });
  };

  const handleAdditionalMetricChange = (
    key: string,
    patch: Partial<AdditionalMetricDraft>
  ) => {
    setAdditionalMetricDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const handleCommit = () => {
    if (!allConfirmed) return;

    const sheetConfigs: Record<
      string,
      {
        granularity: SheetGranularity;
        columnMappings: Record<string, string | null>;
      }
    > = {};

    for (let idx = 0; idx < sheetStates.length; idx += 1) {
      const sheet = sheetStates[idx];
      const mappings: Record<string, string | null> = {};
      for (const col of sheet.columnMappings) {
        mappings[col.header] = col.mappedField;
      }
      const config = {
        granularity: sheet.selectedGranularity,
        columnMappings: mappings,
      };

      if (sheet.workbookName) {
        sheetConfigs[`${sheet.workbookName}::${sheet.sheetName}`] = config;
      }
      sheetConfigs[sheet.sheetName] = config;
      sheetConfigs[idx] = config;
    }

    const profile = buildAccountProfile(
      accountName,
      Object.values(customerExperienceConfigByHeader).find(Boolean) ?? null,
      Object.values(additionalMetricDrafts)
    );

    onConfirm({ sheetConfigs, accountProfile: profile });
  };

  return (
    <>
      <div className="ipm-backdrop">
        <div
          className="ipm-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="ipm-header">
            <div>
              <h2 className="ipm-header-title">
                <span>📥</span> Import Setup
              </h2>
              <p className="ipm-header-subtitle">
                {fileName ? `${fileName} • ` : ''}
                {sheetStates.length} sheet{sheetStates.length !== 1 ? 's' : ''} detected
                {workbookGroups.length > 1 ? ` across ${workbookGroups.length} workbooks` : ''}
                {skippedList.length > 0 ? ` (${skippedList.length} skipped)` : ''}.
                {sheetStates.length > 0
                  ? ' Set up your account and verify the data before importing.'
                  : ' Review skipped sheets below to include.'}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="ipm-close-btn"
              title="Cancel import"
            >
              ✕
            </button>
          </div>

          {/* Sheet Tabs grouped by workbook if multi-sheet */}
          {sheetStates.length > 1 && (
            <div className="ipm-tabs-container">
              {workbookGroups.length > 1
                ? workbookGroups.map((group) => (
                    <div
                      key={group.workbookName}
                      className="ipm-workbook-group"
                    >
                      <div
                        className="ipm-workbook-badge"
                        title={group.workbookName}
                      >
                        <span>📁</span>
                        <span className="ipm-workbook-name">{group.workbookName}</span>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 'normal' }}>
                          ({group.sheets.length})
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {group.sheets.map(({ sheet, globalIndex }) => {
                          const isActive = globalIndex === activeSheetIndex;
                          const isReady =
                            sheet.isConfirmed && sheet.selectedGranularity !== 'unknown';

                          return (
                            <button
                              key={`${sheet.workbookName}::${sheet.sheetName}::${globalIndex}`}
                              onClick={() => setActiveSheetIndex(globalIndex)}
                              className={`ipm-tab-btn ${isActive ? 'active' : ''}`}
                              title={`${sheet.workbookName} › ${sheet.sheetName}`}
                            >
                              <span>{isReady ? '✅' : '⚠️'}</span>
                              <span>{sheet.sheetName}</span>
                              <span style={{ fontSize: '0.7rem', opacity: 0.7, fontFamily: 'monospace' }}>
                                ({sheet.rowCount.toLocaleString()})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                : sheetStates.map((sheet, idx) => {
                    const isActive = idx === activeSheetIndex;
                    const isReady =
                      sheet.isConfirmed && sheet.selectedGranularity !== 'unknown';

                    return (
                      <button
                        key={`${sheet.workbookName}::${sheet.sheetName}::${idx}`}
                        onClick={() => setActiveSheetIndex(idx)}
                        className={`ipm-tab-btn ${isActive ? 'active' : ''}`}
                      >
                        <span>{isReady ? '✅' : '⚠️'}</span>
                        <span>{sheet.sheetName}</span>
                        <span style={{ fontSize: '0.7rem', opacity: 0.7, fontFamily: 'monospace' }}>
                          ({sheet.rowCount.toLocaleString()} rows)
                        </span>
                      </button>
                    );
                  })}
            </div>
          )}

          {/* Modal Scrollable Body */}
          <div className="ipm-body">
            {/* Skipped Sheets Banner */}
            {skippedList.length > 0 && (
              <div className="ipm-skipped-banner">
                <div className="ipm-skipped-header">
                  <div className="ipm-skipped-title">
                    <span>⚠️</span>
                    <span>
                      {skippedList.length} sheet{skippedList.length > 1 ? 's were' : ' was'} skipped during auto-detection
                    </span>
                  </div>
                  <span className="ipm-skipped-subtitle">
                    Review reasons below or click &ldquo;+ Include Sheet&rdquo; to import
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {skippedList.map((item, idx) => (
                    <div
                      key={`${item.sheetName}-${idx}`}
                      className="ipm-skipped-item"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.sheetName}</span>
                        {item.workbookName && (
                          <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                            [{item.workbookName}]
                          </span>
                        )}
                        <span style={{ color: '#94a3b8' }}>•</span>
                        <span style={{ fontSize: '0.75rem', color: '#92400e', fontStyle: 'italic' }}>
                          {item.reason}
                        </span>
                      </div>
                      {item.table ? (
                        <button
                          type="button"
                          onClick={() => handleIncludeSkippedSheet(item)}
                          className="ipm-include-btn"
                          title={`Include "${item.sheetName}" in import`}
                        >
                          + Include Sheet
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                          No data rows
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!currentSheet ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📋</div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                  No Sheets Currently Selected
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', maxWidth: '440px', marginInline: 'auto' }}>
                  No sheets were automatically recognized as operational data. If your workbook contains valid data, click <strong style={{ color: '#2563eb' }}>+ Include Sheet</strong> in the notice above to import and configure that sheet.
                </p>
              </div>
            ) : (
              <>
                {/* Section 1: Granularity Verification */}
                <div className="ipm-section">
                  <div className="ipm-section-header">
                    <div>
                      <h3 className="ipm-section-title">
                        <span>📊</span> 1. Sheet Data Granularity:{' '}
                        {currentSheet.workbookName && (
                          <span style={{ color: '#64748b', fontWeight: 500 }}>{currentSheet.workbookName} › </span>
                        )}
                        <span style={{ color: '#2563eb' }}>{currentSheet.sheetName}</span>
                      </h3>
                      <p className="ipm-section-desc">
                        {currentSheet.granularityReason || 'Determines whether rows are daily summaries or call/ticket-level transactions.'}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {currentSheet.isConfirmed && currentSheet.selectedGranularity !== 'unknown' ? (
                        <span className="ipm-badge ipm-badge-exact">
                          <span>✓</span> {currentSheet.isManuallySet ? 'Manually Confirmed' : 'Auto-Confirmed (High Confidence)'}
                        </span>
                      ) : (
                        <span className="ipm-badge ipm-badge-low">
                          <span>⚠️</span> Needs Confirmation
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Granularity Selector / Override */}
                  <div className="ipm-granularity-row">
                    <label htmlFor="granularity-select" className="ipm-label">
                      Granularity Setting:
                    </label>
                    <select
                      id="granularity-select"
                      value={currentSheet.selectedGranularity}
                      onChange={(e) => handleGranularityChange(activeSheetIndex, e.target.value)}
                      className={`ipm-select ${currentSheet.selectedGranularity === 'unknown' ? 'ipm-select-warning' : ''}`}
                      style={{ flex: '1 1 320px', maxWidth: '460px' }}
                    >
                      <option value="aggregate">Aggregate (Daily Summary — ~1 row per agent/day)</option>
                      <option value="transaction">Transaction (Call/Ticket Level — will be aggregated by agent &amp; date)</option>
                      {currentSheet.selectedGranularity === 'unknown' && (
                        <option value="unknown" disabled>
                          ⚠️ Please select granularity to confirm...
                        </option>
                      )}
                    </select>

                    {currentSheet.isManuallySet && (
                      <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>
                        Manual override applied
                      </span>
                    )}
                  </div>
                </div>

                {/* Section 2: Column Mapping Verification */}
                <div className="ipm-section">
                  <div className="ipm-section-header">
                    <div>
                      <h3 className="ipm-section-title">
                        <span>🗺️</span> 2. Column Mapping &amp; Confidence Table:{' '}
                        {currentSheet.workbookName && (
                          <span style={{ color: '#64748b', fontWeight: 500 }}>{currentSheet.workbookName} › </span>
                        )}
                        <span style={{ color: '#2563eb' }}>{currentSheet.sheetName}</span>
                      </h3>
                      <p className="ipm-section-desc">
                        Headers matched using multi-signal scoring (header, data patterns, and learned memory). Verify or adjust mappings before importing.
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace', fontWeight: 600 }}>
                        {currentSheet.columnMappings.filter((c) => c.mappedField).length} of {currentSheet.columnMappings.length} mapped
                      </span>

                      {unmappedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleBulkIgnoreUnmapped(activeSheetIndex)}
                          className="ipm-btn ipm-btn-secondary"
                          title="Set all unresolved columns on this sheet to None (Ignore)"
                        >
                          <span>🚫</span> Ignore All Unmapped ({unmappedCount})
                        </button>
                      )}

                      {sheetStates.length > 1 && (
                        <button
                          type="button"
                          onClick={handleApplyMappingsToMatching}
                          disabled={matchingSheetIndices.length === 0}
                          className="ipm-btn ipm-btn-primary"
                          title={
                            matchingSheetIndices.length > 0
                              ? `Copy this sheet's column mappings to ${matchingSheetIndices.length} other sheet${matchingSheetIndices.length > 1 ? 's' : ''} with the same headers`
                              : 'No other loaded sheets share the same headers as this sheet'
                          }
                        >
                          <span>⚡</span>
                          {matchingSheetIndices.length > 0
                            ? `Apply to ${matchingSheetIndices.length} matching sheet${matchingSheetIndices.length > 1 ? 's' : ''}`
                            : 'No matching sheets'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Apply-all success notice */}
                  {applyAllNotice && (
                    <div className="ipm-success-toast">
                      <span>✅</span>
                      <span>{applyAllNotice}</span>
                      <button
                        type="button"
                        onClick={() => setApplyAllNotice(null)}
                        style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#1e40af', fontSize: '0.9rem' }}
                        aria-label="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Column Mapping Table */}
                  <div className="ipm-table-card">
                    <table className="ipm-table">
                      <thead>
                        <tr>
                          <th>Original Header</th>
                          <th>Sample Value</th>
                          <th>Match Confidence</th>
                          <th>Mapped Field</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentSheet.columnMappings.map((col) => {
                          const sample = col.sampleValues && col.sampleValues.length > 0 ? col.sampleValues[0] : '—';
                          const isRemembered = col.confidence === 'remembered' || col.matchType === 'remembered';

                          return (
                            <tr
                              key={`${currentSheet.sheetName}-${col.index}-${col.header}`}
                              className={isRemembered ? 'row-remembered' : col.isLowConfidence ? 'row-low-confidence' : ''}
                            >
                              <td>
                                <div className="ipm-header-name-cell">
                                  <span className="ipm-col-header-text">
                                    {col.header || <span style={{ fontStyle: 'italic', color: '#94a3b8' }}>Empty Header</span>}
                                  </span>
                                  {col.fingerprint && col.fingerprint !== 'empty' && (
                                    <span
                                      className="ipm-pattern-badge"
                                      title={`Detected value pattern: ${col.fingerprint}`}
                                    >
                                      {col.fingerprint}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="ipm-sample-val" title={String(sample)}>
                                {String(sample)}
                              </td>
                              <td>
                                {isRemembered ? (
                                  <span
                                    className="ipm-badge ipm-badge-remembered"
                                    title={
                                      col.score !== undefined
                                        ? `Remembered from memory • Score: ${col.score}/100`
                                        : 'Remembered from previous imports in this browser'
                                    }
                                  >
                                    <span>🔁</span> Remembered
                                  </span>
                                ) : col.confidence === 'exact' ? (
                                  <span className="ipm-badge ipm-badge-exact">
                                    ✓ Exact Match
                                  </span>
                                ) : col.isLowConfidence ? (
                                  <span
                                    className="ipm-badge ipm-badge-low"
                                    title={
                                      col.score !== undefined
                                        ? `Confidence score: ${col.score}/100${col.candidates?.[0]?.signals ? ' (' + col.candidates[0].signals.join(', ') + ')' : ''}`
                                        : 'Matched only through token-hint fallback or low-confidence score'
                                    }
                                  >
                                    <span>⚠️</span> Low Confidence {col.score !== undefined ? `(${col.score}%)` : ''}
                                  </span>
                                ) : (
                                  <span className="ipm-badge ipm-badge-unmapped">
                                    — Unmapped
                                  </span>
                                )}
                              </td>
                              <td>
                                <select
                                  value={col.mappedField ?? ''}
                                  onChange={(e) => handleColumnMapChange(activeSheetIndex, col.index, e.target.value)}
                                  className="ipm-select"
                                  style={{
                                    width: '100%',
                                    maxWidth: '280px',
                                    borderColor: isRemembered ? '#c084fc' : col.isLowConfidence ? '#f59e0b' : col.mappedField ? '#94a3b8' : '#cbd5e1',
                                    backgroundColor: isRemembered ? '#faf5ff' : col.isLowConfidence ? '#fffbeb' : '#ffffff',
                                    color: col.mappedField ? '#0f172a' : '#94a3b8',
                                    fontStyle: col.mappedField ? 'normal' : 'italic'
                                  }}
                                >
                                  <option value="">(None / Ignore Column)</option>
                                  {col.candidates && col.candidates.length > 0 && (
                                    <optgroup label="🎯 Top Suggestions (Ranked)">
                                      {col.candidates.map((cand) => (
                                        <option key={`cand-${cand.field}`} value={cand.field}>
                                          {getCanonicalFieldLabel(cand.field)} ({cand.field}) — {cand.score}% match
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label="All Canonical Fields">
                                    {CANONICAL_FIELD_OPTIONS.filter(
                                      (opt) => !col.candidates?.some((cand) => cand.field === opt.value)
                                    ).map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label} ({opt.value})
                                      </option>
                                    ))}
                                  </optgroup>
                                  {col.mappedField &&
                                    !CANONICAL_FIELD_OPTIONS.some((o) => o.value === col.mappedField) &&
                                    !col.candidates?.some((c) => c.field === col.mappedField) && (
                                      <option value={col.mappedField}>{col.mappedField}</option>
                                  )}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>

                  {vxsColumns.length > 0 && (
                    <div className="ipm-section">
                      <div className="ipm-section-header">
                        <div>
                          <h3 className="ipm-section-title">
                            <span>📈</span> 3. Customer Experience Setup
                          </h3>
                          <p className="ipm-section-desc">
                            Review the matched VXS / CSAT / NPS column and confirm whether the raw scores already look like a ready-made percentage or need score-scale configuration.
                          </p>
                        </div>
                      </div>

                      {vxsColumns.map((col) => {
                        const header = String(col.header ?? '').trim();
                        const sampleValues = extractSampleValues(currentSheet.table, col.index);
                        const fingerprint = analyzeColumnValues(sampleValues).fingerprint;
                        const readyRate = isReadyRateFingerprint(fingerprint);
                        const draft = customerExperienceConfigByHeader[header] ?? buildDefaultCustomerExperienceConfig(header, sampleValues);

                        return (
                          <div key={`${header}-metric1`} className="ipm-config-card">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                              <div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>Matched column</div>
                                <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{header}</strong>
                              </div>
                              <span className="ipm-pattern-badge" title={`Detected value pattern: ${fingerprint}`}>
                                {readyRate ? 'Ready-made percentage' : `Raw score pattern: ${fingerprint}`}
                              </span>
                            </div>

                            {readyRate ? (
                              <div style={{ display: 'grid', gap: '12px' }}>
                                <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                                  This column already looks like a precomputed percentage, so only the target needs confirmation.
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <label style={{ fontWeight: 600, minWidth: '90px' }}>Target</label>
                                  <input
                                    type="number"
                                    value={draft.target ?? 0}
                                    onChange={(e) =>
                                      handleCustomerExperienceFieldChange(header, {
                                        target: Number(e.target.value || 0),
                                      })
                                    }
                                    style={{ width: '120px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                  />
                                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>%</span>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gap: '16px' }}>
                                <div>
                                  <div style={{ fontWeight: 700, marginBottom: '8px' }}>1) Calc style</div>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {(['csat-percentage', 'nps'] as const).map((style) => (
                                      <button
                                        key={style}
                                        type="button"
                                        onClick={() =>
                                          handleCustomerExperienceFieldChange(header, {
                                            classification: {
                                              ...(draft.classification ?? {
                                                scale: { min: 1, max: 5 },
                                                promoterRange: { min: 4, max: 5 },
                                                detractorRange: { min: 1, max: 1 },
                                              }),
                                              calcStyle: style,
                                            },
                                          })
                                        }
                                        style={{
                                          padding: '8px 14px',
                                          borderRadius: '8px',
                                          border: draft.classification?.calcStyle === style ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                          background: draft.classification?.calcStyle === style ? '#dbeafe' : '#ffffff',
                                          color: '#0f172a',
                                          cursor: 'pointer',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {style === 'csat-percentage' ? 'CSAT %' : 'NPS'}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <div style={{ fontWeight: 700, marginBottom: '8px' }}>2) Rating scale and promoter/detractor bands</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                                      Scale min
                                      <input
                                        type="number"
                                        value={draft.classification?.scale?.min ?? 1}
                                        onChange={(e) =>
                                          handleCustomerExperienceFieldChange(header, {
                                            classification: {
                                              ...(draft.classification ?? {
                                                calcStyle: 'csat-percentage',
                                                scale: { min: 1, max: 5 },
                                                promoterRange: { min: 4, max: 5 },
                                                detractorRange: { min: 1, max: 1 },
                                              }),
                                              scale: {
                                                ...(draft.classification?.scale ?? { min: 1, max: 5 }),
                                                min: Number(e.target.value || 0),
                                              },
                                            },
                                          })
                                        }
                                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                      />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                                      Scale max
                                      <input
                                        type="number"
                                        value={draft.classification?.scale?.max ?? 5}
                                        onChange={(e) =>
                                          handleCustomerExperienceFieldChange(header, {
                                            classification: {
                                              ...(draft.classification ?? {
                                                calcStyle: 'csat-percentage',
                                                scale: { min: 1, max: 5 },
                                                promoterRange: { min: 4, max: 5 },
                                                detractorRange: { min: 1, max: 1 },
                                              }),
                                              scale: {
                                                ...(draft.classification?.scale ?? { min: 1, max: 5 }),
                                                max: Number(e.target.value || 0),
                                              },
                                            },
                                          })
                                        }
                                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                      />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                                      Promoter min
                                      <input
                                        type="number"
                                        value={draft.classification?.promoterRange?.min ?? 4}
                                        onChange={(e) =>
                                          handleCustomerExperienceFieldChange(header, {
                                            classification: {
                                              ...(draft.classification ?? {
                                                calcStyle: 'csat-percentage',
                                                scale: { min: 1, max: 5 },
                                                promoterRange: { min: 4, max: 5 },
                                                detractorRange: { min: 1, max: 1 },
                                              }),
                                              promoterRange: {
                                                ...(draft.classification?.promoterRange ?? { min: 4, max: 5 }),
                                                min: Number(e.target.value || 0),
                                              },
                                            },
                                          })
                                        }
                                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                      />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                                      Promoter max
                                      <input
                                        type="number"
                                        value={draft.classification?.promoterRange?.max ?? 5}
                                        onChange={(e) =>
                                          handleCustomerExperienceFieldChange(header, {
                                            classification: {
                                              ...(draft.classification ?? {
                                                calcStyle: 'csat-percentage',
                                                scale: { min: 1, max: 5 },
                                                promoterRange: { min: 4, max: 5 },
                                                detractorRange: { min: 1, max: 1 },
                                              }),
                                              promoterRange: {
                                                ...(draft.classification?.promoterRange ?? { min: 4, max: 5 }),
                                                max: Number(e.target.value || 0),
                                              },
                                            },
                                          })
                                        }
                                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                      />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                                      Detractor min
                                      <input
                                        type="number"
                                        value={draft.classification?.detractorRange?.min ?? 1}
                                        onChange={(e) =>
                                          handleCustomerExperienceFieldChange(header, {
                                            classification: {
                                              ...(draft.classification ?? {
                                                calcStyle: 'csat-percentage',
                                                scale: { min: 1, max: 5 },
                                                promoterRange: { min: 4, max: 5 },
                                                detractorRange: { min: 1, max: 1 },
                                              }),
                                              detractorRange: {
                                                ...(draft.classification?.detractorRange ?? { min: 1, max: 1 }),
                                                min: Number(e.target.value || 0),
                                              },
                                            },
                                          })
                                        }
                                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                      />
                                    </label>
                                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: '#475569' }}>
                                      Detractor max
                                      <input
                                        type="number"
                                        value={draft.classification?.detractorRange?.max ?? 1}
                                        onChange={(e) =>
                                          handleCustomerExperienceFieldChange(header, {
                                            classification: {
                                              ...(draft.classification ?? {
                                                calcStyle: 'csat-percentage',
                                                scale: { min: 1, max: 5 },
                                                promoterRange: { min: 4, max: 5 },
                                                detractorRange: { min: 1, max: 1 },
                                              }),
                                              detractorRange: {
                                                ...(draft.classification?.detractorRange ?? { min: 1, max: 1 }),
                                                max: Number(e.target.value || 0),
                                              },
                                            },
                                          })
                                        }
                                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                      />
                                    </label>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <label style={{ fontWeight: 600, minWidth: '90px' }}>Target</label>
                                  <input
                                    type="number"
                                    value={draft.target ?? 0}
                                    onChange={(e) =>
                                      handleCustomerExperienceFieldChange(header, {
                                        target: Number(e.target.value || 0),
                                      })
                                    }
                                    style={{ width: '120px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                  />
                                  <span style={{ color: '#64748b', fontSize: '0.8rem' }}>%</span>
                                </div>
                              </div>
                            )}

                            <div style={{ marginTop: '12px', padding: '8px 10px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#334155', fontSize: '0.78rem' }}>
                              <strong>Review:</strong>{' '}
                              {draft.data.shape === 'ready-rate'
                                ? `Ready-rate column with target ${draft.target}%`
                                : `Raw-score config: ${draft.classification?.calcStyle === 'nps' ? 'NPS' : 'CSAT %'} • scale ${draft.classification?.scale?.min}-${draft.classification?.scale?.max} • promoter ${draft.classification?.promoterRange?.min}-${draft.classification?.promoterRange?.max} • detractor ${draft.classification?.detractorRange?.min}-${draft.classification?.detractorRange?.max} • target ${draft.target}%`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {additionalColumns.length > 0 && (
                    <div className="ipm-section">
                      <div className="ipm-section-header">
                        <div>
                          <h3 className="ipm-section-title"><span>⚙️</span> 4. Additional Account Metric Configuration</h3>
                          <p className="ipm-section-desc">
                            Only matched metrics appear here. Values already answered by the column pattern or header are prefilled; confirm the remaining business rules and target.
                          </p>
                        </div>
                      </div>

                      {additionalColumns.map((col) => {
                        const metric = getAdditionalMetricKey(col.mappedField);
                        if (!metric) return null;
                        const header = String(col.header ?? '').trim();
                        const key = `${metric}:${header}`;
                        const sampleValues = extractSampleValues(currentSheet.table, col.index);
                        const draft = additionalMetricDrafts[key] ?? buildAdditionalMetricDraft(metric, header, sampleValues);
                        const readyRate = draft.data.shape === 'ready-rate';
                        const label = metric === 'resolve2hr'
                          ? 'Resolve Rate (short-term)'
                          : metric === 'resolve3d'
                            ? 'Resolve Rate (long-term)'
                            : metric === 'phoneAdds'
                              ? 'Sales — Smartphones'
                              : metric === 'dataLines'
                                ? 'Sales — Data Lines'
                                : metric === 'fiber'
                                  ? 'Sales — Fiber'
                                  : metric === 'vhi'
                                    ? 'Sales — Fixed Wireless'
                                    : metric === 'hotspot'
                                      ? 'Sales — Hotspot'
                                      : metric === 'handoffs'
                                        ? 'Hand-offs / Transfer Rate'
                                        : metric === 'dpc'
                                          ? 'DPC'
                                          : metric === 'vtt'
                                            ? 'VTT / Required Disclosure'
                                            : 'Credit';

                        return (
                          <div key={key} className="ipm-config-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                              <div>
                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{label}</div>
                                <strong style={{ color: '#0f172a' }}>{header}</strong>
                              </div>
                              <span className="ipm-pattern-badge">{readyRate ? 'Ready-made rate' : `Detected: ${analyzeColumnValues(sampleValues).fingerprint}`}</span>
                            </div>

                            {(metric === 'resolve2hr' || metric === 'resolve3d') && !draft.windowLabel && (
                              <label style={{ display: 'grid', gap: '6px', marginBottom: '12px', fontSize: '0.8rem', color: '#475569' }}>
                                What window does this column represent?
                                <select
                                  value={draft.windowLabel ?? ''}
                                  onChange={(e) => handleAdditionalMetricChange(key, { windowLabel: e.target.value })}
                                  className="ipm-select"
                                >
                                  <option value="">Select a window</option>
                                  <option value="1 hour">1 hour</option>
                                  <option value="2 hour">2 hour</option>
                                  <option value="3 day">3 day</option>
                                  <option value="7 day">7 day</option>
                                </select>
                              </label>
                            )}

                            {metric === 'credit' && !draft.calcStyle && (
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontWeight: 700, marginBottom: '8px' }}>How should Credit be calculated?</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {(['per-call-average', 'total-amount', 'frequency'] as const).map((style) => (
                                    <button
                                      key={style}
                                      type="button"
                                      onClick={() => handleAdditionalMetricChange(key, { calcStyle: style })}
                                      className="ipm-btn ipm-btn-secondary"
                                    >
                                      {style === 'per-call-average' ? 'Per-call average' : style === 'total-amount' ? 'Total amount' : 'Frequency'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(metric === 'phoneAdds' || metric === 'dataLines' || metric === 'fiber' || metric === 'vhi' || metric === 'hotspot') && (
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontWeight: 700, marginBottom: '8px' }}>How should this sales target be expressed?</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {(['flat', 'dynamic-per-agent'] as const).map((kind) => (
                                    <button
                                      key={kind}
                                      type="button"
                                      onClick={() => handleAdditionalMetricChange(key, {
                                        targetStyle: kind === 'flat' ? { kind, value: draft.target } : { kind, multiplier: draft.target },
                                      })}
                                      className="ipm-btn ipm-btn-secondary"
                                    >
                                      {kind === 'flat' ? 'Flat target' : 'Per-agent target'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {metric === 'vtt' && (!draft.requiredMessages || draft.requiredMessages.length === 0) && (
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontWeight: 700, marginBottom: '8px' }}>Which required message does this column measure?</div>
                                {(['view-together', 'terms-and-conditions', 'broadband-facts'] as const).map((message) => {
                                  const checked = draft.requiredMessages?.includes(message) ?? false;
                                  return (
                                    <label key={message} style={{ display: 'block', marginBottom: '6px', color: '#475569' }}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                          const messages = new Set(draft.requiredMessages ?? []);
                                          if (e.target.checked) messages.add(message);
                                          else messages.delete(message);
                                          handleAdditionalMetricChange(key, { requiredMessages: [...messages] });
                                        }}
                                      />{' '}
                                      {message === 'view-together' ? 'View Together' : message === 'terms-and-conditions' ? 'Terms and Conditions' : 'Broadband Facts'}
                                    </label>
                                  );
                                })}
                              </div>
                            )}

                            {metric === 'credit' && draft.calcStyle && (
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#475569' }}>
                                <input
                                  type="checkbox"
                                  checked={draft.lowerIsBetter ?? true}
                                  onChange={(e) => handleAdditionalMetricChange(key, { lowerIsBetter: e.target.checked })}
                                />
                                Lower values are better
                              </label>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <label style={{ fontWeight: 700, minWidth: '90px' }}>Target</label>
                              <input
                                type="number"
                                value={draft.target}
                                onChange={(e) => handleAdditionalMetricChange(key, {
                                  target: Number(e.target.value || 0),
                                  targetStyle: draft.targetStyle?.kind === 'dynamic-per-agent'
                                    ? { kind: 'dynamic-per-agent', multiplier: Number(e.target.value || 0) }
                                    : draft.targetStyle
                                      ? { kind: 'flat', value: Number(e.target.value || 0) }
                                      : undefined,
                                })}
                                style={{ width: '120px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                              />
                              <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{metric === 'phoneAdds' || metric === 'dataLines' || metric === 'fiber' || metric === 'vhi' || metric === 'hotspot' ? 'units' : '%'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="ipm-footer">
            <div className="ipm-footer-left">
              {sheetStates.length === 0 ? (
                <span className="ipm-status-pending">
                  <span>ℹ️</span> No sheets included yet. Click &ldquo;+ Include Sheet&rdquo; on any skipped sheet above to import it.
                </span>
              ) : allConfirmed ? (
                <span className="ipm-status-ready">
                  <span>✅</span> All {sheetStates.length} sheet{sheetStates.length > 1 ? 's' : ''} confirmed and ready to import.
                </span>
              ) : (
                <span className="ipm-status-pending">
                  <span>⚠️</span> Please confirm granularity for all sheets before importing ({confirmedCount}/{sheetStates.length} confirmed).
                </span>
              )}

              {/* Memory Indicator */}
              <div className="ipm-memory-counter">
                <span>🧠</span>
                <span>
                  {learnedCount} mapping{learnedCount === 1 ? '' : 's'} learned
                </span>
                <button
                  type="button"
                  onClick={() => setShowManageMemory(true)}
                  className="ipm-manage-link"
                >
                  Manage
                </button>
              </div>
            </div>

            <div className="ipm-footer-actions">
              <button
                onClick={onCancel}
                className="ipm-btn-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={!allConfirmed || sheetStates.length === 0}
                className="ipm-btn-commit"
                title={
                  sheetStates.length === 0
                    ? 'Please include at least one sheet to import'
                    : !allConfirmed
                      ? 'Please confirm granularity for all sheets first'
                      : 'Commit imported data to dashboard'
                }
              >
                <span>🚀</span>
                <span>
                  {sheetStates.length === 0
                    ? 'No Sheets Included'
                    : allConfirmed
                      ? `Import Data (${sheetStates.length} Sheet${sheetStates.length > 1 ? 's' : ''})`
                      : `Confirm Granularity (${confirmedCount}/${sheetStates.length})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Manage Learned Memory Dialog */}
      <ManageMemoryModal
        isOpen={showManageMemory}
        onClose={() => setShowManageMemory(false)}
        onMemoryChange={() => setLearnedCount(getLearnedMappingsCount())}
      />
    </>
  );
};
