// Extracted from App.tsx (Phase 5 move-only refactor) — behavior must stay identical.
import React from 'react';
import { useDashboard } from '../../hooks';

// ─── Floor Header & Selector Bar ──────────────────────────────────────
export const FloorHeader = React.memo(() => {
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


