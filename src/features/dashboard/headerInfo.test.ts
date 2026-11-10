import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getGreeting, formatToday, countNeedAttention, attentionLabel } from './headerInfo';
import type { HistoricalData } from './repeatOffenders';

const TARGETS = { vxs: { target: 88, reverse: false, label: 'C-Sat', format: '' } };

const missFor = (months: string[]): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const m of months) out[`${m}-15`] = { calls: 100, vxs: 70 };
  return out;
};

describe('headerInfo: greeting', () => {
  it('switches at 12:00 and 18:00 local time', () => {
    assert.equal(getGreeting(new Date(2026, 10, 9, 0, 0)), 'Good morning');
    assert.equal(getGreeting(new Date(2026, 10, 9, 11, 59)), 'Good morning');
    assert.equal(getGreeting(new Date(2026, 10, 9, 12, 0)), 'Good afternoon');
    assert.equal(getGreeting(new Date(2026, 10, 9, 17, 59)), 'Good afternoon');
    assert.equal(getGreeting(new Date(2026, 10, 9, 18, 0)), 'Good evening');
    assert.equal(getGreeting(new Date(2026, 10, 9, 23, 59)), 'Good evening');
  });
});

describe('headerInfo: date', () => {
  it('shows day first with the full month name', () => {
    assert.equal(formatToday(new Date(2026, 10, 9, 9, 0)).replace(',', ''), 'Monday 9 November 2026');
  });
  it('a date like 5 Sep never turns into 4 Sep or 31 Aug', () => {
    assert.match(formatToday(new Date(2026, 8, 5, 0, 5)), /5 September 2026/);
    assert.match(formatToday(new Date(2026, 8, 1, 0, 5)), /1 September 2026/);
  });
});

describe('headerInfo: need-attention count', () => {
  const agents = [{ ccms: 'A1', name: 'Fake One' }, { ccms: 'A2', name: 'Fake Two' }] as any[];

  it('counts agents who missed 2 or more of the latest 3 months', () => {
    const history: HistoricalData = {
      A1: missFor(['2026-07', '2026-08', '2026-09']), // 3 of 3
      A2: { ...missFor(['2026-07', '2026-09']), '2026-08-15': { calls: 100, vxs: 95 } }, // miss, pass, miss = 2 of 3
    };
    assert.equal(countNeedAttention(agents, history, TARGETS), 2);
  });
  it('an agent with only 1 miss in the latest 3 months is not counted', () => {
    const history: HistoricalData = {
      A1: { '2026-07-15': { calls: 100, vxs: 95 }, '2026-08-15': { calls: 100, vxs: 70 }, '2026-09-15': { calls: 100, vxs: 95 } },
      A2: { '2026-07-15': { calls: 100, vxs: 95 }, '2026-08-15': { calls: 100, vxs: 95 }, '2026-09-15': { calls: 100, vxs: 95 } },
    };
    assert.equal(countNeedAttention(agents, history, TARGETS), null);
  });
  it('returns null (not 0) when nobody qualifies', () => {
    const history: HistoricalData = { A1: { '2026-08-15': { calls: 100, vxs: 95 }, '2026-09-15': { calls: 100, vxs: 95 } } };
    assert.equal(countNeedAttention(agents, history, TARGETS), null);
  });
  it('returns null with no data loaded', () => {
    assert.equal(countNeedAttention([], {}, TARGETS), null);
    assert.equal(countNeedAttention(agents, null, TARGETS), null);
    assert.equal(countNeedAttention(undefined, {}, TARGETS), null);
  });
  it('label uses singular and plural correctly', () => {
    assert.equal(attentionLabel(1), '1 agent needs attention');
    assert.equal(attentionLabel(3), '3 agents need attention');
    assert.equal(attentionLabel(1200), '1,200 agents need attention');
  });
});
