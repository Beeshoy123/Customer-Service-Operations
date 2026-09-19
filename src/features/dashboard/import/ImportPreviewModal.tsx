import React, { useState, useMemo, useEffect } from 'react';
import type { SheetTable, SheetGranularity, SheetHeaderMapping, DetectedColumnMapping } from './types';
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

      return detectColumnMappingWithConfidence(headerStr, colIdx, sampleVals);
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
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50/90">
          <div>
            <h3 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
              <span>🧠</span> Learned Column Mappings
            </h3>
            <p className="text-xs text-slate-500 m-0 mt-0.5">
              These mappings are saved in your browser from previous manual corrections.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 bg-transparent border-none text-xl cursor-pointer p-1 rounded-lg"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-white">
          <input
            type="text"
            placeholder="Search learned mappings..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {entries.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer"
            >
              Clear All Memory
            </button>
          )}
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              <span className="text-2xl block mb-2">💡</span>
              No learned mappings yet. Whenever you manually map a column in the preview modal, it will be remembered here!
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No mappings match &quot;{filterText}&quot;.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                  <th className="p-2.5">Header</th>
                  <th className="p-2.5">Mapped Field</th>
                  <th className="p-2.5 text-center">Uses</th>
                  <th className="p-2.5">Last Seen</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((item) => (
                  <tr key={`${item.normalizedHeader}-${item.scope || 'global'}`} className="hover:bg-slate-50/70">
                    <td className="p-2.5 font-mono text-[11px] text-slate-800 font-semibold">
                      {item.normalizedHeader}
                      {item.scope && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] bg-slate-100 text-slate-500 font-normal">
                          {item.scope}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-700">
                      <span className="font-medium">{getCanonicalFieldLabel(item.mappedField)}</span>{' '}
                      <span className="text-slate-400 font-mono text-[10px]">({item.mappedField})</span>
                    </td>
                    <td className="p-2.5 text-center text-slate-500 font-mono">
                      {item.count}
                    </td>
                    <td className="p-2.5 text-slate-500 text-[11px]">
                      {item.lastSeen || '—'}
                    </td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => handleDelete(item.normalizedHeader, item.scope)}
                        className="text-xs text-rose-500 hover:text-rose-700 hover:bg-rose-50 border-none p-1 rounded transition-colors cursor-pointer"
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
        <div className="flex justify-between items-center px-6 py-3 border-t border-slate-200 bg-slate-50/80">
          <span className="text-xs text-slate-500">
            {entries.length} total mapping{entries.length === 1 ? '' : 's'} stored
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  isOpen,
  sheets,
  fileName,
  onConfirm,
  onCancel,
}) => {
  const [sheetStates, setSheetStates] = useState<LocalSheetState[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [showManageMemory, setShowManageMemory] = useState(false);
  const [learnedCount, setLearnedCount] = useState<number>(() => getLearnedMappingsCount());

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

  const allConfirmed = useMemo(() => {
    if (!sheetStates.length) return false;
    return sheetStates.every((sheet) => sheet.isConfirmed && sheet.selectedGranularity !== 'unknown');
  }, [sheetStates]);

  const confirmedCount = useMemo(() => {
    return sheetStates.filter((sheet) => sheet.isConfirmed && sheet.selectedGranularity !== 'unknown').length;
  }, [sheetStates]);

  if (!isOpen || !sheetStates.length || !currentSheet) {
    return null;
  }

  const unmappedCount = currentSheet.columnMappings.filter((c) => !c.mappedField).length;

  const handleCommit = () => {
    if (!allConfirmed) return;

    const sheetConfigs: Record<
      string,
      {
        granularity: SheetGranularity;
        columnMappings: Record<string, string | null>;
      }
    > = {};

    for (const sheet of sheetStates) {
      const mappings: Record<string, string | null> = {};
      for (const col of sheet.columnMappings) {
        mappings[col.header] = col.mappedField;
      }
      sheetConfigs[sheet.sheetName] = {
        granularity: sheet.selectedGranularity,
        columnMappings: mappings,
      };
    }

    onConfirm({ sheetConfigs });
  };

  return (
    <>
      <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in">
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50/80">
            <div>
              <h2 className="text-xl font-bold text-slate-900 m-0 flex items-center gap-2">
                <span>📥</span> Import Preview &amp; Verification
              </h2>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                {fileName ? `${fileName} • ` : ''}
                {sheetStates.length} sheet{sheetStates.length > 1 ? 's' : ''} detected. Confirm granularity and verify column mappings before importing.
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-700 bg-transparent border-none text-2xl cursor-pointer p-1 leading-none rounded-lg"
              title="Cancel import"
            >
              ✕
            </button>
          </div>

          {/* Sheet Tabs if multi-sheet */}
          {sheetStates.length > 1 && (
            <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-200 bg-slate-100/50 overflow-x-auto">
              {sheetStates.map((sheet, idx) => {
                const isActive = idx === activeSheetIndex;
                const isReady = sheet.isConfirmed && sheet.selectedGranularity !== 'unknown';

                return (
                  <button
                    key={sheet.sheetName}
                    onClick={() => setActiveSheetIndex(idx)}
                    className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-xs rounded-t-lg transition-colors cursor-pointer ${
                      isActive
                        ? 'border-blue-600 text-blue-700 bg-white shadow-sm'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <span>{isReady ? '✅' : '⚠️'}</span>
                    <span className="font-semibold">{sheet.sheetName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({sheet.rowCount.toLocaleString()} rows)</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Modal Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Section 1: Granularity Verification */}
            <div className="bg-slate-50/80 rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                    <span>📊</span> 1. Sheet Data Granularity: <span className="text-blue-700">{currentSheet.sheetName}</span>
                  </h3>
                  <p className="text-xs text-slate-500 m-0 mt-0.5">
                    {currentSheet.granularityReason || 'Determines whether rows are daily summaries or call/ticket-level transactions.'}
                  </p>
                </div>

                {/* Status Badge */}
                <div>
                  {currentSheet.isConfirmed && currentSheet.selectedGranularity !== 'unknown' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <span>✓</span> {currentSheet.isManuallySet ? 'Manually Confirmed' : 'Auto-Confirmed (High Confidence)'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                      <span>⚠️</span> Needs Confirmation
                    </span>
                  )}
                </div>
              </div>

              {/* Granularity Selector / Override */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                <label htmlFor="granularity-select" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                  Granularity Setting:
                </label>
                <select
                  id="granularity-select"
                  value={currentSheet.selectedGranularity}
                  onChange={(e) => handleGranularityChange(activeSheetIndex, e.target.value)}
                  className={`flex-1 max-w-md text-xs font-medium p-2.5 rounded-lg border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    currentSheet.selectedGranularity === 'unknown'
                      ? 'border-amber-400 bg-amber-50/30 text-amber-900'
                      : 'border-slate-300 text-slate-800'
                  }`}
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
                  <span className="text-[11px] text-blue-600 font-medium">Manual override applied</span>
                )}
              </div>
            </div>

            {/* Section 2: Column Mapping Verification */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                    <span>🗺️</span> 2. Column Mapping &amp; Confidence Table
                  </h3>
                  <p className="text-xs text-slate-500 m-0 mt-0.5">
                    Headers matched using multi-signal scoring (header, data patterns, and learned memory). Verify or adjust mappings before importing.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="text-xs text-slate-500 font-mono">
                    {currentSheet.columnMappings.filter((c) => c.mappedField).length} of {currentSheet.columnMappings.length} mapped
                  </span>
                  {unmappedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleBulkIgnoreUnmapped(activeSheetIndex)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
                      title="Set all unresolved columns on this sheet to None (Ignore)"
                    >
                      <span>🚫</span> Ignore All Unmapped ({unmappedCount})
                    </button>
                  )}
                </div>
              </div>

              {/* Column Mapping Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Original Header</th>
                      <th className="p-3">Sample Value</th>
                      <th className="p-3">Match Confidence</th>
                      <th className="p-3">Mapped Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {currentSheet.columnMappings.map((col) => {
                      const sample = col.sampleValues && col.sampleValues.length > 0 ? col.sampleValues[0] : '—';
                      const isRemembered = col.confidence === 'remembered' || col.matchType === 'remembered';

                      return (
                        <tr
                          key={`${currentSheet.sheetName}-${col.index}-${col.header}`}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            isRemembered
                              ? 'bg-purple-50/30'
                              : col.isLowConfidence
                                ? 'bg-amber-50/40'
                                : ''
                          }`}
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-800">
                                {col.header || <span className="italic text-slate-400">Empty Header</span>}
                              </span>
                              {col.fingerprint && col.fingerprint !== 'unknown' && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200"
                                  title={`Detected value pattern: ${col.fingerprint}`}
                                >
                                  {col.fingerprint}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-slate-500 font-mono text-[11px] max-w-[150px] truncate" title={sample}>
                            {sample}
                          </td>
                          <td className="p-3">
                            {isRemembered ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300"
                                title={
                                  col.score !== undefined
                                    ? `Remembered from memory • Score: ${col.score}/100`
                                    : 'Remembered from previous imports in this browser'
                                }
                              >
                                <span>🔁</span> Remembered
                              </span>
                            ) : col.confidence === 'exact' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ✓ Exact Match
                              </span>
                            ) : col.isLowConfidence ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                                title={
                                  col.score !== undefined
                                    ? `Confidence score: ${col.score}/100${col.candidates?.[0]?.signals ? ' (' + col.candidates[0].signals.join(', ') + ')' : ''}`
                                    : 'Matched only through token-hint fallback or low-confidence score'
                                }
                              >
                                <span>⚠️</span> Low Confidence {col.score !== undefined ? `(${col.score}%)` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-slate-500 bg-slate-100 border border-slate-200">
                                — Unmapped
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <select
                              value={col.mappedField ?? ''}
                              onChange={(e) => handleColumnMapChange(activeSheetIndex, col.index, e.target.value)}
                              className={`w-full max-w-xs text-xs p-1.5 rounded-md border bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                                isRemembered
                                  ? 'border-purple-300 bg-purple-50/20 text-purple-950 font-medium'
                                  : col.isLowConfidence
                                    ? 'border-amber-400 bg-amber-50/20 text-amber-950 font-medium'
                                    : col.mappedField
                                      ? 'border-slate-300 text-slate-900'
                                      : 'border-slate-200 text-slate-400 italic'
                              }`}
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
          </div>

          {/* Modal Footer */}
          <div className="flex flex-col sm:flex-row justify-between items-center px-6 py-4 border-t border-slate-200 bg-slate-50/80 gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
              {allConfirmed ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                  <span>✅</span> All {sheetStates.length} sheet{sheetStates.length > 1 ? 's' : ''} confirmed and ready to import.
                </span>
              ) : (
                <span className="text-amber-800 font-semibold flex items-center gap-1.5">
                  <span>⚠️</span> Please confirm granularity for all sheets before importing ({confirmedCount}/{sheetStates.length} confirmed).
                </span>
              )}

              {/* Memory Indicator */}
              <div className="flex items-center gap-1.5 text-slate-500 pl-0 sm:pl-3 sm:border-l border-slate-300">
                <span>🧠</span>
                <span>
                  {learnedCount} mapping{learnedCount === 1 ? '' : 's'} learned
                </span>
                <button
                  type="button"
                  onClick={() => setShowManageMemory(true)}
                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium ml-1 cursor-pointer bg-transparent border-none p-0"
                >
                  Manage
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={!allConfirmed}
                className={`px-5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                  allConfirmed
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                    : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                }`}
                title={!allConfirmed ? 'Please confirm granularity for all sheets first' : 'Commit imported data to dashboard'}
              >
                <span>🚀</span>
                <span>
                  {allConfirmed
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
