// Chronic Offenders — agents who missed KPI targets for MORE than 2
// CONSECUTIVE calendar months (3+ in a row). Pure detection logic lives in
// ../../chronicOffenders.ts (reuses repeatOffenders.ts primitives so month
// parsing, per-month aggregation and pass/fail polarity match the rest of
// the app exactly). This view renders summary cards, filters/sorting, the
// historical trend badges and per-agent coaching actions.
import React, { useCallback, useMemo, useState } from 'react';
import { useDashboard } from '../../hooks';
import { METRIC_CONFIG, getDynamicTarget } from '../../config';
import {
  computeChronicOffenders,
  shortMonthLabel,
  streakLabel,
  type ChronicMetricHit,
  type ChronicOffenderRow,
} from '../../chronicOffenders';

const EMPTY_COACHING: Record<string, string> = {};

const formatValue = (value: number, format: string): string => {
  if (format === '%') return `${Math.round(value)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const TrendBadges = ({ hit }: { hit: ChronicMetricHit }) => (
  <div className="flex flex-wrap items-center gap-1" title={`${hit.label}: missed target ${hit.streakMonths.join(', ')}`}>
    {hit.streakMonths.map((month, i) => (
      <span
        key={month}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-xs font-bold text-red-700"
      >
        {shortMonthLabel(month)} <span aria-hidden="true">❌</span>
        <span className="font-semibold text-red-600/80">{formatValue(hit.values[i]?.value ?? NaN, hit.format)}</span>
      </span>
    ))}
  </div>
);

export const FloorOffendersTab = React.memo(() => {
  const { dashData, uiState } = useDashboard();
  const { agents, historicalData, hasUploadedData, setUploadStatus, scheduleStatusClear } = dashData;

  const [supervisorFilter, setSupervisorFilter] = useState('all');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  // Action Status store: ccms -> ISO timestamp when coaching was assigned.
  const [coachingAssigned, setCoachingAssigned] = useState<Record<string, string>>(EMPTY_COACHING);

  // Evaluate ALL targeted KPIs (this view is not gated on the Settings
  // repeatOffenderMetrics selection — chronic = 3+ consecutive misses).
  const { rows, summary } = useMemo(() => {
    if (!hasUploadedData) return { rows: [] as ChronicOffenderRow[], summary: null };
    const targets: Record<string, { target: number; reverse: boolean; label?: string; format?: string }> = {};
    for (const [key, cfg] of Object.entries(METRIC_CONFIG as Record<string, any>)) {
      if (!cfg || !Number.isFinite(cfg.target)) continue;
      targets[key] = {
        target: getDynamicTarget(key, 1),
        reverse: Boolean(cfg.reverse),
        label: cfg.label,
        format: cfg.format ?? '',
      };
    }
    return computeChronicOffenders(agents, historicalData, targets);
  }, [agents, historicalData, hasUploadedData]);

  const visibleRows = useMemo(() => {
    let filtered = rows;
    if (supervisorFilter !== 'all') filtered = filtered.filter((r) => (r.supervisor || '') === supervisorFilter);
    if (kpiFilter !== 'all') filtered = filtered.filter((r) => r.hits.some((h) => h.metric === kpiFilter));
    const sorted = [...filtered].sort(
      (a, b) => b.maxStreak - a.maxStreak || String(a.name || '').localeCompare(String(b.name || ''))
    );
    return sortDir === 'desc' ? sorted : sorted.slice().reverse();
  }, [rows, supervisorFilter, kpiFilter, sortDir]);

  const handleAssignCoaching = useCallback((row: ChronicOffenderRow) => {
    setCoachingAssigned((prev) => (prev[row.ccms] ? prev : { ...prev, [row.ccms]: new Date().toISOString() }));
    setUploadStatus(`✅ Coaching plan assigned to ${row.name || row.ccms}.`);
    scheduleStatusClear();
  }, [setUploadStatus, scheduleStatusClear]);

  const activeKpiOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) for (const hit of row.hits) if (!seen.has(hit.metric)) seen.set(hit.metric, hit.label);
    return Array.from(seen.entries()).map(([metric, label]) => ({ metric, label }));
  }, [rows]);

  return (
    <div className="flex flex-col gap-6 p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
      {/* ── Summary KPI cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs uppercase font-extrabold tracking-wide text-slate-500 mb-1">Total Chronic Offenders</div>
          <div className="text-3xl font-black text-red-600">{summary ? summary.totalOffenders : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">Missed target 3+ consecutive months</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs uppercase font-extrabold tracking-wide text-slate-500 mb-1">Avg Streak Duration</div>
          <div className="text-3xl font-black text-amber-600">{summary ? `${summary.avgStreak} mo` : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">Average longest miss-run per offender</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs uppercase font-extrabold tracking-wide text-slate-500 mb-1">Primary Issue Area</div>
          <div className="text-3xl font-black text-blue-700">{summary ? summary.topKpiLabel : '—'}</div>
          <div className="text-xs text-slate-500 mt-1">
            {summary && summary.topKpiCount > 0 ? `Driving ${summary.topKpiCount} chronic streak${summary.topKpiCount === 1 ? '' : 's'}` : 'No chronic streaks detected'}
          </div>
        </div>
      </div>

      {/* ── Grid card ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="mb-4 border-b border-slate-100 pb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold flex items-center gap-2 mb-1 text-red-700"><span>🚨</span> Chronic Offenders</h3>
            <p className="text-sm text-slate-500 m-0">
              Agents failing KPI targets for more than 2 consecutive months, ranked by streak length.
            </p>
          </div>
          {/* Filters + sort */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase" htmlFor="offenders-sup-filter">Supervisor</label>
            <select
              id="offenders-sup-filter"
              data-testid="offenders-supervisor-filter"
              value={supervisorFilter}
              onChange={(e) => setSupervisorFilter(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">All supervisors</option>
              {(summary?.supervisors ?? []).map((sup) => (
                <option key={sup} value={sup}>{sup}</option>
              ))}
            </select>
            <label className="text-xs font-bold text-slate-500 uppercase ml-2" htmlFor="offenders-kpi-filter">KPI</label>
            <select
              id="offenders-kpi-filter"
              data-testid="offenders-kpi-filter"
              value={kpiFilter}
              onChange={(e) => setKpiFilter(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">All KPIs</option>
              {activeKpiOptions.map(({ metric, label }) => (
                <option key={metric} value={metric}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              data-testid="offenders-sort-toggle"
              onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
              className="ml-2 inline-flex items-center gap-1 border border-slate-300 rounded-md px-3 py-1.5 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
              title="Toggle streak sort direction"
            >
              Streak {sortDir === 'desc' ? '↓ (worst first)' : '↑ (best first)'}
            </button>
          </div>
        </div>

        {!hasUploadedData ? (
          <div className="text-center p-8 text-slate-500 italic">
            Import at least three months of workbook data to detect chronic patterns.
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center p-8 text-slate-500 italic">
            No agents have failed a KPI target for more than 2 consecutive months. 🎉
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="text-center p-8 text-slate-500 italic">
            No offenders match the current filters. Adjust the supervisor or KPI filter above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left font-extrabold text-slate-600 uppercase text-xs">Agent Name</th>
                  <th className="px-4 py-3 text-left font-extrabold text-slate-600 uppercase text-xs">Supervisor</th>
                  <th className="px-4 py-3 text-left font-extrabold text-slate-600 uppercase text-xs">Failed KPI Category</th>
                  <th className="px-4 py-3 text-left font-extrabold text-slate-600 uppercase text-xs">Current Streak</th>
                  <th className="px-4 py-3 text-left font-extrabold text-slate-600 uppercase text-xs">Historical Trend</th>
                  <th className="px-4 py-3 text-left font-extrabold text-slate-600 uppercase text-xs">Action Status</th>
                  <th className="px-4 py-3 text-right font-extrabold text-slate-600 uppercase text-xs">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleRows.map((row) => {
                  const assignedAt = coachingAssigned[row.ccms];
                  return (
                    <tr key={row.ccms} className="hover:bg-red-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <strong className="block text-slate-800">{row.name || row.ccms}</strong>
                        <span className="text-xs text-slate-400">{row.ccms}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.supervisor || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.hits.map((hit) => (
                            <span
                              key={hit.metric}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                                hit.metric === row.primaryHit.metric
                                  ? 'bg-red-100 border-red-300 text-red-800'
                                  : 'bg-amber-50 border-amber-200 text-amber-700'
                              }`}
                            >
                              {hit.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-extrabold text-red-700">{streakLabel(row.maxStreak)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <TrendBadges hit={row.primaryHit} />
                        {row.hits.length > 1 && (
                          <div className="text-xs text-slate-400 mt-1">+{row.hits.length - 1} other KPI streak{row.hits.length - 1 === 1 ? '' : 's'}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {assignedAt ? (
                          <span
                            data-testid={`offenders-action-status-${row.ccms}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 border border-emerald-300 text-emerald-800"
                          >
                            ✅ Coaching assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 border border-slate-300 text-slate-600">
                            ⏳ Not started
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          data-testid={`offenders-coach-btn-${row.ccms}`}
                          disabled={Boolean(assignedAt)}
                          onClick={() => handleAssignCoaching(row)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                            assignedAt
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                          }`}
                        >
                          {assignedAt ? 'Coaching Assigned' : 'Assign Coaching / Intervention'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {uiState.searchQuery && rows.length > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Tip: combine with the global search bar to narrow this list by agent name.
          </p>
        )}
      </div>
    </div>
  );
});

FloorOffendersTab.displayName = 'FloorOffendersTab';
