// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  DEFAULT_MANAGER_NAME,
  DEFAULT_DATE,
  DAYS_OF_WEEK,
  CHART_COLORS,
  TARGETS,
  PERSONA,
} from './features/dashboard/config';
import {
  agentMatchesSearch,
  calculateBonus,
  aggregateRecords,
  aggregateTeamMetrics,
  calculateWeightedVSF,
  calculateTrend,
  formatName,
  shortenManagerName,
  normalizeDate,
  getWeekNumber,
  dowFromDateStr,
} from './features/dashboard/helpers';
import { computeAutoHiddenVisibleCols } from './features/dashboard/emptyColumns';
import {
  ParetoColumn,
  PerformanceHeatmap,
} from './components/shared';
import {
  DashboardContext,
  useDashboard,
  useDashboardData,
  useAiTools,
} from './features/dashboard/hooks';
import { useDashboardMetrics } from './features/dashboard/metrics';
import { ImportLanding } from './features/dashboard/upload/ImportLanding';
import { listAccountNames } from './features/accountSetup/account-profile-storage';
import { ErrorBoundary } from './app/errorBoundary';
import { UploadStatus } from './app/uploadStatus';
import { ChartActionPlanModal } from './app/chartActionPlanModal';
import { DropZone } from './components/dropZone';
import { FloorRosterTab } from './features/dashboard/views/tabs/FloorRosterTab';
import { FloorOutliersTab } from './features/dashboard/views/tabs/FloorOutliersTab';
import { FloorApprenticeTab } from './features/dashboard/views/tabs/FloorApprenticeTab';
import { FloorAnalysisTab } from './features/dashboard/views/tabs/FloorAnalysisTab';
import { FloorTrendsTab } from './features/dashboard/views/tabs/FloorTrendsTab';
import { FloorCorrelationTab } from './features/dashboard/views/tabs/FloorCorrelationTab';
import { FloorBurnoutTab } from './features/dashboard/views/tabs/FloorBurnoutTab';
import { FloorDowTab } from './features/dashboard/views/tabs/FloorDowTab';
import { MainModal } from './features/dashboard/views/modals/MainModal';
import { TopNavbar } from './features/dashboard/views/chrome/TopNavbar';
import { MainStatsRow } from './features/dashboard/views/chrome/MainStatsRow';
import { FloorHeader } from './features/dashboard/views/chrome/FloorHeader';
import { MODAL_INITIAL, UI_INITIAL, modalReducer, uiReducer } from './features/dashboard/uiReducer';

if (typeof window !== 'undefined') {
  window.tailwind = window.tailwind || { config: {} };
}
var tailwind = typeof window !== 'undefined' ? window.tailwind : { config: {} };

// ============================================================================
// FILE STRUCTURE:
// NOTE: Extracted so far (see recommendations.md):
//   Phase 1 → src/app/* (ErrorBoundary, UploadStatus, ChartActionPlanModal)
//             + src/components/dropZone.tsx
//   Phase 2 → src/styles/dashboard.css (DASHBOARD_STYLES moved out of TS into
//             a real stylesheet, loaded once by main.tsx)
//   Phase 3 → src/features/dashboard/views/tabs/* (8 floor tabs)
//   Phase 4 → src/features/dashboard/views/modals/MainModal.tsx
//             (Ask AI content, Supervisor modal content, Main modal shell)
//   Phase 5 → src/features/dashboard/views/chrome/* (TopNavbar,
//             MainStatsRow, FloorHeader)
//   Phase 6 → src/features/dashboard/uiReducer.ts (MODAL_INITIAL, UI_INITIAL,
//             modalReducer, uiReducer)
// What remains in this file:
// ├── App local state (accountName, visibleCols, search, sort)
// └── Main App Composition
// ============================================================================

// ==== App state + reducer defaults ==== 
// NOTE: reducer state lives in src/features/dashboard/uiReducer.ts (Phase 6):
// MODAL_INITIAL, UI_INITIAL and the two named reducers are imported above, so
// modal and UI state changes are traced there instead of inline in this file.

// ==== Main app composition ==== 
// TODO: split this file into smaller component modules once feature logic stabilizes.
export default function App() {
  const aiResetRef = useRef(null);
  const [accountName, setAccountName] = useState("");
  const [accountNameInput, setAccountNameInput] = useState("");
  // Visible metric columns live here (owned by App), while rows are applied in
  // useDashboardData — declared before the hook so the import scan callback can
  // auto-hide columns that received no data (Recommendation 3).
  const [visibleCols, setVisibleCols] = useState({
    vxs: true, resolve2hr: true, phoneAdds: true, handoffs: true, resolve3d: false, aht: false,
    hold: false, dpc: false, vtt: false, netOcc: false, creditFreq: false, vhi: false, ncw: false, trajectory: true 
  });
  const dashData = useDashboardData(() => { if (aiResetRef.current) aiResetRef.current(); }, accountName,
    // Recommendation 3 — auto-hide empty metric columns after import:
    // hide any VISIBLE metric column whose backing fields are all absent from
    // the imported rows. Runs once per import; later manual Settings toggles
    // always win, and non-metric toggles like `trajectory` are never touched.
    useCallback((fieldsWithData) => {
      setVisibleCols(prev => computeAutoHiddenVisibleCols(prev, fieldsWithData));
    }, [])
  );
  const resetToLanding = useCallback(() => {
    dashData.resetDashboard();
    setAccountName('');
    setAccountNameInput('');
  }, [dashData.resetDashboard]);
  const [modalState, dispatchModal] = React.useReducer(modalReducer, MODAL_INITIAL);
  const { activeModal, selectedSupervisorObj, expandedBurnoutAgentId, highlightedAgentId, supTab } = modalState;
  const setActiveModal = (v) => dispatchModal({ activeModal: v });
  const setSelectedSupervisorObj = (v) => dispatchModal({ selectedSupervisorObj: v });
  const setExpandedBurnoutAgentId = (v) => dispatchModal({ expandedBurnoutAgentId: v });
  const setHighlightedAgentId = (v) => dispatchModal({ highlightedAgentId: v });
  const setSupTab = (v) => dispatchModal({ supTab: v });
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'outlier', direction: 'asc' }); 
  const [agentSortConfig, setAgentSortConfig] = useState({ key: 'name', direction: 'asc' });
  // 12 UI display states → single reducer: one subscription, one render per change
  const [uiDisplay, dispatchUi] = React.useReducer(uiReducer, UI_INITIAL);
  const { mainTab, activeMainAiTool, activeSupAiTool, showColMenu, showModalColMenu,
          showTimeframeMenu, runChartMetric, isCumulative, heatmapViewType,
          outlierMode, outlierLevel, apprenticeViewMode } = uiDisplay;
  const setMainTab = (v) => dispatchUi({ mainTab: v });
  const setActiveMainAiTool = (v) => dispatchUi({ activeMainAiTool: v });
  const setActiveSupAiTool = (v) => dispatchUi({ activeSupAiTool: v });
  const setShowColMenu = (v) => dispatchUi({ showColMenu: v });
  const setShowModalColMenu = (v) => dispatchUi({ showModalColMenu: v });
  const setShowTimeframeMenu = (v) => dispatchUi({ showTimeframeMenu: v });
  const setRunChartMetric = (v) => dispatchUi({ runChartMetric: v });
  const setIsCumulative = (v) => dispatchUi({ isCumulative: v });
  const setHeatmapViewType = (v) => dispatchUi({ heatmapViewType: v });
  const setOutlierMode = (v) => dispatchUi({ outlierMode: v });
  const setOutlierLevel = (v) => dispatchUi({ outlierLevel: v });
  const setApprenticeViewMode = (v) => dispatchUi({ apprenticeViewMode: v });


  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const linkedEntities = useMemo(() => {
      const entities = [];
      dashData.supervisors.forEach(s => entities.push({ name: s, type: 'supervisor' }));
      dashData.agents.forEach(a => entities.push({ name: a.name, type: 'agent' }));
      const unique = Array.from(new Map(entities.map(item => [item.name, item])).values());
      return unique.sort((a,b) => b.name.length - a.name.length);
  }, [dashData.supervisors, dashData.agents]);


  const uiState = useMemo(() => ({
    activeModal, selectedSupervisorObj, expandedBurnoutAgentId, highlightedAgentId, supTab, searchQuery, inputValue, sortConfig,
    agentSortConfig, mainTab, activeMainAiTool, activeSupAiTool, showColMenu, showModalColMenu, showTimeframeMenu,
    runChartMetric, isCumulative, heatmapViewType, outlierMode, outlierLevel, apprenticeViewMode, visibleCols,
    linkedEntities
  }), [
    activeModal, selectedSupervisorObj, expandedBurnoutAgentId, highlightedAgentId, supTab, searchQuery, inputValue, sortConfig,
    agentSortConfig, mainTab, activeMainAiTool, activeSupAiTool, showColMenu, showModalColMenu, showTimeframeMenu,
    runChartMetric, isCumulative, heatmapViewType, outlierMode, outlierLevel, apprenticeViewMode, visibleCols,
    linkedEntities
  ]);


  const metrics = useDashboardMetrics({ ...dashData, ...uiState });
  
  const aiTools = useAiTools({ ...dashData, ...metrics, ...uiState });
  aiResetRef.current = aiTools.resetAiStates; // keep ref in sync so upload can clear stale reports


  const handleSortChange = useCallback((key) => {
    setSortConfig((prev) => {
      if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
  }, []);


  const handleAgentSortChange = useCallback((key) => {
    setAgentSortConfig((prev) => {
      if (prev.key === key) return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
  }, []);


  const toggleCol = useCallback((colKey) => { setVisibleCols(prev => ({ ...prev, [colKey]: !prev[colKey] })); }, []);


  const closeModal = useCallback(() => {
    dispatchModal(MODAL_INITIAL);   // single dispatch for all 5 modal states — one re-render
    setActiveSupAiTool(null);
    aiTools.resetAiStates();
  }, [aiTools.resetAiStates]);


  const handleAiLinkClick = useCallback((entityName, type) => {
      if (type === 'supervisor') {
          const supObj = metrics.supervisorStats.find(s => s.name === entityName);
          if (supObj) {
              setSelectedSupervisorObj(supObj);
              setActiveModal('supervisor');
              setSupTab('roster');
              setHighlightedAgentId(null);
              aiTools.generateExpertReport(supObj);
          }
      } else if (type === 'agent') {
          const agentObj = dashData.agents.find(a => a.name === entityName);
          if (agentObj) {
              const supObj = metrics.supervisorStats.find(s => s.name === agentObj.supervisor);
              if (supObj) {
                  setSelectedSupervisorObj(supObj);
                  setActiveModal('supervisor');
                  setSupTab('roster');
                  setHighlightedAgentId(agentObj.ccms);
                  aiTools.generateExpertReport(supObj);
              }
          }
      }
  }, [metrics.supervisorStats, dashData.agents, aiTools.generateExpertReport]);


  const uiHandlers = useMemo(() => ({
    setActiveModal, setSelectedSupervisorObj, setExpandedBurnoutAgentId, setHighlightedAgentId, setSupTab, setSearchQuery, setInputValue,
    handleSortChange, handleAgentSortChange, setAgentSortConfig, setMainTab, setActiveMainAiTool, setActiveSupAiTool,
    setShowColMenu, setShowModalColMenu, setShowTimeframeMenu, setRunChartMetric, setIsCumulative, setHeatmapViewType,
    setOutlierMode, setOutlierLevel, setApprenticeViewMode, toggleCol, closeModal, handleAiLinkClick
  }), [handleSortChange, handleAgentSortChange, toggleCol, closeModal, handleAiLinkClick]);


  const normalizedAccountName = accountName.trim();
  const hasAccountName = normalizedAccountName.length > 0;
  const accountOptions = useMemo(() => ['Verizon Consumer', ...listAccountNames()], []);

  const ctxValue = useMemo(
    () => ({ dashData, metrics, aiTools, uiState, uiHandlers, accountName: normalizedAccountName, resetToLanding }),
    [dashData, metrics, aiTools, uiState, uiHandlers, normalizedAccountName, resetToLanding]
  );

  if (false && !hasAccountName) {
    return (
      <ErrorBoundary>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0f19', color: '#e2e8f0', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#111827', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 16, padding: 28, boxShadow: '0 20px 40px rgba(15, 23, 42, 0.35)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#93c5fd', fontWeight: 700 }}>
              Account setup
            </p>
            <h1 style={{ margin: '0 0 16px', fontSize: 30, lineHeight: 1.2, color: '#ffffff' }}>
              Which account is this?
            </h1>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const trimmed = accountNameInput.trim();
                if (trimmed) {
                  setAccountName(trimmed);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <label htmlFor="account-name" style={{ display: 'flex', flexDirection: 'column', gap: 8, color: '#cbd5e1', fontWeight: 600 }}>
                Account name
                <input
                  id="account-name"
                  type="text"
                  value={accountNameInput}
                  onChange={(event) => setAccountNameInput(event.target.value)}
                  placeholder="Verizon Consumer"
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: '#0f172a',
                    color: '#f8fafc',
                    fontSize: 16,
                    outline: 'none',
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={!accountNameInput.trim()}
                style={{
                  border: 'none',
                  borderRadius: 10,
                  background: accountNameInput.trim() ? '#2563eb' : '#475569',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: 15,
                  padding: '12px 16px',
                  cursor: accountNameInput.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Continue
              </button>
            </form>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (!dashData.hasUploadedData) {
    return (
      <ErrorBoundary>
        <div style={{ minHeight: '100vh', background: '#0b0b0a', padding: '24px', boxSizing: 'border-box' }}>
          <ImportLanding
            accountName={normalizedAccountName}
            accountOptions={accountOptions}
            onAccountNameChange={setAccountName}
            uploadStatus={dashData.uploadStatus}
            onFiles={(files) => dashData.handleAutomaticImport(files)}
            mappingReview={dashData.mappingReview}
            onContinueImport={dashData.continueAutomaticImport}
            rateMergeStyle={dashData.rateMergeStyle}
            onRateMergeStyleChange={dashData.setRateMergeStyle}
          />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <DashboardContext.Provider value={ctxValue}>
        <div className="analyst-dashboard" style={{ width: '100%', minWidth: 0, overflowX: 'hidden' }}>

          {/* ==== Overlay + modal layer ==== */}
          <UploadStatus uploadStatus={dashData.uploadStatus} />
          <ChartActionPlanModal />

          {/* ==== Header / shell navigation ==== */}
          <TopNavbar />

          {/* ==== Dashboard body shell ==== */}
          <div className="main-workspace" style={{ width: '100%', maxWidth: '1100px', minWidth: 0, margin: '0 auto', padding: '32px 24px' }}>
            {/* ==== KPI summary row ==== */}
            <MainStatsRow />

            {/* ==== Floor board / roster content ==== */}
            <div className="flex flex-col gap-4 mb-16">
              {/* ==== Header area for floor selection ==== */}
              <FloorHeader />

              {/* ==== Tab content switcher ==== */}
              <div className="roster-container">
                {mainTab === 'roster'      && <FloorRosterTab />}
                {mainTab === 'outliers'    && <FloorOutliersTab />}
                {mainTab === 'apprentice'  && <FloorApprenticeTab />}
                {mainTab === 'analysis'    && <FloorAnalysisTab />}
                {mainTab === 'trends'      && <FloorTrendsTab />}
                {mainTab === 'correlation' && <FloorCorrelationTab />}
                {mainTab === 'burnout'     && <FloorBurnoutTab />}
                {mainTab === 'dow'         && <FloorDowTab />}
              </div>
            </div>
          </div>

          {/* ==== Detail modal / AI modal layer ==== */}
          <MainModal />
        </div>
      </DashboardContext.Provider>
    </ErrorBoundary>
  );
}
