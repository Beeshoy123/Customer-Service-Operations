// persistence.ts — S1(b) of the `useDashboardData` split (old recommendations.md at commit d34eb57).
// Move-only extraction from hooks.ts: the two localStorage key constants, the
// once-per-mount read (readPersistedDashboardState), resetDashboard and the two
// write effects. No logic changes — verified by an origin-diff parity audit
// against hooks.ts @ 54ace0a.
// ⚠️ STANDING RULE — DO NOT FIX MAPPING BUGS IN THIS FILE. Mapping/alias fixes
// belong in importPolicy.ts (FIELD_ALIASES), nowhere else.

import { useCallback, useEffect, useRef } from 'react';
import { DEFAULT_DATE } from './config';
import { ALL_MONTHS } from './helpers';
import { idbDelete, idbGet, idbSet } from './idbStore';
// S6: all localStorage access goes through the shared safeStorage facade + key
// registry (./storage). Key VALUES are unchanged — there is no migration code.
import { safeStorage, storageKeys } from './storage';

// ─── Local Storage Persistence Helpers ──────────────────────────────────────
const DASHBOARD_STORAGE_KEY = storageKeys.dashboardState;
// Split in two so selection changes (month/timeframe switches) never
// re-stringify the multi-MB history payload — audit finding #1 (month-switch
// localStorage jank). DASHBOARD_STORAGE_KEY holds the heavy data; the tiny
// view key below holds only the timeframe/date/month selections.
const DASHBOARD_VIEW_STORAGE_KEY = storageKeys.dashboardView;

// Step 4 (storage): the big data (agents, supervisors, daily history) now lives in
// IndexedDB under this key. The old localStorage key above is only read once, to
// copy an existing save across (see preloadPersistedDashboardState).
const IDB_DASHBOARD_KEY = 'dashboard-state';

type HeavyPayload = {
  agents: any;
  supervisors: any;
  oamName: any;
  historicalData: any;
  hasUploadedData: any;
};

const pickHeavy = (source: any): HeavyPayload => ({
  agents: source.agents,
  supervisors: source.supervisors,
  oamName: source.oamName,
  historicalData: source.historicalData,
  hasUploadedData: source.hasUploadedData,
});

// IndexedDB is async but React reads saved data synchronously on first render. So
// main.tsx awaits preloadPersistedDashboardState() once, before the first render,
// and readPersistedDashboardState() then returns what was loaded.
let preloadedHeavy: any = null;

export const preloadPersistedDashboardState = async (): Promise<void> => {
  if (typeof window === 'undefined') return;

  const fromIdb = await idbGet<any>(IDB_DASHBOARD_KEY);
  if (fromIdb && typeof fromIdb === 'object') {
    preloadedHeavy = fromIdb;
    return;
  }

  // One-time copy of an older save from browser storage (localStorage).
  try {
    const raw = safeStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    preloadedHeavy = parsed;
    const saved = await idbSet(IDB_DASHBOARD_KEY, pickHeavy(parsed));
    // Remove the old copy only after IndexedDB confirmed it holds the data.
    if (saved) safeStorage.removeItem(DASHBOARD_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to load persisted dashboard state:', error);
  }
};

export const readPersistedDashboardState = () => {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = preloadedHeavy;
    if (!parsed || typeof parsed !== 'object') return null;

    // View selections live under a separate, tiny key. Legacy snapshots kept
    // them inside the main key — those still work as a fallback, and fresh
    // view-key values always win when present.
    try {
      const rawView = safeStorage.getItem(DASHBOARD_VIEW_STORAGE_KEY);
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

// Saves are queued one at a time, newest wins: if three changes arrive while a
// save is running, only the newest one is written next. Resolves true when saved
// (or when a newer save took over), false when the browser refused it.
let saveChain: Promise<unknown> = Promise.resolve();
let latestPayload: HeavyPayload | null = null;

export const saveDashboardPayload = (payload: HeavyPayload): Promise<boolean> => {
  latestPayload = payload;
  const run = saveChain.then(async () => {
    if (latestPayload !== payload) return true; // a newer save is queued behind this one
    return idbSet(IDB_DASHBOARD_KEY, payload);
  });
  saveChain = run.catch(() => undefined);
  return run;
};

/** Tests only: forget what was preloaded and queued. */
export const resetPersistenceForTests = (): void => {
  preloadedHeavy = null;
  latestPayload = null;
  saveChain = Promise.resolve();
};

export const SAVE_FAILED_MESSAGE =
  'Could not save your data in this browser. It stays on screen until you close or reload the page.';

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
      preloadedHeavy = null;
      void idbDelete(IDB_DASHBOARD_KEY);
      safeStorage.removeItem(DASHBOARD_STORAGE_KEY);
      safeStorage.removeItem(DASHBOARD_VIEW_STORAGE_KEY);
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
  // reset / roster edits). Selection changes never touch this, so switching
  // months does not re-save the whole historicalData. It goes to IndexedDB; if the
  // browser refuses, the user sees a message instead of silent loss.
  // The first run (right after the page loads) is skipped: nothing changed yet, and
  // it must never overwrite saved data with an empty start-up state.
  const lastSeenRef = useRef({ agents, supervisors, oamName, historicalData, hasUploadedData });
  const saveFailedShownRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const last = lastSeenRef.current;
    if (
      last.agents === agents && last.supervisors === supervisors && last.oamName === oamName &&
      last.historicalData === historicalData && last.hasUploadedData === hasUploadedData
    ) {
      return;
    }
    lastSeenRef.current = { agents, supervisors, oamName, historicalData, hasUploadedData };

    let cancelled = false;
    void saveDashboardPayload(pickHeavy({ agents, supervisors, oamName, historicalData, hasUploadedData })).then((ok) => {
      if (ok) {
        saveFailedShownRef.current = false;
        return;
      }
      console.warn('Failed to persist dashboard state to IndexedDB.');
      if (cancelled || saveFailedShownRef.current) return;
      saveFailedShownRef.current = true;
      setUploadStatus({ type: 'error', message: SAVE_FAILED_MESSAGE });
    });
    return () => {
      cancelled = true;
    };
  }, [agents, supervisors, oamName, historicalData, hasUploadedData, setUploadStatus]);

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
      safeStorage.setItem(DASHBOARD_VIEW_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to persist dashboard view state:', error);
    }
  }, [activeTimeframe, selectedWeek, selectedDate, selectedDow, selectedMonth, selectedMonthChosen]);

  return { resetDashboard };
};
