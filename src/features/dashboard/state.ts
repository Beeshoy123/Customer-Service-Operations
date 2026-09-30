// state.ts — S1(a) of the `useDashboardData` split (recommendations.md, 2026-09-30).
// Move-only extraction from hooks.ts: the accountProfile/hasSavedAccountProfile
// memos, the 16 useState declarations, the setSelectedMonth wrapper, the two
// refs, and the loadedMonths memo. No logic changes — verified by an
// origin-diff parity audit against hooks.ts @ 36fff9a.
// ⚠️ STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE. Mapping/alias fixes
// belong in importPolicy.ts (FIELD_ALIASES), nowhere else.

import { useCallback, useMemo, useRef, useState } from 'react';
import { DEFAULT_DATE, DEFAULT_MANAGER_NAME, applyAccountProfile } from './config';
import { ALL_MONTHS, collectLoadedMonths } from './helpers';
import { loadAccountProfile, loadRateMergeStyle, saveRateMergeStyle } from '../accountSetup/account-profile-storage';
import type { MappingDiagnostic } from './import/types';

// Owns the base state of the dashboard: the four time selectors, the data
// payload (agents / supervisors / oamName / historicalData), the import-flow
// scratch state, and the derived loadedMonths. `persistedState` (the
// once-per-mount localStorage read) is passed in by useDashboardData so this
// module stays free of persistence concerns — S1(b) will move those too.
/* eslint-disable @typescript-eslint/no-explicit-any -- S1(a) move-only extraction: the hook below is still
   untyped exactly as it was in hooks.ts (@ts-nocheck land). Typing it is a
   separate, deliberate step — do not widen this file's surface while moving it. */
export const useDashboardDataState = (persistedState: any, accountName: string, onImportColumnsScan: any) => {
  const accountProfile = useMemo(() => {
    const profile = accountName ? loadAccountProfile(accountName) : null;
    return applyAccountProfile(profile);
  }, [accountName]);
  const hasSavedAccountProfile = useMemo(
    () => Boolean(accountName && loadAccountProfile(accountName)),
    [accountName]
  );

  const [activeTimeframe, setActiveTimeframe] = useState(() => persistedState?.activeTimeframe || 'monthly');
  const [selectedWeek, setSelectedWeek] = useState(() => persistedState?.selectedWeek || 'Week 1');
  const [selectedDate, setSelectedDate] = useState(() => persistedState?.selectedDate || DEFAULT_DATE);
  const [selectedDow, setSelectedDow] = useState(() => persistedState?.selectedDow || 'Monday');
  const [selectedMonth, setSelectedMonthRaw] = useState(() => persistedState?.selectedMonth || ALL_MONTHS);
  const [selectedMonthChosen, setSelectedMonthChosen] = useState(() => Boolean(persistedState?.selectedMonthChosen));
  // User-driven month picks (from the Timeframe menu) are remembered; before
  // any explicit choice the dashboard defaults to the latest loaded month.
  const setSelectedMonth = useCallback((value: any) => {
    setSelectedMonthChosen(true);
    setSelectedMonthRaw(value);
  }, []);

  const [agents, setAgents] = useState(() => persistedState?.agents || []);
  const [supervisors, setSupervisors] = useState(() => persistedState?.supervisors || []);
  const [oamName, setOamName] = useState(() => persistedState?.oamName || DEFAULT_MANAGER_NAME);
  const [historicalData, setHistoricalData] = useState(() => persistedState?.historicalData || {});
  const [hasUploadedData, setHasUploadedData] = useState(() => !!persistedState?.hasUploadedData);
  const [uploadStatus, setUploadStatus] = useState<any>(null);
  const [batchImportSummary, setBatchImportSummary] = useState<any>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [mappingReview, setMappingReview] = useState<MappingDiagnostic[]>([]);
  const [pendingAutomaticImport, setPendingAutomaticImport] = useState<any>(null);
  const [pendingAutomaticFiles, setPendingAutomaticFiles] = useState<File[]>([]);
  const [rateMergeStyle, setRateMergeStyleState] = useState(() => loadRateMergeStyle(accountName));
  const importAbortControllerRef = useRef(null);
  const onImportColumnsScanRef = useRef(onImportColumnsScan);
  onImportColumnsScanRef.current = onImportColumnsScan; // keep ref in sync (same pattern as aiResetRef in App.tsx)

  const loadedMonths = useMemo(() => collectLoadedMonths(historicalData), [historicalData]);

  // Thin import-preview wrappers — live here (not in hooks.ts) so the setter
  // they wrap stays traceable to its useState call and the deps lint stays
  // honest about them being stable.
  const openImportPreview = useCallback((config: any) => {
    setImportPreview({
      isOpen: true,
      fileName: config.fileName,
      sheets: config.sheets,
      skippedSheets: config.skippedSheets || [],
    });
  }, []);

  const closeImportPreview = useCallback(() => {
    setImportPreview(null);
  }, []);

  const setRateMergeStyle = useCallback((style: any) => {
    setRateMergeStyleState(style);
    saveRateMergeStyle(accountName, style);
  }, [accountName]);

  // One flat bundle — useDashboardData destructures all of it and forwards it
  // through the unchanged 37-key return object, so no consumer changes.
  return {
    accountProfile, hasSavedAccountProfile,
    activeTimeframe, setActiveTimeframe,
    selectedWeek, setSelectedWeek,
    selectedDate, setSelectedDate,
    selectedDow, setSelectedDow,
    selectedMonth, setSelectedMonth,
    selectedMonthChosen, setSelectedMonthChosen,
    setSelectedMonthRaw,
    agents, setAgents,
    supervisors, setSupervisors,
    oamName, setOamName,
    historicalData, setHistoricalData,
    hasUploadedData, setHasUploadedData,
    uploadStatus, setUploadStatus,
    batchImportSummary, setBatchImportSummary,
    importPreview, setImportPreview,
    mappingReview, setMappingReview,
    pendingAutomaticImport, setPendingAutomaticImport,
    pendingAutomaticFiles, setPendingAutomaticFiles,
    rateMergeStyle, setRateMergeStyleState, setRateMergeStyle,
    openImportPreview, closeImportPreview,
    importAbortControllerRef,
    onImportColumnsScanRef,
    loadedMonths,
  };
};
