// Repeated Offenders — agents who missed a KPI target in 2 or more of the latest
// 3 months loaded (not necessarily back-to-back). The detection lives in
// ../../repeatOffenders.ts and is computed ONCE in metrics.ts, so this tab, the
// roster badges, the agent modal and the header chip always agree. This view
// renders summary cards, filters/sorting, the latest-months badges and
// per-agent coaching actions.
import React, { useCallback, useMemo, useState } from 'react';
import { useDashboard } from '../../hooks';
import { TabFrame, EmptyState, Icon } from '../chrome/TabFrame';
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
    className="offender-months"
    title={`${hit.label}: missed target in ${hit.windowMonths.filter((m) => m.missed).map((m) => m.month).join(', ')}`}
  >
    {hit.windowMonths.map((m) =>
      m.value === null ? (
        <span key={m.month} className="cso-month is-none">{shortMonthLabel(m.month)} <span>no data</span></span>
      ) : (
        <span key={m.month} className={`cso-month ${m.missed ? 'is-miss' : 'is-hit'}`}>
          {shortMonthLabel(m.month)}
          <Icon name={m.missed ? 'cross' : 'check'} size={11} />
          <span>{formatValue(m.value, hit.format)}</span>
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
    setUploadStatus(`Coaching plan assigned to ${row.name || row.ccms}.`);
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
            <table className="cso-table cso-table-left offenders-table">
              <colgroup>
                <col style={{ width: '15.2%' }} /><col style={{ width: '22.5%' }} /><col style={{ width: '7%' }} />
                <col style={{ width: '29.5%' }} /><col style={{ width: '11%' }} /><col style={{ width: '14.8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="is-left">Agent</th>
                  <th className="is-left">Failed KPIs</th>
                  <th className="is-left">Misses</th>
                  <th className="is-left">Latest months</th>
                  <th className="is-left">Status</th>
                  <th className="is-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const assignedAt = coachingAssigned[row.ccms];
                  const orderedHits = [row.primaryHit, ...row.hits.filter((h) => h.metric !== row.primaryHit.metric)];
                  return (
                    <tr key={row.ccms}>
                      <td className="offender-agent">
                        <strong title={row.name || row.ccms}>{row.name || row.ccms}</strong>
                        <span>{row.ccms} · {row.supervisor || '—'}</span>
                      </td>
                      <td>
                        <div className="offender-kpis">
                          {orderedHits.slice(0, 2).map((hit) => (
                            <span key={hit.metric} className={`cso-pill ${hit.metric === row.primaryHit.metric ? 'is-bad' : 'is-warn'}`}>{hit.label}</span>
                          ))}
                          {orderedHits.length > 2 && (
                            <span className="cso-pill" title={orderedHits.slice(2).map((h) => h.label).join(', ')}>+{orderedHits.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td><span className="offender-misses">{missLabel(row.maxMisses, windowLength).replace(/ months?$/, '')}</span></td>
                      <td><TrendBadges hit={row.primaryHit} /></td>
                      <td>
                        {assignedAt ? (
                          <span data-testid={`offenders-action-status-${row.ccms}`} className="cso-pill is-ok">Assigned</span>
                        ) : (
                          <span className="cso-pill">Not started</span>
                        )}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          data-testid={`offenders-coach-btn-${row.ccms}`}
                          disabled={Boolean(assignedAt)}
                          onClick={() => handleAssignCoaching(row)}
                          className={`cso-btn cso-btn-sm ${assignedAt ? 'cso-btn-line' : 'cso-btn-fill'}`}
                        >
                          {assignedAt ? 'Assigned' : 'Assign coaching'}
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
