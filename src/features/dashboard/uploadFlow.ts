// uploadFlow.ts — S1(c) of the `useDashboardData` split (recommendations.md).
// Move-only extraction from hooks.ts: the multi-file batch parser
// (handleMultipleFiles), the automatic-import pipeline (handleAutomaticImport,
// continueAutomaticImport, handleAutomaticFileUpload) and the single-file
// upload/drop entry points (handleFileUpload, handleFileDrop). Type-only `any`
// annotations match the S1(a)/S1(b)/S1(e) precedent (see ./state.ts).
// ⚠️ STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE. Mapping/alias fixes
// belong in importPolicy.ts (FIELD_ALIASES), nowhere else.
//
// S1(c)/S1(d) cycle break: processFile (still in hooks.ts) used to early-out
// into handleAutomaticImport when an account profile exists, which would make
// this module and the future batchImport module import each other. That early
// out now lives in routeSingleFile below, and useUploadFlow receives the
// (d)-batch callbacks (applyBatchImport, processFile) as parameters from the
// hooks.ts orchestrator — neither extracted module ever imports the other.

import { useCallback } from 'react';
import { applyAccountProfile, DEFAULT_ACCOUNT_PROFILE } from './config';
import { getResolveWindowField, RESOLVE_WINDOW_FIELDS } from './import/importPolicy';
import {
  convertWorkbookToSheetsViaWorker,
  parseCsvFileText,
  runImportService,
  selectSheetsWithDetails,
} from './import';
import { detectFileType } from './import/fileTypeDetector';
import { loadAccountProfile, saveAccountProfile } from '../accountSetup/account-profile-storage';

// ─── Mapping-review & account-profile helpers ──────────────────────────────
const resolveWindowReviewItems = (diagnostics: any, accountProfile: any) => {
  if (accountProfile?.resolveRate?.shortTerm?.data?.matchedColumns?.length &&
      accountProfile?.resolveRate?.longTerm?.data?.matchedColumns?.length) {
    return [];
  }

  const windows = diagnostics.filter((item: any) => item.resolveWindow || getResolveWindowField(item.mappedField));
  return windows.length > 2 ? windows : [];
};

const customerExperienceReviewItems = (diagnostics: any, accountProfile: any) => {
  if (accountProfile?.customerExperience?.agentSpecificColumn) return [];
  return diagnostics.filter((item: any) => item.choiceGroup === 'customer-experience-agent-survey');
};

const customMetricReviewItems = (diagnostics: any, accountProfile: any) => {
  const ignored = new Set(accountProfile?.ignoredCustomMetricColumns || []);
  return diagnostics.filter((item: any) => item.unrecognizedPlausible && !ignored.has(String(item.header).trim().toLowerCase()));
};

// Wizard questions are answered once per column header (answers are stored by
// header and mappingOverrides are applied header-globally across every
// file/sheet during import), so the same header appearing in multiple files
// must produce ONE question, not one per file. Merge diagnostics that share a
// header, keeping the highest-score item as the face of the question and
// listing the affected files for display.
const consolidateHeaderDuplicates = (items: any) => {
  const byHeader = new Map<string, any>();
  const normalized = (header: any) => String(header || '').trim().toLowerCase();
  for (const item of items) {
    const headerKey = normalized(item.header);
    if (!headerKey) continue;
    const existing = byHeader.get(headerKey);
    if (!existing) {
      byHeader.set(headerKey, { item, fileNames: [item.fileName], sheetNames: [item.sheetName] });
      continue;
    }
    if (!existing.fileNames.includes(item.fileName)) existing.fileNames.push(item.fileName);
    if (!existing.sheetNames.includes(item.sheetName)) existing.sheetNames.push(item.sheetName);
    if ((item.score ?? 0) > (existing.item.score ?? 0)) existing.item = item;
  }
  return Array.from(byHeader.values()).map((entry: any) => {
    if (entry.fileNames.length <= 1 && entry.sheetNames.length <= 1) return entry.item;
    return {
      ...entry.item,
      fileName: entry.fileNames[0],
      sheetName: entry.sheetNames[0],
      duplicateFileNames: entry.fileNames,
      duplicateSheetNames: entry.sheetNames,
    };
  });
};

const customMetricKeyForHeader = (header: any) =>
  `customMetric_${String(header || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'column'}`;

const saveCustomMetricDecisions = (accountName: any, answers: any) => {
  const overrides: any = {};
  const entries: any = Object.entries(answers || {});
  if (!accountName || entries.length === 0) return overrides;

  const profile = JSON.parse(JSON.stringify(loadAccountProfile(accountName) || DEFAULT_ACCOUNT_PROFILE));
  profile.accountName = accountName;
  profile.customMetrics = Array.isArray(profile.customMetrics) ? profile.customMetrics : [];
  profile.ignoredCustomMetricColumns = Array.isArray(profile.ignoredCustomMetricColumns)
    ? profile.ignoredCustomMetricColumns
    : [];

  for (const [header, answer] of entries) {
    const normalizedHeader = String(header).trim().toLowerCase();
    if (!answer || answer.decision === 'ignore') {
      profile.ignoredCustomMetricColumns = [...new Set([...profile.ignoredCustomMetricColumns, normalizedHeader])];
      overrides[header] = null;
      continue;
    }

    const key = customMetricKeyForHeader(header);
    profile.ignoredCustomMetricColumns = profile.ignoredCustomMetricColumns.filter((item: any) => item !== normalizedHeader);
    profile.customMetrics = profile.customMetrics.filter((metric: any) => metric.matchedColumn !== header);
    profile.customMetrics.push({
      key,
      label: answer.label,
      matchedColumn: header,
      calcStyle: answer.calcStyle,
      target: Number(answer.target || 0),
      higherIsBetter: Boolean(answer.higherIsBetter),
    });
    overrides[header] = key;
  }

  saveAccountProfile(profile);
  applyAccountProfile(profile);
  return overrides;
};

const saveResolveWindowChoices = (accountName: any, diagnostics: any, mappingOverrides: any) => {
  if (!accountName) return;

  const selected: any = { shortTerm: null, longTerm: null };
  for (const diagnostic of diagnostics) {
    const choice = Object.prototype.hasOwnProperty.call(mappingOverrides, diagnostic.header)
      ? mappingOverrides[diagnostic.header]
      : diagnostic.mappedField;
    if (choice === 'resolve2hr' && !selected.shortTerm) selected.shortTerm = diagnostic;
    if (choice === 'resolve3d' && !selected.longTerm) selected.longTerm = diagnostic;
  }
  if (!selected.shortTerm && !selected.longTerm) return;

  const profile = JSON.parse(JSON.stringify(loadAccountProfile(accountName) || DEFAULT_ACCOUNT_PROFILE));
  profile.accountName = accountName;
  profile.resolveRate = {
    ...profile.resolveRate,
    shortTerm: selected.shortTerm
      ? {
          tracked: true,
          windowLabel: selected.shortTerm.resolveWindow || RESOLVE_WINDOW_FIELDS.resolve2hr.windowLabel,
          data: { shape: 'ready-rate', matchedColumns: [selected.shortTerm.header] },
          target: profile.resolveRate.shortTerm.target,
        }
      : profile.resolveRate.shortTerm,
    longTerm: selected.longTerm
      ? {
          tracked: true,
          windowLabel: selected.longTerm.resolveWindow || RESOLVE_WINDOW_FIELDS.resolve3d.windowLabel,
          data: { shape: 'ready-rate', matchedColumns: [selected.longTerm.header] },
          target: profile.resolveRate.longTerm.target,
        }
      : profile.resolveRate.longTerm,
  };
  saveAccountProfile(profile);
  applyAccountProfile(profile);
};

const saveCustomerExperienceChoice = (accountName: any, diagnostics: any, mappingOverrides: any) => {
  if (!accountName) return;
  const choice = diagnostics.find((diagnostic: any) =>
    diagnostic.choiceGroup === 'customer-experience-agent-survey' &&
    mappingOverrides[diagnostic.header] === 'vxs'
  );
  if (!choice) return;

  const profile = JSON.parse(JSON.stringify(loadAccountProfile(accountName) || DEFAULT_ACCOUNT_PROFILE));
  profile.accountName = accountName;
  profile.customerExperience = {
    ...profile.customerExperience,
    agentSpecificColumn: choice.header,
    data: {
      ...profile.customerExperience.data,
      matchedColumns: [choice.header],
    },
  };
  saveAccountProfile(profile);
  applyAccountProfile(profile);
};

const MULTI_FILE_CONCURRENCY = 4;

// ─── Upload Flow Hook ──────────────────────────────────────────────────────
// Everything the six callbacks need arrives as one object passed by
// useDashboardData (state setters/refs from ./state, plus the S1(d)-batch
// callbacks that still live in hooks.ts until useBatchImport lands). Passing
// the (d) callbacks in — instead of importing them — is what keeps this module
// and the future batchImport module free of any import cycle.
//
// `any` on the values is deliberate and matches the S1(a)/S1(b)/S1(e)
// precedent: they originate in `@ts-nocheck` land. Give them real types as a
// follow-up, not as part of a move-only step.
export interface UploadFlowDeps {
  accountName: string;
  accountProfile: any;
  hasSavedAccountProfile: boolean;
  rateMergeStyle: any;
  pendingAutomaticImport: any;
  importAbortControllerRef: any;
  openImportPreview: (payload: any) => void;
  setUploadStatus: (value: any) => void;
  setBatchImportSummary: (value: any) => void;
  setPendingAutomaticImport: (value: any) => void;
  setPendingAutomaticFiles: (value: any) => void;
  setMappingReview: (value: any) => void;
  applyBatchImport: any;
  processFile: any;
}

export const useUploadFlow = (deps: UploadFlowDeps) => {
  const {
    accountName, accountProfile, hasSavedAccountProfile, rateMergeStyle,
    pendingAutomaticImport, importAbortControllerRef, openImportPreview,
    setUploadStatus, setBatchImportSummary, setPendingAutomaticImport,
    setPendingAutomaticFiles, setMappingReview,
    applyBatchImport, processFile,
  } = deps;

  const handleMultipleFiles = useCallback(
    async (files: any) => {
      // Cancel any in-flight single-file load before starting a batch.
      importAbortControllerRef.current?.abort();
      const controller = new AbortController();
      importAbortControllerRef.current = controller;

      // Filter out duplicate files by name and size to prevent redundant parses
      const seenFiles = new Set<string>();
      const uniqueFiles: any[] = [];
      const duplicateFiles: string[] = [];

      for (const file of files) {
        const key = `${(file.name || '').trim().toLowerCase()}|${file.size ?? 0}`;
        if (seenFiles.has(key)) {
          duplicateFiles.push(file.name);
        } else {
          seenFiles.add(key);
          uniqueFiles.push(file);
        }
      }

      if (duplicateFiles.length > 0) {
        console.warn(`[handleMultipleFiles] Duplicate files skipped: ${duplicateFiles.join(', ')}`);
      }

      const filesToProcess = uniqueFiles;
      const totalFiles = filesToProcess.length;
      // Track per-file progress percent (0–100) for live aggregation.
      const filePercents = new Array(totalFiles).fill(0);

      const cancelBatch = () => {
        controller.abort();
        setUploadStatus({
          type: 'info',
          message: 'Batch import cancelled.',
          progress: 100,
          cancelAction: null,
        });
        setTimeout(() => setUploadStatus(null), 2000);
      };

      const emitBatchProgress = (fileIndex: any, filePercent: any, fileName: any) => {
        filePercents[fileIndex] = filePercent;
        const completedFiles = filePercents.filter((p: any) => p >= 100).length;
        const overallPercent = Math.round(
          filePercents.reduce((sum: any, p: any) => sum + p, 0) / totalFiles
        );
        const currentFile = Math.min(
          completedFiles + (filePercent >= 100 ? 0 : 1),
          totalFiles,
        );
        setUploadStatus({
          type: 'info',
          message: `File ${currentFile} of ${totalFiles} — ${fileName} — ${filePercent}%`,
          progress: Math.min(overallPercent, 99),
          cancelAction: cancelBatch,
        });
      };

      setUploadStatus({
        type: 'info',
        message: `Preparing ${totalFiles} files for import preview...`,
        progress: 0,
        cancelAction: cancelBatch,
      });

      // Concurrency pool: process up to MULTI_FILE_CONCURRENCY files in parallel.
      const results = new Array(totalFiles).fill(null);
      const skippedResults = new Array(totalFiles).fill(null);
      let nextIndex = 0;

      const runWorker = async () => {
        while (nextIndex < totalFiles) {
          if (controller.signal.aborted) break;
          const i = nextIndex;
          nextIndex += 1;
          const file = filesToProcess[i];
          const fileType = detectFileType(file.name);
          try {
            if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'xlsm') {
              const { sheets, skippedSheets: rawSkipped } = await convertWorkbookToSheetsViaWorker(file, {
                signal: controller.signal,
                includeRawRowsForPreview: true,
                onProgress: (progress: any) => {
                  emitBatchProgress(i, progress.percent ?? 0, file.name);
                },
              });
              emitBatchProgress(i, 100, file.name);
              const selection = selectSheetsWithDetails(sheets);
              results[i] = selection.selectedSheets;
              skippedResults[i] = [
                ...selection.skippedSheets,
                ...(rawSkipped || []).map((name: any) => ({
                  sheetName: name,
                  workbookName: file.name,
                  reason: 'Empty sheet or no data rows',
                })),
              ];
            } else if (fileType === 'csv' || fileType === 'tsv' || fileType === 'txt') {
              emitBatchProgress(i, 50, file.name);
              const textTable = await parseCsvFileText(file);
              emitBatchProgress(i, 100, file.name);
              results[i] = [
                {
                  workbookName: file.name,
                  sheetName: file.name.replace(/\.[^/.]+$/, '') || 'CSV',
                  index: i,
                  headerRow: textTable.headers,
                  rows: textTable.rows,
                  rowCount: textTable.rows.length,
                },
              ];
              skippedResults[i] = [];
            }
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              throw error;
            }
            console.error(`Failed to parse file "${file.name}":`, error);
            results[i] = [];
            skippedResults[i] = [];
          }
        }
      };

      try {
        const pool = Array.from(
          { length: Math.min(MULTI_FILE_CONCURRENCY, totalFiles) },
          () => runWorker()
        );
        await Promise.all(pool);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('Failed to parse batch files:', error);
        setUploadStatus({
          type: 'error',
          message: 'The batch files could not be processed. Please check the file set.',
        });
        setTimeout(() => setUploadStatus(null), 5000);
        return;
      } finally {
        if (importAbortControllerRef.current?.signal === controller.signal) {
          importAbortControllerRef.current = null;
        }
      }

      if (controller.signal.aborted) return;

      const combinedSheets = results.flat().filter(Boolean);
      const combinedSkipped = skippedResults.flat().filter(Boolean);

      if (combinedSheets.length === 0 && combinedSkipped.length === 0) {
        setUploadStatus(null);
        setUploadStatus({ type: 'error', message: 'No usable sheets detected across the selected files.' });
        setTimeout(() => setUploadStatus(null), 5000);
        return;
      }

      openImportPreview({
        fileName: `${totalFiles} files batch`,
        sheets: combinedSheets,
        skippedSheets: combinedSkipped,
      });
      setUploadStatus(null);
    },
    [importAbortControllerRef, openImportPreview, setUploadStatus]
  );

  const handleAutomaticImport = useCallback(
    async (files: any, mappingOverrides: any = {}, customMetricAnswers: any = {}) => {
      const filesToImport: any = Array.from(files || []).filter(Boolean);
      if (!filesToImport.length) return;

      const customMetricOverrides = saveCustomMetricDecisions(accountName, customMetricAnswers);
      const effectiveMappingOverrides = { ...mappingOverrides, ...customMetricOverrides };

      importAbortControllerRef.current?.abort();
      const controller = new AbortController();
      importAbortControllerRef.current = controller;

      setUploadStatus({
        type: 'info',
        message: `Preparing ${filesToImport.length} file${filesToImport.length > 1 ? 's' : ''}...`,
        progress: 0,
        cancelAction: () => controller.abort(),
      });

      try {
        const result = await runImportService(filesToImport, {
          signal: controller.signal,
          detectDuplicateFiles: true,
          mappingOverrides: effectiveMappingOverrides,
          rateMergeStyle: loadAccountProfile(accountName)?.calculationStyles?.rateMergeStyle || rateMergeStyle,
          onProgress: (progress: any) => {
            setUploadStatus({
              type: 'info',
              message: progress.message || 'Importing your files...',
              progress: typeof progress.percent === 'number' ? progress.percent : 0,
              cancelAction: () => controller.abort(),
            });
          },
        });

        if (!result.rows?.length) {
          throw new Error(result.errors?.[0]?.message || 'No valid rows were found in the selected files.');
        }

        setBatchImportSummary(result);
        const diagnostics = result.mappingDiagnostics || [];
        const unmappedCount = diagnostics.filter((item: any) => !item.mappedField).length;
        const lowConfidenceCount = diagnostics.filter((item: any) => item.mappedField && item.confidence === 'low').length;
        const collisionCount = diagnostics.filter((item: any) => item.collisionWith?.length).length;
        // Rule 1: Confident canonical matches auto-apply silently (no question).
        // Rule 2: Structural/non-metric fingerprints and identifier keywords are silently ignored (no question).
        // Rule 3: Only unmapped columns with metric fingerprints (count-integer, percent-decimal, percent-whole, duration-seconds)
        //         are reviewed via customMetricReviewItems below.
        // Headers that appear in multiple files/sheets are consolidated to one
        // question each BEFORE the special review groups run, so resolve-window
        // gating ("more than 2 windows") and choice-group logic see one entry
        // per column, exactly as they would for a single-file import.
        const consolidatedDiagnostics = consolidateHeaderDuplicates(diagnostics);
        const reviewItems = consolidatedDiagnostics.filter((item: any) =>
          (item.mappedField && item.confidence === 'low') ||
          Boolean(item.collisionWith?.length)
        );
        const windowItems = resolveWindowReviewItems(consolidatedDiagnostics, hasSavedAccountProfile ? accountProfile : null);
        for (const item of windowItems) {
          if (!reviewItems.some((candidate: any) => candidate.header === item.header)) {
            reviewItems.push(item);
          }
        }
        const customerExperienceItems = customerExperienceReviewItems(
          consolidatedDiagnostics,
          hasSavedAccountProfile ? accountProfile : null
        );
        for (const item of customerExperienceItems) {
          if (!reviewItems.some((candidate: any) => candidate.header === item.header)) {
            reviewItems.push(item);
          }
        }
        const customItems = customMetricReviewItems(
          consolidatedDiagnostics,
          hasSavedAccountProfile ? accountProfile : null
        );
        for (const item of customItems) {
          if (!reviewItems.some((candidate: any) => candidate.header === item.header)) {
            reviewItems.push(item);
          }
        }
        if (reviewItems.length > 0 && Object.keys(effectiveMappingOverrides).length === 0) {
          setPendingAutomaticImport(result);
          setPendingAutomaticFiles(filesToImport);
          setMappingReview(reviewItems);
          setUploadStatus(null);
          return;
        }
        if (Object.keys(effectiveMappingOverrides).length > 0) {
          saveResolveWindowChoices(accountName, diagnostics, effectiveMappingOverrides);
          saveCustomerExperienceChoice(accountName, diagnostics, effectiveMappingOverrides);
        }
        setUploadStatus({
          type: 'info',
          message: `Mapped ${diagnostics.length - unmappedCount} of ${diagnostics.length} columns. ${unmappedCount + lowConfidenceCount} field${unmappedCount + lowConfidenceCount === 1 ? '' : 's'} need attention${collisionCount ? `; ${collisionCount} collision${collisionCount === 1 ? '' : 's'} detected` : ''}. Applying ${result.rows.length.toLocaleString()} rows...`,
          progress: 100,
          cancelAction: null,
        });
        await applyBatchImport(null, result);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setUploadStatus({ type: 'info', message: 'Import cancelled.' });
          setTimeout(() => setUploadStatus(null), 2000);
          return;
        }

        console.error('Automatic import failed:', error);
        setUploadStatus({
          type: 'error',
          message: error instanceof Error ? error.message : 'The files could not be imported.',
        });
        setTimeout(() => setUploadStatus(null), 6000);
      } finally {
        if (importAbortControllerRef.current?.signal === controller.signal) {
          importAbortControllerRef.current = null;
        }
      }
    },
    [accountName, accountProfile, applyBatchImport, hasSavedAccountProfile, importAbortControllerRef, rateMergeStyle, setBatchImportSummary, setMappingReview, setPendingAutomaticFiles, setPendingAutomaticImport, setUploadStatus]
  );

  const continueAutomaticImport = useCallback(
    async (mappingOverrides: any = {}, customMetricAnswers: any = {}) => {
      const cachedResult = pendingAutomaticImport;
      if (!cachedResult) return;

      setPendingAutomaticImport(null);
      setPendingAutomaticFiles([]);
      setMappingReview([]);

      try {
        const customMetricOverrides = saveCustomMetricDecisions(accountName, customMetricAnswers);
        const effectiveMappingOverrides = { ...mappingOverrides, ...customMetricOverrides };
        const diagnostics = cachedResult.mappingDiagnostics || [];

        if (Object.keys(effectiveMappingOverrides).length > 0) {
          saveResolveWindowChoices(accountName, diagnostics, effectiveMappingOverrides);
          saveCustomerExperienceChoice(accountName, diagnostics, effectiveMappingOverrides);
        }

        setUploadStatus({
          type: 'info',
          message: 'Applying imported data...',
          progress: 100,
        });

        await applyBatchImport(null, cachedResult);
      } catch (error) {
        console.error('Failed to apply cached import:', error);
        setUploadStatus({
          type: 'error',
          message: error instanceof Error ? error.message : 'The files could not be imported.',
        });
        setTimeout(() => setUploadStatus(null), 6000);
      }
    },
    [accountName, applyBatchImport, pendingAutomaticImport, setMappingReview, setPendingAutomaticFiles, setPendingAutomaticImport, setUploadStatus]
  );

  const handleAutomaticFileUpload = useCallback(
    (event: any) => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      void handleAutomaticImport(files);
    },
    [handleAutomaticImport]
  );

  // Single-file entry point: when an account profile is saved the file skips
  // the manual preview route entirely and goes straight to the automatic
  // import. This early-out used to sit at the top of processFile (S1(d)); it
  // moved here so this module has no edge back into the batch-import module —
  // see the cycle note at the top of the file.
  const routeSingleFile = useCallback(
    async (file: any) => {
      if (!file) return;

      if (loadAccountProfile(accountName)) {
        await handleAutomaticImport([file]);
        return;
      }

      await processFile(file);
    },
    [accountName, handleAutomaticImport, processFile]
  );

  const handleFileUpload = useCallback(
    async (event: any) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;

      if (files.length === 1) {
        await routeSingleFile(files[0]);
        if (event.target) event.target.value = '';
        return;
      }

      await handleMultipleFiles(files);
      if (event.target) event.target.value = '';
    },
    [routeSingleFile, handleMultipleFiles]
  );

  const handleFileDrop = useCallback(
    (fileOrFiles: any) => {
      console.log('[DEBUG 1a - handleFileDrop] File(s) dropped:', fileOrFiles);
      if (!fileOrFiles) return;

      if (Array.isArray(fileOrFiles) || (typeof FileList !== 'undefined' && fileOrFiles instanceof FileList)) {
        const files = Array.from(fileOrFiles);
        if (files.length === 1) {
          routeSingleFile(files[0]);
        } else if (files.length > 1) {
          handleMultipleFiles(files);
        }
        return;
      }

      routeSingleFile(fileOrFiles);
    },
    [routeSingleFile, handleMultipleFiles]
  );

  return {
    handleMultipleFiles,
    handleAutomaticImport,
    continueAutomaticImport,
    handleAutomaticFileUpload,
    handleFileUpload,
    handleFileDrop,
  };
};
