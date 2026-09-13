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
  COL_DEFINITIONS,
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
  parseCSVLine,
  getWeekNumber,
  dowFromDateStr,
  detectColumns,
  isRawGranularFormat,
} from './features/dashboard/helpers';
import {
  GeminiLoader,
  FormattedText,
  SubMetricCard,
  DonutChart,
  MetricCell,
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

if (typeof window !== 'undefined') {
  window.tailwind = window.tailwind || { config: {} };
}
var tailwind = typeof window !== 'undefined' ? window.tailwind : { config: {} };

// ==== App entry + shared UI shell ==== 
// Source scan order: src/App.tsx -> src/features/dashboard/* -> src/components/*
// Quick app map:
// 1) TopNavbar / shell + global overlay
// 2) MainStatsRow + FloorHeader + tab content blocks
// 3) AI modal / AskAiContent / MainModal
// 4) data logic: src/dashboard/hooks.ts + metrics.ts + helpers.ts
// 5) reusable UI: src/components/shared.tsx + menus.tsx

const UploadStatus = ({ uploadStatus }) => {
  if (!uploadStatus) return null;
  return (
    <div className="fixed top-24 left-1-2 -translate-x-1-2 z-1000 p-3 px-6 rounded-lg shadow-lg flex items-center gap-3 font-bold animate-slide-down" style={{ background: uploadStatus.type === 'error' ? '#fef2f2' : uploadStatus.type === 'info' ? '#eff6ff' : '#ecfdf5', color: uploadStatus.type === 'error' ? '#991b1b' : uploadStatus.type === 'info' ? '#1e40af' : '#065f46', border: `1px solid ${uploadStatus.type === 'error' ? '#fecaca' : uploadStatus.type === 'info' ? '#bfdbfe' : '#a7f3d0'}` }}>
      {uploadStatus.type === 'error' ? '❌' : uploadStatus.type === 'info' ? '🔄' : '✅'} 
      {uploadStatus.message}
    </div>
  );
};


// ==== AI chart action modal ==== 
// Source: src/App.tsx -> ChartActionPlanModal
const ChartActionPlanModal = () => {
  const { aiTools, uiState } = useDashboard();
  if (!aiTools.loadingChartActionPlan && !aiTools.chartActionPlan) return null;
  return (
    <>
      {aiTools.loadingChartActionPlan && (
        <div className="modal-backdrop open">
          <div className="main-modal bg-transparent shadow-none border-none flex justify-center items-center">
            <GeminiLoader message="Cooking up a targeted action plan..." color="#10B981" />
          </div>
        </div>
      )}
      
      {aiTools.chartActionPlan && (
        <div className="modal-backdrop open" onClick={() => aiTools.setChartActionPlan(null)}>
          <div className="main-modal" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-slate-200 p-6 px-8">
              <h2 className="m-0 text-red-600 flex items-center gap-2 text-xl">
                <span>🎯</span> Targeted Action Plan ({METRIC_CONFIG[uiState.runChartMetric].label})
              </h2>
              <button onClick={() => aiTools.setChartActionPlan(null)} className="bg-transparent border-none text-slate-500 cursor-pointer text-2xl">✕</button>
            </div>
            <div className="p-8 whitespace-pre-wrap leading-relaxed text-slate-700 text-sm">
              <FormattedText text={aiTools.chartActionPlan} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
              <div className="mt-8 text-right">
                <button className="gemini-btn inline-block w-auto" onClick={() => navigator.clipboard.writeText(aiTools.chartActionPlan)}>📋 Copy Action Plan</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


// ==== Top navigation / global actions ==== 
// Source: src/App.tsx
const TopNavbar = React.memo(() => {
  const { dashData, uiState, uiHandlers } = useDashboard();
  const menuRef = useRef(null);
  const timeframeRef = useRef(null);


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


            <input type="file" accept=".csv, .txt, .tsv" id="csv-upload" style={{ display: 'none' }} onChange={dashData.handleFileUpload} />
            <label 
              htmlFor="csv-upload" 
              title="Upload CSV Data" 
              className="py-1 px-4 rounded-full cursor-pointer transition-all flex items-center justify-center text-lg text-white" 
              style={{ background: 'transparent', border: '1px solid transparent', opacity: 0.7 }}
              onMouseOver={(e) => e.currentTarget.style.opacity = 1}
              onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
            >
              📤
            </label>


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


// ==== KPI summary row ==== 
// Source: src/App.tsx -> MainStatsRow
const MainStatsRow = React.memo(() => {
  const { dashData, metrics, uiState } = useDashboard();
  const spotterPrefix = dashData.activeTimeframe === 'monthly' ? 'Monthly Spotter' : dashData.activeTimeframe === 'weekly' ? 'Weekly Spotter' : dashData.activeTimeframe === 'dow' ? 'Day of Week' : 'Daily Spotter';
  const spotterDate = dashData.activeTimeframe === 'monthly' ? 'MTD' : dashData.activeTimeframe === 'weekly' ? dashData.selectedWeek : dashData.activeTimeframe === 'dow' ? dashData.selectedDow : dashData.selectedDate;


  return (
    <div className="stats-row">
      <div className="metric-card card-mtd flex flex-col p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl text-white m-0 font-bold">Month to Date</h2>
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Calls Handled: <strong className="text-white">{metrics.mtdLeaderData.calls ? metrics.mtdLeaderData.calls.toLocaleString() : '-'}</strong></span>
              <span className="text-xs text-slate-400 bg-slate-800 py-1 px-2 rounded">Resolve Contacts: <strong className="text-white">{metrics.mtdLeaderData.resolveTotalContacts ? metrics.mtdLeaderData.resolveTotalContacts.toLocaleString() : '-'}</strong></span>
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


// ==== Floor header + selector bar ==== 
// Source: src/App.tsx -> FloorHeader
const FloorHeader = React.memo(() => {
  const { dashData, uiState, uiHandlers } = useDashboard();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


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
      <div>
        <h2 className="text-xl text-slate-900 m-0 font-bold flex items-center gap-2">
            Floor Details 
            {uiState.searchQuery && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold uppercase tracking-wide border border-blue-200">Filtered</span>}
        </h2>
      </div>


        <div className="flex gap-3 items-center flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => dashData.handleDateChange(-1)} className="p-2 bg-transparent border-none cursor-pointer text-xl text-slate-500 rounded-full transition-all flex items-center justify-center w-9 h-9 hover:bg-slate-100 hover:text-slate-900" title="Previous Day">◀</button>
          <button onClick={() => dashData.handleDateChange(1)} className="p-2 bg-transparent border-none cursor-pointer text-xl text-slate-500 rounded-full transition-all flex items-center justify-center w-9 h-9 hover:bg-slate-100 hover:text-slate-900" title="Next Day">▶</button>
        </div>


        <div className="relative" ref={dropdownRef}>
          <button 
            title="Action Hub Menu"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center justify-center w-11 h-11 bg-slate-900 border border-slate-700 rounded-xl shadow-sm text-white hover:bg-slate-800 hover:border-slate-600 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-slate-900"
          >
            <span className="text-xl leading-none">{currentTab.icon}</span>
          </button>
          
          {isDropdownOpen && (
            <div className="absolute left-0 top-full mt-2 min-w-[200px] w-max glass-panel rounded-xl z-50 overflow-hidden animate-slide-down p-2">
              <div className="flex flex-col gap-1">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { uiHandlers.setMainTab(tab.id); setIsDropdownOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer border-none text-left whitespace-nowrap ${uiState.mainTab === tab.id ? 'bg-white shadow-sm text-slate-900 border border-slate-200' : 'bg-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}
                  >
                    <span className="text-lg leading-none shrink-0 text-center">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>


        <input 
          type="text" 
          className="search-input" 
          placeholder="Search multiple (comma separated)..." 
          value={uiState.inputValue}
          onChange={(e) => uiHandlers.setInputValue(e.target.value)}
        />
      </div>
    </div>
  );
});


// Drag-and-drop upload zone, shown in place of plain text when no data is loaded yet.
const DropZone = () => {
  const { dashData } = useDashboard();
  const [isDragOver, setIsDragOver] = useState(false);

  const onDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragOver(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) dashData.handleFileDrop(file);
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => document.getElementById('csv-upload')?.click()}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '48px 24px', margin: '12px', borderRadius: 14, cursor: 'pointer',
        border: `2px dashed ${isDragOver ? '#3b82f6' : '#cbd5e1'}`,
        background: isDragOver ? '#eff6ff' : '#f8fafc',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ fontSize: '2rem', opacity: isDragOver ? 1 : 0.6 }}>📤</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: isDragOver ? '#2563eb' : '#475569' }}>
        {isDragOver ? 'Drop your file here' : 'Drag & drop your CSV report here'}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>or click to browse — .csv, .txt, .tsv</div>
    </div>
  );
};


// ==== Floor roster tab ==== 
// Source: src/App.tsx -> FloorRosterTab
const FloorRosterTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  return (
  <div className="table-scroll-area">
    <table className="roster-table" style={{ minWidth: '100%', margin: 0 }}>
      <thead className="bg-slate-50">
        <tr>
          <th className="bg-slate-50 text-slate-700 border-b border-slate-300 cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange('name')}>
            Supervisor {(uiState.sortConfig.key === 'name' || uiState.sortConfig.key === 'outlier') && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
          </th>

          {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
            <th key={col.key} className="bg-slate-50 text-slate-700 border-b border-slate-300 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange(col.key)}>
              {col.label} {uiState.sortConfig.key === col.key && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
            </th>
          ))}
          {uiState.visibleCols.trajectory && <th className="bg-slate-50 text-slate-700 border-b border-slate-300 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleSortChange('trajectory')}>
            Trend {uiState.sortConfig.key === 'trajectory' && <span className="sort-icon">{uiState.sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
          </th>}
        </tr>
      </thead>
      <tbody>
        {(() => {
          const queries = uiState.searchQuery.toLowerCase().split(',').map(q => q.trim()).filter(q => q);
          let activeOamName = null;
          
          if (queries.length > 0) {
              const searchedOams = [...new Set(dashData.agents.map(a => a.oam).filter(o => o && queries.some(q => o.toLowerCase().includes(q))))];
              if (searchedOams.length === 1) {
                  activeOamName = searchedOams[0];
              }
          }


          const rollupRow = activeOamName ? (
            <tr key="oam-rollup-row" className="bg-slate-200 border-b-2 border-slate-300 font-extrabold cursor-default transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <td className="p-3 px-6 text-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  <div className="flex flex-col">
                     <span>{activeOamName} (OAM Overall)</span>
                     <span className="text-xs text-slate-500 font-normal mt-0.5">{metrics.sortedSupervisors.length} Supervisors</span>
                  </div>
                </div>
              </td>
              {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                 <td key={`rollup-${col.key}`} className="p-3 px-6 text-center bg-slate-200">
                   <MetricCell 
                     value={metrics.activeLeaderData[col.key]} 
                     target={getDynamicTarget(col.stateKey, metrics.activeLeaderData.activeAgentCount || 1)} 
                     reverse={col.reverse} 
                     isOff={metrics.activeLeaderData.isOff} 
                     isInteger={col.isInteger} 
                   />
                 </td>
              ))}
              {uiState.visibleCols.trajectory && <td className="bg-slate-200">
                <div className="text-center w-full">
                  {metrics.activeLeaderData.isOff ? (
                    <span className="text-xs text-slate-500 italic">-</span>
                  ) : (
                    <span className="text-xs font-extrabold px-2 py-1 rounded whitespace-nowrap" 
                          style={{ 
                            color: calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'up' ? '#10B981' : calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'down' ? '#D52B1E' : '#64748b', 
                            background: calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'up' ? '#ecfdf5' : calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).direction === 'down' ? '#fef2f2' : '#f1f5f9' 
                          }}>
                       {calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).label} ({calculateTrend(metrics.activeLeaderData, metrics.mtdLeaderData).diffStr})
                    </span>
                  )}
                </div>
              </td>}
            </tr>
          ) : null;


          return (
             <>
                {rollupRow}
                {metrics.sortedSupervisors.map((supObj) => {
                  const supData = supObj.activeData;
                  const isOffToday = supObj.isOff;
                  const trendInfo = supObj.trend;
                  return (
                    <tr 
                      key={supObj.name} 
                      className={`roster-row transition-all duration-300 hover:-translate-y-1 hover:shadow-md relative z-10 ${uiState.selectedSupervisorObj?.name === supObj.name ? 'active' : ''}`}
                      style={{ opacity: isOffToday ? 0.6 : 1 }}
                      onClick={() => {
                          if (!isOffToday) {
                              uiHandlers.setSelectedSupervisorObj(supObj);
                              uiHandlers.setActiveModal('supervisor');
                              aiTools.generateExpertReport(supObj);
                          }
                      }}
                    >
                      <td className="font-semibold p-3 px-6">
                        <div className="flex items-center gap-1">
                          <span>{supObj.name}</span>
                          {supObj.isHighRisk && !isOffToday && (
                            <span className="text-base cursor-help" title="High Risk Trend">⚠️</span>
                          )}
                        </div>
                        <span className="block text-xs text-slate-500 font-normal">
                          {supObj.agentCount} Agents
                        </span>
                      </td>
                      {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                         <td key={col.key} className="p-3 px-6 text-center">
                           <MetricCell value={supData[col.key]} target={getDynamicTarget(col.stateKey, supObj.agentCount)} reverse={col.reverse} isOff={isOffToday} isInteger={col.isInteger} />
                         </td>
                      ))}
                      {uiState.visibleCols.trajectory && <td>
                        <div className="text-center w-full">
                          {isOffToday ? (
                            <span className="text-xs text-slate-400 italic">-</span>
                          ) : (
                            <span className="text-xs font-extrabold px-2 py-1 rounded whitespace-nowrap" style={{ color: trendInfo.direction === 'up' ? '#10B981' : trendInfo.direction === 'down' ? '#D52B1E' : '#64748b', background: trendInfo.direction === 'up' ? '#ecfdf5' : trendInfo.direction === 'down' ? '#fef2f2' : '#f1f5f9' }}>
                               {trendInfo.label} ({trendInfo.diffStr})
                            </span>
                          )}
                        </div>
                      </td>}
                    </tr>
                  );
                })}
                {metrics.sortedSupervisors.length === 0 && (
                  <tr>
                    <td colSpan={COL_DEFINITIONS.length + 2} className="text-center p-0">
                      {dashData.hasUploadedData
                        ? <div className="p-10 text-slate-500">{`No supervisors found matching "${uiState.searchQuery}"`}</div>
                        : <DropZone />
                      }
                    </td>
                  </tr>
                )}
             </>
          );
        })()}
      </tbody>
    </table>
  </div>
);
};


// ==== Outliers tab ==== 
// Source: src/App.tsx -> FloorOutliersTab
const FloorOutliersTab = () => {
  const { metrics, uiState, uiHandlers, aiTools } = useDashboard();
  const handleOutlierClick = (item, sortKey, sortDir) => {
      const supName = uiState.outlierLevel === 'agent' ? item.agent.supervisor : item.agent.name;
      const supObj = metrics.supervisorStats.find(s => s.name === supName);
      if (supObj) {
          uiHandlers.setSelectedSupervisorObj(supObj);
          uiHandlers.setActiveModal('supervisor');
          uiHandlers.setSupTab('roster');
          if (sortKey) {
              uiHandlers.setAgentSortConfig({ key: sortKey, direction: sortDir });
          }
          aiTools.generateExpertReport(supObj);
      }
  };


  return (
    <div className="flex flex-col gap-8 p-8 bg-slate-50 border-t border-slate-200">
      <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-6 gap-4 border-b border-slate-100 pb-4 overflow-x-auto">
          <h3 className="text-lg md:text-xl m-0 flex items-center gap-2 font-extrabold text-slate-900 whitespace-nowrap flex-shrink-0">
            <span>{uiState.outlierMode === 'offenders' ? '⚠️' : '🌟'}</span> Top 10 {uiState.outlierMode === 'offenders' ? 'Offenders' : 'Performers'} ({uiState.outlierLevel === 'agent' ? 'Agents' : 'Supervisors'})
          </h3>
          
          <div className="flex gap-4 items-center whitespace-nowrap flex-shrink-0 min-w-max">
            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setOutlierLevel('agent')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierLevel === 'agent' ? '#ffffff' : 'transparent', color: uiState.outlierLevel === 'agent' ? '#0b0f19' : '#64748b', boxShadow: uiState.outlierLevel === 'agent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Agent</button>
              <button 
                onClick={() => uiHandlers.setOutlierLevel('supervisor')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierLevel === 'supervisor' ? '#ffffff' : 'transparent', color: uiState.outlierLevel === 'supervisor' ? '#0b0f19' : '#64748b', boxShadow: uiState.outlierLevel === 'supervisor' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Supervisor</button>
            </div>
            
            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setOutlierMode('offenders')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierMode === 'offenders' ? '#fee2e2' : 'transparent', color: uiState.outlierMode === 'offenders' ? '#991b1b' : '#64748b', boxShadow: uiState.outlierMode === 'offenders' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Negative (Offenders)</button>
              <button 
                onClick={() => uiHandlers.setOutlierMode('performers')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.outlierMode === 'performers' ? '#d1fae5' : 'transparent', color: uiState.outlierMode === 'performers' ? '#065f46' : '#64748b', boxShadow: uiState.outlierMode === 'performers' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Positive (Performers)</button>
            </div>
          </div>
        </div>


        <p className="text-sm m-0 mb-6 leading-relaxed text-slate-500">
          {uiState.outlierMode === 'offenders' ? `Focus coaching and intervention on these specific ${uiState.outlierLevel}s.` : `Analyze and duplicate the successful behaviors of these top ${uiState.outlierLevel}s.`}
        </p>
        
        {uiState.outlierMode === 'offenders' ? (
          <div className="grid grid-cols-auto-300 gap-6">
             <ParetoColumn title="Top CSAT Detractor Drivers" icon="💔" data={metrics.paretoData[uiState.outlierLevel].offenders.byDetractors} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="detractors" labelFn={i => `${Math.round(i.data.detractors)} Detractors`} onItemClick={(item) => handleOutlierClick(item, 'vxs', 'asc')} />
             <ParetoColumn title="Top 3DR Repeat Drivers" icon="🔁" data={metrics.paretoData[uiState.outlierLevel].offenders.byRepeats} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="repeats3d" labelFn={i => i.data.resolve3d != null ? Number(i.data.resolve3d).toFixed(2) + '%' : '-'} onItemClick={(item) => handleOutlierClick(item, 'resolve3d', 'asc')} />
             <ParetoColumn title="Top Hand-off Drivers" icon="🤝" data={metrics.paretoData[uiState.outlierLevel].offenders.byHandoffs} colorObj={{ light: '#fecaca', dark: '#dc2626' }} valKey="handoffsCount" labelFn={i => `${Math.round(i.data.handoffsCount)} Hand-offs`} onItemClick={(item) => handleOutlierClick(item, 'handoffs', 'desc')} />
          </div>
        ) : (
          <div className="grid grid-cols-auto-300 gap-6">
             <ParetoColumn title={uiState.outlierLevel === 'agent' ? "Clean CSAT (100%)" : "Top CSAT Promoters"} icon="🌟" data={metrics.paretoData[uiState.outlierLevel].performers.byPromoters} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="promoters" labelFn={i => `${Math.round(i.data.promoters)} Promoters`} onItemClick={(item) => handleOutlierClick(item, 'vxs', 'desc')} />
             <ParetoColumn title="Top 3DR %" icon="✅" data={metrics.paretoData[uiState.outlierLevel].performers.byResolves} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="resolveTotalContacts3d" labelFn={i => `${Number(i.data.resolve3d).toFixed(2)}%`} onItemClick={(item) => handleOutlierClick(item, 'resolve3d', 'desc')} />
             <ParetoColumn title="Top Sellers (Sales)" icon="📱" data={metrics.paretoData[uiState.outlierLevel].performers.byPhoneAdds} colorObj={{ light: '#a7f3d0', dark: '#059669' }} valKey="phoneAdds" labelFn={i => `${Math.round(i.data.phoneAdds || 0)} Units`} onItemClick={(item) => handleOutlierClick(item, 'phoneAdds', 'desc')} />
          </div>
        )}
      </div>
    </div>
  );
};


// ==== Apprentice tab ==== 
// Source: src/App.tsx -> FloorApprenticeTab
const FloorApprenticeTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  const isCoding = uiState.apprenticeViewMode === 'coding';
  
  const handleCohortClick = (cohortName) => {
      uiHandlers.setInputValue(cohortName);
      uiHandlers.setSearchQuery(cohortName);
      uiHandlers.setMainTab('roster');
  };


  const titleA = isCoding ? "New Hires" : "OJT";
  const titleB = isCoding ? "Transitions" : "Nesting";

  // Memoized: only recomputes when agents, view mode, or timeframe changes
  const groupA = useMemo(
    () => dashData.agents.filter(a => isCoding ? a.coding === 'New Hire' && a.phase !== 'OJT' : a.phase === 'OJT'),
    [dashData.agents, isCoding]
  );
  const groupB = useMemo(
    () => dashData.agents.filter(a => isCoding ? a.coding === 'Transition' : a.phase === 'Nesting'),
    [dashData.agents, isCoding]
  );

  const dataA = useMemo(
    () => aggregateTeamMetrics(groupA.map(a => dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe))),
    [groupA, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );
  const dataB = useMemo(
    () => aggregateTeamMetrics(groupB.map(a => dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe))),
    [groupB, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );


  useEffect(() => {
    if (dataA && dataB && (dataA.calls > 0 || dataB.calls > 0)) {
        aiTools.generateApprenticeReport(uiState.apprenticeViewMode, dataA, dataB, titleA, titleB);
    }
  }, [uiState.apprenticeViewMode, dashData.selectedDate, dashData.selectedWeek, dashData.activeTimeframe]);


  const getVal = (d, key) => (d && d[key] !== null && d[key] !== undefined && !isNaN(d[key])) ? d[key] : 0;
  
  const metricsToRender = [
    { key: 'calls', label: 'Volume (Calls)', type: 'count', aVal: getVal(dataA, 'calls'), bVal: getVal(dataB, 'calls'), aSub: `${getVal(dataA, 'ncwCount')} NCWs`, bSub: `${getVal(dataB, 'ncwCount')} NCWs` },
    { key: 'vxs', label: 'C-Sat', type: 'pct', aVal: getVal(dataA, 'vxs'), bVal: getVal(dataB, 'vxs'), aSub: `${getVal(dataA, 'detractors')} Detractors`, bSub: `${getVal(dataB, 'detractors')} Detractors` },
    { key: 'resolve2hr', label: '2HR', type: 'pct', aVal: getVal(dataA, 'resolve2hr'), bVal: getVal(dataB, 'resolve2hr') },
    { key: 'resolve3d', label: '3DR', type: 'pct', aVal: getVal(dataA, 'resolve3d'), bVal: getVal(dataB, 'resolve3d') },
    { key: 'handoffs', label: 'Hand-offs', type: 'pct', aVal: getVal(dataA, 'handoffs'), bVal: getVal(dataB, 'handoffs'), aSub: `${Math.round(getVal(dataA, 'handoffsCount'))} Transfers`, bSub: `${Math.round(getVal(dataB, 'handoffsCount'))} Transfers` },
    { key: 'phoneAdds', label: 'Phone Lines', type: 'count', aVal: getVal(dataA, 'phoneAdds'), bVal: getVal(dataB, 'phoneAdds') },
    { key: 'vhi', label: 'VHI', type: 'count', aVal: getVal(dataA, 'vhi'), bVal: getVal(dataB, 'vhi') },
    { key: 'vtt', label: 'VTT', type: 'pct', aVal: getVal(dataA, 'vtt'), bVal: getVal(dataB, 'vtt') }
  ];


  return (
    <div className="flex flex-col gap-6 p-8 bg-slate-50 border-t border-slate-200">
       <div className="flex justify-between items-start flex-wrap gap-4">
           <div>
             <h3 className="text-2xl m-0 flex items-center gap-2 font-extrabold text-slate-900">
               <span>🎓</span> Apprentice Track Impact
             </h3>
             <p className="text-sm m-0 mt-1 text-slate-500">
               The race between {isCoding ? 'New Hires and Transitions' : 'OJT and Nesting'}.
             </p>
           </div>
           
           <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setApprenticeViewMode('coding')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.apprenticeViewMode === 'coding' ? '#ffffff' : 'transparent', color: uiState.apprenticeViewMode === 'coding' ? '#0b0f19' : '#64748b', boxShadow: uiState.apprenticeViewMode === 'coding' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Coding Track</button>
              <button 
                onClick={() => uiHandlers.setApprenticeViewMode('phase')}
                className="px-4 py-2 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.apprenticeViewMode === 'phase' ? '#ffffff' : 'transparent', color: uiState.apprenticeViewMode === 'phase' ? '#0b0f19' : '#64748b', boxShadow: uiState.apprenticeViewMode === 'phase' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Operational Phase</button>
            </div>
       </div>


       <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
               <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 px-6 text-slate-700 font-bold uppercase text-xs w-1/3">Metric</th>
                  <th 
                    className="p-4 px-6 text-center border-l border-slate-200 w-1/3 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleCohortClick(isCoding ? 'New Hire' : 'OJT')}
                    title={`Click to deeply filter floor roster by ${titleA}`}
                  >
                      <div className="text-slate-900 font-extrabold text-base">{titleA}</div>
                      <div className="text-slate-400 text-xs font-normal mt-1">{groupA.length} Agents</div>
                  </th>
                  <th 
                    className="p-4 px-6 text-center border-l border-slate-200 w-1/3 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => handleCohortClick(isCoding ? 'Transition' : 'Nesting')}
                    title={`Click to deeply filter floor roster by ${titleB}`}
                  >
                      <div className="text-slate-900 font-extrabold text-base">{titleB}</div>
                      <div className="text-slate-400 text-xs font-normal mt-1">{groupB.length} Agents</div>
                  </th>
               </tr>
            </thead>
            <tbody>
               {metricsToRender.map((m, idx) => {
                  const target = getDynamicTarget(m.key, 1);
                  const isReverse = METRIC_CONFIG[m.key]?.reverse;
                  
                  const formatVal = (v, type) => type === 'count' ? Math.round(v) : Number(v).toFixed(1) + '%';
                  const getColor = (v) => {
                      if (!target || v === 0) return '#0b0f19';
                      return (isReverse ? v <= target : v >= target) ? '#059669' : '#dc2626';
                  };


                  return (
                    <tr key={m.key} className={idx !== metricsToRender.length - 1 ? "border-b border-slate-100" : ""}>
                       <td className="p-5 px-6 font-bold text-slate-800 bg-slate-50">{m.label}</td>
                       <td className="p-5 px-6 text-center border-l border-slate-100">
                           <div className="flex flex-col items-center justify-center">
                              <span className="text-lg font-extrabold" style={{ color: m.key === 'calls' ? '#0b0f19' : getColor(m.aVal) }}>{formatVal(m.aVal, m.type)}</span>
                              {m.aSub && <span className="text-xs text-slate-400 font-normal mt-1">{m.aSub}</span>}
                           </div>
                       </td>
                       <td className="p-5 px-6 text-center border-l border-slate-100">
                           <div className="flex flex-col items-center justify-center">
                              <span className="text-lg font-extrabold" style={{ color: m.key === 'calls' ? '#0b0f19' : getColor(m.bVal) }}>{formatVal(m.bVal, m.type)}</span>
                              {m.bSub && <span className="text-xs text-slate-400 font-normal mt-1">{m.bSub}</span>}
                           </div>
                       </td>
                    </tr>
                  );
               })}
            </tbody>
          </table>
       </div>


       {aiTools.loadingApprentice ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex justify-center">
             <GeminiLoader message="Analyzing track performance..." color="#8b5cf6" icon="🧠" />
          </div>
       ) : aiTools.apprenticeReport && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="p-5 px-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-lg font-extrabold flex items-center gap-2 m-0 text-slate-900"><span>🤖</span> AI Impact Analysis</h3>
                <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.apprenticeReport)}>Copy</button>
             </div>
             <div className="report-body text-[1.05rem] leading-relaxed m-0 p-6 px-8">
               <FormattedText text={aiTools.apprenticeReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
             </div>
          </div>
       )}
    </div>
  );
};


// ==== Analysis tab ==== 
// Source: src/App.tsx -> FloorAnalysisTab
const FloorAnalysisTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.teamReport && !aiTools.loadingTeam) aiTools.generateTeamReport();
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🤖</span> Floor Analysis & Game Plan</h3>
            <p className="text-sm text-slate-500 m-0">Unified AI-driven analysis of organizational trends paired with actionable daily leadership targets.</p>
          </div>
          {aiTools.teamReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.teamReport)}>Copy</button>}
        </div>
        {aiTools.loadingTeam ? ( <GeminiLoader message="Brewing up your Unified Strategy Report..." color="#3b82f6" /> ) : aiTools.teamReport ? (
           <div className="report-body text-[1.05rem] leading-relaxed mt-0">
             <FormattedText text={aiTools.teamReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
           </div>
        ) : (
           <div className="text-center p-5 text-slate-500 italic">Initializing Floor Strategy Report...</div>
        )}
      </div>
    </div>
  );
};


// ==== Trends tab ==== 
// Source: src/App.tsx -> FloorTrendsTab
const FloorTrendsTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>📈</span> Trends</h3>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
               <select value={uiState.runChartMetric} onChange={(e) => uiHandlers.setRunChartMetric(e.target.value)} className="py-1.5 px-3 rounded-md border border-slate-300 outline-none bg-slate-50 text-slate-900 font-semibold cursor-pointer text-sm">
                {Object.keys(METRIC_CONFIG).map(k => (
                  <option key={k} value={k}>{METRIC_CONFIG[k].label}</option>
                ))}
              </select>
            </div>
            
            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setIsCumulative(false)}
                className="px-4 py-1.5 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: !uiState.isCumulative ? '#ffffff' : 'transparent', color: !uiState.isCumulative ? '#0b0f19' : '#64748b', boxShadow: !uiState.isCumulative ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Standalone</button>
              <button 
                onClick={() => uiHandlers.setIsCumulative(true)}
                className="px-4 py-1.5 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.isCumulative ? '#ffffff' : 'transparent', color: uiState.isCumulative ? '#0b0f19' : '#64748b', boxShadow: uiState.isCumulative ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Cumulative</button>
            </div>


            <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-sm p-1 gap-1">
              <button 
                onClick={() => uiHandlers.setHeatmapViewType('daily')}
                className="px-4 py-1.5 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.heatmapViewType === 'daily' ? '#ffffff' : 'transparent', color: uiState.heatmapViewType === 'daily' ? '#0b0f19' : '#64748b', boxShadow: uiState.heatmapViewType === 'daily' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Daily View</button>
              <button 
                onClick={() => uiHandlers.setHeatmapViewType('weekly')}
                className="px-4 py-1.5 border-none font-bold cursor-pointer text-sm transition-all rounded-md"
                style={{ background: uiState.heatmapViewType === 'weekly' ? '#ffffff' : 'transparent', color: uiState.heatmapViewType === 'weekly' ? '#0b0f19' : '#64748b', boxShadow: uiState.heatmapViewType === 'weekly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
              >Weekly View</button>
            </div>


            <button className="gemini-btn text-xs py-1.5 px-3 ml-2" onClick={aiTools.generateChartActionPlan} disabled={aiTools.loadingChartActionPlan || metrics.runChartData.length === 0} style={{ background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', boxShadow: '0 4px 12px rgba(11, 15, 25, 0.2)' }}>
              {aiTools.loadingChartActionPlan ? '✨ Analyzing...' : '✨ Create Action Plan'}
            </button>
          </div>
        </div>
        <PerformanceHeatmap activeDates={metrics.allActiveDates} chartData={metrics.runChartData} metricConfig={METRIC_CONFIG[uiState.runChartMetric]} baseTarget={getDynamicTarget(uiState.runChartMetric, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} onCellClick={(date) => { dashData.setActiveTimeframe('daily'); dashData.setSelectedDate(date); uiHandlers.setMainTab('roster'); }} />
      </div>
    </div>
);
};


// ==== Correlation tab ==== 
// Source: src/App.tsx -> FloorCorrelationTab
const FloorCorrelationTab = () => {
  const { dashData, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.correlationReport && !aiTools.loadingCorrelation) aiTools.generateCorrelationReport();
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🎯</span> Integrity Match-ups</h3>
            <p className="text-sm text-slate-500 m-0">Pre-built risk profiles mapping behavioral trade-offs. The AI actively scans the raw data to surface the strongest hidden links.</p>
          </div>
          {aiTools.correlationReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.correlationReport)}>Copy</button>}
        </div>


        {aiTools.loadingCorrelation ? (
           <div className="flex justify-center p-10"><GeminiLoader color="#f59e0b" message="Scanning data for all Integrity Match-ups..." icon="🧠" /></div>
        ) : aiTools.correlationReport ? (
           <div className="report-body text-[1.05rem] leading-relaxed mt-0">
             <FormattedText text={aiTools.correlationReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
           </div>
        ) : (
           <div className="text-center p-10 text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-lg">Initializing Correlation Scan...</div>
        )}
      </div>
    </div>
  );
};


// ==== Burnout tab ==== 
// Source: src/App.tsx -> FloorBurnoutTab
const FloorBurnoutTab = () => {
  const { metrics, uiState, uiHandlers } = useDashboard();
  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4">
          <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-red-700"><span>🧠</span> Behavioral Scan Watchlist</h3>
          <p className="text-sm text-slate-500 m-0">Floor-wide agents flagged for extreme operational strain. Rank priority: AHT &gt; Net OCC &gt; DPC &gt; Hold.</p>
        </div>


        {metrics.orgBurnoutList.length === 0 ? (
          <div className="text-center p-5 text-slate-500 italic">No agents currently flagged for high behavioral risk on the floor.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metrics.orgBurnoutList.map((item, idx) => {
              const isExpanded = uiState.expandedBurnoutAgentId === item.agent.ccms;
              return (
                <div key={item.agent.ccms} className="flex flex-col bg-red-50 border border-red-200 rounded-lg overflow-hidden shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                  <div
                    onClick={() => uiHandlers.setExpandedBurnoutAgentId(isExpanded ? null : item.agent.ccms)}
                    className="flex justify-between p-4 px-5 items-center cursor-pointer transition-all"
                    style={{ backgroundColor: isExpanded ? '#fee2e2' : 'transparent' }}
                    onMouseOver={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                    onMouseOut={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div className="flex items-center gap-4">
                        <div className="text-2xl font-black text-red-600 w-8 text-center">#{idx + 1}</div>
                        <div>
                            <strong className="block text-base text-red-800">{item.agent.name}</strong>
                            <span className="text-xs font-semibold text-red-700 opacity-80 uppercase tracking-wide">Sup: {item.agent.supervisor}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <strong className="block text-red-600 text-xl font-extrabold">{item.highMetricsCount}/4 Missed</strong>
                    </div>
                  </div>


                  {isExpanded && (
                    <div className="p-5 bg-white border-t border-dashed border-red-200">
                      <div className="grid grid-cols-auto-110 gap-3">
                         {COL_DEFINITIONS.map(col => {
                            const val = item.data[col.stateKey];
                            const isMissing = val === null || val === undefined || isNaN(val) || val === '';
                            let displayVal = '-';
                            if (!isMissing) {
                                if (['phoneAdds', 'vhi', 'aht', 'hold'].includes(col.stateKey)) displayVal = Math.round(val);
                                else displayVal = Number(val).toFixed(2);
                            }
                            let valColor = '#0b0f19';
                            const tgt = getDynamicTarget(col.stateKey, 1);
                            if (!isMissing && tgt !== null && tgt !== undefined) {
                                const isGood = col.reverse ? val <= tgt : val >= tgt;
                                valColor = isGood ? '#10B981' : '#D52B1E';
                            }
                            return (
                              <div key={col.key} className="bg-slate-50 border border-slate-200 p-3 rounded-md text-center shadow-sm">
                                <div className="text-xs text-slate-500 uppercase font-extrabold mb-1">{col.label}</div>
                                <div className="text-xl font-black" style={{ color: valColor }}>{displayVal}{!isMissing ? col.format : ''}</div>
                              </div>
                            )
                         })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};


// ==== Day-of-week tab ==== 
// Source: src/App.tsx -> FloorDowTab
const FloorDowTab = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  useEffect(() => {
    if(dashData.hasUploadedData && !aiTools.dowReport && !aiTools.loadingDow) aiTools.generateDowReport(metrics.dowData);
  }, [dashData.hasUploadedData, dashData.historicalData]);


  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="mb-6 border-b border-slate-100 pb-4 flex justify-between items-end flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>📅</span> Day-of-the-Week (DoW) Analysis</h3>
            <p className="text-sm text-slate-500 m-0">Aggregate performance based on historical day to identify systemic vulnerabilities.</p>
          </div>
          {aiTools.dowReport && <button className="gemini-btn btn-alt px-3 py-1.5 text-xs" onClick={() => navigator.clipboard.writeText(aiTools.dowReport)}>Copy</button>}
        </div>


        <table className="w-full text-left border-collapse mt-4 shadow-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead className="bg-slate-50">
             <tr className="border-b border-slate-200">
               <th className="p-3 px-6 font-bold text-slate-700 text-sm">Day</th>
               <th className="p-3 px-6 text-center font-bold text-slate-700 text-sm">Calls Handled</th>
               {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                 <th key={col.key} className="p-3 px-6 text-center font-bold text-slate-700 text-sm">{col.label}</th>
               ))}
             </tr>
          </thead>
          <tbody>
             {metrics.dowData.summary.map((row, i) => (
                <tr 
                  key={row.day} 
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-100 cursor-pointer transition-colors"
                  title={`Click to drill down into ${row.day} Team Roster`}
                  onClick={() => {
                      dashData.setActiveTimeframe('dow');
                      dashData.setSelectedDow(row.day);
                      uiHandlers.setMainTab('roster');
                  }}
                >
                  <td className="p-3 px-6 font-bold text-slate-800 flex items-center">
                     {row.day} 
                     {metrics.dowData.worstIdx === i && <span className="ml-2 text-lg animate-pulse" title="Worst Performing Day">⚠️</span>}
                  </td>
                  <td className="p-3 px-6 text-center text-slate-600 font-semibold">{row.data.calls || 0}</td>
                  
                  {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                    <td key={col.key} className="p-3 px-6 text-center">
                      <MetricCell 
                        value={row.data[col.stateKey]} 
                        target={getDynamicTarget(col.stateKey, row.avgAgents)} 
                        reverse={col.reverse} 
                        isOff={row.isOff} 
                        format={col.format} 
                        isInteger={col.isInteger} 
                      />
                    </td>
                  ))}
                </tr>
             ))}
          </tbody>
        </table>


        {aiTools.loadingDow ? (
           <div className="mt-8 flex justify-center"><GeminiLoader message="Analyzing systemic day vulnerabilities..." color="#0d9488" icon="📅" /></div>
        ) : aiTools.dowReport && (
           <div className="bg-[#fff1f2] border border-[#fecdd3] rounded-xl p-8 mt-8 shadow-sm">
              <div className="report-body text-[1.05rem] leading-relaxed text-red-950 mt-0">
                <FormattedText text={aiTools.dowReport} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />
              </div>
           </div>
        )}
      </div>
    </div>
  );
};


// ==== AI assistant content ==== 
// Source: src/App.tsx -> AskAiContent
// ==== Ask AI modal content ==== 
// Source: src/App.tsx -> AskAiContent
const AskAiContent = ({ aiTools, uiState, uiHandlers }) => {
  const smartChips = [
    "🔍 Why did 3DR drop yesterday?",
    "🔍 Who has the highest Hand-offs vs NCW?",
    "🔍 Which Supervisor is driving the most Sales?"
  ];


  return (
    <div className="flex flex-col gap-6 animate-slide-down bg-slate-50 p-6 rounded-xl border border-slate-200">
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm">
        <div className="mb-4">
          <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🔍</span> Data Assistant</h3>
        </div>
        <div className="chat-input-area border border-slate-300 rounded-lg p-1 bg-slate-50 focus-within:border-blue-500 transition-all shadow-sm flex items-center">
          <svg className="ml-3 text-slate-400" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input 
            type="text" className="chat-input border-none bg-transparent flex-1 text-slate-900 placeholder:text-slate-400 !outline-none !shadow-none" placeholder="e.g. Which supervisor has the highest AHT? or What is my overall C-Sat?"
            value={aiTools.askAiQuery} onChange={(e) => aiTools.setAskAiQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aiTools.handleAskAiSubmit()} disabled={aiTools.askAiLoading}
          />
          <button className="gemini-btn w-auto !m-1" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)' }} onClick={() => aiTools.handleAskAiSubmit()} disabled={aiTools.askAiLoading || !aiTools.askAiQuery.trim()}>Ask</button>
        </div>
        
        {/* Smart Chips Section */}
        <div className="flex flex-wrap gap-2 mt-4">
          {smartChips.map((chip, idx) => (
            <button 
              key={idx}
              onClick={() => aiTools.handleAskAiSubmit(chip)}
              disabled={aiTools.askAiLoading}
              className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 text-xs font-semibold cursor-pointer hover:bg-slate-100 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {chip}
            </button>
          ))}
        </div>
        
        {aiTools.askAiLoading && (
          <div className="flex justify-center p-6 mt-4"><GeminiLoader message="Analyzing dashboard data..." icon="🧠" color="#3b82f6" /></div>
        )}
        
        {aiTools.askAiResponse && !aiTools.askAiLoading && (
          <div className="ai-output-box !mb-0 mt-6 border-blue-200 bg-blue-50">
              <div className="text-xs font-extrabold text-blue-800 uppercase mb-3 flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Data Assistant Analysis</div>
              <div className="whitespace-pre-wrap text-slate-800 text-[1.05rem] leading-relaxed"><FormattedText text={aiTools.askAiResponse} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} /></div>
          </div>
        )}
      </div>
    </div>
  );
};


const SupervisorModalContent = () => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  if (!uiState.selectedSupervisorObj) return null;

  const supName = uiState.selectedSupervisorObj.name;

  // ── Memoized: only recomputes when supervisor, timeframe, or sort changes ──
  const supAgentsList = useMemo(() =>
    dashData.agents
      .filter(a => a.supervisor === supName)
      .map(a => ({ agent: a, data: dashData.getAgentDataForTimeframe(a, dashData.activeTimeframe) }))
      .filter(item => !item.data.isOff),
    [dashData.agents, supName, dashData.activeTimeframe, dashData.getAgentDataForTimeframe]
  );

  const topDetractors = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.detractors || 0) - (a.data.detractors || 0)).filter(a => a.data.detractors >= 1).slice(0, 3), [supAgentsList]);
  const topRepeats    = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.repeats3d || 0) - (a.data.repeats3d || 0)).filter(a => a.data.repeats3d >= 1).slice(0, 3), [supAgentsList]);
  const topHandoffs   = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.handoffsCount || 0) - (a.data.handoffsCount || 0)).filter(a => a.data.handoffsCount >= 1).slice(0, 3), [supAgentsList]);
  const topPromoters  = useMemo(() => [...supAgentsList].filter(a => a.data.vxs === 100 && a.data.promoters >= 1).sort((a, b) => (b.data.promoters || 0) - (a.data.promoters || 0)).slice(0, 3), [supAgentsList]);
  const topResolvers  = useMemo(() => [...supAgentsList].filter(a => a.data.resolve3d != null).sort((a, b) => b.data.resolve3d - a.data.resolve3d).slice(0, 3), [supAgentsList]);
  const topSellers    = useMemo(() => [...supAgentsList].sort((a, b) => (b.data.phoneAdds || 0) - (a.data.phoneAdds || 0)).filter(a => (a.data.phoneAdds || 0) >= 1).slice(0, 3), [supAgentsList]);

  const sortedAgentsList = useMemo(() => {
    const sorted = [...supAgentsList];
    sorted.sort((a, b) => {
      let valA, valB;
      if (uiState.agentSortConfig.key === 'name') {
        valA = a.agent.name.toLowerCase(); valB = b.agent.name.toLowerCase();
        if (valA < valB) return uiState.agentSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return uiState.agentSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      } else {
        valA = a.data[uiState.agentSortConfig.key]; valB = b.data[uiState.agentSortConfig.key];
        valA = valA === null || valA === undefined || isNaN(valA) ? -Infinity : Number(valA);
        valB = valB === null || valB === undefined || isNaN(valB) ? -Infinity : Number(valB);
        if (valA < valB) return uiState.agentSortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return uiState.agentSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }
    });
    return sorted;
  }, [supAgentsList, uiState.agentSortConfig]);


  return (
    <div className="flex flex-col gap-6 mt-2 w-full min-w-0">
      {uiState.supTab === 'roster' && (
        <div className="flex flex-col gap-6 animate-slide-down w-full min-w-0">
          <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-sm font-extrabold text-slate-900 uppercase mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
               <span className="text-xl">📊</span> Team KPIs
            </div>
            <div className="grid grid-cols-6 gap-4">
              {(() => {
                  const liveSupObj = metrics.supervisorStats.find(s => s.name === uiState.selectedSupervisorObj.name) || uiState.selectedSupervisorObj;
                  const aData = liveSupObj.activeData;


                  return (
                      <>
                        {COL_DEFINITIONS.filter(col => uiState.visibleCols[col.stateKey]).map(col => {
                          let decimals = 2;
                          if (['aht', 'hold', 'phoneAdds', 'vhi'].includes(col.stateKey)) decimals = 0;
                          else if (['resolve2hr', 'vxs', 'resolve3d', 'handoffs', 'vtt'].includes(col.stateKey)) decimals = 1;
                          return (
                            <SubMetricCard 
                              key={col.label} label={col.label} val={aData[col.stateKey]} 
                              metricKey={col.stateKey} agentCount={liveSupObj.agentCount} 
                              decimals={decimals} prefix={col.stateKey === 'netOcc' ? '$' : ''} suffix={METRIC_CONFIG[col.stateKey].format} 
                            />
                          );
                        })}
                        {COL_DEFINITIONS.filter(col => uiState.visibleCols[col.stateKey]).length === 0 && (
                          <div className="col-span-full p-2 text-center text-slate-500 text-sm">No KPIs selected. Please toggle metrics in Settings.</div>
                        )}
                      </>
                  );
              })()}
            </div>
          </div>


          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm w-full min-w-0">
            <table className="roster-table" style={{ minWidth: 0, width: '100%', margin: 0 }}>
              <thead className="bg-slate-900">
                <tr>
                  <th className="bg-slate-900 text-white border-b-2 border-slate-800 cursor-pointer select-none" onClick={() => uiHandlers.handleAgentSortChange('name')}>
                    Agent Name {uiState.agentSortConfig.key === 'name' && <span className="sort-icon">{uiState.agentSortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                    <th key={col.key} className="bg-slate-900 text-white border-b-2 border-slate-800 text-center cursor-pointer select-none" onClick={() => uiHandlers.handleAgentSortChange(col.stateKey)}>
                      {col.label} {uiState.agentSortConfig.key === col.stateKey && <span className="sort-icon">{uiState.agentSortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                 {sortedAgentsList.map(item => (
                  <tr key={item.agent.ccms} className={`roster-row transition-all duration-300 hover:-translate-y-1 hover:shadow-md relative z-10 ${uiState.highlightedAgentId === item.agent.ccms ? 'bg-blue-100 outline outline-2 outline-blue-500 rounded-md z-20' : ''}`}>
                     <td className="font-semibold p-3 px-6">{item.agent.name}</td>
                     {COL_DEFINITIONS.map(col => uiState.visibleCols[col.stateKey] && (
                        <td key={col.key} className="p-3 px-6 text-center">
                          <MetricCell value={item.data[col.stateKey]} target={getDynamicTarget(col.stateKey, 1)} reverse={col.reverse} isInteger={col.isInteger} />
                        </td>
                     ))}
                  </tr>
                 ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {uiState.supTab === 'outliers' && (
        <div className="flex flex-col gap-6 animate-slide-down">
          <div className="grid grid-cols-2 gap-6">
            <div className="p-6 bg-white rounded-xl border border-red-200 shadow-sm">
              <div className="text-lg font-extrabold text-red-800 uppercase mb-4 flex items-center gap-2 border-b border-red-100 pb-3">
                 <span className="text-2xl">⚠️</span> Negative Outliers
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-red-900 uppercase mb-3">CSAT Detractors</div>
                  {topDetractors.length > 0 ? topDetractors.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-red-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-red-600 font-bold">{Math.round(x.data.detractors)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-red-900 uppercase mb-3">3DR Repeats</div>
                  {topRepeats.length > 0 ? topRepeats.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-red-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-red-600 font-bold">{Math.round(x.data.repeats3d)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
              </div>
            </div>


            <div className="p-6 bg-white rounded-xl border border-emerald-200 shadow-sm">
              <div className="text-lg font-extrabold text-emerald-800 uppercase mb-4 flex items-center gap-2 border-b border-emerald-100 pb-3">
                 <span className="text-2xl">🌟</span> Top Performers
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-emerald-900 uppercase mb-3">Clean CSAT (100%)</div>
                  {topPromoters.length > 0 ? topPromoters.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-emerald-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-emerald-600 font-bold">{Math.round(x.data.promoters)}</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
                <div className="bg-emerald-50 p-4 rounded-lg">
                  <div className="text-sm font-extrabold text-emerald-900 uppercase mb-3">Top 3DR</div>
                  {topResolvers.length > 0 ? topResolvers.map(x => (
                    <div key={x.agent.ccms} className="flex justify-between text-base mb-2 border-b border-emerald-100 pb-1">
                      <span className="text-slate-700 font-semibold">{x.agent.name}</span><span className="text-emerald-600 font-bold">{Number(x.data.resolve3d).toFixed(1)}%</span>
                    </div>
                  )) : <div className="text-sm text-slate-500">None</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {uiState.supTab === 'strategy' && (
        <div className="flex flex-col gap-6 animate-slide-down bg-slate-50 p-6 rounded-xl border border-slate-200">
          
          <div className="flex flex-col gap-3">
             <div className="text-xs font-extrabold text-slate-400 uppercase px-2">AI Toolbelt</div>
             
             <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-200">
               <button 
                 onClick={() => uiHandlers.setActiveSupAiTool('report')} 
                 className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-2 text-sm ${uiState.activeSupAiTool === 'report' ? 'bg-white shadow-sm border border-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-200 border border-transparent'}`}
               >
                 <span className="text-base">🤖</span> Sup Report
               </button>


               <button 
                 onClick={() => uiHandlers.setActiveSupAiTool('burnout')} 
                 className={`px-3 py-2 rounded-lg font-bold transition-all flex items-center gap-2 text-sm ${uiState.activeSupAiTool === 'burnout' ? 'bg-white shadow-sm border border-slate-200 text-red-600' : 'text-slate-600 hover:bg-slate-200 border border-transparent'}`}
               >
                 <span className="text-base">🧠</span> Behavioral Scan
               </button>
             </div>
          </div>


          <div className="w-full flex flex-col gap-6">
            {uiState.activeSupAiTool === null && (
              <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-2">
                <span className="text-5xl mb-4">✨</span>
                <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Supervisor Action Hub</h3>
                <p className="text-slate-500 max-w-md">Select a tool from the toolbelt above to generate personalized coaching scripts, reports, or turnaround plans.</p>
              </div>
            )}


            {uiState.activeSupAiTool === 'burnout' && (() => {
              const supBurnoutList = metrics.orgBurnoutList.filter(item => item.agent.supervisor === uiState.selectedSupervisorObj.name);
              return (
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
                  <div className="mb-6 border-b border-slate-100 pb-4">
                    <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-red-700"><span>🧠</span> Behavioral Scan Watchlist</h3>
                    <p className="text-sm text-slate-500 m-0">Agents flagged for extreme operational strain. Rank priority: AHT &gt; Net OCC &gt; DPC &gt; Hold.</p>
                  </div>


                  {supBurnoutList.length === 0 ? (
                    <div className="text-center p-5 text-slate-500 italic">No agents currently flagged for high behavioral risk on this team.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {supBurnoutList.map((item, idx) => {
                        const isExpanded = uiState.expandedBurnoutAgentId === item.agent.ccms;
                        return (
                          <div key={item.agent.ccms} className="flex flex-col bg-red-50 border border-red-200 rounded-lg overflow-hidden shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
                            <div
                              onClick={() => uiHandlers.setExpandedBurnoutAgentId(isExpanded ? null : item.agent.ccms)}
                              className="flex justify-between p-4 px-5 items-center cursor-pointer transition-all"
                              style={{ backgroundColor: isExpanded ? '#fee2e2' : 'transparent' }}
                              onMouseOver={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = '#fee2e2'; }}
                              onMouseOut={(e) => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <div className="flex items-center gap-4">
                                  <div className="text-2xl font-black text-red-600 w-8 text-center">#{idx + 1}</div>
                                  <div>
                                      <strong className="block text-base text-red-800">{item.agent.name}</strong>
                                      <span className="text-xs font-semibold text-red-700 opacity-80 uppercase tracking-wide">Sup: {item.agent.supervisor}</span>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <strong className="block text-red-600 text-xl font-extrabold">{item.highMetricsCount}/4 Missed</strong>
                              </div>
                            </div>


                            {isExpanded && (
                              <div className="p-5 bg-white border-t border-dashed border-red-200">
                                <div className="grid grid-cols-auto-110 gap-3">
                                   {COL_DEFINITIONS.map(col => {
                                      const val = item.data[col.stateKey];
                                      const isMissing = val === null || val === undefined || isNaN(val) || val === '';
                                      let displayVal = '-';
                                      if (!isMissing) {
                                          if (['phoneAdds', 'vhi', 'aht', 'hold'].includes(col.stateKey)) displayVal = Math.round(val);
                                          else displayVal = Number(val).toFixed(2);
                                      }
                                      let valColor = '#0b0f19';
                                      const tgt = getDynamicTarget(col.stateKey, 1);
                                      if (!isMissing && tgt !== null && tgt !== undefined) {
                                          const isGood = col.reverse ? val <= tgt : val >= tgt;
                                          valColor = isGood ? '#10B981' : '#D52B1E';
                                      }
                                      return (
                                        <div key={col.key} className="bg-slate-50 border border-slate-200 p-3 rounded-md text-center shadow-sm">
                                          <div className="text-xs text-slate-500 uppercase font-extrabold mb-1">{col.label}</div>
                                          <div className="text-xl font-black" style={{ color: valColor }}>{displayVal}{!isMissing ? col.format : ''}</div>
                                        </div>
                                      )
                                   })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}


            {uiState.activeSupAiTool === 'report' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-slate-900"><span>🤖</span> AI Supervisor Report</h3>
                  <p className="text-sm text-slate-500 m-0">Data-driven insights connecting the dots for this team.</p>
                </div>
                <div className="report-body mt-0 p-6 text-[1.05rem]">
                  {aiTools.loading ? (
                    <div className="flex justify-center p-6"><GeminiLoader message="Brewing up Trajectory Report..." /></div>
                  ) : <FormattedText text={aiTools.report} linkedEntities={uiState.linkedEntities} onEntityClick={uiHandlers.handleAiLinkClick} />}
                </div>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
};


// ==== Main modal shell ==== 
// Source: src/App.tsx -> MainModal
const MainModal = React.memo(() => {
  const { dashData, metrics, aiTools, uiState, uiHandlers } = useDashboard();
  if (!uiState.activeModal) return null;


  return (
    <div className="modal-backdrop open" onClick={uiHandlers.closeModal}>
      <div className="main-modal" onClick={(e) => e.stopPropagation()}>
        <div className="main-modal-header">
          <h2 className="m-0 text-xl font-bold text-slate-900">
            {uiState.activeModal === 'askAi' ? 'Data Assistant' : 
             uiState.activeModal === 'supervisor' && uiState.selectedSupervisorObj ? `Supervisor Overview: ${uiState.selectedSupervisorObj.name}` : 'Details'}
          </h2>
          <button className="close-btn" onClick={uiHandlers.closeModal}>✕ Close</button>
        </div>
        
        {uiState.activeModal === 'supervisor' && (
          <div className="bg-slate-50 px-8 py-4 border-b border-slate-200 flex gap-2">
            {[
              { id: 'roster', label: '📋 Team Roster' },
              { id: 'outliers', label: '⚠️ Outliers' },
              { id: 'strategy', label: '⚡ AI Strategy Hub' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => uiHandlers.setSupTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${uiState.supTab === tab.id ? 'bg-white shadow-sm border border-slate-200 text-slate-900' : 'text-slate-500 hover:bg-slate-200 border border-transparent'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}


        <div className="main-modal-content">
          {uiState.activeModal === 'askAi' && <AskAiContent aiTools={aiTools} uiState={uiState} uiHandlers={uiHandlers} />}
          {uiState.activeModal === 'supervisor' && <SupervisorModalContent />}
        </div>
      </div>
    </div>
  );
});


const DASHBOARD_STYLES = `
.analyst-dashboard{min-height:100vh;width:100%;min-width:0;box-sizing:border-box;background-color:#f5f2eb;color:#0b0f19;font-family:'Inter',Helvetica,sans-serif;position:relative;overflow-x:hidden}@keyframes slideDown{from{transform:translate(-50%,-20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}.top-navbar{background-color:#0b0f19;border-bottom:1px solid #111827;padding:16px 24px;z-index:40}.top-navbar-inner{width:100%;max-width:1100px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;box-sizing:border-box}.header-info{display:flex;align-items:center;gap:16px}.badge{background:linear-gradient(135deg,rgba(59,130,246,.15) 0,rgba(30,58,138,.2) 100%);color:#93c5fd;border:1px solid rgba(96,165,250,.15);padding:6px 16px;border-radius:20px;font-size:.75rem;font-weight:700;letter-spacing:.5px;display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px rgba(0,0,0,.2)}.action-buttons{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.column-menu-container{position:relative}.column-menu-btn{padding:8px 12px;background:#0b0f19;border:1px solid #111827;border-radius:6px;font-size:1.2rem;color:#94a3b8;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}.column-menu-btn:hover{color:#fff;background:#111827;border-color:#1e293b}.glass-panel{background:rgba(15,23,42,0.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(148,163,184,0.2);box-shadow:0 10px 40px -10px rgba(2,6,23,0.8)}.column-menu-dropdown{position:absolute;top:100%;right:0;margin-top:12px;background:rgba(15,23,42,0.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(148,163,184,0.22);border-radius:16px;box-shadow:0 10px 40px -10px rgba(2,6,23,0.8);width:300px;padding:20px;z-index:100;display:flex;flex-direction:column;gap:12px;color:#e2e8f0}.column-menu-dropdown label{display:flex;align-items:center;gap:10px;font-size:.85rem;cursor:pointer;color:#e2e8f0}.column-menu-dropdown select,.column-menu-dropdown input{color:#f8fafc;background:#0f172a;border-color:#334155}.column-menu-dropdown option{background:#0f172a;color:#f8fafc}.main-workspace{padding:32px 24px;max-width:1100px;margin:0 auto;width:100%;display:flex;flex-direction:column;gap:32px;box-sizing:border-box;min-width:0}.stats-row{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media (max-width:850px){.stats-row{grid-template-columns:1fr}}.roster-container{position:relative;z-index:10;background:#fff;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 4px 6px rgba(0,0,0,.05);margin-bottom:60px;border:1px solid #e2e8f0;overflow:hidden}.roster-header{position:relative;z-index:50;padding:0 0 16px 0;background-color:transparent;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}.search-input{padding:8px 16px;border:1px solid #cbd5e1;background-color:#fff;color:#0b0f19;border-radius:6px;font-size:.9rem;width:250px;outline:0;transition:border-color .2s}.search-input:focus{border-color:#3b82f6}.search-input::placeholder{color:#94a3b8}.table-scroll-area{overflow-x:auto}.roster-table{width:100%;border-collapse:collapse;text-align:left;min-width:800px}.roster-table th{position:sticky;top:0;background-color:#0b0f19;padding:12px 24px;font-size:.75rem;text-transform:uppercase;color:#fff;font-weight:700;border-bottom:2px solid #111827;z-index:10;cursor:pointer;user-select:none;transition:background-color .2s}.roster-table th:hover{background-color:#111827;color:#fff}.sort-icon{display:inline-block;margin-left:6px;color:#3b82f6;font-size:.8rem}.roster-table td{padding:16px 24px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:.95rem;vertical-align:middle}.roster-row{cursor:pointer;transition:background-color .2s}.roster-row:nth-child(even){background-color:#f8fafc}.roster-row:nth-child(odd){background-color:#fff}.roster-table tbody tr.roster-row:hover{background-color:#f1f5f9}.roster-table tbody tr.roster-row.active{background-color:#eff6ff}.metric-card{background:#0b0f19;border:1px solid #111827;border-radius:12px;padding:24px;position:relative;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,.1)}.metric-card.clickable-card{cursor:pointer;transition:transform .2s}.metric-card.clickable-card:hover{transform:translateY(-2px);border-color:#334155}.metric-card::after{content:"";position:absolute;top:0;left:0;bottom:0;width:4px}.card-daily::after{background:#3b82f6}.card-mtd::after{background:#1e40af}.gemini-btn{background:linear-gradient(135deg,#3b82f6 0,#1d4ed8 100%);color:#fff;border:none;padding:10px 18px;border-radius:6px;font-weight:700;font-size:.85rem;cursor:pointer;transition:transform .2s,box-shadow .2s;box-shadow:0 4px 12px rgba(59,130,246,.2);display:flex;align-items:center;justify-content:center;gap:8px;text-transform:uppercase;letter-spacing:.5px}.gemini-btn:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(59,130,246,.3)}.gemini-btn:disabled{opacity:.7;cursor:not-allowed;transform:none}.btn-alt{background:transparent;border:1px solid #3b82f6;color:#3b82f6;box-shadow:none}.btn-alt:hover{background:rgba(59,130,246,.05);box-shadow:none}.btn-dark{background:#0b0f19;border:1px solid #111827;color:#fff;box-shadow:none}.btn-dark:hover{background:#111827;border-color:#1e293b}.btn-red-dark{background:#450a0a;color:#fca5a5;border:1px solid #991b1b}.btn-red-dark:hover{background:#7f1d1d}.modal-backdrop{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(11,15,25,.75);backdrop-filter:blur(4px);z-index:90;display:flex;justify-content:flex-start;align-items:stretch;opacity:0;pointer-events:none;transition:opacity .3s ease}.modal-backdrop.open{opacity:1;pointer-events:all}.main-modal{width:95%;max-width:1100px;background:#fff;border-radius:0 24px 24px 0;overflow-y:auto;box-shadow:15px 0 50px -12px rgba(0,0,0,.3);display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .3s cubic-bezier(.16,1,.3,1)}.modal-backdrop.open .main-modal{transform:translateX(0)}.main-modal-header{position:sticky;top:0;background:#fff;z-index:20;padding:24px 32px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center}.main-modal-content{padding:32px;flex:1;display:flex;flex-direction:column}.close-btn{background:#f1f5f9;border:none;padding:8px 16px;border-radius:6px;color:#475569;font-weight:700;cursor:pointer;transition:all .2s}.close-btn:hover{background:#e2e8f0;color:#0b0f19}::-webkit-scrollbar{width:8px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#94a3b8}.report-body{font-size:16px;line-height:1.9;color:#334155;white-space:pre-wrap;margin-top:16px}.submetrics-panel{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:12px;margin-bottom:24px;padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}.sub-val-main{font-size:1.1rem;font-weight:700;color:#0b0f19}.ai-output-box{margin-bottom:24px;background:#f8fafc;border:1px solid #3b82f6;border-radius:8px;padding:20px;position:relative}.chat-container{background:#0b0f19;border:1px solid #111827;border-radius:12px;padding:24px;margin-top:16px;box-shadow:inset 0 2px 4px rgba(0,0,0,.05)}.chat-messages{display:flex;flex-direction:column;gap:16px;max-height:350px;overflow-y:auto;margin-bottom:20px;padding-right:8px}.message-bubble{max-width:80%;padding:12px 16px;border-radius:12px;font-size:.95rem;line-height:1.5}.bubble-bot{align-self:flex-start;background-color:#27272a;color:#f4f4f5;border-left:4px solid #3b82f6}.bubble-user{align-self:flex-end;background-color:#3b82f6;color:#fff}.chat-input-area{display:flex;gap:12px}.chat-input{flex:1;background-color:#111827;border:1px solid #1e293b;color:#fff;padding:12px 16px;border-radius:8px;font-size:.95rem;outline:0}.chat-input:focus{border-color:#3b82f6}.loader-spin{animation:spin 1s linear infinite}@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}.heatmap-table{width:100%;border-collapse:collapse;margin-top:16px;font-size:.85rem}.heatmap-table th,.heatmap-table td{padding:12px;border:1px solid #e2e8f0;text-align:center}.heatmap-table th{background:#f8fafc;color:#475569;font-weight:700}.range-slider{-webkit-appearance:none;width:100%;height:6px;border-radius:4px;background:#e2e8f0;outline:0}.range-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:#3b82f6;cursor:pointer}


/* UTILITIES */
.flex { display: flex; } .flex-col { flex-direction: column; } .flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; } .items-start { align-items: flex-start; } .items-baseline { align-items: baseline; }
.justify-center { justify-content: center; } .justify-between { justify-content: space-between; } .justify-around { justify-content: space-around; } .justify-end { justify-content: flex-end; } .flex-1 { flex: 1; }
.gap-1 { gap: 4px; } .gap-2 { gap: 8px; } .gap-3 { gap: 12px; } .gap-4 { gap: 16px; } .gap-5 { gap: 20px; } .gap-6 { gap: 24px; } .gap-8 { gap: 32px; }
.p-0 { padding: 0px; } .p-1 { padding: 4px; } .p-2 { padding: 8px; } .p-3 { padding: 12px; } .p-4 { padding: 16px; } .p-5 { padding: 20px; } .p-6 { padding: 24px; } .p-8 { padding: 32px; } .p-10 { padding: 40px; }
.px-2 { padding-left: 8px; padding-right: 8px; } .px-4 { padding-left: 16px; padding-right: 16px; } .px-6 { padding-left: 24px; padding-right: 24px; } .px-8 { padding-left: 32px; padding-right: 32px; }
.py-1 { padding-top: 4px; padding-bottom: 4px; } .py-2 { padding-top: 8px; padding-bottom: 8px; } .py-3 { padding-top: 12px; padding-bottom: 12px; } .py-4 { padding-top: 16px; padding-bottom: 16px; } .py-5 { padding-top: 20px; padding-bottom: 20px; } .py-6 { padding-top: 24px; padding-bottom: 24px; } .py-10 { padding-top: 40px; padding-bottom: 40px; }
.pb-2 { padding-bottom: 8px; } .pb-4 { padding-bottom: 16px; } .pb-6 { padding-bottom: 24px; }
.pt-3 { padding-top: 12px; } .pt-4 { padding-top: 16px; } .pt-5 { padding-top: 20px; } .pr-4 { padding-right: 16px; }
.m-0 { margin: 0px; } .mt-0 { margin-top: 0px; } .mt-1 { margin-top: 4px; } .mt-2 { margin-top: 8px; } .mt-3 { margin-top: 12px; } .mt-4 { margin-top: 16px; } .mt-6 { margin-top: 24px; } .mt-8 { margin-top: 32px; }
.mb-1 { margin-bottom: 4px; } .mb-2 { margin-bottom: 8px; } .mb-3 { margin-bottom: 12px; } .mb-4 { margin-bottom: 16px; } .mb-6 { margin-bottom: 24px; } .mb-16 { margin-bottom: 64px; } .ml-2 { margin-left: 8px; } .ml-3 { margin-left: 12px; }
.mx-1 { margin-left: 4px; margin-right: 4px; } .mx-auto { margin-left: auto; margin-right: auto; }
.w-full { width: 100%; } .w-auto { width: auto; } .w-9 { width: 36px; } .h-9 { height: 36px; } .w-10 { width: 40px; } .h-10 { height: 40px; } .w-16 { width: 75px; } .h-16 { height: 75px; } .h-full { height: 100%; } .h-auto { height: auto; } .min-w-600 { min-width: 600px; } .min-w-700 { min-width: 700px; } .max-w-280 { max-width: 280px; } .max-w-80 { max-width: 80px; }
.text-center { text-align: center; } .text-right { text-align: right; } .text-left { text-align: left; }
.font-normal { font-weight: 400; } .font-medium { font-weight: 500; } .font-semibold { font-weight: 600; } .font-bold { font-weight: 700; } .font-extrabold { font-weight: 800; } .font-black { font-weight: 900; } .italic { font-style: italic; } .uppercase { text-transform: uppercase; }
.whitespace-nowrap { white-space: nowrap; } .whitespace-pre-wrap { white-space: pre-wrap; }
.leading-none { line-height: 1; } .leading-relaxed { line-height: 1.6; } .tracking-wide { letter-spacing: 0.5px; }
.text-xs { font-size: 0.7rem; } .text-sm { font-size: 0.85rem; } .text-base { font-size: 1rem; } .text-lg { font-size: 1.05rem; } .text-xl { font-size: 1.2rem; } .text-2xl { font-size: 1.5rem; } .text-4xl { font-size: 2.5rem; }
.text-white { color: #ffffff; } .text-slate-300 { color: #cbd5e1; } .text-slate-400 { color: #94a3b8; } .text-slate-500 { color: #64748b; } .text-slate-700 { color: #334155; } .text-slate-900 { color: #0b0f19; } .text-red-400 { color: #f87171; } .text-red-500 { color: #ef4444; } .text-red-600 { color: #dc2626; } .text-red-800 { color: #991b1b; } .text-emerald-400 { color: #34d399; } .text-emerald-500 { color: #10B981; } .text-emerald-600 { color: #059669; } .text-emerald-800 { color: #065f46; } .text-blue-800 { color: #1e40af; }
.bg-white { background-color: #ffffff; } .bg-transparent { background-color: transparent; } .bg-slate-50 { background-color: #f8fafc; } .bg-slate-100 { background-color: #f1f5f9; } .bg-slate-800 { background-color: #111827; } .bg-slate-900 { background-color: #0b0f19; } .bg-red-50 { background-color: #fef2f2; } .bg-red-100 { background-color: #fee2e2; } .bg-emerald-50 { background-color: #ecfdf5; } .bg-emerald-100 { background-color: #d1fae5; } .bg-blue-50 { background-color: #eff6ff; }
.border { border-width: 1px; border-style: solid; } .border-none { border: none; } .border-t { border-top-width: 1px; border-top-style: solid; } .border-b { border-bottom-width: 1px; border-bottom-style: solid; } .border-b-2 { border-bottom-width: 2px; border-bottom-style: solid; } .border-dashed { border-style: dashed; } .border-transparent { border-color: transparent; }
.border-slate-100 { border-color: #f1f5f9; } .border-slate-200 { border-color: #e2e8f0; } .border-slate-300 { border-color: #cbd5e1; } .border-slate-700 { border-color: #334155; } .border-slate-800 { border-color: #111827; } .border-red-200 { border-color: #fecaca; } .border-emerald-200 { border-color: #a7f3d0; } .border-blue-200 { border-color: #bfdbfe; }
.rounded { border-radius: 4px; } .rounded-md { border-radius: 6px; } .rounded-lg { border-radius: 8px; } .rounded-xl { border-radius: 12px; } .rounded-full { border-radius: 50%; }
.shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.02); } .shadow { box-shadow: 0 2px 4px rgba(0,0,0,0.05); } .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
.overflow-hidden { overflow: hidden; } .overflow-visible { overflow: visible; } .overflow-x-auto { overflow-x: auto; } .overflow-y-auto { overflow-y: auto; }
.relative { position: relative; } .absolute { position: absolute; } .fixed { position: fixed; } .inset-0 { top: 0; left: 0; right: 0; bottom: 0; }
.block { display: block; } .inline-block { display: inline-block; }
.cursor-pointer { cursor: pointer; } .cursor-help { cursor: help; } .transition-all { transition: all 0.2s; } .outline-none { outline: none; }
.opacity-50 { opacity: 0.5; } .opacity-60 { opacity: 0.6; } .opacity-80 { opacity: 0.8; }
.z-50 { z-index: 50; } .z-1000 { z-index: 1000; }
.top-24 { top: 90px; } .left-1-2 { left: 50%; } .-translate-x-1-2 { transform: translateX(-50%); }
.-rotate-90 { transform: rotate(-90deg); } .rotate-180 { transform: rotate(180deg); } .text-ellipsis { text-overflow: ellipsis; }
.grid { display: grid; } .grid-cols-auto-100 { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); } .grid-cols-auto-110 { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); } .grid-cols-auto-200 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); } .grid-cols-auto-300 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); } .grid-cols-2 { grid-template-columns: 1fr 1fr; } .grid-cols-1-280 { grid-template-columns: 1fr 280px; } .grid-cols-5 { grid-template-columns: repeat(5, 1fr); } .grid-cols-6 { grid-template-columns: repeat(6, 1fr); }
.stroke-slate-800 { stroke: #111827; } .stroke-3 { stroke-width: 3; } .fill-none { fill: none; } .rounded-stroke { stroke-linecap: round; } .transition-stroke { transition: stroke-dasharray 1s ease-out; }
.animate-slide-down { animation: slideDown 0.3s ease-out; }
`;


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

export default function App() {
  const aiResetRef = useRef(null);
  const dashData = useDashboardData(() => { if (aiResetRef.current) aiResetRef.current(); });
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
  const [visibleCols, setVisibleCols] = useState({
    vxs: true, resolve2hr: true, phoneAdds: true, handoffs: true, resolve3d: false, aht: false,
    hold: false, dpc: false, vtt: false, netOcc: false, creditFreq: false, vhi: false, ncw: false, trajectory: true 
  });


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


  const ctxValue = useMemo(
    () => ({ dashData, metrics, aiTools, uiState, uiHandlers }),
    [dashData, metrics, aiTools, uiState, uiHandlers]
  );

  return (
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
  );
}
