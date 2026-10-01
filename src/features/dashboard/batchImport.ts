// batchImport.ts — S1(d) of the `useDashboardData` split (recommendations.md).
// Move-only extraction from hooks.ts: the batch row applier
// (applyBatchImport), the import-preview confirmer (confirmImportPreview) and
// the single-file preview router (processFile). Type-only `any` annotations
// match the S1(a)/S1(b)/S1(e)/S1(c) precedent (see ./state.ts).
// ⚠️ STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE. Row storage in
// applyBatchImport (below) is correct and generic; mapping/alias fixes belong
// in importPolicy.ts (FIELD_ALIASES), nowhere else.
//
// Placement note: the original plan said `import/batchImport.ts`, but a
// stateful React hook is not one of the pure layered functions trap 5 reserves
// that folder for, and sitting beside uploadFlow.ts keeps both halves of the
// split symmetric. It imports `./import/*` like hooks.ts did — never
// `./uploadFlow` and never `../hooks` (the (c) cycle break makes that
// unnecessary: uploadFlow receives these callbacks as injected parameters).

import { useCallback } from 'react';
import { applyAccountProfile, DEFAULT_DATE } from './config';
import { normalizeDate } from './helpers';
import { collectFieldsWithData } from './emptyColumns';
import {
  convertWorkbookToSheets,
  selectSheetsWithDetails,
  parseCsvFileText,
  aggregateTransactions,
  validateNormalizedRows,
  mergeNormalizedRows,
  normalizeCellValue,
  normalizeHeaderToField,
} from './import';
import { detectFileType } from './import/fileTypeDetector';
import { saveAccountProfile } from '../accountSetup/account-profile-storage';

// ─── Batch Import Hook ─────────────────────────────────────────────────────
// Everything the three callbacks need arrives as one object passed by
// useDashboardData (state from ./state plus the open/close preview wrappers).
// `any` on the values is deliberate and matches the S1(a) precedent: they
// originate in `@ts-nocheck` land. Give them real types as a follow-up, not as
// part of a move-only step.
export interface BatchImportDeps {
  agents: any;
  supervisors: any;
  historicalData: any;
  batchImportSummary: any;
  importPreview: any;
  importAbortControllerRef: any;
  onImportColumnsScanRef: any;
  setAgents: (value: any) => void;
  setSupervisors: (value: any) => void;
  setHistoricalData: (value: any) => void;
  setHasUploadedData: (value: any) => void;
  setSelectedDate: (value: any) => void;
  setActiveTimeframe: (value: any) => void;
  setUploadStatus: (value: any) => void;
  setBatchImportSummary: (value: any) => void;
  openImportPreview: (payload: any) => void;
  closeImportPreview: () => void;
}

export const useBatchImport = (deps: BatchImportDeps) => {
  const {
    agents, supervisors, historicalData, batchImportSummary, importPreview,
    importAbortControllerRef, onImportColumnsScanRef,
    setAgents, setSupervisors, setHistoricalData, setHasUploadedData,
    setSelectedDate, setActiveTimeframe, setUploadStatus, setBatchImportSummary,
    openImportPreview, closeImportPreview,
  } = deps;

  const applyBatchImport = useCallback(async (sourceSelection: any = null, explicitSummary: any = null) => {
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
      ? summary.rows.filter((row: any) => {
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

    const toNumber = (value: any) => {
      if (value === null || value === undefined || value === '') return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const parsed = Number(String(value).replace(/[%,$\s]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const agentByCcms = new Map();
    const agentByNameAndId = new Map();

    for (const agent of updatedAgents) {
      if (agent.ccms) {
        agentByCcms.set(agent.ccms, agent);
      }
      const nameIdKey = `${(agent.name || '').toLowerCase()}|${agent.sourceId || ''}`;
      agentByNameAndId.set(nameIdKey, agent);
    }

    const chunkSize = 2500;
    console.log('[DEBUG 8 - applyBatchImport] Starting to apply rows to state. Total rows:', rowsToApply.length);
    for (let index = 0; index < rowsToApply.length; index += 1) {
      if (index > 0 && index % chunkSize === 0) {
        const applyPercent = Math.round((index / rowsToApply.length) * 100);
        setUploadStatus({
          type: 'info',
          message: `Applying rows… ${index.toLocaleString()} / ${rowsToApply.length.toLocaleString()}`,
          progress: applyPercent,
        });
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

      const nameIdKey = `${rawName.toLowerCase()}|${rawId}`;
      let targetAgent = agentByCcms.get(agentKey) || agentByNameAndId.get(nameIdKey);
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
        agentByCcms.set(agentKey, targetAgent);
        agentByNameAndId.set(nameIdKey, targetAgent);
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
      const toNumberOrNull = (value: any) => {
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

    // Recommendation 3 — auto-hide empty metric columns: scan the applied rows
    // once and let the visible-columns owner (App.tsx) hide any metric column
    // that received zero real values. See recommendations.md §"Recommendation 3".
    const fieldsWithData = collectFieldsWithData(rowsToApply);
    onImportColumnsScanRef.current?.(fieldsWithData);

    setUploadStatus({ type: 'info', message: 'Finalizing dashboard…', progress: 100 });
    await new Promise((resolve) => setTimeout(resolve, 0)); // let UI paint

    setHistoricalData(newHistory);
    setAgents(updatedAgents);
    setSupervisors(Array.from(nextSupervisors).sort());
    setHasUploadedData(true);
    const firstDate = rowsToApply.find((row: any) => row.date)?.date ? normalizeDate(String(rowsToApply.find((row: any) => row.date)?.date ?? '')) : DEFAULT_DATE;
    setSelectedDate(firstDate || DEFAULT_DATE);
    setActiveTimeframe('monthly');
    setUploadStatus({ type: 'success', message: `Applied ${rowsToApply.length} imported rows from the selected sheets.` });
    setTimeout(() => setUploadStatus(null), 5000);
  }, [agents, batchImportSummary, historicalData, onImportColumnsScanRef, setActiveTimeframe, setAgents, setHasUploadedData, setHistoricalData, setSelectedDate, setSupervisors, setUploadStatus, supervisors]);

  const confirmImportPreview = useCallback(
    async (config: any) => {
      if (!importPreview?.sheets || !importPreview.sheets.length) {
        closeImportPreview();
        return;
      }

      setUploadStatus({ type: 'info', message: 'Applying imported sheets to dashboard...' });

      try {
        if (config?.accountProfile) {
          saveAccountProfile(config.accountProfile);
          applyAccountProfile(config.accountProfile);
        }
        const sheetConfigs = config?.sheetConfigs || {};
        const allNormalizedRows = [];
        const warnings = [];

        // 1. Column mapping with user overrides & 2. aggregateTransactions for transaction-classified sheets
        for (let sheetIdx = 0; sheetIdx < importPreview.sheets.length; sheetIdx += 1) {
          const sheet = importPreview.sheets[sheetIdx];
          const namespacedKey = sheet.workbookName ? `${sheet.workbookName}::${sheet.sheetName}` : null;
          const sheetConfig =
            (namespacedKey ? sheetConfigs[namespacedKey] : null) ||
            sheetConfigs[sheet.sheetName] ||
            sheetConfigs[sheetIdx];
          const userMappings = sheetConfig?.columnMappings || {};
          const headers = sheet.headerRow ?? [];
          const rows = sheet.rows ?? [];

          const mappedHeaders = [];
          for (let colIdx = 0; colIdx < headers.length; colIdx += 1) {
            const rawHeader = headers[colIdx];
            const headerStr = String(rawHeader ?? '').trim();

            let mappedField = undefined;
            if (Object.prototype.hasOwnProperty.call(userMappings, headerStr)) {
              mappedField = userMappings[headerStr];
            } else if (Object.prototype.hasOwnProperty.call(userMappings, rawHeader)) {
              mappedField = userMappings[rawHeader];
            } else {
              const sampleVals = rows
                .slice(0, 50)
                .map((r: any) => r?.[colIdx])
                .filter((v: any) => v !== undefined && v !== null && String(v).trim() !== '');
              mappedField = normalizeHeaderToField(headerStr, sampleVals);
            }

            if (mappedField) {
              mappedHeaders.push({ colIdx, mappedField });
            }
          }

          const rawMappedRows = [];
          for (const rawRow of rows) {
            const mappedRow: any = {};
            for (let m = 0; m < mappedHeaders.length; m += 1) {
              const { colIdx, mappedField } = mappedHeaders[m];
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
        const mergedRows = mergeNormalizedRows(validated.rows, {
          onWarning: (w: any) => warnings.push(w),
        });

        const summary = {
          files: new Set(importPreview.sheets.map((s: any) => s.workbookName || fileName)).size || 1,
          sheets: importPreview.sheets.length,
          rows: mergedRows,
          warnings,
          errors: [],
          sources: importPreview.sheets.map((s: any) => ({
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
    [applyBatchImport, closeImportPreview, importPreview, setBatchImportSummary, setUploadStatus]
  );

  const processFile = useCallback(
    async (file: any) => {
      if (!file) return;

      const fileType = detectFileType(file.name);
      console.log('[DEBUG 1b - processFile] File detected:', { name: file.name, size: file.size, detectedType: fileType });

      if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
        console.log('[DEBUG 1c - processFile] Routing Excel to import preview');
        const controller = new AbortController();
        importAbortControllerRef.current?.abort();
        importAbortControllerRef.current = controller;

        const cancelLoading = () => {
          controller.abort();
          setUploadStatus({
            type: 'info',
            message: 'Workbook loading cancelled.',
            progress: 100,
            cancelAction: null,
          });
          setTimeout(() => setUploadStatus(null), 2000);
        };

        setUploadStatus({
          type: 'info',
          message: `Preparing ${file.name} for import preview...`,
          progress: 0,
          cancelAction: cancelLoading,
        });

        try {
          const { sheets, skippedSheets: rawSkipped } = await convertWorkbookToSheets(file, {
            signal: controller.signal,
            onProgress: (progress: any) => {
              setUploadStatus({
                type: 'info',
                message: progress.message || `Loading ${file.name}...`,
                progress: typeof progress.percent === 'number' ? progress.percent : 0,
                cancelAction: cancelLoading,
              });
            },
          });
          const { selectedSheets: filteredSheets, skippedSheets } = selectSheetsWithDetails(sheets);
          const combinedSkipped = [
            ...skippedSheets,
            ...(rawSkipped || []).map((name: any) => ({
              sheetName: name,
              workbookName: file.name,
              reason: 'Empty sheet or no data rows',
            })),
          ];

          setUploadStatus(null);

          if ((!filteredSheets || filteredSheets.length === 0) && combinedSkipped.length === 0) {
            setUploadStatus({ type: 'error', message: 'No usable data sheets detected in the workbook.' });
            setTimeout(() => setUploadStatus(null), 5000);
            return;
          }

          openImportPreview({
            fileName: file.name,
            sheets: filteredSheets || [],
            skippedSheets: combinedSkipped,
          });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          console.error('Failed to parse workbook for preview:', error);
          setUploadStatus({
            type: 'error',
            message: 'The workbook could not be processed. Please check the file format.',
          });
          setTimeout(() => setUploadStatus(null), 5000);
        } finally {
          if (importAbortControllerRef.current?.signal === controller.signal) {
            importAbortControllerRef.current = null;
          }
        }
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
          console.error('Failed to parse CSV for preview:', error);
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
    },
    [importAbortControllerRef, openImportPreview, setUploadStatus]
  );

  return {
    applyBatchImport,
    confirmImportPreview,
    processFile,
  };
};
