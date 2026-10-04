import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMissedTarget,
  groupAgentDatesByMonth,
  computeMonthlyAggregates,
  getConsecutiveMissStreak,
  getRepeatOffender,
  getRepeatOffendersForAgent,
  computeRepeatOffenders,
  nextMonthKey,
} from './repeatOffenders';
import type { HistoricalData } from './repeatOffenders';

// Targets mirror config.ts TARGETS: vxs 88 (higher is better),
// aht 1100 (lower is better / reverse), matching MetricCell's pass/fail rule.
const TARGETS_RO = {
  vxs: { target: 88, reverse: false, label: 'C-Sat', format: '' },
  aht: { target: 1100, reverse: true, label: 'AHT', format: '' },
};

// Builds a one-agent historicalData where each month maps to day record(s).
// Day records use calls: 100 so aggregateRecords round-trips vxs exactly
// (5 simulated surveys × vxs/100 → promoters/surveys × 100 === vxs).
const history = (months: Record<string, any | any[]>): HistoricalData => {
  const agentHistory: Record<string, any> = {};
  for (const [month, records] of Object.entries(months)) {
    const list = Array.isArray(records) ? records : [records];
    list.forEach((record, idx) => {
      agentHistory[`${month}-${String(10 + idx).padStart(2, '0')}`] = record;
    });
  }
  return { A1: agentHistory };
};

const day = (record: Record<string, any>) => ({ calls: 100, ...record });

describe('repeatOffenders — pure streak detection', () => {
  describe('isMissedTarget (exact inverse of MetricCell pass/fail)', () => {
    it('normal metrics miss BELOW target; equality passes', () => {
      assert.equal(isMissedTarget(80, 88, false), true);
      assert.equal(isMissedTarget(92, 88, false), false);
      assert.equal(isMissedTarget(88, 88, false), false);
    });

    it('reverse metrics (AHT, hand-offs) miss ABOVE target; equality passes', () => {
      assert.equal(isMissedTarget(1300, 1100, true), true);
      assert.equal(isMissedTarget(1050, 1100, true), false);
      assert.equal(isMissedTarget(1100, 1100, true), false);
    });

    it('non-evaluable values (null/undefined/empty/NaN) are never misses', () => {
      assert.equal(isMissedTarget(null, 88, false), false);
      assert.equal(isMissedTarget(undefined, 88, false), false);
      assert.equal(isMissedTarget('', 88, false), false);
      assert.equal(isMissedTarget('not-a-number', 88, false), false);
      assert.equal(isMissedTarget(null, 1100, true), false);
    });

    it('accepts numeric strings', () => {
      assert.equal(isMissedTarget('80', 88, false), true);
    });
  });

  describe('nextMonthKey (calendar adjacency)', () => {
    it('walks months and rolls the year over', () => {
      assert.equal(nextMonthKey('2026-04'), '2026-05');
      assert.equal(nextMonthKey('2026-12'), '2027-01');
    });
  });

  describe('computeMonthlyAggregates — REAL per-month data, not blended', () => {
    it('aggregates each month separately via the same aggregateRecords the month filter uses', () => {
      const hist = history({
        '2026-03': day({ vxs: 80 }),
        '2026-05': day({ vxs: 95 }),
      });
      const agg = computeMonthlyAggregates(hist.A1);

      assert.deepEqual(Object.keys(agg).sort(), ['2026-03', '2026-05']);
      assert.equal(Math.round(agg['2026-03'].vxs), 80);
      assert.equal(Math.round(agg['2026-05'].vxs), 95);
      // A blended all-months view would show 87.5 for both — it must not.
      assert.notEqual(Math.round(agg['2026-03'].vxs), Math.round(agg['2026-05'].vxs));
    });

    it('aggregates multiple days within one month into a single month value', () => {
      const hist = history({
        '2026-04': [day({ vxs: 80 }), day({ vxs: 84 })],
      });
      const agg = computeMonthlyAggregates(hist.A1);
      assert.equal(Object.keys(agg).length, 1);
      assert.ok(Math.abs(agg['2026-04'].vxs - 82) < 0.01);
    });

    it('ignores malformed date keys', () => {
      const hist: HistoricalData = { A1: { 'bogus-date': day({ vxs: 80 }), notadate: day({ vxs: 80 }) } };
      assert.deepEqual(groupAgentDatesByMonth(hist.A1), {});
      assert.deepEqual(computeMonthlyAggregates(hist.A1), {});
    });
  });

  describe('required edge cases', () => {
    it('(a) an agent with only 1 month of data can never be a repeat offender', () => {
      const hist = history({ '2026-06': day({ vxs: 80 }) }); // below target
      const result = getRepeatOffender('A1', 'vxs', hist, TARGETS_RO, ['vxs']);

      assert.equal(result.isRepeatOffender, false);
      assert.equal(result.streakLength, 0);
      assert.deepEqual(result.streakMonths, []);
      assert.deepEqual(result.values, []);
    });

    it('(b) below in March, ABOVE in April, below in May → NOT flagged (must be back-to-back)', () => {
      const hist = history({
        '2026-03': day({ vxs: 80 }),
        '2026-04': day({ vxs: 92 }), // recovers above target — breaks the run
        '2026-05': day({ vxs: 79 }),
      });
      const result = getRepeatOffender('A1', 'vxs', hist, TARGETS_RO, ['vxs']);

      assert.equal(result.isRepeatOffender, false);
      assert.equal(result.streakLength, 0);
      assert.deepEqual(result.streakMonths, []);
    });

    it('(c) 2+ consecutive months below → flagged with the exact streak months', () => {
      const hist = history({
        '2026-03': day({ vxs: 85 }),
        '2026-04': day({ vxs: 84 }),
        '2026-05': day({ vxs: 80 }),
      });
      const result = getRepeatOffender('A1', 'vxs', hist, TARGETS_RO, ['vxs']);

      assert.equal(result.isRepeatOffender, true);
      assert.equal(result.streakLength, 3);
      assert.deepEqual(result.streakMonths, ['2026-03', '2026-04', '2026-05']);
      assert.equal(result.metric, 'vxs');
      assert.equal(result.label, 'C-Sat');
      assert.equal(result.target, 88);
      assert.equal(result.reverse, false);
      assert.equal(result.values.length, 3);
      assert.ok(Math.abs(result.values[0].value - 85) < 0.01);
      assert.ok(Math.abs(result.values[2].value - 80) < 0.01);
    });

    it('(d) reverse metrics: AHT ABOVE target counts as missing; recovery breaks the streak', () => {
      const flagged = history({
        '2026-04': day({ aht: 1300 }),
        '2026-05': day({ aht: 1250 }),
      });
      const result = getRepeatOffender('A1', 'aht', flagged, TARGETS_RO, ['aht']);
      assert.equal(result.isRepeatOffender, true);
      assert.equal(result.streakLength, 2);
      assert.deepEqual(result.streakMonths, ['2026-04', '2026-05']);

      const recovered = history({
        '2026-04': day({ aht: 1300 }),
        '2026-05': day({ aht: 1050 }), // back under target
      });
      assert.equal(getRepeatOffender('A1', 'aht', recovered, TARGETS_RO, ['aht']).isRepeatOffender, false);

      const atTarget = history({
        '2026-04': day({ aht: 1100 }),
        '2026-05': day({ aht: 1100 }),
      });
      assert.equal(getRepeatOffender('A1', 'aht', atTarget, TARGETS_RO, ['aht']).isRepeatOffender, false);
    });

    it('(e) strict calendar adjacency: missing April (Mar & May below) → NOT flagged', () => {
      const hist = history({
        '2026-03': day({ vxs: 80 }),
        // no 2026-04 data at all
        '2026-05': day({ vxs: 79 }),
      });
      const result = getRepeatOffender('A1', 'vxs', hist, TARGETS_RO, ['vxs']);
      assert.equal(result.isRepeatOffender, false);
      assert.equal(result.streakLength, 0);
    });

    it('a month with no evaluable value for the metric breaks the streak', () => {
      const hist = history({
        '2026-03': day({ vxs: 80 }),
        '2026-04': day({}), // calls but no surveys → vxs null
        '2026-05': day({ vxs: 79 }),
      });
      const result = getRepeatOffender('A1', 'vxs', hist, TARGETS_RO, ['vxs']);
      assert.equal(result.isRepeatOffender, false);
    });

    it('when two qualifying runs exist, the most recent streak is reported', () => {
      const hist = history({
        '2026-03': day({ vxs: 80 }),
        '2026-04': day({ vxs: 81 }),
        '2026-05': day({ vxs: 95 }), // pass breaks the run
        '2026-06': day({ vxs: 82 }),
        '2026-07': day({ vxs: 83 }),
      });
      const result = getRepeatOffender('A1', 'vxs', hist, TARGETS_RO, ['vxs']);
      assert.equal(result.isRepeatOffender, true);
      assert.deepEqual(result.streakMonths, ['2026-06', '2026-07']);
    });
  });

  describe('configuration guards (selectedMetrics)', () => {
    const threeBelow = () =>
      history({
        '2026-04': day({ vxs: 85 }),
        '2026-05': day({ vxs: 84 }),
        '2026-06': day({ vxs: 80 }),
      });

    it('metric not in selectedMetrics is never flagged', () => {
      const result = getRepeatOffender('A1', 'vxs', threeBelow(), TARGETS_RO, ['aht']);
      assert.equal(result.isRepeatOffender, false);
    });

    it('empty selectedMetrics (feature off) never flags', () => {
      const result = getRepeatOffender('A1', 'vxs', threeBelow(), TARGETS_RO, []);
      assert.equal(result.isRepeatOffender, false);
      assert.deepEqual(getRepeatOffendersForAgent('A1', threeBelow(), TARGETS_RO, []), []);
    });

    it('a metric with no configured target is skipped', () => {
      const result = getRepeatOffender('A1', 'vxs', threeBelow(), {}, ['vxs']);
      assert.equal(result.isRepeatOffender, false);
    });

    it('getRepeatOffendersForAgent returns one hit per qualifying selected metric', () => {
      const hist = history({
        '2026-04': day({ vxs: 85, aht: 1300 }),
        '2026-05': day({ vxs: 84, aht: 1250 }),
      });
      const hits = getRepeatOffendersForAgent('A1', hist, TARGETS_RO, ['vxs', 'aht']);
      assert.equal(hits.length, 2);
      assert.deepEqual(hits.map((h) => h.metric).sort(), ['aht', 'vxs']);
      assert.ok(hits.every((h) => h.streakLength >= 2));
    });
  });

  describe('computeRepeatOffenders (roster-level rollup)', () => {
    const agents = [
      { ccms: 'A1', name: 'Alice', supervisor: 'Sup One' },
      { ccms: 'B2', name: 'Bob', supervisor: 'Sup One' },
      { ccms: 'C3', name: 'Carol', supervisor: 'Sup Two' },
    ];

    it('maps flagged agents and rolls a per-supervisor count for the roster badge', () => {
      const hist: HistoricalData = {
        A1: history({
          '2026-04': day({ vxs: 85 }),
          '2026-05': day({ vxs: 84 }),
        }).A1,
        B2: history({ '2026-04': day({ vxs: 99 }), '2026-05': day({ vxs: 97 }) }).A1,
        C3: history({ '2026-04': day({ vxs: 99 }), '2026-05': day({ vxs: 97 }) }).A1,
      };

      const { byAgent, bySupervisor } = computeRepeatOffenders(agents, hist, TARGETS_RO, ['vxs']);

      assert.equal(byAgent.size, 1);
      assert.ok(byAgent.has('A1'));
      assert.equal(bySupervisor.size, 1);
      assert.deepEqual(bySupervisor.get('Sup One'), { agentCount: 1, agentNames: ['Alice'] });
      assert.equal(bySupervisor.has('Sup Two'), false);
    });

    it('returns empty maps when the feature is off', () => {
      const { byAgent, bySupervisor } = computeRepeatOffenders(agents, {}, TARGETS_RO, []);
      assert.equal(byAgent.size, 0);
      assert.equal(bySupervisor.size, 0);
    });
  });

  describe('getConsecutiveMissStreak (unit-level)', () => {
    it('requires at least two calendar-adjacent misses', () => {
      const monthly = {
        '2026-04': { vxs: 80 },
        '2026-06': { vxs: 80 }, // gap at May
      };
      assert.deepEqual(getConsecutiveMissStreak(monthly, 'vxs', 88, false), {
        streakMonths: [],
        values: [],
      });
    });
  });
});
