// The floating header (forest, like the sidebar): department title + live headcount summary,
// search, the date steps with the period shown between the arrows, and the tool buttons
// (Add workbook / Timeframe / Metrics / Exit). The old top bar was merged into it.
import React from 'react';
import { useDashboard } from '../../hooks';
import { getGreeting, formatToday, attentionLabel } from '../../headerInfo';
import { HeaderTools } from './HeaderTools';
import { Icon } from './TabFrame';

// What the date arrows are currently stepping through, in words.
const formatDay = (isoDay: string): string => {
  const parsed = new Date(`${isoDay}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? isoDay
    : parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

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

  const period =
    dashData.activeTimeframe === 'monthly' ? (dashData.selectedMonth === 'all' ? 'All months' : dashData.monthLabel(dashData.selectedMonth))
    : dashData.activeTimeframe === 'weekly' ? dashData.selectedWeek
    : dashData.activeTimeframe === 'dow' ? dashData.selectedDow
    : formatDay(dashData.selectedDate);

  return (
    <div className="roster-header workspace-header floor-header">
      <div className="workspace-header-top">
        <div className="floor-header-main">
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

        <div className="workspace-controls floor-header-tools">
          <label className="header-search">
            <Icon name="search" size={16} />
            <input
              type="text"
              className="search-input"
              placeholder="Search agents"
              title="Search several agents at once, separated by commas"
              aria-label="Search agents (separate several with commas)"
              value={uiState.inputValue}
              onChange={(e) => uiHandlers.setInputValue(e.target.value)}
            />
          </label>
          <div className="workspace-date-steps">
            <button type="button" onClick={() => dashData.handleDateChange(-1)} className="date-step-btn" title="Previous Day" aria-label="Previous day">‹</button>
            <span className="date-step-label" aria-live="polite">{period}</span>
            <button type="button" onClick={() => dashData.handleDateChange(1)} className="date-step-btn" title="Next Day" aria-label="Next day">›</button>
          </div>
          <span className="header-sep" aria-hidden="true" />
          <HeaderTools />
        </div>
      </div>
    </div>
  );
});
