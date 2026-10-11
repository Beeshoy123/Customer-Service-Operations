import React, { useState, useMemo, useEffect } from 'react';
import type {
  SheetTable,
  SheetGranularity,
  SheetHeaderMapping,
  SkippedSheetInfo,
} from './types';
import { detectGranularity, evaluateGranularityConfidence } from './granularityDetector';
import { CANONICAL_FIELD_OPTIONS } from './importPolicy';
import { analyzeColumnValues } from './columnFingerprinter';
import type {
  AccountProfile,
  CustomerExperienceConfig,
} from '../../accountSetup/account-profile-schema';
import { rememberMapping, forgetMapping, getLearnedMappingsCount } from './mappingMemory';
import {
  getCanonicalFieldLabel,
  isReadyRateFingerprint,
  extractSampleValues,
  buildDefaultCustomerExperienceConfig,
  getAdditionalMetricKey,
  buildAdditionalMetricDraft,
  buildAccountProfile,
  buildInitialSheetStates,
  findMatchingSheets,
  applyMappingsToSheets,
  type AdditionalMetricDraft,
  type LocalSheetState,
} from './previewState';
import { ManageMemoryModal } from './ManageMemoryModal';

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
        if (!col.mappedField && col.matchType !== 'ignored_identifier') {
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

  const unmappedCount = currentSheet
    ? currentSheet.columnMappings.filter((c) => !c.mappedField && c.matchType !== 'ignored_identifier').length
    : 0;
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
                        <span className="ipm-workbook-count">
                          ({group.sheets.length})
                        </span>
                      </div>
                      <div className="ipm-tabs-row">
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
                              <span className="ipm-tab-count">
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
                        <span className="ipm-tab-count">
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
                <div className="ipm-skipped-list">
                  {skippedList.map((item, idx) => (
                    <div
                      key={`${item.sheetName}-${idx}`}
                      className="ipm-skipped-item"
                    >
                      <div className="ipm-skipped-item-row">
                        <span className="ipm-skipped-name">{item.sheetName}</span>
                        {item.workbookName && (
                          <span className="ipm-skipped-wb">
                            [{item.workbookName}]
                          </span>
                        )}
                        <span className="ipm-skipped-dot">•</span>
                        <span className="ipm-skipped-reason">
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
                        <span className="ipm-skipped-norows">
                          No data rows
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!currentSheet ? (
              <div className="ipm-empty-state">
                <div className="ipm-empty-state-icon">📋</div>
                <h3 className="ipm-empty-state-title">
                  No Sheets Currently Selected
                </h3>
                <p className="ipm-empty-state-desc">
                  No sheets were automatically recognized as operational data. If your workbook contains valid data, click <strong className="ipm-empty-state-strong">+ Include Sheet</strong> in the notice above to import and configure that sheet.
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
                          <span className="ipm-section-wb">{currentSheet.workbookName} › </span>
                        )}
                        <span className="ipm-section-sheet">{currentSheet.sheetName}</span>
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
                      className={`ipm-select ipm-granularity-select ${currentSheet.selectedGranularity === 'unknown' ? 'ipm-select-warning' : ''}`}
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
                      <span className="ipm-manual-override">
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
                          <span className="ipm-section-wb">{currentSheet.workbookName} › </span>
                        )}
                        <span className="ipm-section-sheet">{currentSheet.sheetName}</span>
                      </h3>
                      <p className="ipm-section-desc">
                        Headers matched using multi-signal scoring (header, data patterns, and learned memory). Verify or adjust mappings before importing.
                      </p>
                    </div>

                    <div className="ipm-toolbar-actions">
                      <span className="ipm-mapped-counter">
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
                        className="ipm-toast-dismiss"
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
                                    {col.header || <span className="ipm-empty-header">Empty Header</span>}
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
                                ) : col.matchType === 'ignored_identifier' ? (
                                  <span
                                    className="ipm-badge ipm-badge-ignored"
                                    title="Identifier-style column (ID/key header or near-unique system IDs) — classified as not-a-metric, excluded from mapping and confirmation"
                                  >
                                    🪪 Identifier — ignored
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
                            <div className="ipm-config-head">
                              <div>
                                <div className="ipm-field-label">Matched column</div>
                                <strong className="ipm-field-value">{header}</strong>
                              </div>
                              <span className="ipm-pattern-badge" title={`Detected value pattern: ${fingerprint}`}>
                                {readyRate ? 'Ready-made percentage' : `Raw score pattern: ${fingerprint}`}
                              </span>
                            </div>

                            {readyRate ? (
                              <div className="ipm-grid-12">
                                <div className="ipm-hint-text">
                                  This column already looks like a precomputed percentage, so only the target needs confirmation.
                                </div>
                                <div className="ipm-target-row">
                                  <label className="ipm-target-label">Target</label>
                                  <input
                                    type="number"
                                    value={draft.target ?? 0}
                                    onChange={(e) =>
                                      handleCustomerExperienceFieldChange(header, {
                                        target: Number(e.target.value || 0),
                                      })
                                    }
                                    className="ipm-target-input"
                                  />
                                  <span className="ipm-unit-suffix">%</span>
                                </div>
                              </div>
                            ) : (
                              <div className="ipm-grid-16">
                                <div>
                                  <div className="ipm-subsection-title">1) Calc style</div>
                                  <div className="ipm-btn-row">
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
                                  <div className="ipm-subsection-title">2) Rating scale and promoter/detractor bands</div>
                                  <div className="ipm-scale-grid">
                                    <label className="ipm-numbered-label">
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
                                        className="ipm-numbered-input"
                                      />
                                    </label>
                                    <label className="ipm-numbered-label">
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
                                        className="ipm-numbered-input"
                                      />
                                    </label>
                                    <label className="ipm-numbered-label">
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
                                        className="ipm-numbered-input"
                                      />
                                    </label>
                                    <label className="ipm-numbered-label">
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
                                        className="ipm-numbered-input"
                                      />
                                    </label>
                                    <label className="ipm-numbered-label">
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
                                        className="ipm-numbered-input"
                                      />
                                    </label>
                                    <label className="ipm-numbered-label">
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
                                        className="ipm-numbered-input"
                                      />
                                    </label>
                                  </div>
                                </div>

                                <div className="ipm-target-row">
                                  <label className="ipm-target-label">Target</label>
                                  <input
                                    type="number"
                                    value={draft.target ?? 0}
                                    onChange={(e) =>
                                      handleCustomerExperienceFieldChange(header, {
                                        target: Number(e.target.value || 0),
                                      })
                                    }
                                    className="ipm-target-input"
                                  />
                                  <span className="ipm-unit-suffix">%</span>
                                </div>
                              </div>
                            )}

                            <div className="ipm-review-strip">
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
                            <div className="ipm-metric-head">
                              <div>
                                <div className="ipm-metric-label">{label}</div>
                                <strong className="ipm-metric-value">{header}</strong>
                              </div>
                              <span className="ipm-pattern-badge">{readyRate ? 'Ready-made rate' : `Detected: ${analyzeColumnValues(sampleValues).fingerprint}`}</span>
                            </div>

                            {(metric === 'resolve2hr' || metric === 'resolve3d') && !draft.windowLabel && (
                              <label className="ipm-window-label">
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
                              <div className="ipm-block-mt12">
                                <div className="ipm-subsection-title">How should Credit be calculated?</div>
                                <div className="ipm-btn-row">
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
                              <div className="ipm-block-mt12">
                                <div className="ipm-subsection-title">How should this sales target be expressed?</div>
                                <div className="ipm-btn-row">
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
                              <div className="ipm-block-mt12">
                                <div className="ipm-subsection-title">Which required message does this column measure?</div>
                                {(['view-together', 'terms-and-conditions', 'broadband-facts'] as const).map((message) => {
                                  const checked = draft.requiredMessages?.includes(message) ?? false;
                                  return (
                                    <label key={message} className="ipm-checkbox-label">
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
                              <label className="ipm-lower-better-label">
                                <input
                                  type="checkbox"
                                  checked={draft.lowerIsBetter ?? true}
                                  onChange={(e) => handleAdditionalMetricChange(key, { lowerIsBetter: e.target.checked })}
                                />
                                Lower values are better
                              </label>
                            )}

                            <div className="ipm-target-row">
                              <label className="ipm-target-label-strong">Target</label>
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
                                className="ipm-target-input"
                              />
                              <span className="ipm-unit-suffix">{metric === 'phoneAdds' || metric === 'dataLines' || metric === 'fiber' || metric === 'vhi' || metric === 'hotspot' ? 'units' : '%'}</span>
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
