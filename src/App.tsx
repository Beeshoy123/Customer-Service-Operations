// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  DEFAULT_MANAGER_NAME,
  DEFAULT_DATE,
  DAYS_OF_WEEK,
  CHART_COLORS,
  TARGETS,
  METRIC_CONFIG,
  getDynamicTarget,
  getDynamicMax,
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
  DonutChart,
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
import { SettingsMenu, TimeframeMenu } from './components/menus';
import { ImportLanding } from './features/dashboard/upload/ImportLanding';
import { listAccountNames } from './features/accountSetup/account-profile-storage';
import { ErrorBoundary } from './app/errorBoundary';
import { UploadStatus } from './app/uploadStatus';
import { ChartActionPlanModal } from './app/chartActionPlanModal';
import { DropZone } from './components/dropZone';
import { DASHBOARD_STYLES } from './app/dashboardStyles';
import { FloorRosterTab } from './features/dashboard/views/tabs/FloorRosterTab';
import { FloorOutliersTab } from './features/dashboard/views/tabs/FloorOutliersTab';
import { FloorApprenticeTab } from './features/dashboard/views/tabs/FloorApprenticeTab';
import { FloorAnalysisTab } from './features/dashboard/views/tabs/FloorAnalysisTab';
import { FloorTrendsTab } from './features/dashboard/views/tabs/FloorTrendsTab';
import { FloorCorrelationTab } from './features/dashboard/views/tabs/FloorCorrelationTab';
import { FloorBurnoutTab } from './features/dashboard/views/tabs/FloorBurnoutTab';
import { FloorDowTab } from './features/dashboard/views/tabs/FloorDowTab';
import { MainModal } from './features/dashboard/views/modals/MainModal';

if (typeof window !== 'undefined') {
  window.tailwind = window.tailwind || { config: {} };
}
var tailwind = typeof window !== 'undefined' ? window.tailwind : { config: {} };

// ============================================================================
// FILE STRUCTURE:
// NOTE: Extracted so far (see recommendations.md):
//   Phase 1 → src/app/* (ErrorBoundary, UploadStatus, ChartActionPlanModal,
//             DASHBOARD_STYLES) + src/components/dropZone.tsx
//   Phase 3 → src/features/dashboard/views/tabs/* (8 floor tabs)
//   Phase 4 → src/features/dashboard/views/modals/MainModal.tsx
//             (Ask AI content, Supervisor modal content, Main modal shell)
// What remains in this file:
// ├── Top Navigation Bar
// ├── KPI Summary Row
// ├── Floor Header & Selector Bar
// ├── App State & Reducer Defaults
// └── Main App Composition
// ============================================================================

// ─── Top Navigation Bar ──────────────────────────────────────
const TopNavbar = React.memo(() => {
  const { dashData, uiState, uiHandlers, resetToLanding } = useDashboard();
  const menuRef = useRef(null);
  const timeframeRef = useRef(null);
  const batchSummary = dashData.batchImportSummary;


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) uiHandlers.setShowColMenu(false);
      if (timeframeRef.current && !timeframeRef.current.contains(event.target)) uiHandlers.setShowTimeframeMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [uiHandlers]);


  let headerName = dashData.oamName;
  const queries = uiState.searchQuery.toLowerCase().split(',').map(q => q.trim()).filter(q => q);
  if (queries.length > 0) {
      const searchedOams = [...new Set(dashData.agents.map(a => a.oam).filter(o => o && queries.some(q => o.toLowerCase().includes(q))))];
      if (searchedOams.length === 1) {
          headerName = searchedOams[0]; 
      }
  }


  return (
    <div className="top-navbar">
      <div className="top-navbar-inner">
        <div className="header-info">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold m-0 mb-1 text-white tracking-wide">
              {headerName} <span className="opacity-50 mx-1 font-normal">|</span> Floor
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 italic">
                {uiState.searchQuery ? 'Filtered View' : `${dashData.supervisors.length} Supervisors / ${dashData.agents.length} Agents`}
              </span>
            </div>
          </div>
        </div>
        
        <div className="action-buttons">
          <div className="flex gap-2 items-center">
            {batchSummary && (
              <div className="flex items-center gap-2 rounded-full bg-slate-800/80 border border-slate-600 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-200 whitespace-nowrap">
                <span>{batchSummary.files} file(s)</span>
                <span>•</span>
                <span>{batchSummary.sheets} sheet(s)</span>
                <span>•</span>
                <span>{batchSummary.rows?.length ?? 0} rows</span>
              </div>
            )}

            <button 
              title="Data Assistant"
              className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg text-white"
              style={{ background: 'transparent', border: '1px solid transparent', opacity: 0.7 }}
              onClick={() => uiHandlers.setActiveModal('askAi')}
              onMouseOver={(e) => e.currentTarget.style.opacity = 1}
              onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
            >
              🔍
            </button>

            <button
              type="button"
              title="Exit to import landing page"
              aria-label="Exit to import landing page"
              className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg text-white" 
              style={{ background: 'transparent', border: '1px solid transparent', opacity: 0.7 }}
              onClick={resetToLanding}
              onMouseOver={(e) => e.currentTarget.style.opacity = 1}
              onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
            >
              🚪
            </button>

            <div className="column-menu-container flex" ref={timeframeRef}>
              <button 
                title="Timeframe Filter" 
                onClick={() => uiHandlers.setShowTimeframeMenu(!uiState.showTimeframeMenu)}
                className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg"
                style={{ 
                  background: uiState.showTimeframeMenu ? '#ffffff' : 'transparent', 
                  border: uiState.showTimeframeMenu ? '1px solid #cbd5e1' : '1px solid transparent', 
                  boxShadow: uiState.showTimeframeMenu ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                  opacity: uiState.showTimeframeMenu ? 1 : 0.7
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                onMouseOut={(e) => e.currentTarget.style.opacity = uiState.showTimeframeMenu ? 1 : 0.7}
              >
                📅
              </button>
              {uiState.showTimeframeMenu && (
                <div className="column-menu-dropdown overflow-y-auto" style={{ maxHeight: '70vh' }}>
                  <TimeframeMenu 
                    activeTimeframe={dashData.activeTimeframe} setActiveTimeframe={dashData.setActiveTimeframe}
                    selectedWeek={dashData.selectedWeek} setSelectedWeek={dashData.setSelectedWeek}
                    selectedDate={dashData.selectedDate} setSelectedDate={dashData.setSelectedDate}
                    selectedDow={dashData.selectedDow} setSelectedDow={dashData.setSelectedDow}
                    selectedMonth={dashData.selectedMonth} setSelectedMonth={dashData.setSelectedMonth}
                    loadedMonths={dashData.loadedMonths}
                    closeMenu={() => uiHandlers.setShowTimeframeMenu(false)} 
                  />
                </div>
              )}
            </div>

            <div className="column-menu-container flex" ref={menuRef}>
              <button 
                title="Toggle Metrics" 
                onClick={() => uiHandlers.setShowColMenu(!uiState.showColMenu)}
                className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg"
                style={{ 
                  background: uiState.showColMenu ? '#ffffff' : 'transparent', 
                  border: uiState.showColMenu ? '1px solid #cbd5e1' : '1px solid transparent', 
                  boxShadow: uiState.showColMenu ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                  opacity: uiState.showColMenu ? 1 : 0.7
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                onMouseOut={(e) => e.currentTarget.style.opacity = uiState.showColMenu ? 1 : 0.7}
              >
                ⚙️
              </button>
              {uiState.showColMenu && (
                <div className="column-menu-dropdown overflow-y-auto" style={{ maxHeight: '70vh' }}>
                  <SettingsMenu 
                    visibleCols={uiState.visibleCols} toggleCol={uiHandlers.toggleCol} closeMenu={() => uiHandlers.setShowColMenu(false)} 
                  />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
});


// ─── KPI Summary Row ──────────────────────────────────────
const MainStatsRow = React.memo(() => {
  const { dashData, metrics, uiState } = useDashboard();
  const spotterPrefix = dashData.activeTimeframe === 'monthly' ? 'Monthly Spotter' : dashData.activeTimeframe === 'weekly' ? 'Weekly Spotter' : dashData.activeTimeframe === 'dow' ? 'Day of Week' : 'Daily Spotter';
  const spotterDate = dashData.activeTimeframe === 'monthly' ? dashData.monthLabel(dashData.selectedMonth) : dashData.activeTimeframe === 'weekly' ? dashData.selectedWeek : dashData.activeTimeframe === 'dow' ? dashData.selectedDow : dashData.selectedDate;


  return (
    <div className="stats-row">
      <div className="metric-card card-mtd flex flex-col p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl text-white m-0 font-bold">{dashData.activeTimeframe === 'monthly' ? (dashData.selectedMonth === 'all' ? 'All Months' : dashData.monthLabel(dashData.selectedMonth)) : 'Month to Date'}</h2>
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Calls Handled: <strong className="text-white">{metrics.mtdLeaderData.calls ? metrics.mtdLeaderData.calls.toLocaleString() : '-'}</strong></span>
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Res Contacts: <strong className="text-white">{metrics.mtdLeaderData.resolveTotalContacts ? metrics.mtdLeaderData.resolveTotalContacts.toLocaleString() : '-'}</strong></span>
            </div>
          </div>
          <span className="bg-red-900 bg-opacity-20 text-red-300 py-1 px-2 rounded text-xs font-bold">MONTH-END STRATEGY</span>
        </div>


        <div className="flex flex-wrap justify-around gap-4 pb-6 border-b border-slate-800">
          {['vxs', 'resolve2hr', 'handoffs', 'resolve3d'].filter(key => uiState.visibleCols[key]).map(key => (
            <DonutChart key={key} value={metrics.mtdLeaderData[key]} target={getDynamicTarget(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} label={METRIC_CONFIG[key].label} format={METRIC_CONFIG[key].format} reverse={METRIC_CONFIG[key].reverse} max={getDynamicMax(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} isInteger={METRIC_CONFIG[key].isInteger} />
          ))}
        </div>


        <div className="grid grid-cols-auto-110 gap-3 pt-5">
          {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && !['bonus', 'vxs', 'resolve3d', 'resolve2hr', 'handoffs', 'trajectory'].includes(key) && METRIC_CONFIG[key]).map(key => {
              const config = METRIC_CONFIG[key];
              const val = metrics.mtdLeaderData[key];
              const tgt = getDynamicTarget(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length);
              const isGood = config.reverse ? val <= tgt : val >= tgt;
              let displayVal = val === null || val === undefined || isNaN(val) ? '-' : (config.isInteger ? Math.round(val) : Number(val).toFixed(2));
              
              return (
                <div key={key} className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-xs text-slate-500 uppercase font-extrabold tracking-wide">{config.label}</span>
                  <span className={`text-lg font-bold mt-1 ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>{displayVal}{config.format}</span>
                </div>
              );
            })}
        </div>
        {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && METRIC_CONFIG[key]).length === 0 && (
          <span className="text-slate-500 text-sm">No metrics selected for display. Use Global Settings.</span>
        )}
      </div>


      <div className="metric-card card-daily flex flex-col p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl text-white m-0 font-bold flex items-baseline">
              {spotterPrefix} <span className="text-sm text-slate-400 italic ml-2 font-normal">({spotterDate})</span>
            </h2>
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Calls Handled: <strong className="text-white">{metrics.activeLeaderData.calls ? metrics.activeLeaderData.calls.toLocaleString() : '-'}</strong></span>
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Res Contacts: <strong className="text-white">{metrics.activeLeaderData.resolveTotalContacts ? metrics.activeLeaderData.resolveTotalContacts.toLocaleString() : '-'}</strong></span>
            </div>
          </div>
          <span className="bg-red-900 bg-opacity-20 text-red-300 py-1 px-2 rounded text-xs font-bold">DAILY EXECUTION</span>
        </div>
        
        <div className="flex flex-wrap justify-around gap-4 pb-6 border-b border-slate-800">
          {['vxs', 'resolve2hr', 'handoffs', 'resolve3d'].filter(key => uiState.visibleCols[key]).map(key => (
            <DonutChart key={key} value={metrics.activeLeaderData[key]} target={getDynamicTarget(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} label={METRIC_CONFIG[key].label} format={METRIC_CONFIG[key].format} reverse={METRIC_CONFIG[key].reverse} max={getDynamicMax(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} isInteger={METRIC_CONFIG[key].isInteger} />
          ))}
        </div>


        <div className="grid grid-cols-auto-110 gap-3 pt-5">
          {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && !['bonus', 'vxs', 'resolve3d', 'resolve2hr', 'handoffs', 'trajectory'].includes(key) && METRIC_CONFIG[key]).map(key => {
              const config = METRIC_CONFIG[key];
              const val = metrics.activeLeaderData[key];
              const tgt = getDynamicTarget(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length);
              const isGood = config.reverse ? val <= tgt : val >= tgt;
              let displayVal = val === null || val === undefined || isNaN(val) ? '-' : (config.isInteger ? Math.round(val) : Number(val).toFixed(2));
              return (
                <div key={key} className="bg-slate-900 border border-slate-800 p-3 rounded-lg flex flex-col">
                  <span className="text-xs text-slate-500 uppercase font-extrabold tracking-wide">{config.label}</span>
                  <span className={`text-lg font-bold mt-1 ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>{displayVal}{config.format}</span>
                </div>
              );
            })}
        </div>
        {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && METRIC_CONFIG[key]).length === 0 && (
          <span className="text-slate-500 text-sm">No metrics selected for display. Use Global Settings.</span>
        )}
      </div>
    </div>
  );
});


// ─── Floor Header & Selector Bar ──────────────────────────────────────
const FloorHeader = React.memo(() => {
  const { dashData, uiState, uiHandlers } = useDashboard();
  const tabs = [
    { id: 'roster', icon: '📋', label: 'Team Roster' },
    { id: 'outliers', icon: '⚠️', label: 'Floor Outliers' },
    { id: 'apprentice', icon: '🎓', label: 'Apprentice Track' },
    { id: 'analysis', icon: '🤖', label: 'Floor Analysis' },
    { id: 'trends', icon: '📈', label: 'Trends' },
    { id: 'correlation', icon: '🎯', label: 'Integrity Match-ups' },
    { id: 'burnout', icon: '🧠', label: 'Behavioral Scan' },
    { id: 'dow', icon: '📅', label: 'DoW Analysis' }
  ];


  const currentTab = tabs.find(t => t.id === uiState.mainTab) || tabs[0];


  return (
    <div className="roster-header relative z-20">
      <div className="flex items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-2">
          <h2 className="text-xl text-slate-900 m-0 font-bold flex items-center gap-2">
            Floor Details
            {uiState.searchQuery && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold uppercase tracking-wide border border-blue-200">Filtered</span>}
          </h2>
        </div>

        <div className="flex items-center gap-3" style={{ marginLeft: 'auto' }}>
          <div className="flex items-center gap-1">
            <button onClick={() => dashData.handleDateChange(-1)} className="p-2 bg-transparent border-none cursor-pointer text-xl text-slate-500 rounded-full transition-all flex items-center justify-center w-9 h-9 hover:bg-slate-100 hover:text-slate-900" title="Previous Day">◀</button>
            <button onClick={() => dashData.handleDateChange(1)} className="p-2 bg-transparent border-none cursor-pointer text-xl text-slate-500 rounded-full transition-all flex items-center justify-center w-9 h-9 hover:bg-slate-100 hover:text-slate-900" title="Next Day">▶</button>
          </div>

          <input
            type="text"
            className="search-input"
            placeholder="Search multiple (comma separated)..."
            value={uiState.inputValue}
            onChange={(e) => uiHandlers.setInputValue(e.target.value)}
            style={{ width: 'min(360px, 100%)', maxWidth: '360px' }}
          />
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-sm w-full overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => uiHandlers.setMainTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap border ${uiState.mainTab === tab.id ? 'bg-white text-slate-900 border-slate-200 shadow-sm' : 'text-slate-500 border-transparent hover:bg-slate-50 hover:text-slate-900'}`}
              title={tab.label}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});


// ==== App state + reducer defaults ==== 
// NOTE: keep reducer state kept here so modal and UI state changes are easy to trace during future refactors.
const MODAL_INITIAL = {
  activeModal: null, selectedSupervisorObj: null,
  expandedBurnoutAgentId: null, highlightedAgentId: null, supTab: 'roster',
};

const UI_INITIAL = {
  mainTab: 'roster',
  activeMainAiTool: null,
  activeSupAiTool: null,
  showColMenu: false,
  showModalColMenu: false,
  showTimeframeMenu: false,
  runChartMetric: 'bonus',
  isCumulative: false,
  heatmapViewType: 'weekly',
  outlierMode: 'offenders',
  outlierLevel: 'agent',
  apprenticeViewMode: 'coding',
};

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
  const [modalState, dispatchModal] = React.useReducer((s, a) => ({ ...s, ...a }), MODAL_INITIAL);
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
  const [uiDisplay, dispatchUi] = React.useReducer((s, a) => ({ ...s, ...a }), UI_INITIAL);
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
          <style dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }} />

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
