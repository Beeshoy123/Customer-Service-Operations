// repeatOffenders.ts — "Repeated Offenders" detection (pure logic, no React).
// ============================================================================
// An agent is a repeat offender for metric X when their value for X missed
// target for 2 or more CONSECUTIVE calendar months of loaded data — back-to-back
// months only, never "2 out of any N".
//
// Contract:
//   1. Per-month data: computeMonthlyAggregates groups an agent's raw day
//      records by `YYYY-MM` and runs the SAME aggregateRecords() the month
//      selector uses (timeframe.ts) on each group — real per-month aggregates,
//      never the blended all-months view.
//   2. Consecutive = calendar-adjacent month keys (next is exactly +1 month).
//      A month where the agent has no data, an un-imported middle month, or a
//      month with no evaluable value for the metric ALL break the run.
//   3. Missed target mirrors MetricCell's pass/fail rule exactly (shared.tsx):
//      reverse (lower-is-better, e.g. AHT/hand-offs) misses when value > target;
//      otherwise misses when value < target. Equality passes; null/NaN months
//      are not evaluable and break the run.
//   4. Targets come from the caller (metrics.ts builds them from METRIC_CONFIG /
//      getDynamicTarget, which applyAccountProfile keeps account-specific).
//
// See repeatOffenders.test.ts for the pinned edge cases (single-month agent,
// non-consecutive misses, missing middle month, reverse-metric polarity).
// ============================================================================

import { aggregateRecords } from './helpers';

/** ccms -> { 'YYYY-MM-DD': dayRecord } — the shape hooks.ts/metrics.ts already use. */
export type HistoricalData = Record<string, Record<string, any>>;

export type RepeatOffenderTarget = {
  target: number;
  reverse: boolean;
  label?: string;
  format?: string;
};

export type RepeatOffenderTargets = Record<string, RepeatOffenderTarget>;

export type MonthValue = { month: string; value: number };

export type RepeatOffenderMetricHit = {
  metric: string;
  label: string;
  format: string;
  target: number;
  reverse: boolean;
  /** Length of the qualifying streak (always >= 2 when present). */
  streakLength: number;
  /** Ascending calendar month keys, e.g. ['2026-04', '2026-05']. */
  streakMonths: string[];
  /** Value per streak month, aligned with streakMonths. */
  values: MonthValue[];
};

export type RepeatOffenderResult = RepeatOffenderMetricHit & {
  isRepeatOffender: boolean;
};

export type RepeatOffenderAgentRef = { ccms: string; name?: string; supervisor?: string };

export type RepeatOffendersBySupervisor = { agentCount: number; agentNames: string[] };

export type RepeatOffendersResult = {
  byAgent: Map<string, RepeatOffenderMetricHit[]>;
  bySupervisor: Map<string, RepeatOffendersBySupervisor>;
};

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** '2026-12' -> '2027-01'; '2026-04' -> '2026-05'. */
export const nextMonthKey = (monthKey: string): string => {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
};

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
  agentHistory: Record<string, any> | undefined | null
): Record<string, any> => {
  if (!agentHistory) return {};
  const groups = groupAgentDatesByMonth(agentHistory);
  const aggregates: Record<string, any> = {};
  for (const month of Object.keys(groups)) {
    aggregates[month] = aggregateRecords(groups[month].map((dateKey) => agentHistory[dateKey]));
  }
  return aggregates;
};

/**
 * Longest run of calendar-adjacent months where the metric missed target.
 * Only runs of length >= 2 qualify; on a tie the later (more recent) run wins.
 * Months with no evaluable value break the run.
 */
export const getConsecutiveMissStreak = (
  monthlyAggregates: Record<string, any>,
  metric: string,
  target: number,
  reverse: boolean
): { streakMonths: string[]; values: MonthValue[] } => {
  const months = Object.keys(monthlyAggregates || {})
    .filter((month) => MONTH_KEY_RE.test(month))
    .sort();

  let best: { streakMonths: string[]; values: MonthValue[] } = { streakMonths: [], values: [] };
  let run: { streakMonths: string[]; values: MonthValue[] } = { streakMonths: [], values: [] };

  const flush = () => {
    // >= so the more recent run wins a tie
    if (run.streakMonths.length >= best.streakMonths.length && run.streakMonths.length > 0) {
      best = run;
    }
    run = { streakMonths: [], values: [] };
  };

  for (const month of months) {
    const value = toFiniteNumber(monthlyAggregates[month]?.[metric]);
    if (value === null || !isMissedTarget(value, target, reverse)) {
      flush();
      continue;
    }
    const previous = run.streakMonths[run.streakMonths.length - 1];
    if (previous !== undefined && nextMonthKey(previous) !== month) {
      flush(); // calendar gap (absent month / un-imported month) breaks the run
    }
    run.streakMonths.push(month);
    run.values.push({ month, value });
  }
  flush();

  return best.streakMonths.length >= 2 ? best : { streakMonths: [], values: [] };
};

const emptyResult = (
  metric: string,
  target: RepeatOffenderTarget | undefined
): RepeatOffenderResult => ({
  isRepeatOffender: false,
  metric,
  label: target?.label ?? metric,
  format: target?.format ?? '',
  target: target?.target ?? 0,
  reverse: target?.reverse ?? false,
  streakLength: 0,
  streakMonths: [],
  values: [],
});

const streakToHit = (
  metric: string,
  target: RepeatOffenderTarget,
  streak: { streakMonths: string[]; values: MonthValue[] }
): RepeatOffenderMetricHit => ({
  metric,
  label: target.label ?? metric,
  format: target.format ?? '',
  target: target.target,
  reverse: target.reverse,
  streakLength: streak.streakMonths.length,
  streakMonths: streak.streakMonths,
  values: streak.values,
});

/**
 * The headline check: is this agent a repeat offender for one metric?
 * Returns which months and how long the streak, so callers can render detail.
 */
export const getRepeatOffender = (
  agentId: string,
  metric: string,
  historicalData: HistoricalData | undefined | null,
  targets: RepeatOffenderTargets,
  selectedMetrics: string[]
): RepeatOffenderResult => {
  const target = targets?.[metric];
  const base = emptyResult(metric, target);
  if (!target || !selectedMetrics?.includes(metric)) return base;
  const agentHistory = historicalData?.[agentId];
  if (!agentHistory) return base;

  const streak = getConsecutiveMissStreak(
    computeMonthlyAggregates(agentHistory),
    metric,
    target.target,
    target.reverse
  );
  if (streak.streakMonths.length < 2) return base;

  return { ...streakToHit(metric, target, streak), isRepeatOffender: true };
};

/** All qualifying metrics for one agent (aggregates computed once). */
export const getRepeatOffendersForAgent = (
  agentId: string,
  historicalData: HistoricalData | undefined | null,
  targets: RepeatOffenderTargets,
  selectedMetrics: string[]
): RepeatOffenderMetricHit[] => {
  if (!selectedMetrics?.length) return [];
  const agentHistory = historicalData?.[agentId];
  if (!agentHistory) return [];

  const monthly = computeMonthlyAggregates(agentHistory);
  const hits: RepeatOffenderMetricHit[] = [];
  for (const metric of selectedMetrics) {
    const target = targets?.[metric];
    if (!target) continue;
    const streak = getConsecutiveMissStreak(monthly, metric, target.target, target.reverse);
    if (streak.streakMonths.length >= 2) {
      hits.push(streakToHit(metric, target, streak));
    }
  }
  return hits;
};

/**
 * One pass over the roster: per-agent hits plus a per-supervisor count for the
 * badge on the Team Roster. Returns empty maps when the feature is off
 * (no selected metrics), so callers never special-case it.
 */
export const computeRepeatOffenders = (
  agents: RepeatOffenderAgentRef[],
  historicalData: HistoricalData | undefined | null,
  targets: RepeatOffenderTargets,
  selectedMetrics: string[]
): RepeatOffendersResult => {
  const byAgent = new Map<string, RepeatOffenderMetricHit[]>();
  const bySupervisor = new Map<string, RepeatOffendersBySupervisor>();

  if (!selectedMetrics?.length || !agents?.length || !historicalData) {
    return { byAgent, bySupervisor };
  }

  for (const agent of agents) {
    const hits = getRepeatOffendersForAgent(agent.ccms, historicalData, targets, selectedMetrics);
    if (hits.length === 0) continue;
    byAgent.set(agent.ccms, hits);

    const supervisor = agent.supervisor || '';
    if (supervisor) {
      const entry = bySupervisor.get(supervisor) || { agentCount: 0, agentNames: [] };
      entry.agentCount += 1;
      entry.agentNames.push(agent.name || agent.ccms);
      bySupervisor.set(supervisor, entry);
    }
  }

  return { byAgent, bySupervisor };
};
