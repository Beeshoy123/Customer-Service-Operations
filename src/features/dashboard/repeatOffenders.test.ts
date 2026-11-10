import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPEAT_WINDOW_MONTHS,
  REPEAT_MIN_MISSES,
  isMissedTarget,
  groupAgentDatesByMonth,
  computeMonthlyAggregates,
  getLatestMonths,
  getRepeatHit,
  getRepeatHitsForAgent,
  computeRepeatOffenders,
  missLabel,
  shortMonthLabel,
} from './repeatOffenders';
import type { HistoricalData } from './repeatOffenders';

// ONE concept: "Repeated". An agent is flagged for a metric when it missed target in
// 2 or more of the LATEST 3 months loaded (not necessarily back-to-back).
// Every expected value below was worked out by hand first.
//
// Targets mirror config.ts: vxs 88 (higher is better), aht 1100 (lower is better /
// reverse), matching MetricCell's pass/fail rule. calls: 100 makes aggregateRecords
// return vxs exactly.
const TARGETS = {
  vxs: { target: 88, reverse: false, label: 'C-Sat', format: '' },
  aht: { target: 1100, reverse: true, label: 'AHT', format: '' },
};

const day = (record: Record<string, any>) => ({ calls: 100, ...record });

/** One agent, one day record per month (the 15th). */
const oneAgent = (id: string, months: Record<string, any>): HistoricalData => {
  const agentHistory: Record<string, any> = {};
  for (const [month, record] of Object.entries(months)) agentHistory[`${month}-15`] = day(record);
  return { [id]: agentHistory };
};

/** Merge several single-agent histories into one floor. */
const floor = (...parts: HistoricalData[]): HistoricalData => Object.assign({}, ...parts);

const hitFor = (data: HistoricalData, id: string, metric = 'vxs') => {
  const windowMonths = getLatestMonths(data, Object.keys(data));
  const monthly = computeMonthlyAggregates(data[id], windowMonths);
  return getRepeatHit(monthly, metric, TARGETS[metric as 'vxs' | 'aht'], windowMonths);
};

describe('repeatOffenders: 2 of the latest 3 months', () => {
  it('the rule is 2 misses in a window of 3 months', () => {
    assert.equal(REPEAT_WINDOW_MONTHS, 3);
    assert.equal(REPEAT_MIN_MISSES, 2);
  });

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

  describe('computeMonthlyAggregates: REAL per-month data, not blended', () => {
    it('aggregates each month separately', () => {
      const hist = oneAgent('A1', { '2026-03': { vxs: 80 }, '2026-05': { vxs: 95 } });
      const agg = computeMonthlyAggregates(hist.A1);
      assert.deepEqual(Object.keys(agg).sort(), ['2026-03', '2026-05']);
      assert.equal(Math.round(agg['2026-03'].vxs), 80);
      assert.equal(Math.round(agg['2026-05'].vxs), 95);
    });

    it('aggregates multiple days of one month into one value', () => {
      const agentHistory = { '2026-04-10': day({ vxs: 80 }), '2026-04-11': day({ vxs: 84 }) };
      const agg = computeMonthlyAggregates(agentHistory);
      assert.equal(Object.keys(agg).length, 1);
      assert.ok(Math.abs(agg['2026-04'].vxs - 82) < 0.01);
    });

    it('only aggregates the months asked for', () => {
      const hist = oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 81 }, '2026-03': { vxs: 82 } });
      const agg = computeMonthlyAggregates(hist.A1, ['2026-02', '2026-03']);
      assert.deepEqual(Object.keys(agg).sort(), ['2026-02', '2026-03']);
    });

    it('ignores malformed date keys', () => {
      const bad = { 'bogus-date': day({ vxs: 80 }), notadate: day({ vxs: 80 }) };
      assert.deepEqual(groupAgentDatesByMonth(bad), {});
      assert.deepEqual(computeMonthlyAggregates(bad), {});
    });
  });

  describe('getLatestMonths: the window is the latest 3 months LOADED', () => {
    it('five months loaded: the last three, oldest first', () => {
      const data = oneAgent('A1', {
        '2026-01': { vxs: 90 }, '2026-02': { vxs: 90 }, '2026-03': { vxs: 90 },
        '2026-04': { vxs: 90 }, '2026-05': { vxs: 90 },
      });
      assert.deepEqual(getLatestMonths(data, ['A1']), ['2026-03', '2026-04', '2026-05']);
    });

    it('fewer than three months loaded: all of them', () => {
      const data = oneAgent('A1', { '2026-04': { vxs: 90 }, '2026-05': { vxs: 90 } });
      assert.deepEqual(getLatestMonths(data, ['A1']), ['2026-04', '2026-05']);
    });

    it('a month that was never loaded is skipped (Jan, Feb, Apr loaded)', () => {
      const data = oneAgent('A1', { '2026-01': { vxs: 90 }, '2026-02': { vxs: 90 }, '2026-04': { vxs: 90 } });
      assert.deepEqual(getLatestMonths(data, ['A1']), ['2026-01', '2026-02', '2026-04']);
    });

    it('uses every agent: the floor decides what "latest" means', () => {
      const data = floor(
        oneAgent('A1', { '2026-01': { vxs: 90 } }),
        oneAgent('A2', { '2026-02': { vxs: 90 }, '2026-03': { vxs: 90 }, '2026-04': { vxs: 90 } }),
      );
      assert.deepEqual(getLatestMonths(data, ['A1', 'A2']), ['2026-02', '2026-03', '2026-04']);
    });

    it('no data, or only malformed keys: empty', () => {
      assert.deepEqual(getLatestMonths(null, ['A1']), []);
      assert.deepEqual(getLatestMonths({ A1: { bogus: day({ vxs: 80 }) } }, ['A1']), []);
    });
  });

  describe('the rule (vxs target 88, higher is better)', () => {
    it('A: miss, pass, miss = 2 of 3, flagged (NOT back-to-back)', () => {
      const hit = hitFor(oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 92 }, '2026-03': { vxs: 79 } }), 'A1');
      assert.ok(hit);
      assert.equal(hit!.missCount, 2);
      assert.deepEqual(hit!.windowMonths.map((m) => m.month), ['2026-01', '2026-02', '2026-03']);
      assert.deepEqual(hit!.windowMonths.map((m) => m.missed), [true, false, true]);
    });

    it('B: miss, miss, pass = 2 of 3, flagged', () => {
      const hit = hitFor(oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 85 }, '2026-03': { vxs: 92 } }), 'A1');
      assert.ok(hit);
      assert.equal(hit!.missCount, 2);
    });

    it('C: pass, miss, pass = 1 of 3, not flagged', () => {
      assert.equal(hitFor(oneAgent('A1', { '2026-01': { vxs: 92 }, '2026-02': { vxs: 80 }, '2026-03': { vxs: 95 } }), 'A1'), null);
    });

    it('miss, miss, miss = 3 of 3', () => {
      const hit = hitFor(oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 81 }, '2026-03': { vxs: 82 } }), 'A1');
      assert.equal(hit!.missCount, 3);
    });

    it('keeps the month values so the screen can show them', () => {
      const hit = hitFor(oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 92 }, '2026-03': { vxs: 79 } }), 'A1');
      assert.deepEqual(hit!.windowMonths.map((m) => Math.round(m.value as number)), [80, 92, 79]);
      assert.equal(hit!.target, 88);
      assert.equal(hit!.label, 'C-Sat');
    });

    it('equal to target passes: 88, 88, 80 = 1 of 3, not flagged', () => {
      assert.equal(hitFor(oneAgent('A1', { '2026-01': { vxs: 88 }, '2026-02': { vxs: 88 }, '2026-03': { vxs: 80 } }), 'A1'), null);
    });

    it('old misses outside the window do not count: miss, miss (Jan, Feb), then pass x3', () => {
      const data = oneAgent('A1', {
        '2026-01': { vxs: 70 }, '2026-02': { vxs: 71 },
        '2026-03': { vxs: 95 }, '2026-04': { vxs: 95 }, '2026-05': { vxs: 95 },
      });
      assert.equal(hitFor(data, 'A1'), null);
    });

    it('an old miss pair is forgotten, a recent pair counts: window is Mar, Apr, May', () => {
      const data = oneAgent('A1', {
        '2026-01': { vxs: 95 }, '2026-02': { vxs: 95 },
        '2026-03': { vxs: 80 }, '2026-04': { vxs: 95 }, '2026-05': { vxs: 80 },
      });
      const hit = hitFor(data, 'A1');
      assert.equal(hit!.missCount, 2);
      assert.deepEqual(hit!.windowMonths.map((m) => m.month), ['2026-03', '2026-04', '2026-05']);
    });
  });

  describe('edge cases', () => {
    it('only 1 month loaded: never flagged', () => {
      assert.equal(hitFor(oneAgent('A1', { '2026-06': { vxs: 80 } }), 'A1'), null);
    });

    it('only 2 months loaded, both missed: flagged (2 of 2)', () => {
      const hit = hitFor(oneAgent('A1', { '2026-05': { vxs: 80 }, '2026-06': { vxs: 81 } }), 'A1');
      assert.equal(hit!.missCount, 2);
      assert.equal(hit!.windowMonths.length, 2);
    });

    it('only 2 months loaded, one missed: not flagged', () => {
      assert.equal(hitFor(oneAgent('A1', { '2026-05': { vxs: 80 }, '2026-06': { vxs: 95 } }), 'A1'), null);
    });

    it('a month with no data for this agent is not a miss: miss, (no data), miss = 2 of 3, flagged', () => {
      const data = floor(
        oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-03': { vxs: 79 } }),
        oneAgent('A2', { '2026-01': { vxs: 95 }, '2026-02': { vxs: 95 }, '2026-03': { vxs: 95 } }), // Feb exists for the floor
      );
      const hit = hitFor(data, 'A1');
      assert.ok(hit);
      assert.equal(hit!.missCount, 2);
      assert.equal(hit!.windowMonths[1].value, null);
      assert.equal(hit!.windowMonths[1].missed, false);
    });

    it('miss, (no data), pass = 1 of 3, not flagged', () => {
      const data = floor(
        oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-03': { vxs: 95 } }),
        oneAgent('A2', { '2026-02': { vxs: 95 } }),
      );
      assert.equal(hitFor(data, 'A1'), null);
    });

    it('a month loaded for the floor but empty for the metric is not a miss (value missing, not 0)', () => {
      // Feb record has AHT but no vxs at all: vxs must stay "not evaluable", never 0.
      const data = oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { aht: 900 }, '2026-03': { vxs: 95 } });
      assert.equal(hitFor(data, 'A1', 'vxs'), null);
    });

    it('months Jan, Feb, Apr loaded (Mar never loaded): window is those three, Jan + Apr missed = flagged', () => {
      const data = oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 95 }, '2026-04': { vxs: 79 } });
      const hit = hitFor(data, 'A1');
      assert.equal(hit!.missCount, 2);
      assert.deepEqual(hit!.windowMonths.map((m) => m.month), ['2026-01', '2026-02', '2026-04']);
    });

    it('an agent who left (no data in the latest 3 floor months) is not flagged', () => {
      const data = floor(
        oneAgent('LEFT', { '2026-01': { vxs: 70 }, '2026-02': { vxs: 71 } }),
        oneAgent('STAY', { '2026-01': { vxs: 95 }, '2026-02': { vxs: 95 }, '2026-03': { vxs: 95 }, '2026-04': { vxs: 95 }, '2026-05': { vxs: 95 } }),
      );
      assert.equal(hitFor(data, 'LEFT'), null);
    });

    it('reverse metric (AHT target 1100): 1300, 1050, 1250 = 2 of 3, flagged', () => {
      const data = oneAgent('A1', { '2026-01': { aht: 1300 }, '2026-02': { aht: 1050 }, '2026-03': { aht: 1250 } });
      assert.equal(hitFor(data, 'A1', 'aht')!.missCount, 2);
    });

    it('reverse metric: equal to target passes: 1100, 1100, 1300 = 1 of 3', () => {
      const data = oneAgent('A1', { '2026-01': { aht: 1100 }, '2026-02': { aht: 1100 }, '2026-03': { aht: 1300 } });
      assert.equal(hitFor(data, 'A1', 'aht'), null);
    });
  });

  describe('getRepeatHitsForAgent: all metrics at once', () => {
    it('returns only the metrics that qualify', () => {
      const data = oneAgent('A1', {
        '2026-01': { vxs: 80, aht: 900 },
        '2026-02': { vxs: 81, aht: 950 },
        '2026-03': { vxs: 95, aht: 1000 },
      });
      const windowMonths = getLatestMonths(data, ['A1']);
      const hits = getRepeatHitsForAgent('A1', data, TARGETS, windowMonths);
      assert.deepEqual(hits.map((h) => h.metric), ['vxs']);
    });

    it('unknown agent, no history or no targets: empty', () => {
      const data = oneAgent('A1', { '2026-01': { vxs: 80 } });
      assert.deepEqual(getRepeatHitsForAgent('NOPE', data, TARGETS, ['2026-01']), []);
      assert.deepEqual(getRepeatHitsForAgent('A1', null, TARGETS, ['2026-01']), []);
      assert.deepEqual(getRepeatHitsForAgent('A1', data, {}, ['2026-01']), []);
    });

    it('a target that is not a finite number is skipped', () => {
      const data = oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 81 }, '2026-03': { vxs: 82 } });
      const hits = getRepeatHitsForAgent('A1', data, { vxs: { target: NaN, reverse: false } }, ['2026-01', '2026-02', '2026-03']);
      assert.deepEqual(hits, []);
    });
  });

  describe('computeRepeatOffenders: one pass for every screen', () => {
    const agents = [
      { ccms: 'A1', name: 'Zed Fake', supervisor: 'Sup One' },
      { ccms: 'A2', name: 'Amy Fake', supervisor: 'Sup One' },
      { ccms: 'A3', name: 'Bob Fake', supervisor: 'Sup Two' },
      { ccms: 'A4', name: 'Cat Fake', supervisor: '' },
      { ccms: 'A5', name: 'Dan Fake', supervisor: 'Sup Two' },
    ];
    const data = floor(
      // A1: vxs missed 3 of 3
      oneAgent('A1', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 81 }, '2026-03': { vxs: 82 } }),
      // A2: vxs missed 2 of 3 (miss, pass, miss)
      oneAgent('A2', { '2026-01': { vxs: 80 }, '2026-02': { vxs: 95 }, '2026-03': { vxs: 81 } }),
      // A3: fine
      oneAgent('A3', { '2026-01': { vxs: 95 }, '2026-02': { vxs: 95 }, '2026-03': { vxs: 95 } }),
      // A4: aht missed 2 of 3, no supervisor
      oneAgent('A4', { '2026-01': { aht: 1300 }, '2026-02': { aht: 1050 }, '2026-03': { aht: 1250 } }),
      // A5: no history at all
    );
    const result = computeRepeatOffenders(agents, data, TARGETS);

    it('window months are the latest 3 loaded', () => {
      assert.deepEqual(result.windowMonths, ['2026-01', '2026-02', '2026-03']);
    });

    it('rows: only offenders, worst first, then by name', () => {
      assert.deepEqual(result.rows.map((r) => r.ccms), ['A1', 'A2', 'A4']);
      assert.deepEqual(result.rows.map((r) => r.maxMisses), [3, 2, 2]);
      assert.equal(result.rows[0].primaryHit.metric, 'vxs');
    });

    it('byAgent has the same offenders', () => {
      assert.deepEqual([...result.byAgent.keys()].sort(), ['A1', 'A2', 'A4']);
    });

    it('bySupervisor counts offenders per supervisor; no supervisor is not counted', () => {
      assert.deepEqual(result.bySupervisor.get('Sup One'), { agentCount: 2, agentNames: ['Zed Fake', 'Amy Fake'] });
      assert.equal(result.bySupervisor.has('Sup Two'), false);
      assert.equal(result.bySupervisor.has(''), false);
    });

    it('summary numbers', () => {
      assert.equal(result.summary.totalOffenders, 3);
      assert.equal(result.summary.missedAllCount, 1); // A1 missed all 3 loaded months
      assert.equal(result.summary.topKpiMetric, 'vxs'); // A1 + A2 = 2 vs aht 1
      assert.equal(result.summary.topKpiLabel, 'C-Sat');
      assert.equal(result.summary.topKpiCount, 2);
      assert.deepEqual(result.summary.supervisors, ['Sup One']);
      assert.deepEqual(result.summary.kpis.map((k) => k.metric), ['vxs', 'aht']);
    });

    it('empty or missing input gives an empty result, never a crash', () => {
      for (const r of [
        computeRepeatOffenders([], data, TARGETS),
        computeRepeatOffenders(agents, null, TARGETS),
        computeRepeatOffenders(agents, {}, TARGETS),
        computeRepeatOffenders(undefined as any, data, TARGETS),
      ]) {
        assert.equal(r.rows.length, 0);
        assert.equal(r.byAgent.size, 0);
        assert.equal(r.summary.totalOffenders, 0);
        assert.equal(r.summary.topKpiLabel, '—');
      }
    });
  });

  describe('labels', () => {
    it('missLabel', () => {
      assert.equal(missLabel(2, 3), '2 of 3 months');
      assert.equal(missLabel(3, 3), '3 of 3 months');
      assert.equal(missLabel(2, 2), '2 of 2 months');
    });

    it('shortMonthLabel', () => {
      assert.equal(shortMonthLabel('2026-01'), 'Jan');
      assert.equal(shortMonthLabel('2026-09'), 'Sep');
      assert.equal(shortMonthLabel(''), '?');
    });
  });
});
