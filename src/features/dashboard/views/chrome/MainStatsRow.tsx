// KPI summary: one slim card with a Month-End / Daily switch (replaces the two big cards).
// Same numbers and the same on-target rule as before; the gauges became coloured chips so
// the card stays one line high and the tab panel gets the room.
import React, { useMemo } from 'react';
import { useDashboard } from '../../hooks';
import { CountUp } from './CountUp';
import { getDynamicTarget, METRIC_CONFIG } from '../../config';
import { safeStorage, storageKeys } from '../../storage';

type KpiView = 'month' | 'daily';

// ─── Metric chip ──────────────────────────────────────────
// Mint chip = on target, peach = off target, white = no value or no target to compare
// with. Same on-target rule as the old gauge: lower is better when `reverse` is set.
// The "vs target" difference moved into the hover tooltip.
const KpiStripItem = ({ config, value, target }: { config: any; value: unknown; target: number | undefined }) => {
  const num = typeof value === 'number' ? value : Number(value);
  const hasValue = value !== null && value !== undefined && value !== '' && Number.isFinite(num);
  const decimals = config.isInteger ? 0 : 2;
  let tone = 'is-neutral';
  let tip = config.label;
  if (hasValue && typeof target === 'number' && Number.isFinite(target)) {
    const isGood = config.reverse ? num <= target : num >= target;
    tone = isGood ? 'is-good' : 'is-bad';
    const diff = Number((num - target).toFixed(decimals));
    tip = `${config.label}: ${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(decimals)} vs target ${target}`;
  }
  return (
    <span className={`kpi-strip-item ${tone}`} title={tip}>
      <span className="kpi-strip-label">{config.label}</span>
      <strong className="kpi-strip-value">{hasValue ? <CountUp value={num} decimals={decimals} /> : '-'}{config.format}</strong>
    </span>
  );
};

// ─── KPI Summary Row ──────────────────────────────────────
export const MainStatsRow = React.memo(() => {
  const { dashData, metrics, uiState } = useDashboard();
  const [view, setView] = React.useState<KpiView>(
    () => (safeStorage.getItem(storageKeys.kpiView) === 'daily' ? 'daily' : 'month'),
  );
  const chooseView = (next: KpiView) => {
    setView(next);
    safeStorage.setItem(storageKeys.kpiView, next);
  };

  const spotterPrefix = dashData.activeTimeframe === 'monthly' ? 'Monthly Spotter' : dashData.activeTimeframe === 'weekly' ? 'Weekly Spotter' : dashData.activeTimeframe === 'dow' ? 'Day Of Week' : 'Daily Spotter';
  const spotterDate = dashData.activeTimeframe === 'monthly' ? dashData.monthLabel(dashData.selectedMonth) : dashData.activeTimeframe === 'weekly' ? dashData.selectedWeek : dashData.activeTimeframe === 'dow' ? dashData.selectedDow : dashData.selectedDate;

  // Visible metrics: the four former gauges first, then the former tiles.
  const { itemKeys, anyMetricVisible } = useMemo(() => {
    const allKeys = Object.keys(uiState.visibleCols);
    const metricKeys = allKeys.filter(key => uiState.visibleCols[key] && (METRIC_CONFIG as Record<string, any>)[key]);
    const gaugeKeys = ['vxs', 'resolve2hr', 'handoffs', 'resolve3d'].filter(key => uiState.visibleCols[key]);
    const tileKeys = metricKeys.filter(key => !['bonus', 'vxs', 'resolve3d', 'resolve2hr', 'handoffs', 'trajectory'].includes(key));
    return { itemKeys: [...gaugeKeys, ...tileKeys], anyMetricVisible: metricKeys.length > 0 };
  }, [uiState.visibleCols]);

  const leader = view === 'month' ? metrics.mtdLeaderData : metrics.activeLeaderData;
  const agentCount = leader.activeAgentCount || dashData.agents.length;

  return (
    <div className="stats-row">
      <div className={`kpi-switch-card ${view === 'month' ? 'card-mtd' : 'card-daily'}`}>
        <div className="kpi-switch" role="group" aria-label="KPI period">
          <button type="button" className={`kpi-switch-btn${view === 'month' ? ' active' : ''}`} aria-pressed={view === 'month'} onClick={() => chooseView('month')}>Month-End</button>
          <button type="button" className={`kpi-switch-btn${view === 'daily' ? ' active' : ''}`} aria-pressed={view === 'daily'} onClick={() => chooseView('daily')}>Daily</button>
        </div>

        <h2 className="kpi-switch-title">
          {view === 'month'
            ? (dashData.activeTimeframe === 'monthly' ? (dashData.selectedMonth === 'all' ? 'All Months' : dashData.monthLabel(dashData.selectedMonth)) : 'Month To Date')
            : <>{spotterPrefix} <span className="kpi-switch-sub">({spotterDate})</span></>}
        </h2>

        <div className="kpi-strip">
          <span className="kpi-chip">Calls Handled: <strong>{leader.calls ? <CountUp value={leader.calls} grouped /> : '-'}</strong></span>
          <span className="kpi-chip">Res Contacts: <strong>{leader.resolveTotalContacts ? <CountUp value={leader.resolveTotalContacts} grouped /> : '-'}</strong></span>
          {itemKeys.map(key => (
            <KpiStripItem key={key} config={(METRIC_CONFIG as Record<string, any>)[key]} value={leader[key]} target={getDynamicTarget(key, agentCount)} />
          ))}
          {!anyMetricVisible && (
            <span className="text-slate-500 text-sm">No metrics selected for display. Use Global Settings.</span>
          )}
        </div>
      </div>
    </div>
  );
});
