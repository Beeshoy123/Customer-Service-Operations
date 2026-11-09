// Frontend redesign: FloorHeader is now the Right Workspace header —
  // department title + live headcount summary, plus the date-step controls and
  // search that used to sit beside the (removed) floating pill tab bar.
import React, { useMemo } from 'react';
import { useDashboard } from '../../hooks';
import { METRIC_CONFIG, getDynamicTarget } from '../../config';
import type { ChronicTargets } from '../../chronicOffenders';
import { getGreeting, formatToday, countNeedAttention, attentionLabel } from '../../headerInfo';

// Same KPI targets the Chronic Offenders tab uses (every KPI that has a target).
const buildTargets = (): ChronicTargets => {
  const targets: ChronicTargets = {};
  for (const [key, cfg] of Object.entries(METRIC_CONFIG as Record<string, any>)) {
    if (!cfg || !Number.isFinite(cfg.target)) continue;
    const target = getDynamicTarget(key, 1);
    if (target === undefined) continue;
    targets[key] = { target, reverse: Boolean(cfg.reverse), label: cfg.label, format: cfg.format ?? '' };
  }
  return targets;
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
  // uses existing chronic-offender data only; null means show nothing.
  const now = new Date();
  const needAttention = useMemo(
    () => (dashData.hasUploadedData
      ? countNeedAttention(dashData.agents, dashData.historicalData, buildTargets())
      : null),
    [dashData.agents, dashData.historicalData, dashData.hasUploadedData]
  );

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
              <span className="attention-chip" title="Agents who missed a KPI target 3 or more months in a row (same rule as the Chronic Offenders tab)">
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
