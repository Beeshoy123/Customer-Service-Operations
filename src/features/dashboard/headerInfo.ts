// headerInfo.ts: the small pure pieces behind the workspace header
// (greeting, today's date, the "need attention" count). No React in here,
// so every piece can be tested on its own.
import { computeRepeatOffenders, type HistoricalData, type RepeatOffenderAgentRef, type RepeatOffenderTargets } from './repeatOffenders';

/** 0-11 morning, 12-17 afternoon, 18-23 evening (the browser's own clock). */
export const getGreeting = (now: Date): string => {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

/** Day first, as he reads dates: "Monday 9 November 2026". */
export const formatToday = (now: Date): string => {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const rest = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${weekday} ${rest}`;
};

/**
 * Agents who missed a KPI target in 2 or more of the latest 3 months (the same
 * rule as the Repeated Offenders tab). Returns null when the data cannot say:
 * no data loaded, or nobody qualifies. Null means "show nothing"; 0 is never
 * shown as "0 agents", because missing is not 0.
 */
export const countNeedAttention = (
  agents: RepeatOffenderAgentRef[] | undefined | null,
  historicalData: HistoricalData | undefined | null,
  targets: RepeatOffenderTargets
): number | null => {
  if (!Array.isArray(agents) || agents.length === 0 || !historicalData) return null;
  const { rows } = computeRepeatOffenders(agents, historicalData, targets);
  return rows.length > 0 ? rows.length : null;
};

export const attentionLabel = (count: number): string =>
  `${count.toLocaleString('en-US')} agent${count === 1 ? ' needs' : 's need'} attention`;
