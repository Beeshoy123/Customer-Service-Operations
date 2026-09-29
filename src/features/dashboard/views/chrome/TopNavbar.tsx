// Extracted from App.tsx (Phase 5 move-only refactor) — behavior must stay identical.
import React, { useRef, useEffect } from 'react';
import { useDashboard } from '../../hooks';
import { TimeframeMenu, SettingsMenu } from '../../../../components/menus';

// ─── Top Navigation Bar ──────────────────────────────────────
export const TopNavbar = React.memo(() => {
  const { dashData, uiState, uiHandlers, resetToLanding } = useDashboard();
  const menuRef = useRef<any>(null);
  const timeframeRef = useRef<any>(null);
  const batchSummary = dashData.batchImportSummary;


  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) uiHandlers.setShowColMenu(false);
      if (timeframeRef.current && !timeframeRef.current.contains(event.target)) uiHandlers.setShowTimeframeMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [uiHandlers]);


  let headerName = dashData.oamName;
  const queries = uiState.searchQuery.toLowerCase().split(',').map((q: any) => q.trim()).filter((q: any) => q);
  if (queries.length > 0) {
      const searchedOams = [...new Set(dashData.agents.map((a: any) => a.oam).filter((o: any) => o && queries.some((q: any) => o.toLowerCase().includes(q))))];
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
              onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
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
              onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
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
                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                onMouseOut={(e) => e.currentTarget.style.opacity = uiState.showTimeframeMenu ? '1' : '0.7'}
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
                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                onMouseOut={(e) => e.currentTarget.style.opacity = uiState.showColMenu ? '1' : '0.7'}
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


