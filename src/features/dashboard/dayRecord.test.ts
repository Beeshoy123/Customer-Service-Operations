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
