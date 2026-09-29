import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_MONTHS,
  collectLoadedMonths,
  matchesSelectedMonth,
  monthLabel,
  dowFromDateStr,
  getWeekNumber,
  normalizeDate,
} from './helpers';

const HISTORY = {
  A1: { '2026-04-15': {}, '2026-05-01': {}, '2026-06-30': {} },
  B2: { '2026-04-01': {}, '2026-06-15': {}, 'bogus-date': {}, notadate: {} },
  C3: {},
};

describe('collectLoadedMonths', () => {
  it('returns distinct month prefixes sorted latest first', () => {
    assert.deepEqual(collectLoadedMonths(HISTORY), ['2026-06', '2026-05', '2026-04']);
  });

  it('excludes malformed date keys', () => {
    const months = collectLoadedMonths(HISTORY);
    assert.ok(months.every((m) => /^\d{4}-\d{2}$/.test(m)));
    assert.equal(months.length, 3);
  });

  it('handles empty and nullish history', () => {
    assert.deepEqual(collectLoadedMonths({}), []);
    assert.deepEqual(collectLoadedMonths(null), []);
    assert.deepEqual(collectLoadedMonths(undefined), []);
  });
});

describe('matchesSelectedMonth', () => {
  it('matches dates inside the selected month', () => {
    assert.equal(matchesSelectedMonth('2026-04-15', '2026-04'), true);
    assert.equal(matchesSelectedMonth('2026-04-30', '2026-04'), true);
  });

  it('rejects dates outside the selected month', () => {
    assert.equal(matchesSelectedMonth('2026-05-15', '2026-04'), false);
    assert.equal(matchesSelectedMonth('2025-04-15', '2026-04'), false);
  });

  it('treats ALL_MONTHS as a wildcard', () => {
    assert.equal(matchesSelectedMonth('2026-04-15', ALL_MONTHS), true);
    assert.equal(ALL_MONTHS, 'all');
  });
});

describe('monthLabel', () => {
  it('formats a month key as a human label', () => {
    assert.equal(monthLabel('2026-04'), 'April 2026');
    assert.equal(monthLabel('2026-12'), 'December 2026');
  });

  it('labels ALL_MONTHS and garbage safely', () => {
    assert.equal(monthLabel(ALL_MONTHS), 'All months');
    assert.equal(monthLabel('zzz'), 'Current Month');
    assert.equal(monthLabel(undefined), 'Current Month');
  });
});

describe('dowFromDateStr', () => {
  // Regression guard for the `m < 3 ? y - 1 : y` January/February year branch
  // (a typo there was caught by re-read during the Recommendation 5 audit —
  // helpers.ts is @ts-nocheck, so tests are the only automated safety net).
  it('matches JS Date.getDay for every month', () => {
    for (let month = 0; month < 12; month += 1) {
      const iso = `2026-${String(month + 1).padStart(2, '0')}-15`;
      const [y, m, d] = iso.split('-').map(Number);
      assert.equal(dowFromDateStr(iso), new Date(y, m - 1, d).getDay(), iso);
    }
  });
});

describe('getWeekNumber', () => {
  it('buckets by day of month', () => {
    assert.equal(getWeekNumber('2026-04-03'), 'Week 1');
    assert.equal(getWeekNumber('2026-04-10'), 'Week 2');
    assert.equal(getWeekNumber('2026-04-15'), 'Week 3');
    assert.equal(getWeekNumber('2026-04-25'), 'Week 4');
    assert.equal(getWeekNumber('2026-04-30'), 'Week 5');
    assert.equal(getWeekNumber('bad'), 'Week 1');
  });
});

describe('normalizeDate', () => {
  it('normalizes both date orders to YYYY-MM-DD', () => {
    assert.equal(normalizeDate('2026-04-15'), '2026-04-15');
    assert.equal(normalizeDate('4/15/2026'), '2026-04-15');
    assert.equal(normalizeDate('2026-4-5'), '2026-04-05');
    assert.equal(normalizeDate(''), null);
    assert.equal(normalizeDate('garbage'), null);
  });
});
