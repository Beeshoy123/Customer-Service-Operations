// @ts-nocheck
import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  CHART_COLORS,
  DAYS_OF_WEEK,
  DEFAULT_DATE,
  DEFAULT_MANAGER_NAME,
  METRIC_CONFIG,
  PERSONA,
  TARGETS,
} from './config';
import {
  agentMatchesSearch,
  aggregateRecords,
  aggregateTeamMetrics,
  calculateTrend,
  calculateWeightedVSF,
  dowFromDateStr,
  normalizeDate,
} from './helpers';
import {
  runImportService,
  convertWorkbookToSheets,
  selectSheets,
  parseCsvFileText,
  aggregateTransactions,
  validateNormalizedRows,
  mergeNormalizedRows,
  normalizeCellValue,
  normalizeHeaderToField,
} from './import';
import type { SheetTable, SheetGranularity, ImportResult } from './import/types';
import { detectFileType } from './import/fileTypeDetector';

// ============================================================================
// FILE STRUCTURE:
// ├── Local Storage Persistence Helpers
// ├── Dashboard Context & Hook
// ├── Dashboard Data Management Hook
// ├── AI Network & Resilience Helpers
// └── AI Assistant Tools Hook
// ============================================================================

// ─── Local Storage Persistence Helpers ──────────────────────────────────────
const DASHBOARD_STORAGE_KEY = 'customer-service-dashboard-state-v1';

const readPersistedDashboardState = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (error) {
    console.warn('Failed to load persisted dashboard state:', error);
    return null;
  }
};

// ─── Dashboard Context & Hook ──────────────────────────────────────
export const DashboardContext = createContext(null);
export const useDashboard = () => useContext(DashboardContext);

// ─── Dashboard Data Management Hook ──────────────────────────────────────
export const useDashboardData = (onDataReset = null) => {
  const persistedState = useMemo(() => readPersistedDashboardState(), []);

  const [activeTimeframe, setActiveTimeframe] = useState(() => persistedState?.activeTimeframe || 'monthly');
  const [selectedWeek, setSelectedWeek] = useState(() => persistedState?.selectedWeek || 'Week 1');
  const [selectedDate, setSelectedDate] = useState(() => persistedState?.selectedDate || DEFAULT_DATE);
  const [selectedDow, setSelectedDow] = useState(() => persistedState?.selectedDow || 'Monday');

  const [agents, setAgents] = useState(() => persistedState?.agents || []);
  const [supervisors, setSupervisors] = useState(() => persistedState?.supervisors || []);
  const [oamName, setOamName] = useState(() => persistedState?.oamName || DEFAULT_MANAGER_NAME);
  const [historicalData, setHistoricalData] = useState(() => persistedState?.historicalData || {});
  const [hasUploadedData, setHasUploadedData] = useState(() => !!persistedState?.hasUploadedData);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [batchImportSummary, setBatchImportSummary] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const importAbortControllerRef = useRef(null);

  const openImportPreview = useCallback((config) => {
    setImportPreview({
      isOpen: true,
      fileName: config.fileName,
      sheets: config.sheets,
    });
  }, []);

  const closeImportPreview = useCallback(() => {
    setImportPreview(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const payload = {
        activeTimeframe,
        selectedWeek,
        selectedDate,
        selectedDow,
        agents,
        supervisors,
        oamName,
        historicalData,
        hasUploadedData,
      };
      window.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist dashboard state:', error);
    }
  }, [activeTimeframe, selectedWeek, selectedDate, selectedDow, agents, supervisors, oamName, historicalData, hasUploadedData]);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (files.length === 1) {
      await processFile(files[0]);
      if (event.target) event.target.value = '';
      return;
    }

    setUploadStatus({ type: 'info', message: `Preparing ${files.length} files for import preview...` });

    try {
      const combinedSheets = [];
      for (const file of files) {
        const fileType = detectFileType(file.name);
        if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
          const { sheets } = await convertWorkbookToSheets(file);
          const filteredSheets = selectSheets(sheets);
          combinedSheets.push(...filteredSheets);
        } else if (fileType === 'csv' || fileType === 'tsv' || fileType === 'txt') {
          const textTable = await parseCsvFileText(file);
          combinedSheets.push({
            workbookName: file.name,
            sheetName: file.name.replace(/\.[^/.]+$/, '') || 'CSV',
            index: combinedSheets.length,
            headerRow: textTable.headers,
            rows: textTable.rows,
            rowCount: textTable.rows.length,
          });
        }
      }

      if (event.target) event.target.value = '';
      setUploadStatus(null);

      if (combinedSheets.length === 0) {
        setUploadStatus({ type: 'error', message: 'No usable sheets detected across the selected files.' });
        setTimeout(() => setUploadStatus(null), 5000);
        return;
      }

      openImportPreview({
        fileName: `${files.length} files batch`,
        sheets: combinedSheets,
      });
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: 'The batch files could not be processed. Please check the file set.',
      });
      if (event.target) event.target.value = '';
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const applyBatchImport = useCallback(async (sourceSelection = null, explicitSummary = null) => {
    const summary = explicitSummary || batchImportSummary;
    if (!summary || !summary.rows?.length) {
      setUploadStatus({ type: 'error', message: 'There is no valid batch import ready to apply.' });
      setTimeout(() => setUploadStatus(null), 4000);
      return;
    }

    const selectedKeys = sourceSelection && typeof sourceSelection === 'object'
      ? Object.keys(sourceSelection).filter((key) => sourceSelection[key])
      : null;

    const rowsToApply = selectedKeys && selectedKeys.length
      ? summary.rows.filter((row) => {
          const sourceKey = `${row.sourceFile || 'unknown'}|${row.sourceSheet || 'CSV'}`;
          return selectedKeys.includes(sourceKey);
        })
      : summary.rows;

    if (!rowsToApply.length) {
      setUploadStatus({ type: 'error', message: 'No selected sheets have usable rows to apply.' });
      setTimeout(() => setUploadStatus(null), 4000);
      return;
    }

    const newHistory = { ...historicalData };
    const updatedAgents = [...agents];
    const nextSupervisors = new Set(supervisors);

    const toNumber = (value) => {
      if (value === null || value === undefined || value === '') return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const parsed = Number(String(value).replace(/[%,$\s]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const chunkSize = 250;
    console.log('[DEBUG 8 - applyBatchImport] Starting to apply rows to state. Total rows:', rowsToApply.length);
    for (let index = 0; index < rowsToApply.length; index += 1) {
      if (index > 0 && index % chunkSize === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const row = rowsToApply[index];
      const rawName = String(row.agentName ?? row.name ?? '').trim();
      const rawDate = normalizeDate(String(row.date ?? ''));
      if (!rawName || !rawDate) continue;

      const rawSupervisor = String(row.supervisor ?? '').trim() || 'Unknown';
      const rawOam = String(row.oam ?? '').trim() || 'Unknown';
      const rawId = String(row.employeeId ?? '').trim();
      const agentKey = rawId ? `ID_${rawId}` : `AUTO_${rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

      let targetAgent = updatedAgents.find((agent) => agent.ccms === agentKey || (agent.name && agent.name.toLowerCase() === rawName.toLowerCase() && agent.sourceId === rawId));
      if (!targetAgent) {
        targetAgent = {
          ccms: agentKey,
          sourceId: rawId || null,
          name: rawName,
          supervisor: rawSupervisor,
          oam: rawOam,
          coding: 'Unknown',
          phase: 'Unknown',
        };
        updatedAgents.push(targetAgent);
      } else {
        targetAgent.name = rawName;
        targetAgent.supervisor = rawSupervisor;
        targetAgent.oam = rawOam;
        if (!targetAgent.sourceId && rawId) targetAgent.sourceId = rawId;
      }

      if (rawSupervisor && rawSupervisor !== 'Unknown') nextSupervisors.add(rawSupervisor);
      if (!newHistory[targetAgent.ccms]) newHistory[targetAgent.ccms] = {};

      const callsValue = toNumber(row.calls);
      const ahtValue = toNumber(row.aht);
      const vxsValue = toNumber(row.vxs);
      const resolve2hrValue = toNumber(row.resolve2hr);
      const resolve3dValue = toNumber(row.resolve3d);

      // Read every recognized metric field off the normalized row.
      // toNumber() returns 0 for missing/null, so we preserve null for truly absent
      // fields by checking row[field] explicitly before converting.
      const toNumberOrNull = (value) => {
        if (value === null || value === undefined || value === '') return null;
        return toNumber(value);
      };

      // resolveTotalContacts: use imported value when present, fall back to callsValue
      const resolveTotalContactsValue =
        row.resolveTotalContacts != null && row.resolveTotalContacts !== ''
          ? toNumber(row.resolveTotalContacts)
          : callsValue;

      newHistory[targetAgent.ccms][rawDate] = {
        isOff: callsValue === 0,
        calls: callsValue,
        resolveTotalContacts: resolveTotalContactsValue,
        resolveTotalContacts2hr: toNumberOrNull(row.resolveTotalContacts2hr),
        resolveTotalContacts3d: toNumberOrNull(row.resolveTotalContacts3d),
        surveys: toNumberOrNull(row.surveys),
        promoters: toNumberOrNull(row.promoters),
        vxs: vxsValue,
        resolve3d: resolve3dValue,
        handoffs: toNumberOrNull(row.handoffs),
        handoffsCount: toNumberOrNull(row.handoffsCount),
        resolve2hr: resolve2hrValue,
        aht: ahtValue,
        hold: toNumberOrNull(row.hold),
        dpc: toNumberOrNull(row.dpc),
        viewTogether: toNumberOrNull(row.viewTogether),
        vtt: toNumberOrNull(row.vtt),
        vttSent: toNumberOrNull(row.vttSent),
        vttTransacted: toNumberOrNull(row.vttTransacted),
        netOcc: toNumberOrNull(row.netOcc),
        creditFreq: toNumberOrNull(row.creditFreq),
        phoneAdds: toNumberOrNull(row.phoneAdds),
        vhi: toNumberOrNull(row.vhi),
      };
    }

    setHistoricalData(newHistory);
    setAgents(updatedAgents);
    setSupervisors(Array.from(nextSupervisors).sort());
    setHasUploadedData(true);
    const firstDate = rowsToApply.find((row) => row.date)?.date ? normalizeDate(String(rowsToApply.find((row) => row.date)?.date ?? '')) : DEFAULT_DATE;
    setSelectedDate(firstDate || DEFAULT_DATE);
    setActiveTimeframe('monthly');
    setUploadStatus({ type: 'success', message: `Applied ${rowsToApply.length} imported rows from the selected sheets.` });
    setTimeout(() => setUploadStatus(null), 5000);
  }, [agents, batchImportSummary, historicalData, setActiveTimeframe, setAgents, setHasUploadedData, setHistoricalData, setSelectedDate, setSupervisors, supervisors]);

  const confirmImportPreview = useCallback(
    async (config) => {
      if (!importPreview?.sheets || !importPreview.sheets.length) {
        closeImportPreview();
        return;
      }

      setUploadStatus({ type: 'info', message: 'Applying imported sheets to dashboard...' });

      try {
        const sheetConfigs = config?.sheetConfigs || {};
        const allNormalizedRows = [];
        const warnings = [];

        // 1. Column mapping with user overrides & 2. aggregateTransactions for transaction-classified sheets
        for (let sheetIdx = 0; sheetIdx < importPreview.sheets.length; sheetIdx += 1) {
          const sheet = importPreview.sheets[sheetIdx];
          const sheetConfig = sheetConfigs[sheet.sheetName] || sheetConfigs[sheetIdx];
          const userMappings = sheetConfig?.columnMappings || {};
          const headers = sheet.headerRow ?? [];
          const rows = sheet.rows ?? [];

          const rawMappedRows = [];
          for (const rawRow of rows) {
            const mappedRow = {};
            for (let colIdx = 0; colIdx < headers.length; colIdx += 1) {
              const rawHeader = headers[colIdx];
              const headerStr = String(rawHeader ?? '').trim();

              let mappedField = undefined;
              if (Object.prototype.hasOwnProperty.call(userMappings, headerStr)) {
                mappedField = userMappings[headerStr];
              } else if (Object.prototype.hasOwnProperty.call(userMappings, rawHeader)) {
                mappedField = userMappings[rawHeader];
              } else {
                mappedField = normalizeHeaderToField(headerStr);
              }

              if (!mappedField) continue;

              const val = rawRow?.[colIdx];
              mappedRow[mappedField] = normalizeCellValue(val, mappedField);
            }

            if (Object.keys(mappedRow).length > 0) {
              mappedRow.sourceFile = sheet.workbookName || importPreview.fileName || 'Upload';
              mappedRow.sourceSheet = sheet.sheetName || 'CSV';
              rawMappedRows.push(mappedRow);
            }
          }

          // Pass user's SELECTED granularity (target.selectedGranularity) into aggregation
          const selectedGranularity = sheetConfig?.granularity || 'aggregate';
          const sheetRows =
            selectedGranularity === 'transaction'
              ? aggregateTransactions(rawMappedRows)
              : rawMappedRows;

          allNormalizedRows.push(...sheetRows);
        }

        // 3. validateNormalizedRows
        const fileName = importPreview.fileName || 'Import';
        const validated = validateNormalizedRows(allNormalizedRows, fileName);
        warnings.push(...(validated.warnings || []));

        if (!validated.rows.length) {
          setUploadStatus({
            type: 'error',
            message: 'No valid rows found after validation. Please check column mappings.',
          });
          setTimeout(() => setUploadStatus(null), 5000);
          closeImportPreview();
          return;
        }

        // 4. mergeNormalizedRows
        const mergedRows = mergeNormalizedRows(validated.rows);

        const summary = {
          files: new Set(importPreview.sheets.map((s) => s.workbookName || fileName)).size || 1,
          sheets: importPreview.sheets.length,
          rows: mergedRows,
          warnings,
          errors: [],
          sources: importPreview.sheets.map((s) => ({
            fileName: s.workbookName || fileName,
            sheetName: s.sheetName,
            rowCount: s.rowCount,
          })),
        };

        // 5. applyBatchImport
        setBatchImportSummary(summary);
        await applyBatchImport(null, summary);
        closeImportPreview();
      } catch (error) {
        console.error('Failed to confirm import preview:', error);
        setUploadStatus({
          type: 'error',
          message: 'Failed to process and import the sheets.',
        });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    },
    [importPreview, closeImportPreview, setUploadStatus, setBatchImportSummary, applyBatchImport]
  );

  const handleWorkbookImport = useCallback(async (file) => {
    if (!file) return;
    console.log('[DEBUG 1e - handleWorkbookImport] Initiating runImportService for:', { name: file.name, size: file.size });

    const controller = new AbortController();
    importAbortControllerRef.current?.abort();
    importAbortControllerRef.current = controller;

    const cancelImport = () => {
      controller.abort();
      setUploadStatus({
        type: 'info',
        message: 'Import cancelled.',
        progress: 100,
        cancelAction: null,
      });
      setTimeout(() => setUploadStatus(null), 2000);
    };

    setUploadStatus({
      type: 'info',
      message: `Processing workbook ${file.name}...`,
      progress: 0,
      cancelAction: cancelImport,
    });

    try {
      const result = await runImportService([file], {
        signal: controller.signal,
        onProgress: (progress) => {
          setUploadStatus({
            type: 'info',
            message: progress.message || `Processing workbook ${file.name}...`,
            progress: typeof progress.percent === 'number' ? progress.percent : 0,
            cancelAction: cancelImport,
          });
        },
      });
      const totalRows = result.rows?.length ?? 0;
      setBatchImportSummary(result);

      if (totalRows > 0) {
        setBatchImportSummary(result);
        await applyBatchImport(null, result);
        return;
      }

      setUploadStatus({ type: 'error', message: 'No usable rows were found in the workbook.' });
      setTimeout(() => setUploadStatus(null), 5000);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setUploadStatus({
          type: 'info',
          message: 'Import cancelled.',
          progress: 100,
          cancelAction: null,
        });
        setTimeout(() => setUploadStatus(null), 2000);
        return;
      }

      setUploadStatus({ type: 'error', message: 'The workbook could not be processed. Please check the file format.' });
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      if (importAbortControllerRef.current?.signal === controller.signal) {
        importAbortControllerRef.current = null;
      }
    }
  }, [applyBatchImport, setBatchImportSummary, setUploadStatus]);

  const handleFileDrop = (file) => {
    console.log('[DEBUG 1a - handleFileDrop] File dropped:', { name: file?.name, size: file?.size, type: file?.type });
    processFile(file);
  };

  const processFile = async (file) => {
    if (!file) return;

    const fileType = detectFileType(file.name);
    console.log('[DEBUG 1b - processFile] File detected:', { name: file.name, size: file.size, detectedType: fileType });

    if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
      console.log('[DEBUG 1c - processFile] Routing to handleWorkbookImport');
      handleWorkbookImport(file);
      return;
    }

    if (fileType === 'csv' || fileType === 'tsv' || fileType === 'txt') {
      console.log('[DEBUG 1d - processFile] Routing to parseCsvFileText (CSV preview route)');
      setUploadStatus({ type: 'info', message: `Preparing ${file.name} for import preview...` });
      try {
        const textTable = await parseCsvFileText(file);
        const singleSheet = [
          {
            workbookName: file.name,
            sheetName: file.name.replace(/\.[^/.]+$/, '') || 'CSV',
            index: 0,
            headerRow: textTable.headers,
            rows: textTable.rows,
            rowCount: textTable.rows.length,
          },
        ];

        setUploadStatus(null);
        openImportPreview({
          fileName: file.name,
          sheets: singleSheet,
        });
      } catch (error) {
        setUploadStatus({
          type: 'error',
          message: 'The file could not be processed. Please check the file format.',
        });
        setTimeout(() => setUploadStatus(null), 5000);
      }
      return;
    }

    setUploadStatus({
      type: 'error',
      message: `Unsupported file format: ${file.name}. Please upload CSV, TSV, TXT, or Excel files.`,
    });
    setTimeout(() => setUploadStatus(null), 5000);
  };

  const agentDataCache = useMemo(() => {
    const cache = {};
    if (!hasUploadedData) return cache;

    const OFF = { isOff: true, calls: 0 };
    const daysMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const targetDow = daysMap[selectedDow];
    const weekNum = parseInt(selectedWeek.replace('Week ', ''));
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = weekNum >= 5 ? 31 : startDay + 6;

    Object.keys(historicalData).forEach((ccms) => {
      const agentHistory = historicalData[ccms];
      const allDates = Object.keys(agentHistory);

      cache[`${ccms}|monthly`] = allDates.length > 0 ? aggregateRecords(allDates.map((d) => agentHistory[d])) : OFF;
      cache[`${ccms}|daily`] = agentHistory[selectedDate] ? { ...agentHistory[selectedDate] } : OFF;

      const weekDates = allDates.filter((d) => {
        const parts = d.split('-');
        if (parts.length !== 3) return false;
        const day = parseInt(parts[2], 10);
        return day >= startDay && day <= endDay;
      });
      cache[`${ccms}|weekly`] = weekDates.length > 0 ? aggregateRecords(weekDates.map((d) => agentHistory[d])) : OFF;

      const dowDates = allDates.filter((d) => dowFromDateStr(d) === targetDow);
      cache[`${ccms}|dow`] = dowDates.length > 0 ? aggregateRecords(dowDates.map((d) => agentHistory[d])) : OFF;
    });

    return cache;
  }, [historicalData, hasUploadedData, selectedDate, selectedWeek, selectedDow]);

  const getAgentDataForTimeframe = (agent, timeframe) => {
    if (!hasUploadedData) return { isOff: true, calls: 0 };
    return agentDataCache[`${agent.ccms}|${timeframe}`] || { isOff: true, calls: 0 };
  };

  const handleDateChange = (daysToAdd) => {
    if (!hasUploadedData) return;
    const current = new Date(selectedDate + 'T00:00:00');
    const year = current.getFullYear();
    const month = current.getMonth();
    const day = current.getDate();

    if (activeTimeframe === 'dow') {
      let idx = DAYS_OF_WEEK.indexOf(selectedDow) + daysToAdd;
      if (idx < 0) idx = 6;
      if (idx > 6) idx = 0;
      setSelectedDow(DAYS_OF_WEEK[idx]);
      return;
    }

    if (activeTimeframe !== 'daily') {
      if (daysToAdd < 0) return;
      setActiveTimeframe('daily');
      const firstDay = new Date(year, month, 1);
      setSelectedDate(`${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-${String(firstDay.getDate()).padStart(2, '0')}`);
      return;
    }

    if (daysToAdd < 0) {
      if (day === 1) { setActiveTimeframe('monthly'); return; }
      const prevDay = new Date(year, month, day - 1);
      setSelectedDate(`${prevDay.getFullYear()}-${String(prevDay.getMonth() + 1).padStart(2, '0')}-${String(prevDay.getDate()).padStart(2, '0')}`);
      return;
    }

    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    if (day >= lastDayOfMonth) return;
    const nextDay = new Date(year, month, day + 1);
    setSelectedDate(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`);
  };

  const getCurrentMonthName = () => {
    const parts = selectedDate.split('-');
    if (parts.length !== 3) return 'Current Month';
    const localDate = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
    return localDate.toLocaleString('en-US', { month: 'long' });
  };

  const getTopHeadlineMonth = () => {
    if (activeTimeframe === 'monthly') return getCurrentMonthName();
    if (activeTimeframe === 'weekly') return selectedWeek;
    return getCurrentMonthName();
  };

  return {
    agents, supervisors, oamName, historicalData, hasUploadedData, uploadStatus, batchImportSummary,
    handleFileUpload, handleFileDrop, applyBatchImport,
    importPreview, openImportPreview, closeImportPreview, confirmImportPreview,
    activeTimeframe, setActiveTimeframe, selectedWeek, setSelectedWeek, selectedDate, setSelectedDate,
    selectedDow, setSelectedDow,
    getAgentDataForTimeframe, handleDateChange, getTopHeadlineMonth,
  };
};

// ─── AI Network & Resilience Helpers ──────────────────────────────────────
const _aiControllers = new Map();

const delayForRetry = (attempt) => new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));

const fetchWithRetry = async (url, options, retries = 2, timeoutMs = 30000) => {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          await delayForRetry(attempt);
          continue;
        }
      }
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (error?.name === 'AbortError') throw error;
      if (attempt === retries) break;
      await delayForRetry(attempt);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('AI request failed');
};

const executeGeminiAction = async (context, systemPrompt, setStatusFn, setLoadingFn, errorMsg) => {
  const slotKey = setLoadingFn;
  if (_aiControllers.get(slotKey)?.active) return;

  const prevController = _aiControllers.get(slotKey);
  if (prevController) prevController.controller.abort();

  const controller = new AbortController();
  _aiControllers.set(slotKey, { controller, active: true });

  setLoadingFn(true);
  try {
    const result = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: context }],
        }),
      },
      2,
      30000,
    );

    const text = result.content?.map((b) => b.text || '').join('') || '';
    if (text) {
      setStatusFn(text);
      setLoadingFn(false);
      return;
    }

    throw new Error('Empty response');
  } catch (e) {
    if (e?.name !== 'AbortError') {
      const isTimeout = e?.message?.includes('abort') || e?.name === 'TimeoutError';
      setStatusFn(isTimeout ? 'Request timed out. Please try again.' : (errorMsg || 'An error occurred while generating content.'));
      setLoadingFn(false);
    }
  } finally {
    const current = _aiControllers.get(slotKey);
    if (current?.controller === controller) {
      _aiControllers.set(slotKey, { controller, active: false });
    }
  }
};

// ─── AI Assistant Tools Hook ──────────────────────────────────────
export const AI_INITIAL = {
  report: null,
  loading: false,
  teamReport: null,
  loadingTeam: false,
  chartActionPlan: null,
  loadingChartActionPlan: false,
  correlationReport: null,
  loadingCorrelation: false,
  apprenticeReport: null,
  loadingApprentice: false,
  dowReport: null,
  loadingDow: false,
};

export const useAiTools = ({
  agents,
  supervisors,
  oamName,
  historicalData,
  selectedDate,
  activeTimeframe,
  selectedWeek,
  selectedDow,
  getAgentDataForTimeframe,
  activeLeaderData,
  mtdLeaderData,
  supervisorStats,
  runChartMetric,
  runChartData,
  allActiveDates,
}) => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [teamReport, setTeamReport] = useState(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [chartActionPlan, setChartActionPlan] = useState(null);
  const [loadingChartActionPlan, setLoadingChartActionPlan] = useState(false);
  const [correlationReport, setCorrelationReport] = useState(null);
  const [loadingCorrelation, setLoadingCorrelation] = useState(false);
  const [apprenticeReport, setApprenticeReport] = useState(null);
  const [loadingApprentice, setLoadingApprentice] = useState(false);
  const [dowReport, setDowReport] = useState(null);
  const [loadingDow, setLoadingDow] = useState(false);

  useEffect(() => {
    if (!agents.length) return;
    const systemPrompt = `You are a performance coach...`;
    const input = JSON.stringify({
      oamName,
      activeTimeframe,
      selectedDate,
      selectedWeek,
      selectedDow,
      activeLeaderData,
      mtdLeaderData,
      supervisorStats,
      runChartMetric,
      runChartData,
      allActiveDates,
      agents,
      supervisors,
    }, null, 2);

    executeGeminiAction(input, systemPrompt, setReport, setLoading, 'Unable to generate report.');
  }, [agents, supervisors, oamName, historicalData, selectedDate, activeTimeframe, selectedWeek, selectedDow, getAgentDataForTimeframe, activeLeaderData, mtdLeaderData, supervisorStats, runChartMetric, runChartData, allActiveDates]);

  return {
    report,
    loading,
    teamReport,
    loadingTeam,
    chartActionPlan,
    loadingChartActionPlan,
    setChartActionPlan,
    correlationReport,
    loadingCorrelation,
    apprenticeReport,
    loadingApprentice,
    dowReport,
    loadingDow,
  };
};
