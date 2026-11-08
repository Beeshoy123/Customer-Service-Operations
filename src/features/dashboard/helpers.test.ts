// helpers.test.ts — pins the hand-offs calculation contract.
//
// Hand-offs is a RATE: transfers ÷ calls × 100.
// - Agent level (`aggregateRecords`) derives it from a raw transfer count, or
//   round-trips an existing rate column untouched.
// - Team level (`aggregateTeamMetrics`) must aggregate the same way —
//   call-weighted (total transfers ÷ total calls) — never as an unweighted
//   mean of per-agent percentages, which misstates the floor-wide rate when
//   agents differ in call volume.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRecords, aggregateTeamMetrics } from './helpers';

const near = (actual: number | null | undefined, expected: number, label = '') => {
  assert.ok(typeof actual === 'number', `${label ? label + ': ' : ''}expected a number, got ${actual}`);
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label ? label + ': ' : ''}expected ~${expected}, got ${actual}`
  );
};

describe('aggregateRecords — agent hand-offs (transfers ÷ calls)', () => {
  it('derives the rate from a raw transfer count', () => {
    const data = aggregateRecords([{ calls: 200, handoffsCount: 10 }]);
    near(data.handoffs, 5, 'handoffs%');
    near(data.handoffsCount, 10, 'handoffsCount');
  });

  it('round-trips a rate column without changing it', () => {
    const data = aggregateRecords([{ calls: 200, handoffs: 5 }]);
    near(data.handoffs, 5, 'handoffs%');
    near(data.handoffsCount, 10, 'reconstructed count');
  });

  it('returns null when no record carries hand-off data', () => {
    const data = aggregateRecords([{ calls: 200 }]);
    assert.equal(data.handoffs, null);
  });
});

describe('aggregateTeamMetrics — team hand-offs aggregation', () => {
  it('weights agents by call volume (total transfers ÷ total calls)', () => {
    // An unweighted mean of the two agent rates would be 5%;
    // the floor-wide rate is (90 + 0) / (900 + 100) = 9%.
    const team = aggregateTeamMetrics([
      { calls: 900, handoffs: 10, handoffsCount: 90 },
      { calls: 100, handoffs: 0, handoffsCount: 0 },
    ]);
    near(team.handoffs, 9, 'handoffs%');
  });

  it('includes count-only rows (raw transfer count, no rate column)', () => {
    const team = aggregateTeamMetrics([
      { calls: 500, handoffsCount: 50 },
      { calls: 500, handoffs: 10, handoffsCount: 50 },
    ]);
    near(team.handoffs, 10, 'handoffs%');
    near(team.handoffsCount, 100, 'total transfers');
  });

  it('does not dilute the rate with agents that have no hand-off data', () => {
    const team = aggregateTeamMetrics([
      { calls: 900, handoffs: 10, handoffsCount: 90 },
      { calls: 100 },
    ]);
    near(team.handoffs, 10, 'handoffs%');
  });

  it('excludes off-duty agents', () => {
    const team = aggregateTeamMetrics([
      { isOff: true, calls: 100, handoffs: 50, handoffsCount: 50 },
      { calls: 900, handoffs: 10, handoffsCount: 90 },
    ]);
    near(team.handoffs, 10, 'handoffs%');
  });

  it('returns null when no agent has hand-off data', () => {
    const team = aggregateTeamMetrics([{ calls: 100 }, { calls: 200 }]);
    assert.equal(team.handoffs, null);
  });
});

describe('Step 2: no invented survey counts (the 5% rule is gone)', () => {
  it('a day with only a VXS % has NO surveys or promoters, but the agent still shows that %', () => {
    const r: any = aggregateRecords([{ calls: 100, vxs: 90 }]);
    assert.equal(r.surveys, 0);
    assert.equal(r.promoters, 0);
    assert.equal(r.detractors, 0);
    assert.equal(r.vxs, 90);
  });

  it('several VXS-only days show the plain mean of the reported % (nothing invented)', () => {
    const r: any = aggregateRecords([{ calls: 100, vxs: 80 }, { calls: 900, vxs: 90 }]);
    assert.equal(r.surveys, 0);
    assert.equal(r.vxs, 85);
  });

  it('real counts are used as before (25 of 50 = 50%)', () => {
    const r: any = aggregateRecords([{ calls: 100, surveys: 50, promoters: 25, vxs: 50 }]);
    assert.equal(r.surveys, 50);
    assert.equal(r.promoters, 25);
    assert.equal(r.vxs, 50);
  });

  it('days with real counts and days with only a %: only the real counts are used', () => {
    const r: any = aggregateRecords([
      { calls: 100, surveys: 50, promoters: 25, vxs: 50 },
      { calls: 1000, vxs: 95 },
    ]);
    assert.equal(r.surveys, 50);
    assert.equal(r.vxs, 50);
  });

  it('floor: a 1,000-call VXS-only agent does not outweigh an agent with real 25/50', () => {
    const floor: any = aggregateTeamMetrics([
      { calls: 1000, vxs: 90 },
      { calls: 100, surveys: 50, promoters: 25, vxs: 50 },
    ]);
    assert.equal(floor.surveys, 50);
    assert.equal(floor.vxs, 50);
  });

  it('floor: two agents, 100 calls each, one VXS-only 90% and one real 25/50 -> 50% (was 53.6%)', () => {
    const floor: any = aggregateTeamMetrics([
      aggregateRecords([{ calls: 100, vxs: 90 }]),
      aggregateRecords([{ calls: 100, surveys: 50, promoters: 25, vxs: 50 }]),
    ]);
    assert.equal(floor.surveys, 50);
    assert.equal(floor.vxs, 50);
  });

  it('floor with no survey counts at all is blank (null), not a made-up number', () => {
    const floor: any = aggregateTeamMetrics([
      aggregateRecords([{ calls: 100, vxs: 90 }]),
      aggregateRecords([{ calls: 100, vxs: 70 }]),
    ]);
    assert.equal(floor.surveys, 0);
    assert.equal(floor.vxs, null);
  });
});
