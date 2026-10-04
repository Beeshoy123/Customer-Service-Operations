// Extracted from App.tsx (Phase 5 move-only refactor) — behavior must stay identical.
import React from 'react';
import { useDashboard } from '../../hooks';
import { DonutChart } from '../../../../components/shared';
import { getDynamicTarget, METRIC_CONFIG, getDynamicMax } from '../../config';

// ─── KPI Summary Row ──────────────────────────────────────
export const MainStatsRow = React.memo(() => {
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
            <DonutChart key={key} value={metrics.mtdLeaderData[key]} target={getDynamicTarget(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} label={(METRIC_CONFIG as Record<string, any>)[key].label} format={(METRIC_CONFIG as Record<string, any>)[key].format} reverse={(METRIC_CONFIG as Record<string, any>)[key].reverse} max={getDynamicMax(key, metrics.mtdLeaderData.activeAgentCount || dashData.agents.length)} isInteger={(METRIC_CONFIG as Record<string, any>)[key].isInteger} />
          ))}
        </div>


        <div className="grid grid-cols-auto-110 gap-3 pt-5">
          {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && !['bonus', 'vxs', 'resolve3d', 'resolve2hr', 'handoffs', 'trajectory'].includes(key) && (METRIC_CONFIG as Record<string, any>)[key]).map(key => {
              const config = (METRIC_CONFIG as Record<string, any>)[key];
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
        {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && (METRIC_CONFIG as Record<string, any>)[key]).length === 0 && (
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
            <DonutChart key={key} value={metrics.activeLeaderData[key]} target={getDynamicTarget(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} label={(METRIC_CONFIG as Record<string, any>)[key].label} format={(METRIC_CONFIG as Record<string, any>)[key].format} reverse={(METRIC_CONFIG as Record<string, any>)[key].reverse} max={getDynamicMax(key, metrics.activeLeaderData.activeAgentCount || dashData.agents.length)} isInteger={(METRIC_CONFIG as Record<string, any>)[key].isInteger} />
          ))}
        </div>


        <div className="grid grid-cols-auto-110 gap-3 pt-5">
          {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && !['bonus', 'vxs', 'resolve3d', 'resolve2hr', 'handoffs', 'trajectory'].includes(key) && (METRIC_CONFIG as Record<string, any>)[key]).map(key => {
              const config = (METRIC_CONFIG as Record<string, any>)[key];
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
        {Object.keys(uiState.visibleCols).filter(key => uiState.visibleCols[key] && (METRIC_CONFIG as Record<string, any>)[key]).length === 0 && (
          <span className="text-slate-500 text-sm">No metrics selected for display. Use Global Settings.</span>
        )}
      </div>
    </div>
  );
});


