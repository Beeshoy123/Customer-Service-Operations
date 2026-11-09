// Extracted from App.tsx (Phase 5 move-only refactor) — behavior must stay identical.
import React, { useMemo } from 'react';
import { useDashboard } from '../../hooks';
import { DonutChart } from '../../../../components/shared';
import { CountUp } from './CountUp';
import { getDynamicTarget, METRIC_CONFIG, getDynamicMax } from '../../config';

// ─── Metric tile ──────────────────────────────────────────
// Mint tile = on target, peach = off target, white = no value or no target to compare
// with. The "vs target" line is value minus target, with the same decimals as the value.
// Same on-target rule as the gauge: lower is better when `reverse` is set.
const KpiTile = ({ config, value, target }: { config: any; value: unknown; target: number | undefined }) => {
  const num = typeof value === 'number' ? value : Number(value);
  const hasValue = value !== null && value !== undefined && value !== '' && Number.isFinite(num);
  const decimals = config.isInteger ? 0 : 2;
  let tone = 'is-neutral';
  let delta: string | null = null;
  if (hasValue && typeof target === 'number' && Number.isFinite(target)) {
    const isGood = config.reverse ? num <= target : num >= target;
    tone = isGood ? 'is-good' : 'is-bad';
    const diff = Number((num - target).toFixed(decimals));
    delta = `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(decimals)} vs target`;
  }
  return (
    <div className={`kpi-tile ${tone}`}>
      <span className="kpi-tile-label">{config.label}</span>
      <span className="kpi-tile-value">{hasValue ? <CountUp value={num} decimals={decimals} /> : '-'}{config.format}</span>
      {delta && <span className="kpi-tile-delta">{delta}</span>}
    </div>
  );
};

// ─── KPI Summary Row ──────────────────────────────────────
export const MainStatsRow = React.memo(() => {
  const { dashData, metrics, uiState } = useDashboard();

  const spotterPrefix = dashData.activeTimeframe === 'monthly' ? 'Monthly Spotter' : dashData.activeTimeframe === 'weekly' ? 'Weekly Spotter' : dashData.activeTimeframe === 'dow' ? 'Day Of Week' : 'Daily Spotter';
  const spotterDate = dashData.activeTimeframe === 'monthly' ? dashData.monthLabel(dashData.selectedMonth) : dashData.activeTimeframe === 'weekly' ? dashData.selectedWeek : dashData.activeTimeframe === 'dow' ? dashData.selectedDow : dashData.selectedDate;

  // S21: compute the visible-column key lists once per render instead of
  // calling Object.keys(...).filter(...) four times in the JSX below.
  const { gridKeys, anyMetricVisible } = useMemo(() => {
    const allKeys = Object.keys(uiState.visibleCols);
    const metricKeys = allKeys.filter(key => uiState.visibleCols[key] && (METRIC_CONFIG as Record<string, any>)[key]);
    return {
      gridKeys: metricKeys.filter(key => !['bonus', 'vxs', 'resolve3d', 'resolve2hr', 'handoffs', 'trajectory'].includes(key)),
      anyMetricVisible: metricKeys.length > 0,
    };
  }, [uiState.visibleCols]);


  return (
    <div className="stats-row">
      <div className="metric-card card-mtd flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="metric-card-title">{dashData.activeTimeframe === 'monthly' ? (dashData.selectedMonth === 'all' ? 'All Months' : dashData.monthLabel(dashData.selectedMonth)) : 'Month To Date'}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="kpi-chip">Calls Handled: <strong>{metrics.mtdLeaderData.calls ? <CountUp value={metrics.mtdLeaderData.calls} grouped /> : '-'}</strong></span>
              <span className="kpi-chip">Res Contacts: <strong>{metrics.mtdLeaderData.resolveTotalContacts ? <CountUp value={metrics.mtdLeaderData.resolveTotalContacts} grouped /> : '-'}</strong></span>
            </div>
          </div>
          <span className="kpi-pill">MONTH-END STRATEGY</span>
        </div>


        <div className="flex flex-wrap justify-around gap-4 pb-6 kpi-divider">
          {['vxs', 'resolve2hr', 'handoffs', 'resolve3d'].filter(key => uiState.visibleCols[key]).map(key => (
            <DonutChart key={key} value={metrics.mtdLeaderData[key]} target={getDynamicTarget(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} label={(METRIC_CONFIG as Record<string, any>)[key].label} format={(METRIC_CONFIG as Record<string, any>)[key].format} reverse={(METRIC_CONFIG as Record<string, any>)[key].reverse} max={getDynamicMax(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} isInteger={(METRIC_CONFIG as Record<string, any>)[key].isInteger} />
          ))}
        </div>


        <div className="grid grid-cols-auto-110 gap-3 pt-5">
          {gridKeys.map(key => (
            <KpiTile key={key} config={(METRIC_CONFIG as Record<string, any>)[key]} value={metrics.mtdLeaderData[key]} target={getDynamicTarget(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} />
          ))}
        </div>
        {!anyMetricVisible && (
          <span className="text-slate-500 text-sm">No metrics selected for display. Use Global Settings.</span>
        )}
      </div>


      <div className="metric-card card-daily flex flex-col">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="metric-card-title flex items-baseline">
              {spotterPrefix} <span className="text-sm text-slate-400 italic ml-2 font-normal">({spotterDate})</span>
            </h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="kpi-chip">Calls Handled: <strong>{metrics.activeLeaderData.calls ? <CountUp value={metrics.activeLeaderData.calls} grouped /> : '-'}</strong></span>
              <span className="kpi-chip">Res Contacts: <strong>{metrics.activeLeaderData.resolveTotalContacts ? <CountUp value={metrics.activeLeaderData.resolveTotalContacts} grouped /> : '-'}</strong></span>
            </div>
          </div>
          <span className="kpi-pill">DAILY EXECUTION</span>
        </div>
        
        <div className="flex flex-wrap justify-around gap-4 pb-6 kpi-divider">
          {['vxs', 'resolve2hr', 'handoffs', 'resolve3d'].filter(key => uiState.visibleCols[key]).map(key => (
            <DonutChart key={key} value={metrics.activeLeaderData[key]} target={getDynamicTarget(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} label={(METRIC_CONFIG as Record<string, any>)[key].label} format={(METRIC_CONFIG as Record<string, any>)[key].format} reverse={(METRIC_CONFIG as Record<string, any>)[key].reverse} max={getDynamicMax(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} isInteger={(METRIC_CONFIG as Record<string, any>)[key].isInteger} />
          ))}
        </div>


        <div className="grid grid-cols-auto-110 gap-3 pt-5">
          {gridKeys.map(key => (
            <KpiTile key={key} config={(METRIC_CONFIG as Record<string, any>)[key]} value={metrics.activeLeaderData[key]} target={getDynamicTarget(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} />
          ))}
        </div>
        {!anyMetricVisible && (
          <span className="text-slate-500 text-sm">No metrics selected for display. Use Global Settings.</span>
        )}
      </div>
    </div>
  );
});


