// Frontend redesign: FloorHeader is now the Right Workspace header —
  // department title + live headcount summary, plus the date-step controls and
  // search that used to sit beside the (removed) floating pill tab bar.
import React from 'react';
import { useDashboard } from '../../hooks';

// ─── Workspace Header ──────────────────────────────────────────
export const FloorHeader = React.memo(() => {
  const { dashData, metrics, uiState, uiHandlers } = useDashboard();

  // S13: singleSearchedOam is computed once in useDashboardMetrics and shared here.
  const headerName = metrics.singleSearchedOam || dashData.oamName;
  // Live headcount: agents with activity in the selected timeframe vs. total loaded.
  const onlineCount = metrics.activeLeaderData?.activeAgentCount ?? dashData.agents.length;
  const totalCount = dashData.agents.length;

  return (
    <div className="roster-header workspace-header">
      <div className="workspace-header-top">
        <div>
          <h1 className="workspace-title">{headerName} <span className="workspace-title-sep">|</span> Floor</h1>
          <div className="workspace-headcount">
            <span className="headcount-dot" aria-hidden="true" />
            <span className="headcount-value">{onlineCount.toLocaleString()} / {totalCount.toLocaleString()}</span>
            <span className="headcount-label">Agents Online</span>
            {uiState.searchQuery && <span className="filtered-chip">Filtered</span>}
          </div>
        </div>

        <div className="workspace-controls">
          <div className="workspace-date-steps">
            <button onClick={() => dashData.handleDateChange(-1)} className="date-step-btn" title="Previous Day">‹</button>
            <button onClick={() => dashData.handleDateChange(1)} className="date-step-btn" title="Next Day">›</button>
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
    </div>
  );
});
