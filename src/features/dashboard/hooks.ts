// @ts-nocheck
// ⚠️  STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE
// If a dashboard metric shows 0, null, or wrong values after import, the fix
// belongs in importPolicy.ts (FIELD_ALIASES), NOT here. Row storage in
// applyBatchImport is correct and generic. See recommendations.md §"STANDING
// RULE" and the top-of-file banner in importPolicy.ts for the full checklist.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
    uploadStatus, setUploadStatus, scheduleStatusClear,
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
    setSelectedDate, setActiveTimeframe, setUploadStatus, scheduleStatusClear, setBatchImportSummary,
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
    setPendingAutomaticFiles, setMappingReview, scheduleStatusClear,
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
  askAiQuery: '',
  askAiResponse: null,
  askAiLoading: false,
};

// Compact the context we send to the model so prompts stay within budget.
const slimAgents = (list) => (Array.isArray(list) ? list : []).map((a) => ({
  name: a?.name, supervisor: a?.supervisor, ccms: a?.ccms,
  phoneAdds: a?.phoneAdds, vhi: a?.vhi, aht: a?.aht, hold: a?.hold,
  dpc: a?.dpc, occ: a?.occ, csat: a?.csat, sales: a?.sales, handoffs: a?.handoffs,
}));

const slimSupervisors = (stats) => (Array.isArray(stats) ? stats : []).map((s) => ({
  name: s?.name, agentCount: s?.agentCount, trajectory: s?.trajectory, trend: s?.trend ?? null,
}));

const buildDashboardContext = (vars) => JSON.stringify({
  oamName: vars.oamName,
  activeTimeframe: vars.activeTimeframe,
  selectedDate: vars.selectedDate,
  selectedWeek: vars.selectedWeek,
  selectedDow: vars.selectedDow,
  activeLeaderData: vars.activeLeaderData,
  mtdLeaderData: vars.mtdLeaderData,
  supervisorStats: slimSupervisors(vars.supervisorStats),
  agents: slimAgents(vars.agents),
  supervisors: vars.supervisors,
}, null, 1);

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
  dowData,
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
  const [askAiQuery, setAskAiQuery] = useState('');
  const [askAiResponse, setAskAiResponse] = useState(null);
  const [askAiLoading, setAskAiLoading] = useState(false);

  // Keep the latest values in a ref so every generate* callback below can be
  // referentially stable (empty deps). Consumers list these callbacks in
  // their own effect dependency arrays — an unstable identity would re-fire
  // those effects on every keystroke and hammer the AI endpoint.
  const varsRef = useRef({
    agents, supervisors, oamName, historicalData, selectedDate, activeTimeframe,
    selectedWeek, selectedDow, getAgentDataForTimeframe, activeLeaderData,
    mtdLeaderData, supervisorStats, runChartMetric, runChartData, allActiveDates, dowData,
  });
  useEffect(() => {
    varsRef.current = {
      agents, supervisors, oamName, historicalData, selectedDate, activeTimeframe,
      selectedWeek, selectedDow, getAgentDataForTimeframe, activeLeaderData,
      mtdLeaderData, supervisorStats, runChartMetric, runChartData, allActiveDates, dowData,
    };
  }, [agents, supervisors, oamName, historicalData, selectedDate, activeTimeframe, selectedWeek, selectedDow, getAgentDataForTimeframe, activeLeaderData, mtdLeaderData, supervisorStats, runChartMetric, runChartData, allActiveDates, dowData]);

  // Clear every generated report (used when the modal closes or data resets,
  // so stale analyses never survive an upload / account switch).
  const resetAiStates = useCallback(() => {
    setReport(null);
    setTeamReport(null);
    setChartActionPlan(null);
    setCorrelationReport(null);
    setApprenticeReport(null);
    setDowReport(null);
    setAskAiQuery('');
    setAskAiResponse(null);
  }, []);

  // Floor Analysis tab → Unified Strategy Report (whole floor view).
  const generateTeamReport = useCallback(() => {
    const v = varsRef.current;
    if (!v.agents?.length) return;
    const systemPrompt = `${PERSONA} Produce a UNIFIED STRATEGY REPORT for the whole floor: overall trajectory, top wins, biggest risks per supervisor team, and 3 concrete next actions for the OAM. Use simple everyday English.`;
    executeGeminiAction(buildDashboardContext(v), systemPrompt, setTeamReport, setLoadingTeam, 'Unable to generate team report.');
  }, []);

  // Supervisor modal → per-team expert report.
  const generateExpertReport = useCallback((supObj) => {
    const v = varsRef.current;
    if (!supObj) return;
    const systemPrompt = `${PERSONA} Write an EXPERT SUPERVISOR REPORT for "${supObj.name}". Cover team performance vs targets, standouts, concerns, and a coaching plan for the next week. Use simple everyday English.`;
    const context = JSON.stringify({ supObj, timeframe: v.activeTimeframe, selectedDate: v.selectedDate, agents: slimAgents(v.agents) }, null, 1);
    executeGeminiAction(context, systemPrompt, setReport, setLoading, 'Unable to generate supervisor report.');
  }, []);

  // Trends tab heatmap → targeted action plan for the selected metric.
  const generateChartActionPlan = useCallback(() => {
    const v = varsRef.current;
    if (!v.runChartData?.length) return;
    const systemPrompt = `${PERSONA} You receive a heatmap of daily "${v.runChartMetric}" performance. Identify the weakest days/segments and write a TARGETED ACTION PLAN: root-cause hypotheses plus specific interventions, owners and deadlines. Use simple everyday English.`;
    const context = JSON.stringify({ metric: v.runChartMetric, dates: v.allActiveDates, runChartData: v.runChartData, leaderData: v.activeLeaderData }, null, 1);
    executeGeminiAction(context, systemPrompt, setChartActionPlan, setLoadingChartActionPlan, 'Unable to generate action plan.');
  }, []);

  // Correlation tab report.
  const generateCorrelationReport = useCallback(() => {
    const v = varsRef.current;
    if (!v.agents?.length) return;
    const systemPrompt = `${PERSONA} Analyze CORRELATIONS between floor metrics (e.g. AHT vs Sales, Hold vs CSat). Call out the strongest positive/negative relationships, likely causes, and what the OAM should change. Use simple everyday English.`;
    executeGeminiAction(buildDashboardContext(v), systemPrompt, setCorrelationReport, setLoadingCorrelation, 'Unable to generate correlation report.');
  }, []);

  // Apprentice tab comparison report (group A vs group B).
  const generateApprenticeReport = useCallback((viewMode, dataA, dataB, titleA, titleB) => {
    const systemPrompt = `${PERSONA} Compare two teams ("${titleA}" vs "${titleB}") in ${viewMode || 'default'} view mode. Highlight who leads on each metric, gaps that matter, and one concrete coaching takeaway per team. Use simple everyday English.`;
    const context = JSON.stringify({ viewMode, titleA, titleB, dataA, dataB }, null, 1);
    executeGeminiAction(context, systemPrompt, setApprenticeReport, setLoadingApprentice, 'Unable to generate apprentice report.');
  }, []);

  // Day-of-week tab report.
  const generateDowReport = useCallback((dowInput) => {
    const v = varsRef.current;
    const systemPrompt = `${PERSONA} Analyze DAY-OF-WEEK performance patterns. Identify the strongest and weakest days, probable drivers (volume, staffing, intent mix) and a schedule/coverage recommendation. Use simple everyday English.`;
    const context = JSON.stringify({ dowData: dowInput ?? v.dowData, oamName: v.oamName, activeLeaderData: v.activeLeaderData }, null, 1);
    executeGeminiAction(context, systemPrompt, setDowReport, setLoadingDow, 'Unable to generate day-of-week report.');
  }, []);

  // Mirror the query into a ref so handleAskAiSubmit stays referentially stable.
  const askAiQueryRef = useRef('');
  useEffect(() => { askAiQueryRef.current = askAiQuery; }, [askAiQuery]);

  // Data Assistant modal → free-form question answering over the dashboard.
  // Accepts an optional preset question (smart chip); otherwise uses the input.
  const handleAskAiSubmit = useCallback((presetQuestion) => {
    const v = varsRef.current;
    const q = (typeof presetQuestion === 'string' && presetQuestion.trim())
      ? presetQuestion
      : askAiQueryRef.current;
    if (!q || !q.trim()) return;
    const systemPrompt = `${PERSONA} You are a DATA ASSISTANT with access to the dashboard context below. Answer the user's question strictly from this data; if the data cannot answer it, say so. Use simple everyday English.`;
    const context = `QUESTION: ${q}\n\nDASHBOARD CONTEXT:\n${buildDashboardContext(v)}`;
    executeGeminiAction(context, systemPrompt, setAskAiResponse, setAskAiLoading, 'Unable to answer right now. Please try again.');
  }, []);

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
    askAiQuery,
    setAskAiQuery,
    askAiResponse,
    askAiLoading,
    handleAskAiSubmit,
    generateTeamReport,
    generateExpertReport,
    generateChartActionPlan,
    generateCorrelationReport,
    generateApprenticeReport,
    generateDowReport,
    resetAiStates,
  };
};
