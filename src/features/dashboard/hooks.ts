// @ts-nocheck
// ⚠️  STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE
// If a dashboard metric shows 0, null, or wrong values after import, the fix
// belongs in importPolicy.ts (FIELD_ALIASES), NOT here. Row storage in
// applyBatchImport is correct and generic. See recommendations.md §"STANDING
// RULE" and the top-of-file banner in importPolicy.ts for the full checklist.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  CHART_COLORS,
  METRIC_CONFIG,
  PERSONA,
  TARGETS,
} from './config';
import { useDashboardDataState } from './state';
import { readPersistedDashboardState, useDashboardPersistence } from './persistence';
import { useTimeframeSelectors } from './timeframe';
import { useBatchImport } from './batchImport';
import { useUploadFlow } from './uploadFlow';
import {
  agentMatchesSearch,
  aggregateTeamMetrics,
  ALL_MONTHS,
  calculateTrend,
  calculateWeightedVSF,
} from './helpers';
import type { SheetTable, SheetGranularity, ImportResult, SkippedSheetInfo } from './import/types';

// ============================================================================
// FILE STRUCTURE:
// ├── Dashboard Context & Hook
// ├── Dashboard Data Management Hook
// ├── AI Network & Resilience Helpers
// └── AI Assistant Tools Hook
// ============================================================================

const CONTEXT_ONLY_HEADER_PATTERN = /(?:^|[_\s-])(location|department|dept|skill\s*group|skillgroup|track|tracking|intent|intent\s*description|description|category|categorical|queue|team|region|site|supervisor|manager|recovery|hour|geographic|scorecard|id|key)(?:$|[_\s-])|key$|id$/i;

const isContextOnlyMapping = (diagnostic) =>
  !diagnostic.mappedField && CONTEXT_ONLY_HEADER_PATTERN.test(String(diagnostic.header || ''));

// ─── Dashboard Context & Hook ──────────────────────────────────────
// Typed as `any` on purpose: consumers are spread across many extracted
// component files that read the bundle loosely (no prop drilling). This keeps
// those files out of @ts-nocheck land without inventing a full prop contract.
export const DashboardContext = createContext<any>(null);
export const useDashboard = () => useContext(DashboardContext);

// ─── Dashboard Data Management Hook ──────────────────────────────────────
export const useDashboardData = (onDataReset = null, accountName = '', onImportColumnsScan = null) => {
  const persistedState = useMemo(() => readPersistedDashboardState(), []);

  // S1(a): the accountProfile memos, the 16 useState declarations, the
  // setSelectedMonth wrapper, the two refs and the loadedMonths memo now
  // live in ./state.ts (move-only extraction, recommendations.md).
  const state = useDashboardDataState(persistedState, accountName, onImportColumnsScan);
  const {
    accountProfile, hasSavedAccountProfile,
    activeTimeframe, setActiveTimeframe,
    selectedWeek, setSelectedWeek,
    selectedDate, setSelectedDate,
    selectedDow, setSelectedDow,
    selectedMonth, setSelectedMonth, setSelectedMonthRaw,
    selectedMonthChosen, setSelectedMonthChosen,
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
    rateMergeStyle, setRateMergeStyle,
    openImportPreview, closeImportPreview,
    importAbortControllerRef,
    onImportColumnsScanRef,
    loadedMonths,
  } = state;

  // S1(b): resetDashboard, the once-per-mount localStorage read and both write
  // effects now live in ./persistence.ts (move-only extraction, recommendations.md).
  const { resetDashboard } = useDashboardPersistence(
    {
      agents, supervisors, oamName, historicalData, hasUploadedData,
      activeTimeframe, selectedWeek, selectedDate, selectedDow, selectedMonth, selectedMonthChosen,
      setAgents, setSupervisors, setHistoricalData, setHasUploadedData, setBatchImportSummary,
      setImportPreview, setMappingReview, setPendingAutomaticImport, setPendingAutomaticFiles,
      setUploadStatus, setActiveTimeframe, setSelectedWeek, setSelectedDate, setSelectedDow,
      setSelectedMonthRaw, setSelectedMonthChosen,
      importAbortControllerRef,
    },
    onDataReset
  );

  // Keep the selection valid as data changes: default to the latest loaded
  // month until the user picks one explicitly, and fall back to the latest
  // month if the selected month's data disappears (reset / new import).
  useEffect(() => {
    if (loadedMonths.length === 0) return;
    setSelectedMonthRaw((current) => {
      if (selectedMonthChosen && (current === ALL_MONTHS || loadedMonths.includes(current))) return current;
      return loadedMonths[0];
    });
  }, [loadedMonths, selectedMonthChosen]); // oxlint-disable-line react-hooks/exhaustive-deps -- setSelectedMonthRaw comes from ./state (S1a), untraceable to its useState here

  // S1(d): applyBatchImport, confirmImportPreview and processFile now live in
  // ./batchImport.ts (move-only extraction, recommendations.md). They are fed
  // into useUploadFlow below as parameters — batchImport.ts and uploadFlow.ts
  // never import each other (the S1(c) cycle break made that possible).
  const { applyBatchImport, confirmImportPreview, processFile } = useBatchImport({
    agents, supervisors, historicalData, batchImportSummary, importPreview,
    importAbortControllerRef, onImportColumnsScanRef,
    setAgents, setSupervisors, setHistoricalData, setHasUploadedData,
    setSelectedDate, setActiveTimeframe, setUploadStatus, setBatchImportSummary,
    openImportPreview, closeImportPreview,
  });

  // S1(c): handleMultipleFiles, handleAutomaticImport, continueAutomaticImport,
  // handleAutomaticFileUpload, handleFileUpload and handleFileDrop now live in
  // ./uploadFlow.ts (move-only extraction, recommendations.md). The S1(d)
  // callbacks below are injected as parameters — uploadFlow.ts never imports
  // this module back, so the two can never form an import cycle (the
  // processFile → handleAutomaticImport early-out moved into uploadFlow's
  // routeSingleFile to make that possible).
  const {
    handleAutomaticImport, handleAutomaticFileUpload, continueAutomaticImport,
    handleFileUpload, handleFileDrop,
  } = useUploadFlow({
    accountName, accountProfile, hasSavedAccountProfile, rateMergeStyle,
    pendingAutomaticImport, importAbortControllerRef, openImportPreview,
    setUploadStatus, setBatchImportSummary, setPendingAutomaticImport,
    setPendingAutomaticFiles, setMappingReview,
    applyBatchImport, processFile,
  });

  // S1(e): the agentDataCache memo and the four timeframe selectors now live
  // in ./timeframe.ts (move-only extraction, recommendations.md).
  const { getAgentDataForTimeframe, handleDateChange, getTopHeadlineMonth, monthLabel } =
    useTimeframeSelectors({
      historicalData, hasUploadedData, activeTimeframe, selectedWeek,
      selectedDow, selectedDate, selectedMonth,
      setActiveTimeframe, setSelectedDate, setSelectedDow,
    });

  return {
    agents, supervisors, oamName, historicalData, hasUploadedData, uploadStatus, batchImportSummary,
    handleFileUpload, handleFileDrop, handleAutomaticImport, handleAutomaticFileUpload, continueAutomaticImport, mappingReview, rateMergeStyle, setRateMergeStyle, applyBatchImport, resetDashboard,
    accountProfile, hasSavedAccountProfile, importPreview, openImportPreview, closeImportPreview, confirmImportPreview,
    activeTimeframe, setActiveTimeframe, selectedWeek, setSelectedWeek, selectedDate, setSelectedDate,
    selectedDow, setSelectedDow, selectedMonth, setSelectedMonth, loadedMonths, monthLabel,
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
