import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDayRecord, toNumberOrNull } from './dayRecord';

const HEADLINE = ['calls', 'aht', 'vxs', 'resolve2hr', 'resolve3d'] as const;

describe('Step 2: missing stays null (not 0)', () => {
  it('a row with no values gives null for calls, AHT, VXS, resolve2hr and resolve3d', () => {
    const rec: any = buildDayRecord({ agentName: 'Agent One', date: '2026-10-05' });
    for (const f of HEADLINE) assert.equal(rec[f], null, f);
  });

  it('empty text, dashes and n/a are missing too, not 0', () => {
    for (const bad of [undefined, null, '', '   ', '-', 'n/a', 'N/A', '%', NaN]) {
      const rec: any = buildDayRecord({ calls: bad, aht: bad, vxs: bad, resolve2hr: bad, resolve3d: bad });
      for (const f of HEADLINE) assert.equal(rec[f], null, `${f} <- ${String(bad)}`);
    }
  });

  it('a real 0 stays 0', () => {
    const rec: any = buildDayRecord({ calls: 0, aht: 0, vxs: 0, resolve2hr: 0, resolve3d: 0 });
    for (const f of HEADLINE) assert.equal(rec[f], 0, f);
  });

  it('real values still parse (numbers, percent text, thousands separators)', () => {
    const rec: any = buildDayRecord({ calls: '1,200', aht: 310.5, vxs: '85%', resolve2hr: ' 70 ', resolve3d: '95.5%' });
    assert.deepEqual([rec.calls, rec.aht, rec.vxs, rec.resolve2hr, rec.resolve3d], [1200, 310.5, 85, 70, 95.5]);
  });

  it('a day with only VXS is NOT marked off, and calls is null', () => {
    const rec: any = buildDayRecord({ vxs: 90 });
    assert.equal(rec.isOff, false);
    assert.equal(rec.calls, null);
    assert.equal(rec.vxs, 90);
  });

  it('calls = 0 is still an off day', () => {
    assert.equal(buildDayRecord({ calls: 0 }).isOff, true);
  });

  it('resolveTotalContacts falls back to calls, and stays null when calls is missing', () => {
    assert.equal(buildDayRecord({ calls: 10 }).resolveTotalContacts, 10);
    assert.equal(buildDayRecord({ calls: 10, resolveTotalContacts: 8 }).resolveTotalContacts, 8);
    assert.equal(buildDayRecord({}).resolveTotalContacts, null);
  });

  it('toNumberOrNull: unparsable text is null', () => {
    assert.equal(toNumberOrNull('abc'), null);
    assert.equal(toNumberOrNull('12abc'), null);
    assert.equal(toNumberOrNull('0'), 0);
  });
});

import { mergeDayRecord, keepKnown } from './dayRecord';

describe('Step 2: a later upload merges into the existing day', () => {
  const existing = () => buildDayRecord({ calls: 10, vxs: 80, aht: 300, surveys: 5, promoters: 4 });

  it('file B (AHT only) does not erase what file A gave (calls, VXS, surveys)', () => {
    const merged: any = mergeDayRecord(existing(), { aht: 280 });
    assert.equal(merged.calls, 10);
    assert.equal(merged.vxs, 80);
    assert.equal(merged.surveys, 5);
    assert.equal(merged.promoters, 4);
    assert.equal(merged.aht, 280);
  });

  it('applying the same row twice gives the same record (no doubling)', () => {
    const row = { calls: 10, vxs: 80, aht: 300, surveys: 5, promoters: 4 };
    const once: any = mergeDayRecord(buildDayRecord(row), row);
    assert.deepEqual(once, buildDayRecord(row));
    assert.equal(once.calls, 10);
    assert.equal(once.surveys, 5);
  });

  it('when both have a value, the newer upload wins (calls 10 then 12 -> 12)', () => {
    assert.equal((mergeDayRecord(existing(), { calls: 12 }) as any).calls, 12);
  });

  it('a real 0 in the new file counts; a missing value does not', () => {
    const zero: any = mergeDayRecord(existing(), { calls: 0 });
    assert.equal(zero.calls, 0);
    assert.equal(zero.isOff, true);
    const missing: any = mergeDayRecord(existing(), { calls: '', vxs: '-' });
    assert.equal(missing.calls, 10);
    assert.equal(missing.vxs, 80);
  });

  it('isOff is recomputed from the merged calls', () => {
    const off = buildDayRecord({ calls: 0 });
    assert.equal(off.isOff, true);
    assert.equal((mergeDayRecord(off, { calls: 5 }) as any).isOff, false);
  });

  it('resolveTotalContacts follows calls when it was never imported, and keeps an imported value', () => {
    const derived: any = mergeDayRecord(buildDayRecord({ calls: 10 }), { calls: 12 });
    assert.equal(derived.resolveTotalContacts, 12);
    const kept: any = mergeDayRecord(buildDayRecord({ calls: 10, resolveTotalContacts: 8 }), { calls: 12 });
    assert.equal(kept.resolveTotalContacts, 8);
    const newer: any = mergeDayRecord(buildDayRecord({ calls: 10, resolveTotalContacts: 8 }), { calls: 12, resolveTotalContacts: 9 });
    assert.equal(newer.resolveTotalContacts, 9);
  });

  it('does not edit the existing record in place', () => {
    const before = existing();
    const snapshot = JSON.stringify(before);
    mergeDayRecord(before, { calls: 99, aht: 1 });
    assert.equal(JSON.stringify(before), snapshot);
  });

  it('with no existing day, it is just the new record', () => {
    assert.deepEqual(mergeDayRecord(undefined, { calls: 3 }), buildDayRecord({ calls: 3 }));
  });

  it('keepKnown: "Unknown" or empty never overwrites a known value', () => {
    assert.equal(keepKnown('Sup X', 'Unknown'), 'Sup X');
    assert.equal(keepKnown('Sup X', ''), 'Sup X');
    assert.equal(keepKnown('Sup X', 'Sup Y'), 'Sup Y');
    assert.equal(keepKnown(undefined, 'Unknown'), 'Unknown');
    assert.equal(keepKnown('Unknown', 'Sup Y'), 'Sup Y');
  });
});
