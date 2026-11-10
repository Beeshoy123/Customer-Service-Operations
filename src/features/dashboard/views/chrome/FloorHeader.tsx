// Frontend redesign: FloorHeader is now the Right Workspace header —
  // department title + live headcount summary, plus the date-step controls and
  // search that used to sit beside the (removed) floating pill tab bar.
import React from 'react';
import { useDashboard } from '../../hooks';
import { getGreeting, formatToday, attentionLabel } from '../../headerInfo';

// ─── Workspace Header ──────────────────────────────────────────
export const FloorHeader = React.memo(() => {
  const { dashData, metrics, uiState, uiHandlers } = useDashboard();

  // S13: singleSearchedOam is computed once in useDashboardMetrics and shared here.
  const headerName = metrics.singleSearchedOam || dashData.oamName;
  // Live headcount: agents with activity in the selected timeframe vs. total loaded.
  const onlineCount = metrics.activeLeaderData?.activeAgentCount ?? dashData.agents.length;
  const totalCount = dashData.agents.length;

  // Greeting and date come from the browser clock. The "need attention" count
  // is the Repeated Offenders count, read from the one shared result (the same
  // numbers as the tab); null means show nothing.
  const now = new Date();
  const repeatTotal = metrics.repeatOffenders?.summary?.totalOffenders ?? 0;
  const needAttention = dashData.hasUploadedData && repeatTotal > 0 ? repeatTotal : null;

  return (
    <div className="roster-header workspace-header">
      <div className="workspace-header-top">
        <div>
          <p className="workspace-greeting">{getGreeting(now)} <span aria-hidden="true">·</span> {formatToday(now)}</p>
          <h1 className="workspace-title">{headerName} <em className="workspace-title-accent">Floor</em></h1>
          <div className="workspace-headcount">
            <span className="headcount-chip">
              <span className="headcount-dot" aria-hidden="true" />
              <span className="headcount-value">{onlineCount.toLocaleString()} / {totalCount.toLocaleString()}</span>
              <span className="headcount-label">Agents Online</span>
            </span>
            {needAttention !== null && (
              <span className="attention-chip" title="Agents who missed a KPI target in 2 or more of the latest 3 months (same rule as the Repeated Offenders tab)">
                {attentionLabel(needAttention)}
              </span>
            )}
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
