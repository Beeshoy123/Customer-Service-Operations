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

  const handleIncludeSkippedSheet = (item: SkippedSheetInfo) => {
    if (!item.table) return;

    const [newSheetState] = buildInitialSheetStates([item.table]);
    if (!newSheetState) return;

    const newIndex = sheetStates.length;
    setSheetStates((prev) => [...prev, newSheetState]);
    setSkippedList((prev) => prev.filter((s) => s.sheetName !== item.sheetName));
    setActiveSheetIndex(newIndex);
  };

  const currentSheet = sheetStates[activeSheetIndex];

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

    onConfirm({ sheetConfigs });
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
                <span>📥</span> Import Preview &amp; Verification
              </h2>
              <p className="ipm-header-subtitle">
                {fileName ? `${fileName} • ` : ''}
                {sheetStates.length} sheet{sheetStates.length !== 1 ? 's' : ''} detected
                {workbookGroups.length > 1 ? ` across ${workbookGroups.length} workbooks` : ''}
                {skippedList.length > 0 ? ` (${skippedList.length} skipped)` : ''}.
                {sheetStates.length > 0
                  ? ' Confirm granularity and verify column mappings before importing.'
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
