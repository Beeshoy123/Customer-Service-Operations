// repeatOffenders.ts — "Repeated Offenders" detection (pure logic, no React).
// ============================================================================
// ONE concept, one name. An agent is a REPEATED offender for a metric when their
// value for that metric missed target in 2 or more of the LATEST 3 MONTHS loaded.
// The misses do not have to be back-to-back: miss, pass, miss counts.
// (Decided 2026-11-09; this replaced two older rules, "2+ in a row" and "3+ in a
// row". Every metric that has a target is checked.)
//
// Contract:
//   1. The window is the latest 3 months that have data anywhere on the floor
//      (getLatestMonths). A month nobody loaded is not part of it. With fewer than
//      3 months loaded the window is all of them (1 month can never flag).
//   2. Per-month data: computeMonthlyAggregates groups an agent's raw day
//      records by `YYYY-MM` and runs the SAME aggregateRecords() the month
//      selector uses (timeframe.ts) on each group — real per-month aggregates,
//      never the blended all-months view.
//   3. Missed target mirrors MetricCell's pass/fail rule exactly (shared.tsx):
//      reverse (lower-is-better, e.g. AHT/hand-offs) misses when value > target;
//      otherwise misses when value < target. Equality passes. A month with no
//      value for the metric (null/NaN) is NOT a miss — missing is not 0.
//   4. Flagged when misses >= REPEAT_MIN_MISSES (2) inside the window.
//   5. Targets come from the caller (metrics.ts builds them from METRIC_CONFIG /
//      getDynamicTarget, which applyAccountProfile keeps account-specific).
//
// See repeatOffenders.test.ts for the pinned edge cases.
// ============================================================================

import { aggregateRecords } from './helpers';

/** ccms -> { 'YYYY-MM-DD': dayRecord } — the shape hooks.ts/metrics.ts already use. */
export type HistoricalData = Record<string, Record<string, any>>;

/** The window the rule looks at, and how many misses inside it flag an agent. */
export const REPEAT_WINDOW_MONTHS = 3;
export const REPEAT_MIN_MISSES = 2;

export type RepeatOffenderTarget = {
  target: number;
  reverse: boolean;
  label?: string;
  format?: string;
};

export type RepeatOffenderTargets = Record<string, RepeatOffenderTarget>;

export type MonthValue = { month: string; value: number };

/** One month of the window for one metric: value is null when there is no data. */
export type MonthStatus = { month: string; value: number | null; missed: boolean };

export type RepeatOffenderMetricHit = {
  metric: string;
  label: string;
  format: string;
  target: number;
  reverse: boolean;
  /** How many window months missed target (always >= REPEAT_MIN_MISSES when present). */
  missCount: number;
  /** The window months, oldest first, each with its value and whether it missed. */
  windowMonths: MonthStatus[];
};

export type RepeatOffenderAgentRef = { ccms: string; name?: string; supervisor?: string };

export type RepeatOffendersBySupervisor = { agentCount: number; agentNames: string[] };

export type RepeatOffenderRow = RepeatOffenderAgentRef & {
  hits: RepeatOffenderMetricHit[];
  /** Most misses on any one metric (drives the default sort). */
  maxMisses: number;
  /** The metric with the most misses (ties: the more recent miss wins). */
  primaryHit: RepeatOffenderMetricHit;
};

export type RepeatOffendersSummary = {
  totalOffenders: number;
  /** Agents with a metric missed in EVERY month of the window. */
  missedAllCount: number;
  /** KPI label most often responsible for a repeat. */
  topKpiLabel: string;
  topKpiMetric: string;
  topKpiCount: number;
  /** Distinct supervisors among offenders (filter dropdown). */
  supervisors: string[];
  /** Distinct KPIs among offenders (filter dropdown). */
  kpis: { metric: string; label: string }[];
};

export type RepeatOffendersResult = {
  byAgent: Map<string, RepeatOffenderMetricHit[]>;
  bySupervisor: Map<string, RepeatOffendersBySupervisor>;
  rows: RepeatOffenderRow[];
  summary: RepeatOffendersSummary;
  /** The window actually used, oldest first. */
  windowMonths: string[];
};

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const trimmed = typeof value === 'string' ? value.trim() : value;
  if (trimmed === '') return null;
  const num = typeof trimmed === 'number' ? trimmed : Number(trimmed);
  return Number.isFinite(num) ? num : null;
};

/** The exact inverse of MetricCell's isGood rule (shared.tsx). */
export const isMissedTarget = (value: unknown, target: number, reverse: boolean): boolean => {
  const num = toFiniteNumber(value);
  if (num === null) return false;
  return reverse ? num > target : num < target;
};

/** Groups an agent's date keys by 'YYYY-MM'. Malformed date keys are ignored. */
export const groupAgentDatesByMonth = (agentHistory: Record<string, any> | undefined | null): Record<string, string[]> => {
  const groups: Record<string, string[]> = {};
  if (!agentHistory) return groups;
  for (const dateKey of Object.keys(agentHistory)) {
    if (!DATE_KEY_RE.test(dateKey)) continue;
    const month = dateKey.slice(0, 7);
    (groups[month] || (groups[month] = [])).push(dateKey);
  }
  return groups;
};

/**
 * One aggregateRecords() call per month group — byte-for-byte the same
 * primitive the month selector uses, so every value here is a REAL per-month
 * aggregate, never blended multi-month data.
 */
export const computeMonthlyAggregates = (
  agentHistory: Record<string, any> | undefined | null,
  onlyMonths?: string[]
): Record<string, any> => {
  if (!agentHistory) return {};
  const groups = groupAgentDatesByMonth(agentHistory);
  const wanted = onlyMonths ? new Set(onlyMonths) : null;
  const aggregates: Record<string, any> = {};
  for (const month of Object.keys(groups)) {
    if (wanted && !wanted.has(month)) continue;
    aggregates[month] = aggregateRecords(groups[month].map((dateKey) => agentHistory[dateKey]));
  }
  return aggregates;
};

/**
 * The window: the latest `count` months ('YYYY-MM', oldest first) that have data
 * for at least one of the given agents. A month nobody loaded is skipped, and
 * fewer than `count` loaded months simply gives all of them.
 */
export const getLatestMonths = (
  historicalData: HistoricalData | undefined | null,
  agentIds: string[],
  count: number = REPEAT_WINDOW_MONTHS
): string[] => {
  if (!historicalData || !Array.isArray(agentIds)) return [];
  const months = new Set<string>();
  for (const id of agentIds) {
    const agentHistory = historicalData[id];
    if (!agentHistory) continue;
    for (const dateKey of Object.keys(agentHistory)) {
      if (DATE_KEY_RE.test(dateKey)) months.add(dateKey.slice(0, 7));
    }
  }
  return [...months].filter((month) => MONTH_KEY_RE.test(month)).sort().slice(-count);
};

/**
 * The rule for one metric: count misses across the window months. Returns the
 * hit when the agent missed in REPEAT_MIN_MISSES or more of them, otherwise null.
 */
export const getRepeatHit = (
  monthlyAggregates: Record<string, any>,
  metric: string,
  target: RepeatOffenderTarget,
  windowMonths: string[]
): RepeatOffenderMetricHit | null => {
  const statuses: MonthStatus[] = windowMonths.map((month) => {
    const value = toFiniteNumber(monthlyAggregates?.[month]?.[metric]);
    return { month, value, missed: value !== null && isMissedTarget(value, target.target, target.reverse) };
  });
  const missCount = statuses.filter((status) => status.missed).length;
  if (missCount < REPEAT_MIN_MISSES) return null;
  return {
    metric,
    label: target.label ?? metric,
    format: target.format ?? '',
    target: target.target,
    reverse: target.reverse,
    missCount,
    windowMonths: statuses,
  };
};

/** Every metric (with a target) that qualifies for one agent; aggregates computed once. */
export const getRepeatHitsForAgent = (
  agentId: string,
  historicalData: HistoricalData | undefined | null,
  targets: RepeatOffenderTargets,
  windowMonths: string[]
): RepeatOffenderMetricHit[] => {
  const agentHistory = historicalData?.[agentId];
  if (!agentHistory || !targets || windowMonths.length === 0) return [];

  const monthly = computeMonthlyAggregates(agentHistory, windowMonths);
  const hits: RepeatOffenderMetricHit[] = [];
  for (const metric of Object.keys(targets)) {
    const target = targets[metric];
    if (!target || !Number.isFinite(target.target)) continue;
    const hit = getRepeatHit(monthly, metric, target, windowMonths);
    if (hit) hits.push(hit);
  }
  return hits;
};

const lastMissedMonth = (hit: RepeatOffenderMetricHit): string => {
  for (let i = hit.windowMonths.length - 1; i >= 0; i--) {
    if (hit.windowMonths[i].missed) return hit.windowMonths[i].month;
  }
  return '';
};

const emptySummary = (): RepeatOffendersSummary => ({
  totalOffenders: 0,
  missedAllCount: 0,
  topKpiLabel: '—',
  topKpiMetric: '',
  topKpiCount: 0,
  supervisors: [],
  kpis: [],
});

/**
 * One pass over the roster, used by every screen (roster badges, agent modal,
 * the Repeated Offenders tab and the header chip), so they can never disagree.
 * Returns per-agent hits, per-supervisor counts, ranked rows and summary stats.
 */
export const computeRepeatOffenders = (
  agents: RepeatOffenderAgentRef[],
  historicalData: HistoricalData | undefined | null,
  targets: RepeatOffenderTargets
): RepeatOffendersResult => {
  const byAgent = new Map<string, RepeatOffenderMetricHit[]>();
  const bySupervisor = new Map<string, RepeatOffendersBySupervisor>();
  const rows: RepeatOffenderRow[] = [];

  if (!Array.isArray(agents) || agents.length === 0 || !historicalData) {
    return { byAgent, bySupervisor, rows, summary: emptySummary(), windowMonths: [] };
  }

  const windowMonths = getLatestMonths(historicalData, agents.map((agent) => agent.ccms));

  for (const agent of agents) {
    const hits = getRepeatHitsForAgent(agent.ccms, historicalData, targets, windowMonths);
    if (hits.length === 0) continue;
    byAgent.set(agent.ccms, hits);

    const supervisor = agent.supervisor || '';
    if (supervisor) {
      const entry = bySupervisor.get(supervisor) || { agentCount: 0, agentNames: [] };
      entry.agentCount += 1;
      entry.agentNames.push(agent.name || agent.ccms);
      bySupervisor.set(supervisor, entry);
    }

    // Primary hit: most misses; ties go to the more recent miss.
    let primaryHit = hits[0];
    let maxMisses = 0;
    for (const hit of hits) {
      if (hit.missCount > maxMisses) maxMisses = hit.missCount;
      if (
        hit.missCount > primaryHit.missCount ||
        (hit.missCount === primaryHit.missCount && lastMissedMonth(hit) > lastMissedMonth(primaryHit))
      ) {
        primaryHit = hit;
      }
    }
    rows.push({ ...agent, hits, maxMisses, primaryHit });
  }

  rows.sort((x, y) => y.maxMisses - x.maxMisses || String(x.name || '').localeCompare(String(y.name || '')));

  const supervisorSet = new Set<string>();
  const kpiOrder: string[] = [];
  const kpiLabelByMetric: Record<string, string> = {};
  const kpiCounts: Record<string, number> = {};
  let missedAllCount = 0;
  for (const row of rows) {
    if (row.supervisor) supervisorSet.add(row.supervisor);
    if (row.maxMisses === windowMonths.length) missedAllCount += 1;
    for (const hit of row.hits) {
      if (!(hit.metric in kpiCounts)) {
        kpiCounts[hit.metric] = 0;
        kpiOrder.push(hit.metric);
        kpiLabelByMetric[hit.metric] = hit.label;
      }
      kpiCounts[hit.metric] += 1;
    }
  }
  let topKpiMetric = '';
  let topKpiCount = 0;
  for (const metric of kpiOrder) {
    if (kpiCounts[metric] > topKpiCount) {
      topKpiCount = kpiCounts[metric];
      topKpiMetric = metric;
    }
  }

  return {
    byAgent,
    bySupervisor,
    rows,
    windowMonths,
    summary: {
      totalOffenders: rows.length,
      missedAllCount,
      topKpiLabel: topKpiMetric ? kpiLabelByMetric[topKpiMetric] : '—',
      topKpiMetric,
      topKpiCount,
      supervisors: Array.from(supervisorSet).sort(),
      kpis: kpiOrder.map((metric) => ({ metric, label: kpiLabelByMetric[metric] })),
    },
  };
};

/** Human text: (2, 3) -> "2 of 3 months". */
export const missLabel = (missCount: number, windowLength: number): string =>
  `${missCount} of ${windowLength} months`;

/** Compact month badge text: '2026-01' -> 'Jan'. */
export const shortMonthLabel = (monthKey: string): string => {
  const [year, month] = String(monthKey || '').split('-');
  const parsed = month && year ? new Date(Number(year), Number(month) - 1, 1) : null;
  return parsed && !isNaN(parsed.getTime())
    ? parsed.toLocaleDateString('en-US', { month: 'short' })
    : String(monthKey || '?');
};
