// Repeated Offenders — agents who missed a KPI target in 2 or more of the latest
// 3 months loaded (not necessarily back-to-back). The detection lives in
// ../../repeatOffenders.ts and is computed ONCE in metrics.ts, so this tab, the
// roster badges, the agent modal and the header chip always agree. This view
// renders summary cards, filters/sorting, the latest-months badges and
// per-agent coaching actions.
import React, { useCallback, useMemo, useState } from 'react';
import { useDashboard } from '../../hooks';
import { TabFrame, EmptyState } from '../chrome/TabFrame';
import {
  REPEAT_MIN_MISSES,
  REPEAT_WINDOW_MONTHS,
  missLabel,
  shortMonthLabel,
  type RepeatOffenderMetricHit,
  type RepeatOffenderRow,
  type RepeatOffendersSummary,
} from '../../repeatOffenders';

const EMPTY_COACHING: Record<string, string> = {};
const NO_ROWS: RepeatOffenderRow[] = [];

const formatValue = (value: number, format: string): string => {
  if (format === '%') return `${Math.round(value)}%`;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const TrendBadges = ({ hit }: { hit: RepeatOffenderMetricHit }) => (
  <div
    className="flex flex-wrap items-center gap-1"
    title={`${hit.label}: missed target in ${hit.windowMonths.filter((m) => m.missed).map((m) => m.month).join(', ')}`}
  >
    {hit.windowMonths.map((m) =>
      m.value === null ? (
        <span key={m.month} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-xs font-bold text-slate-400">
          {shortMonthLabel(m.month)} <span className="font-semibold">no data</span>
        </span>
      ) : m.missed ? (
        <span key={m.month} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-xs font-bold text-red-700">
          {shortMonthLabel(m.month)} <span aria-hidden="true">❌</span>
          <span className="font-semibold text-red-600/80">{formatValue(m.value, hit.format)}</span>
        </span>
      ) : (
        <span key={m.month} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700">
          {shortMonthLabel(m.month)} <span aria-hidden="true">✅</span>
          <span className="font-semibold text-emerald-600/80">{formatValue(m.value, hit.format)}</span>
        </span>
      )
    )}
  </div>
);

export const FloorOffendersTab = React.memo(() => {
  const { dashData, metrics, uiState } = useDashboard();
  const { hasUploadedData, setUploadStatus, scheduleStatusClear } = dashData;

  const [supervisorFilter, setSupervisorFilter] = useState('all');
  const [kpiFilter, setKpiFilter] = useState('all');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  // Action Status store: ccms -> ISO timestamp when coaching was assigned.
  const [coachingAssigned, setCoachingAssigned] = useState<Record<string, string>>(EMPTY_COACHING);

  // One shared result (metrics.ts): every KPI that has a target, latest 3 months.
  const result = metrics.repeatOffenders;
  const rows: RepeatOffenderRow[] = hasUploadedData && result ? result.rows : NO_ROWS;
  const summary: RepeatOffendersSummary | null = hasUploadedData && result ? result.summary : null;
  const windowLength: number = hasUploadedData && result ? result.windowMonths.length : 0;

  const visibleRows = useMemo(() => {
    let filtered = rows;
    if (supervisorFilter !== 'all') filtered = filtered.filter((r) => (r.supervisor || '') === supervisorFilter);
    if (kpiFilter !== 'all') filtered = filtered.filter((r) => r.hits.some((h) => h.metric === kpiFilter));
    const sorted = [...filtered].sort(
      (a, b) => b.maxMisses - a.maxMisses || String(a.name || '').localeCompare(String(b.name || ''))
    );
    return sortDir === 'desc' ? sorted : sorted.slice().reverse();
  }, [rows, supervisorFilter, kpiFilter, sortDir]);

  const handleAssignCoaching = useCallback((row: RepeatOffenderRow) => {
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
    <TabFrame
      icon="repeat"
      title="Repeated offenders"
      subtitle={`Agents who missed a KPI target in ${REPEAT_MIN_MISSES} or more of the latest ${REPEAT_WINDOW_MONTHS} months (not necessarily in a row), most misses first.`}
      controls={
        <>
          <label className="cso-field-label" htmlFor="offenders-sup-filter">Supervisor</label>
          <select
            id="offenders-sup-filter"
            data-testid="offenders-supervisor-filter"
            value={supervisorFilter}
            onChange={(e) => setSupervisorFilter(e.target.value)}
            className="cso-select"
          >
            <option value="all">All supervisors</option>
            {(summary?.supervisors ?? []).map((sup) => (
              <option key={sup} value={sup}>{sup}</option>
            ))}
          </select>
          <label className="cso-field-label" htmlFor="offenders-kpi-filter">KPI</label>
          <select
            id="offenders-kpi-filter"
            data-testid="offenders-kpi-filter"
            value={kpiFilter}
            onChange={(e) => setKpiFilter(e.target.value)}
            className="cso-select"
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
            className="cso-btn cso-btn-line"
            title="Toggle misses sort direction"
          >
            Misses {sortDir === 'desc' ? '↓ (most first)' : '↑ (fewest first)'}
          </button>
        </>
      }
    >
      {/* ── Summary KPI cards ─────────────────────────────── */}
      <div className="summary-tiles">
        <div className="summary-tile">
          <div className="summary-tile-label">Total Repeated Offenders</div>
          <div className="summary-tile-value is-red">{summary ? summary.totalOffenders : '—'}</div>
          <div className="summary-tile-sub">Missed target in {REPEAT_MIN_MISSES}+ of the latest {REPEAT_WINDOW_MONTHS} months</div>
        </div>
        <div className="summary-tile">
          <div className="summary-tile-label">Missed Every Month</div>
          <div className="summary-tile-value is-amber">{summary && windowLength > 0 ? summary.missedAllCount : '—'}</div>
          <div className="summary-tile-sub">Missed target in all {windowLength || REPEAT_WINDOW_MONTHS} latest months</div>
        </div>
        <div className="summary-tile">
          <div className="summary-tile-label">Primary Issue Area</div>
          <div className="summary-tile-value is-blue">{summary ? summary.topKpiLabel : '—'}</div>
          <div className="summary-tile-sub">
            {summary && summary.topKpiCount > 0 ? `Driving ${summary.topKpiCount} repeat${summary.topKpiCount === 1 ? '' : 's'}` : 'No repeated misses detected'}
          </div>
        </div>
      </div>

        {!hasUploadedData || windowLength < 2 ? (
          <EmptyState icon="repeat" title="Not enough months yet" hint="Import at least two months of workbook data to detect repeated misses." />
        ) : rows.length === 0 ? (
          <EmptyState icon="repeat" title="No repeated offenders" hint={`No agents missed a KPI target in ${REPEAT_MIN_MISSES} or more of the latest ${REPEAT_WINDOW_MONTHS} months.`} />
        ) : visibleRows.length === 0 ? (
          <EmptyState icon="repeat" title="No offenders match" hint="Adjust the supervisor or KPI filter above." />
        ) : (
          <>
            <table className="cso-table cso-table-left">
              <thead>
                <tr>
                  <th className="is-left">Agent Name</th>
                  <th className="is-left">Supervisor</th>
                  <th className="is-left">Failed KPI Category</th>
                  <th className="is-left">Misses</th>
                  <th className="is-left">Latest Months</th>
                  <th className="is-left">Action Status</th>
                  <th className="is-right">Action</th>
                </tr>
              </thead>
              <tbody>
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
                        <span className="font-extrabold text-red-700">{missLabel(row.maxMisses, windowLength)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <TrendBadges hit={row.primaryHit} />
                        {row.hits.length > 1 && (
                          <div className="text-xs text-slate-400 mt-1">+{row.hits.length - 1} other KPI{row.hits.length - 1 === 1 ? '' : 's'}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {assignedAt ? (
                          <span
                            data-testid={`offenders-action-status-${row.ccms}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 border border-emerald-300 text-emerald-800"
                          >
                            Coaching assigned
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 border border-slate-300 text-slate-600">
                            Not started
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          data-testid={`offenders-coach-btn-${row.ccms}`}
                          disabled={Boolean(assignedAt)}
                          onClick={() => handleAssignCoaching(row)}
                          className={`cso-btn cso-btn-sm ${assignedAt ? 'cso-btn-line' : 'cso-btn-fill'}`}
                        >
                          {assignedAt ? 'Coaching Assigned' : 'Assign Coaching / Intervention'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {uiState.searchQuery && rows.length > 0 && (
          <p className="tab-footnote">
            Tip: combine with the global search bar to narrow this list by agent name.
          </p>
        )}
    </TabFrame>
  );
});

FloorOffendersTab.displayName = 'FloorOffendersTab';
