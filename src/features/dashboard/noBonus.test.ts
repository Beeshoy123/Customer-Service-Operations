// noBonus.test.ts: the Bonus Score was removed from the dashboard (his decision, 2026-11-14).
// These tests keep it out: not a metric, not in the Trends dropdown, not in any
// aggregate, and not part of the Repeated Offenders rule.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { METRIC_CONFIG, getDynamicTarget } from './config';
import { aggregateRecords, aggregateTeamMetrics } from './helpers';
import { UI_INITIAL } from './uiReducer';
import { computeMonthlyAggregates, getLatestMonths, getRepeatHitsForAgent } from './repeatOffenders';
import type { HistoricalData } from './repeatOffenders';

// A day that has every input the old bonus needed (C-Sat, 3-day resolve, hand-offs).
const fullDay = { calls: 100, vxs: 50, resolve3d: 50, handoffsCount: 30 };

describe('Bonus Score is gone', () => {
  it('is not a metric: no config entry and no target', () => {
    assert.equal(Object.hasOwn(METRIC_CONFIG, 'bonus'), false);
    assert.equal(getDynamicTarget('bonus', 1), undefined);
  });

  it('the Trends tab lists only real metrics and starts on one of them', () => {
    // FloorTrendsTab builds its dropdown from Object.keys(METRIC_CONFIG).
    const options = Object.keys(METRIC_CONFIG);
    assert.equal(options.includes('bonus'), false);
    assert.equal(UI_INITIAL.runChartMetric, 'vxs');
    assert.ok(options.includes(UI_INITIAL.runChartMetric));
  });

  it('agent, team and day-off aggregates carry no bonus field', () => {
    const agent = aggregateRecords([fullDay]);
    assert.equal('bonus' in agent, false);
    assert.equal('bonus' in aggregateRecords([]), false);
    assert.equal('bonus' in aggregateTeamMetrics([agent]), false);
    assert.equal('bonus' in aggregateTeamMetrics([]), false);
  });

  it('the Repeated Offenders rule never reports a bonus hit, and still reports real metrics', () => {
    // Same target map metrics.ts builds: every METRIC_CONFIG entry that has a target.
    const targets: Record<string, { target: number; reverse: boolean; label?: string; format?: string }> = {};
    for (const [key, cfg] of Object.entries(METRIC_CONFIG as Record<string, any>)) {
      const target = getDynamicTarget(key, 1);
      if (target === undefined) continue;
      targets[key] = { target, reverse: Boolean(cfg.reverse), label: cfg.label, format: cfg.format ?? '' };
    }
    const data: HistoricalData = {
      a1: { '2026-08-15': { ...fullDay }, '2026-09-15': { ...fullDay }, '2026-10-15': { ...fullDay } },
    } as HistoricalData;
    const windowMonths = getLatestMonths(data, ['a1']);
    assert.equal(windowMonths.length, 3);
    assert.ok(Object.keys(computeMonthlyAggregates(data.a1, windowMonths)).length > 0);

    const metrics = getRepeatHitsForAgent('a1', data, targets, windowMonths).map((h) => h.metric);
    assert.equal(metrics.includes('bonus'), false);
    assert.ok(metrics.includes('vxs'), `C-Sat 50 vs target 88 for 3 months should still flag; got ${metrics}`);
  });
});
