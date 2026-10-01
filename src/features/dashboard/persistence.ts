// persistence.ts — S1(b) of the `useDashboardData` split (recommendations.md).
// Move-only extraction from hooks.ts: the two localStorage key constants, the
// once-per-mount read (readPersistedDashboardState), resetDashboard and the two
// write effects. No logic changes — verified by an origin-diff parity audit
// against hooks.ts @ 54ace0a.
// ⚠️ STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE. Mapping/alias fixes
// belong in importPolicy.ts (FIELD_ALIASES), nowhere else.

import { useCallback, useEffect } from 'react';
import { DEFAULT_DATE } from './config';
import { ALL_MONTHS } from './helpers';

// ─── Local Storage Persistence Helpers ──────────────────────────────────────
const DASHBOARD_STORAGE_KEY = 'customer-service-dashboard-state-v1';
// Split in two so selection changes (month/timeframe switches) never
// re-stringify the multi-MB history payload — audit finding #1 (month-switch
// localStorage jank). DASHBOARD_STORAGE_KEY holds the heavy data; the tiny
// view key below holds only the timeframe/date/month selections.
const DASHBOARD_VIEW_STORAGE_KEY = 'customer-service-dashboard-view-v1';

export const readPersistedDashboardState = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    // View selections live under a separate, tiny key. Legacy snapshots kept
    // them inside the main key — those still work as a fallback, and fresh
    // view-key values always win when present.
    try {
      const rawView = window.localStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY);
      if (rawView) {
        const parsedView = JSON.parse(rawView);
        if (parsedView && typeof parsedView === 'object') {
          return { ...parsed, ...parsedView };
        }
      }
    } catch (viewError) {
      console.warn('Failed to load persisted dashboard view state:', viewError);
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to load persisted dashboard state:', error);
    return null;
  }
};

// The subset of the dashboard state that persistence needs. It is passed as one
// object by useDashboardData so this module stays a pure function of what it is
// handed — it never reads another module's state directly.
//
// `any` here is deliberate and matches the S1(a) precedent (see ./state.ts):
// the values originate in `@ts-nocheck` land and are only now coming under
// tsc. Give them real types as a follow-up, not as part of a move-only step.
export interface DashboardPersistenceState {
  agents: any;
  supervisors: any;
  oamName: any;
  historicalData: any;
  hasUploadedData: any;
  activeTimeframe: any;
  selectedWeek: any;
  selectedDate: any;
  selectedDow: any;
  selectedMonth: any;
  selectedMonthChosen: any;
  setAgents: (value: any) => void;
  setSupervisors: (value: any) => void;
  setHistoricalData: (value: any) => void;
  setHasUploadedData: (value: any) => void;
  setBatchImportSummary: (value: any) => void;
  setImportPreview: (value: any) => void;
  setMappingReview: (value: any) => void;
  setPendingAutomaticImport: (value: any) => void;
  setPendingAutomaticFiles: (value: any) => void;
  setUploadStatus: (value: any) => void;
  setActiveTimeframe: (value: any) => void;
  setSelectedWeek: (value: any) => void;
  setSelectedDate: (value: any) => void;
  setSelectedDow: (value: any) => void;
  setSelectedMonthRaw: (value: any) => void;
  setSelectedMonthChosen: (value: any) => void;
  importAbortControllerRef: { current: any };
}

export const useDashboardPersistence = (
  state: DashboardPersistenceState,
  onDataReset?: (() => void) | null
) => {
  const {
    agents, supervisors, oamName, historicalData, hasUploadedData,
    activeTimeframe, selectedWeek, selectedDate, selectedDow, selectedMonth, selectedMonthChosen,
    setAgents, setSupervisors, setHistoricalData, setHasUploadedData, setBatchImportSummary,
    setImportPreview, setMappingReview, setPendingAutomaticImport, setPendingAutomaticFiles,
    setUploadStatus, setActiveTimeframe, setSelectedWeek, setSelectedDate, setSelectedDow,
    setSelectedMonthRaw, setSelectedMonthChosen,
    importAbortControllerRef,
  } = state;

  const resetDashboard = useCallback(() => {
    importAbortControllerRef.current?.abort();
    importAbortControllerRef.current = null;
    setAgents([]);
    setSupervisors([]);
    setHistoricalData({});
    setHasUploadedData(false);
    setBatchImportSummary(null);
    setImportPreview(null);
    setMappingReview([]);
    setPendingAutomaticImport(null);
    setPendingAutomaticFiles([]);
    setUploadStatus(null);
    setActiveTimeframe('monthly');
    setSelectedWeek('Week 1');
    setSelectedDate(DEFAULT_DATE);
    setSelectedDow('Monday');
    setSelectedMonthRaw(ALL_MONTHS);
    setSelectedMonthChosen(false);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DASHBOARD_STORAGE_KEY);
      window.localStorage.removeItem(DASHBOARD_VIEW_STORAGE_KEY);
    }
    onDataReset?.();
  }, [
    onDataReset,
    importAbortControllerRef,
    setAgents, setSupervisors, setHistoricalData, setHasUploadedData,
    setBatchImportSummary, setImportPreview, setMappingReview,
    setPendingAutomaticImport, setPendingAutomaticFiles, setUploadStatus,
    setActiveTimeframe, setSelectedWeek, setSelectedDate, setSelectedDow,
    setSelectedMonthRaw, setSelectedMonthChosen,
  ]);

  // Heavy data payload — rewritten only when the data itself changes (import /
  // reset / roster edits). Selection changes never touch this key, so
  // switching months no longer re-stringifies the whole historicalData.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const payload = {
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
  }, [agents, supervisors, oamName, historicalData, hasUploadedData]);

  // Tiny view payload (timeframe / date / month selections) — a few hundred
  // bytes, safe to rewrite on every selection change without jank.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const payload = {
        activeTimeframe,
        selectedWeek,
        selectedDate,
        selectedDow,
        selectedMonth,
        selectedMonthChosen,
      };
      window.localStorage.setItem(DASHBOARD_VIEW_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist dashboard view state:', error);
    }
  }, [activeTimeframe, selectedWeek, selectedDate, selectedDow, selectedMonth, selectedMonthChosen]);

  return { resetDashboard };
};
