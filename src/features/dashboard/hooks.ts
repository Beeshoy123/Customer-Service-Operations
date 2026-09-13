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
  parseCsvFileText,
  aggregateTransactions,
  validateNormalizedRows,
  mergeNormalizedRows,
  normalizeCellValue,
} from './import';
import type { SheetTable, SheetGranularity, ImportResult } from './import/types';
import { detectFileType } from './import/fileTypeDetector';

// ==== Dashboard state + data lifecycle ==== 
// Quick scan: src/features/dashboard/hooks.ts for upload flow, state, and app wiring

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

export const DashboardContext = createContext(null);
export const useDashboard = () => useContext(DashboardContext);

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
          combinedSheets.push(...sheets);
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

      newHistory[targetAgent.ccms][rawDate] = {
        isOff: callsValue === 0,
        calls: callsValue,
        resolveTotalContacts3d: null,
        resolveTotalContacts2hr: null,
        resolveTotalContacts: callsValue,
        surveys: null,
        promoters: null,
        vxs: vxsValue,
        resolve3d: resolve3dValue,
        handoffs: null,
        handoffsCount: null,
        resolve2hr: resolve2hrValue,
        aht: ahtValue,
        hold: null,
        dpc: null,
        viewTogether: null,
        vtt: null,
        vttSent: null,
        vttTransacted: null,
        netOcc: null,
        creditFreq: null,
        phoneAdds: null,
        vhi: null,
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

  const handleWorkbookImport = useCallback(async (file) => {
    if (!file) return;

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
    processFile(file);
  };

  const processFile = (file) => {
    if (!file) return;

    const fileType = detectFileType(file.name);
    if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
      handleWorkbookImport(file);
      return;
    }

    setUploadStatus({ type: 'info', message: `Building OAM Database from ${file.name}...` });

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
        if (lines.length < 2) {
          setUploadStatus({ type: 'error', message: 'File is empty or missing data rows.' });
          return;
        }

        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = parseCSVLine(lines[0], delimiter).map((h) => h.toLowerCase().trim());

        const cols = detectColumns(headers);
        const nameKey = cols.name;
        const supKey = cols.supervisor;
        const oamKey = cols.oam;
        const dateKey = cols.date;
        const locationKey = cols.location;
        const idKey = cols.employeeId;

        if (nameKey === -1) {
          setUploadStatus({ type: 'error', message: 'Could not find an "Agent Name", "Employee Name", or "Name" column.' });
          return;
        }

        const rawFormat = isRawGranularFormat(cols);

        const getFloat = (row, index, treatAsPercent = false) => {
          if (index === -1 || !row[index] || row[index].trim() === '') return null;
          let strVal = row[index].trim();
          const hasPct = strVal.includes('%');
          let parsed = parseFloat(strVal.replace(/,/g, '').replace(/%/g, '').replace(/\$/g, ''));
          if (isNaN(parsed)) return null;
          if (treatAsPercent && !hasPct && parsed <= 1.0 && parsed >= 0) { parsed = parsed * 100; }
          return parsed;
        };

        const getRowDate = (row) => {
          if (dateKey !== -1 && row[dateKey]) return normalizeDate(row[dateKey]);
          const rawDateCell = row.find((c) => c && typeof c === 'string' && (c.includes('/20') || c.includes(' AM') || c.includes(' PM')));
          return rawDateCell ? normalizeDate(rawDateCell) : null;
        };

        const getRowKey = (row) => {
          if (idKey !== -1 && row[idKey]) return 'ID_' + row[idKey].trim();
          return 'NAME_' + formatName(row[nameKey] || '').toLowerCase();
        };

        let rollups = null;
        if (rawFormat) {
          rollups = {};
          for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i], delimiter);
            if (!row[nameKey]) continue;
            const rowDate = getRowDate(row);
            if (!rowDate) continue;
            const rowKey = getRowKey(row);
            const groupKey = `${rowKey}|${rowDate}`;

            if (!rollups[groupKey]) {
              rollups[groupKey] = {
                rowKey, rowDate, rowRef: row,
                callsRaw: 0, handleTimeRaw: 0, vxsPassRaw: 0, vxsTotalRaw: 0,
                resolve2hrFlag: 0, resolve3dFlag: 0, transferFlag: 0,
                detractors: 0, promoters: 0, satisfactionSum: 0, satisfactionCount: 0,
                knowledgeSum: 0, knowledgeCount: 0, rowCount: 0,
              };
            }
            const acc = rollups[groupKey];
            acc.rowCount += 1;
            if (cols.callsRaw !== -1) acc.callsRaw += getFloat(row, cols.callsRaw) || 0;
            if (cols.handleTimeRaw !== -1) acc.handleTimeRaw += getFloat(row, cols.handleTimeRaw) || 0;
            if (cols.vxsPassRaw !== -1) acc.vxsPassRaw += getFloat(row, cols.vxsPassRaw) || 0;
            if (cols.vxsTotalRaw !== -1) acc.vxsTotalRaw += getFloat(row, cols.vxsTotalRaw) || 0;
            const r2hr = cols.resolve2hrFlag !== -1 ? (getFloat(row, cols.resolve2hrFlag) || 0) : 0;
            const r3d = cols.resolve3dFlag !== -1 ? (getFloat(row, cols.resolve3dFlag) || 0) : 0;
            acc.resolve2hrFlag += r2hr;
            acc.resolve3dFlag += (r2hr > 0 ? 1 : r3d);
            if (cols.transferFlag !== -1) acc.transferFlag += getFloat(row, cols.transferFlag) || 0;
            if (cols.vxsTotalRaw !== -1) {
              const promoterVal = cols.promoters !== -1 ? (getFloat(row, cols.promoters) || 0) : 0;
              acc.promoters += promoterVal;
            }
            if (cols.detractors !== -1) acc.detractors += getFloat(row, cols.detractors) || 0;
            const satVal = cols.satisfaction !== -1 ? getFloat(row, cols.satisfaction) : null;
            if (satVal !== null) { acc.satisfactionSum += satVal; acc.satisfactionCount += 1; }
            const knowVal = cols.knowledge !== -1 ? getFloat(row, cols.knowledge) : null;
            if (knowVal !== null) { acc.knowledgeSum += knowVal; acc.knowledgeCount += 1; }
          }
        }

        let rowsParsed = 0;
        let latestFoundDate = null;
        const newHistory = { ...historicalData };
        const updatedAgents = [...agents];
        let foundSupervisors = new Set();
        let foundOam = null;

        const resolveAgentForRow = (row, joinKeyOverride) => {
          const rawAgentName = row[nameKey];
          const rawSupName = supKey !== -1 && row[supKey] ? row[supKey].trim() : 'Unknown';
          const rawOamName = oamKey !== -1 && row[oamKey] ? row[oamKey].trim() : null;
          const locationVal = locationKey !== -1 && row[locationKey] ? row[locationKey].trim() : 'Unknown';

          const agentName = formatName(rawAgentName);
          const supName = rawSupName !== 'Unknown' ? shortenManagerName(formatName(rawSupName)) : 'Unknown';
          const oamNameFormatted = rawOamName ? shortenManagerName(formatName(rawOamName)) : 'Unknown';

          if (supName !== 'Unknown') foundSupervisors.add(supName);
          if (rawOamName && !foundOam) foundOam = shortenManagerName(formatName(rawOamName));

          let coding = 'Unknown';
          if (locationVal.toLowerCase().includes('new hire')) coding = 'New Hire';
          else if (locationVal.toLowerCase().includes('transition')) coding = 'Transition';

          let phase = 'Unknown';
          if (rawOamName) {
            const mgr2 = rawOamName.toLowerCase();
            if (mgr2.includes('abdelazim') || mgr2.includes('ziad') || mgr2.includes('mohsen') || mgr2.includes('youssef')) {
              phase = 'OJT';
            } else if (mgr2.includes('mohamed') || mgr2.includes('seifeldin') || mgr2.includes('shahat') || mgr2.includes('ali') || mgr2.includes('khaled') || mgr2.includes('manar')) {
              phase = 'Nesting';
            }
          }

          const idVal = idKey !== -1 && row[idKey] ? row[idKey].trim() : null;
          let targetAgent = idVal
            ? updatedAgents.find((a) => a.sourceId === idVal)
            : updatedAgents.find((a) => a.name.toLowerCase() === agentName.toLowerCase());
          if (!targetAgent && idVal) {
            targetAgent = updatedAgents.find((a) => a.name.toLowerCase() === agentName.toLowerCase() && !a.sourceId);
          }

          if (!targetAgent) {
            targetAgent = {
              ccms: idVal ? ('ID_' + idVal) : ('AUTO_' + Math.random().toString(36).substr(2, 8)),
              sourceId: idVal,
              name: agentName,
              supervisor: supName,
              oam: oamNameFormatted,
              coding,
              phase,
            };
            updatedAgents.push(targetAgent);
          } else {
            targetAgent.supervisor = supName;
            targetAgent.oam = oamNameFormatted;
            if (coding !== 'Unknown') targetAgent.coding = coding;
            if (phase !== 'Unknown') targetAgent.phase = phase;
            if (idVal && !targetAgent.sourceId) targetAgent.sourceId = idVal;
          }
          return targetAgent;
        };

        if (rawFormat) {
          for (const groupKey in rollups) {
            const acc = rollups[groupKey];
            const row = acc.rowRef;
            const targetAgent = resolveAgentForRow(row);
            if (!targetAgent) continue;

            rowsParsed++;
            const rowDate = acc.rowDate;
            if (!latestFoundDate || rowDate > latestFoundDate) latestFoundDate = rowDate;

            const callsHandled = acc.callsRaw || acc.rowCount || 0;
            const isOff = callsHandled === 0;

            const vxsRate = acc.vxsTotalRaw > 0
              ? (acc.vxsPassRaw > 0 ? (acc.vxsPassRaw / acc.vxsTotalRaw) * 100 : (acc.promoters / acc.vxsTotalRaw) * 100)
              : null;
            const resolve2hrRate = callsHandled > 0 && cols.resolve2hrFlag !== -1 ? (1 - acc.resolve2hrFlag / callsHandled) * 100 : null;
            const resolve3dRate = callsHandled > 0 && (cols.resolve3dFlag !== -1 || cols.resolve2hrFlag !== -1) ? (1 - acc.resolve3dFlag / callsHandled) * 100 : null;
            const handoffsRate = callsHandled > 0 && cols.transferFlag !== -1 ? (acc.transferFlag / callsHandled) * 100 : null;
            const ahtVal = callsHandled > 0 && acc.handleTimeRaw > 0 ? acc.handleTimeRaw / callsHandled : null;

            if (!newHistory[targetAgent.ccms]) newHistory[targetAgent.ccms] = {};
            newHistory[targetAgent.ccms][rowDate] = {
              isOff, calls: callsHandled,
              resolveTotalContacts3d: null, resolveTotalContacts2hr: null,
              resolveTotalContacts: callsHandled,
              surveys: acc.vxsTotalRaw || null, promoters: acc.promoters || null, vxs: vxsRate,
              resolve3d: resolve3dRate, handoffs: handoffsRate, handoffsCount: acc.transferFlag || null,
              resolve2hr: resolve2hrRate, aht: ahtVal, hold: null,
              dpc: null, viewTogether: null, vtt: null, vttSent: null, vttTransacted: null, netOcc: null,
              creditFreq: null, phoneAdds: null, vhi: null,
            };
          }
        } else {
          const vxsIdx = cols.vxs;
          const resolve3dIdx = cols.resolve3d;
          const handoffsIdx = cols.handoffsPct;
          const handoffsCountIdx = cols.handoffsCount;
          const resolve2hrIdx = cols.resolve2hr;
          const ahtIdx = cols.aht;
          const resolve3dContactsIdx = cols.resolve3dContacts;
          const resolve2hrContactsIdx = cols.resolve2hrContacts;
          const fallbackResolveContactsIdx = cols.resolveContactsFallback;
          const holdIdx = cols.hold;
          const dpcIdx = cols.dpc;
          const vttIdx = cols.vtt;
          const vttSentIdx = cols.vttSent;
          const vttTransactedIdx = cols.vttTransacted;
          const netOccIdx = cols.netOcc;
          const creditFreqIdx = cols.creditFreq;
          const phoneAddsIdx = cols.phoneAdds;
          const vhiIdx = cols.vhi;
          const callsIdx = cols.calls;
          const surveysIdx = cols.surveys;
          const promotersIdx = cols.promoters;

          for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i], delimiter);
            if (!row[nameKey]) continue;

            const rowDate = getRowDate(row);
            if (!rowDate) continue;
            if (!latestFoundDate || rowDate > latestFoundDate) latestFoundDate = rowDate;

            const targetAgent = resolveAgentForRow(row);
            if (!targetAgent) continue;

            rowsParsed++;
            const callsHandled = getFloat(row, callsIdx) || 0;
            const isOff = callsHandled === 0;

            const parsed3drContacts = getFloat(row, resolve3dContactsIdx);
            const parsedFallback = getFloat(row, fallbackResolveContactsIdx);
            const parsedVttSent = getFloat(row, vttSentIdx, false);
            const parsedVttTransacted = getFloat(row, vttTransactedIdx, false);
            let parsedVttRate = getFloat(row, vttIdx, true);
            if (parsedVttSent != null && parsedVttTransacted != null && parsedVttSent > 0) {
              parsedVttRate = (parsedVttTransacted / parsedVttSent) * 100;
            }

            if (!newHistory[targetAgent.ccms]) newHistory[targetAgent.ccms] = {};
            newHistory[targetAgent.ccms][rowDate] = {
              isOff,
              calls: callsHandled,
              resolveTotalContacts3d: parsed3drContacts,
              resolveTotalContacts2hr: getFloat(row, resolve2hrContactsIdx),
              resolveTotalContacts: parsedFallback !== null ? parsedFallback : (parsed3drContacts !== null ? parsed3drContacts : callsHandled),
              surveys: getFloat(row, surveysIdx),
              promoters: getFloat(row, promotersIdx),
              vxs: getFloat(row, vxsIdx, true),
              resolve3d: getFloat(row, resolve3dIdx, true),
              handoffs: getFloat(row, handoffsIdx, true),
              handoffsCount: getFloat(row, handoffsCountIdx, false),
              resolve2hr: getFloat(row, resolve2hrIdx, true),
              aht: getFloat(row, ahtIdx, false),
              hold: getFloat(row, holdIdx, false),
              dpc: getFloat(row, dpcIdx, false),
              viewTogether: parsedVttRate,
              vtt: parsedVttRate,
              vttSent: parsedVttSent,
              vttTransacted: parsedVttTransacted,
              netOcc: getFloat(row, netOccIdx, false),
              creditFreq: getFloat(row, creditFreqIdx, false),
              phoneAdds: getFloat(row, phoneAddsIdx, false),
              vhi: getFloat(row, vhiIdx, false),
            };
          }
        }

        if (rowsParsed > 0) {
          setHistoricalData(newHistory);
          setAgents(updatedAgents);
          setSupervisors(Array.from(foundSupervisors).sort());
          if (foundOam) setOamName(foundOam);
          setHasUploadedData(true);
          if (onDataReset) onDataReset();

          if (latestFoundDate) setSelectedDate(latestFoundDate);
          setActiveTimeframe('monthly');
          setUploadStatus({ type: 'success', message: `Database Built! Tracked ${Array.from(foundSupervisors).length} Supervisors & ${rowsParsed} records.` });
        } else {
          setUploadStatus({ type: 'error', message: 'No active records matched your Members.' });
        }
        setTimeout(() => setUploadStatus(null), 6000);
      } catch (err) {
        setUploadStatus({ type: 'error', message: 'Failed to process file format. Please check the data.' });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    };
    reader.readAsText(file);
    if (event && event.target) event.target.value = '';
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
    activeTimeframe, setActiveTimeframe, selectedWeek, setSelectedWeek, selectedDate, setSelectedDate,
    selectedDow, setSelectedDow,
    getAgentDataForTimeframe, handleDateChange, getTopHeadlineMonth,
  };
};

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
