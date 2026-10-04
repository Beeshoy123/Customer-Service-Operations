// timeframe.test.ts — S1(e) of the `useDashboardData` split.
//
// This repo has no DOM test harness (`tsx --test`, no jsdom, no testing-library)
// and no dependency may be added, so the hook is driven through React's server
// renderer: `renderToString` runs the hook body once and leaves the returned
// selector object capturable. That is enough to assert the pure derivation this
// module owns — bucket construction, month/week/day scoping and the headline
// labels. `handleDateChange` is deliberately not covered here: it drives
// setters, which is a state-transition concern rather than a derivation one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useTimeframeSelectors, type TimeframeSelectorDeps } from './timeframe';
import { dowFromDateStr } from './helpers';

const OFF = { isOff: true, calls: 0 };
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const history = {
  AGENT1: {
    '2026-09-01': { calls: 10 },
    '2026-09-03': { calls: 5 },
    '2026-09-08': { calls: 20 },
  },
};

const render = (overrides: Partial<TimeframeSelectorDeps> = {}) => {
  const deps: TimeframeSelectorDeps = {
    historicalData: {},
    hasUploadedData: false,
    activeTimeframe: 'monthly',
    selectedWeek: 'Week 1',
    selectedDow: 'Monday',
    selectedDate: '2026-09-01',
    selectedMonth: '2026-09',
    setActiveTimeframe: () => {},
    setSelectedDate: () => {},
    setSelectedDow: () => {},
    ...overrides,
  };

  // Collected through a sink rather than an outer `result = ...` assignment:
  // that shape is what `react/globals` flags as a render side effect.
  const sink: any[] = [];
  const Probe = () => {
    sink.push(useTimeframeSelectors(deps));
    return createElement('span');
  };
  renderToString(createElement(Probe));
  return sink[0];
};

test('returns an empty cache and OFF lookups before any import', () => {
  const s = render();
  assert.deepEqual(s.agentDataCache, {});
  assert.deepEqual(s.getAgentDataForTimeframe({ ccms: 'AGENT1' }, 'monthly'), OFF);
});

test('builds the monthly, daily and weekly buckets', () => {
  const s = render({ historicalData: history, hasUploadedData: true, selectedWeek: 'Week 1' });

  assert.equal(s.agentDataCache['AGENT1|monthly'].calls, 35, 'monthly sums every date in the month');
  assert.deepEqual(s.agentDataCache['AGENT1|daily'], { calls: 10 }, 'daily is the raw date record');
  assert.equal(s.agentDataCache['AGENT1|weekly'].calls, 15, 'Week 1 keeps only day 1-7 (09-01, 09-03)');
});

test('month scoping turns the month/week/dow buckets OFF but leaves daily alone', () => {
  const s = render({
    historicalData: history,
    hasUploadedData: true,
    selectedMonth: '2026-10',
  });

  assert.deepEqual(s.agentDataCache['AGENT1|monthly'], OFF);
  assert.deepEqual(s.agentDataCache['AGENT1|weekly'], OFF);
  assert.deepEqual(s.agentDataCache['AGENT1|dow'], OFF);
  assert.deepEqual(
    s.agentDataCache['AGENT1|daily'],
    { calls: 10 },
    'daily is date-scoped, not month-scoped, so it still resolves'
  );
});

test('the day-of-week bucket keeps exactly the dates with that weekday', () => {
  const dow = dowFromDateStr('2026-09-01');
  const s = render({ historicalData: history, hasUploadedData: true, selectedDow: DOW_NAMES[dow] });

  const expected = Object.entries(history.AGENT1)
    .filter(([date]) => dowFromDateStr(date) === dow)
    .reduce((sum, [, rec]) => sum + (rec as { calls: number }).calls, 0);

  assert.equal(s.agentDataCache['AGENT1|dow'].calls, expected);
  assert.ok(expected > 0 && expected < 35, `expected a strict subset, got ${expected}`);
});

test('unknown agents fall back to the OFF record', () => {
  const s = render({ historicalData: history, hasUploadedData: true });
  assert.deepEqual(s.getAgentDataForTimeframe({ ccms: 'NOBODY' }, 'monthly'), OFF);
  assert.deepEqual(s.getAgentDataForTimeframe({ ccms: 'AGENT1' }, 'nonsense'), OFF);
});

test('getTopHeadlineMonth labels the active timeframe', () => {
  assert.equal(render({ activeTimeframe: 'monthly', selectedMonth: '2026-09' }).getTopHeadlineMonth(), 'September 2026');
  assert.equal(render({ activeTimeframe: 'weekly', selectedWeek: 'Week 3' }).getTopHeadlineMonth(), 'Week 3');
  assert.equal(render({ activeTimeframe: 'daily', selectedDate: '2026-09-15' }).getTopHeadlineMonth(), 'September');
});
