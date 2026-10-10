// chronicOffenders.ts — "Chronic Offenders" detection (pure logic, no React).
// ============================================================================
// An agent is a CHRONIC offender when they missed target for MORE THAN 2
// CONSECUTIVE calendar months — i.e. streaks of 3+ months in a row. This view
// intentionally uses a stricter threshold than the Settings-driven "Repeated
// Offenders" feature (2+ months); it always evaluates ALL KPI metrics that have
// a configured target, regardless of the repeatOffenderMetrics selection.
//
// Reuses the exact primitives from repeatOffenders.ts so month parsing,
// per-month aggregation (aggregateRecords), calendar-adjacency and pass/fail
// polarity are identical everywhere:
//   - computeMonthlyAggregates: real per-month aggregates, never blended data.
//   - getConsecutiveMissStreak: longest calendar-adjacent miss run (>= 2).
// Here we additionally require length >= 3 to qualify as chronic, and expose
// every qualifying metric hit so the grid can render trend badges, current
// streak text ("3 Consecutive Months"), supervisor/KPI filters and summary
// stats (total offenders, avg streak, top impacted KPI).
// ============================================================================

import {
  computeMonthlyAggregates,
  getConsecutiveMissStreak,
  type HistoricalData,
  type MonthValue,
  type RepeatOffenderAgentRef,
} from './repeatOffenders';

/** Chronic threshold: strictly MORE than 2 consecutive months => >= 3. */
export const CHRONIC_MIN_STREAK = 3;

export type ChronicMetricHit = {
  metric: string;
  label: string;
  format: string;
  target: number;
  reverse: boolean;
  /** Length of the qualifying chronic streak (always >= CHRONIC_MIN_STREAK). */
  streakLength: number;
  /** Ascending calendar month keys of the streak, e.g. ['2026-01','2026-02','2026-03']. */
  streakMonths: string[];
  /** Value per streak month, aligned with streakMonths. */
  values: MonthValue[];
};

export type ChronicOffenderRow = RepeatOffenderAgentRef & {
  hits: ChronicMetricHit[];
  /** Longest chronic streak across all metrics (drives default sort). */
  maxStreak: number;
  /** The metric carrying the longest streak (ties: more recent streak wins). */
  primaryHit: ChronicMetricHit;
};

export type ChronicOffendersSummary = {
  totalOffenders: number;
  /** Average of each offender's longest streak, rounded to one decimal. */
  avgStreak: number;
  /** KPI label most frequently responsible for chronic streaks. */
  topKpiLabel: string;
  topKpiMetric: string;
  topKpiCount: number;
  /** All distinct supervisors present among offenders (for filter dropdown). */
  supervisors: string[];
  /** All distinct KPIs present among offenders (for filter dropdown). */
  kpis: { metric: string; label: string }[];
};

export type ChronicTargets = Record<
  string,
  { target: number; reverse: boolean; label?: string; format?: string }
>;

/**
 * One agent: every metric whose miss-run spans >= CHRONIC_MIN_STREAK
 * consecutive calendar months. Returns [] when the agent has no chronic hit.
 */
export const getChronicHitsForAgent = (
  agentId: string,
  historicalData: HistoricalData | undefined | null,
  targets: ChronicTargets
): ChronicMetricHit[] => {
  const agentHistory = historicalData?.[agentId];
  if (!agentHistory || !targets) return [];

  const monthly = computeMonthlyAggregates(agentHistory);
  const hits: ChronicMetricHit[] = [];
  for (const metric of Object.keys(targets)) {
    const t = targets[metric];
    if (!t || !Number.isFinite(t.target)) continue;
    const streak = getConsecutiveMissStreak(monthly, metric, t.target, t.reverse);
    if (streak.streakMonths.length >= CHRONIC_MIN_STREAK) {
      hits.push({
        metric,
        label: t.label ?? metric,
        format: t.format ?? '',
        target: t.target,
        reverse: t.reverse,
        streakLength: streak.streakMonths.length,
        streakMonths: streak.streakMonths,
        values: streak.values,
      });
    }
  }
  return hits;
};

/**
 * Full-floor scan: rows (one per chronic offender, sorted by longest streak
 * desc) + summary stats for the KPI cards and filter dropdowns.
 */
export const computeChronicOffenders = (
  agents: RepeatOffenderAgentRef[],
  historicalData: HistoricalData | undefined | null,
  targets: ChronicTargets
): { rows: ChronicOffenderRow[]; summary: ChronicOffendersSummary } => {
  const rows: ChronicOffenderRow[] = [];
  if (!Array.isArray(agents) || agents.length === 0 || !historicalData) {
    return { rows, summary: emptySummary() };
  }

  for (const agent of agents) {
    const hits = getChronicHitsForAgent(agent.ccms, historicalData, targets);
    if (hits.length === 0) continue;
    // Primary hit: longest streak; ties broken by the later (more recent) run.
    let primaryHit = hits[0];
    let maxStreak = 0;
    for (const hit of hits) {
      if (hit.streakLength > maxStreak) maxStreak = hit.streakLength;
      const a = hit.streakMonths[hit.streakMonths.length - 1] || '';
      const b = primaryHit.streakMonths[primaryHit.streakMonths.length - 1] || '';
      if (hit.streakLength > primaryHit.streakLength || (hit.streakLength === primaryHit.streakLength && a > b)) {
        primaryHit = hit;
      }
    }
    rows.push({ ...agent, hits, maxStreak, primaryHit });
  }

  rows.sort((x, y) => y.maxStreak - x.maxStreak || String(x.name || '').localeCompare(String(y.name || '')));

  const supervisorSet = new Set<string>();
  const kpiOrder: string[] = [];
  const kpiLabelByMetric: Record<string, string> = {};
  const kpiCounts: Record<string, number> = {};
  let streakSum = 0;
  for (const row of rows) {
    streakSum += row.maxStreak;
    if (row.supervisor) supervisorSet.add(row.supervisor);
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
    rows,
    summary: {
      totalOffenders: rows.length,
      avgStreak: rows.length ? Math.round((streakSum / rows.length) * 10) / 10 : 0,
      topKpiLabel: topKpiMetric ? kpiLabelByMetric[topKpiMetric] : '—',
      topKpiMetric,
      topKpiCount,
      supervisors: Array.from(supervisorSet).sort(),
      kpis: kpiOrder.map((metric) => ({ metric, label: kpiLabelByMetric[metric] })),
    },
  };
};

const emptySummary = (): ChronicOffendersSummary => ({
  totalOffenders: 0,
  avgStreak: 0,
  topKpiLabel: '—',
  topKpiMetric: '',
  topKpiCount: 0,
  supervisors: [],
  kpis: [],
});

/** Human streak text: 3 -> "3 Consecutive Months", 1 -> "1 Month". */
export const streakLabel = (length: number): string =>
  `${length} Consecutive Month${length === 1 ? '' : 's'}`;

/** Compact month badge text: '2026-01' -> 'Jan'. */
export const shortMonthLabel = (monthKey: string): string => {
  const [year, month] = String(monthKey || '').split('-');
  const parsed = month && year ? new Date(Number(year), Number(month) - 1, 1) : null;
  return parsed && !isNaN(parsed.getTime())
    ? parsed.toLocaleDateString('en-US', { month: 'short' })
    : String(monthKey || '?');
};
