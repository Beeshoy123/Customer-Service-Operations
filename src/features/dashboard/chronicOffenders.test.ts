import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHRONIC_MIN_STREAK,
  getChronicHitsForAgent,
  computeChronicOffenders,
  streakLabel,
  shortMonthLabel,
} from './chronicOffenders';
import type { HistoricalData } from './repeatOffenders';

// Same round-trip trick as repeatOffenders.test.ts: calls:100 makes
// aggregateRecords return vxs exactly. vxs target 88 (higher-is-better),
// aht target 1100 (reverse: lower-is-better).
const TARGETS = {
  vxs: { target: 88, reverse: false, label: 'C-Sat', format: '' },
  aht: { target: 1100, reverse: true, label: 'AHT', format: '' },
};

const history = (agentId: string, months: Record<string, any>): HistoricalData => {
  const agentHistory: Record<string, any> = {};
  for (const [month, record] of Object.entries(months)) {
    agentHistory[`${month}-15`] = { calls: 100, ...record };
  }
  return { [agentId]: agentHistory };
};

describe('chronicOffenders — 3+ consecutive month detection', () => {
  it('threshold is strictly more than 2 consecutive months', () => {
    assert.equal(CHRONIC_MIN_STREAK, 3);
  });

  it('2-month miss streak does NOT qualify (that is Repeated Offenders territory)', () => {
    const data = history('A1', {
      '2026-01': { vxs: 80 },
      '2026-02': { vxs: 85 },
    });
    assert.deepEqual(getChronicHitsForAgent('A1', data, TARGETS), []);
  });

  it('3-month miss streak qualifies with correct months and values', () => {
    const data = history('A1', {
      '2026-01': { vxs: 80 },
      '2026-02': { vxs: 85 },
      '2026-03': { vxs: 70 },
      '2026-04': { vxs: 95 }, // pass breaks the run
    });
    const hits = getChronicHitsForAgent('A1', data, TARGETS);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].metric, 'vxs');
    assert.equal(hits[0].streakLength, 3);
    assert.deepEqual(hits[0].streakMonths, ['2026-01', '2026-02', '2026-03']);
    assert.deepEqual(hits[0].values.map((v) => v.value), [80, 85, 70]);
  });

  it('calendar gap breaks chronology even when total misses >= 3', () => {
    const data = history('A1', {
      '2026-01': { vxs: 80 },
      '2026-02': { vxs: 80 },
      // March missing entirely (not imported)
      '2026-04': { vxs: 80 },
    });
    assert.deepEqual(getChronicHitsForAgent('A1', data, TARGETS), []);
  });

  it('reverse metrics (AHT) flag when value stays ABOVE target 3+ months', () => {
    const data = history('A1', {
      '2026-01': { aht: 1200 },
      '2026-02': { aht: 1300 },
      '2026-03': { aht: 1150 },
    });
    const hits = getChronicHitsForAgent('A1', data, TARGETS);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].metric, 'aht');
    assert.equal(hits[0].streakLength, 3);
  });

  it('multiple failing KPIs produce multiple hits; primary = longest streak', () => {
    const data = history('A1', {
      '2026-01': { vxs: 80, aht: 1200 },
      '2026-02': { vxs: 80, aht: 1200 },
      '2026-03': { vxs: 80, aht: 1200 },
      '2026-04': { vxs: 80, aht: 900 }, // aht recovers, vxs keeps failing
    });
    const { rows, summary } = computeChronicOffenders(
      [{ ccms: 'A1', name: 'Alice', supervisor: 'Sam' }],
      data,
      TARGETS
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].maxStreak, 4);
    assert.equal(rows[0].primaryHit.metric, 'vxs');
    assert.equal(summary.totalOffenders, 1);
    assert.equal(summary.avgStreak, 4);
    assert.equal(summary.topKpiLabel, 'C-Sat');
    assert.deepEqual(summary.supervisors, ['Sam']);
    assert.equal(summary.kpis.length, 2);
  });

  it('rows sort by streak length descending', () => {
    const long = history('A1', {
      '2026-01': { vxs: 50 }, '2026-02': { vxs: 50 }, '2026-03': { vxs: 50 }, '2026-04': { vxs: 50 },
    });
    const short = history('A2', {
      '2026-01': { vxs: 50 }, '2026-02': { vxs: 50 }, '2026-03': { vxs: 50 },
    });
    const merged: HistoricalData = { ...long, ...short };
    const { rows } = computeChronicOffenders(
      [
        { ccms: 'A2', name: 'Bob', supervisor: 'Sam' },
        { ccms: 'A1', name: 'Alice', supervisor: 'Kim' },
      ],
      merged,
      TARGETS
    );
    assert.deepEqual(rows.map((r) => r.ccms), ['A1', 'A2']);
    assert.equal(rows[0].maxStreak, 4);
    assert.equal(rows[1].maxStreak, 3);
  });

  it('empty inputs yield empty result without throwing', () => {
    const { rows, summary } = computeChronicOffenders([], null, TARGETS);
    assert.equal(rows.length, 0);
    assert.equal(summary.totalOffenders, 0);
    assert.equal(summary.topKpiLabel, '—');
  });

  it('streakLabel / shortMonthLabel helpers', () => {
    assert.equal(streakLabel(3), '3 Consecutive Months');
    assert.equal(streakLabel(1), '1 Consecutive Month');
    assert.equal(shortMonthLabel('2026-01'), 'Jan');
    assert.equal(shortMonthLabel('2026-12'), 'Dec');
  });
});
