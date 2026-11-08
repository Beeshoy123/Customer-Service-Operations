// Step 3 (dates), change 1: month names, month-only text and timestamps.
// Every expected value below was worked out by hand from the calendar, not
// copied from the code's output. Origin of the bug: `new Date(text)` +
// `.toISOString()` moved dates back a day in Cairo (UTC+3), see dateText.ts.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateText } from './dateText.ts';
import { normalizeImportedValue } from './importPolicy.ts';

const cases = (rows: ReadonlyArray<readonly [string, string | null]>) => {
  for (const [input, expected] of rows) {
    assert.equal(parseDateText(input), expected, `input: ${JSON.stringify(input)}`);
  }
};

describe('parseDateText — the 4 formats named in suggestions.md X1', () => {
  it('reads "September 2026" and "Sep 2026" as the 1st of September', () => {
    cases([
      ['September 2026', '2026-09-01'],
      ['Sep 2026', '2026-09-01'],
      ['Sep-2026', '2026-09-01'],
      ['sept 2026', '2026-09-01'],
      ['SEPTEMBER 2026', '2026-09-01'],
    ]);
  });

  it('reads Excel "mmm-yy" ("Sep-26") as September 2026, not 26 Sep 2001', () => {
    cases([
      ['Sep-26', '2026-09-01'],
      ['Dec-25', '2025-12-01'],
      ['Jan-27', '2027-01-01'],
    ]);
  });

  it('reads "Sep 5, 2026" as 5 September (not the 4th)', () => {
    cases([
      ['Sep 5, 2026', '2026-09-05'],
      ['September 5, 2026', '2026-09-05'],
      ['5 Sep 2026', '2026-09-05'],
      ['05-Sep-2026', '2026-09-05'],
      ['5-Sep-26', '2026-09-05'],
      ['Sep 5th, 2026', '2026-09-05'],
    ]);
  });

  it('reads month/year numbers ("9/2026") as the 1st of the month', () => {
    cases([
      ['9/2026', '2026-09-01'],
      ['09/2026', '2026-09-01'],
      ['09-2026', '2026-09-01'],
      ['2026-09', '2026-09-01'],
      ['2026/9', '2026-09-01'],
    ]);
  });
});

describe('parseDateText — timestamps keep the date as written', () => {
  it('drops a trailing time of day without moving the date', () => {
    cases([
      ['2026-09-05 00:00:00', '2026-09-05'],
      ['2026-09-05T00:00:00', '2026-09-05'],
      ['2026-09-05T23:59:59Z', '2026-09-05'],
      ['2026-09-05T23:30:00-05:00', '2026-09-05'],
      ['05/09/2026 00:00:00', '2026-09-05'],
      ['5/9/2026 11:30 PM', '2026-09-05'],
      ['Sat Sep 05 2026', '2026-09-05'],
      ['Sat Sep 05 2026 00:00:00 GMT+0300 (Eastern European Summer Time)', '2026-09-05'],
    ]);
  });
});

describe('parseDateText — numeric dates behave as before', () => {
  it('year first', () => {
    cases([
      ['2024-03-15', '2024-03-15'],
      ['2026/09/05', '2026-09-05'],
      ['2026-9-5', '2026-09-05'],
    ]);
  });

  it('slash dates are day first, with month first only when day first is impossible', () => {
    cases([
      ['05/09/2026', '2026-09-05'], // 5 Sep (day first)
      ['5/9/26', '2026-09-05'],
      ['13/09/2026', '2026-09-13'], // 13 cannot be a month
      ['9/13/2026', '2026-09-13'], // 13 cannot be a month, so month first
      ['03/15/2024', '2024-03-15'],
    ]);
  });

  it('dash and dot dates are day first only', () => {
    cases([
      ['15-03-2024', '2024-03-15'],
      ['05-09-2026', '2026-09-05'],
      ['05.09.2026', '2026-09-05'],
    ]);
  });
});

describe('parseDateText — real calendar dates only, and no guessing', () => {
  it('rejects days that do not exist', () => {
    cases([
      ['31/04/2026', null], // April has 30 days (and month 31 is impossible)
      ['2026-02-29', null], // 2026 is not a leap year
      ['2026-02-30', null],
      ['Feb 30, 2026', null],
    ]);
  });

  it('accepts 29 February only in a leap year', () => {
    cases([
      ['2028-02-29', '2028-02-29'], // 2028 is a leap year
      ['Feb 29, 2028', '2028-02-29'],
      ['2027-02-29', null],
    ]);
  });

  it('returns null when text is not a date we can read with certainty', () => {
    cases([
      ['Sep', null], // no year
      ['Sep 5', null], // no year: never invent one
      ['9/26', null], // month/day or month/year? ambiguous
      ['13/2026', null], // no month 13
      ['not-a-date', null],
      ['04:15', null], // a duration, not a date
      ['', null],
      ['   ', null],
      ['hello 2026', null],
      ['Smarch 5, 2026', null],
    ]);
  });
});

describe('normalizeImportedValue("date", …) — through the import path', () => {
  it('returns the right date for the Cairo regressions', () => {
    assert.equal(normalizeImportedValue('date', 'September 2026'), '2026-09-01');
    assert.equal(normalizeImportedValue('date', 'Sep-26'), '2026-09-01');
    assert.equal(normalizeImportedValue('date', 'Sep 5, 2026'), '2026-09-05');
    assert.equal(normalizeImportedValue('date', '9/2026'), '2026-09-01');
    assert.equal(normalizeImportedValue('date', '2026-09-05 00:00:00'), '2026-09-05');
  });

  it('still reads Excel serials (46270 = 5 Sep 2026)', () => {
    assert.equal(normalizeImportedValue('date', '46270'), '2026-09-05');
  });
});

describe('parseDateText — same answer in every time zone', () => {
  // Guard against anyone bringing `new Date(text)` back: it would give
  // different answers here. Cairo is UTC+3 in September.
  const sample = [
    'September 2026', 'Sep-26', 'Sep 5, 2026', '9/2026', '2026-09-05 00:00:00',
    '05/09/2026', 'Sat Sep 05 2026', '2026-09',
  ] as const;

  it('gives identical results under Africa/Cairo, UTC and America/Los_Angeles', () => {
    const original = process.env.TZ;
    try {
      const results = ['Africa/Cairo', 'UTC', 'America/Los_Angeles'].map((zone) => {
        process.env.TZ = zone;
        return sample.map((text) => parseDateText(text));
      });
      assert.deepEqual(results[1], results[0]);
      assert.deepEqual(results[2], results[0]);
      assert.deepEqual(results[0], [
        '2026-09-01', '2026-09-01', '2026-09-05', '2026-09-01',
        '2026-09-05', '2026-09-05', '2026-09-05', '2026-09-01',
      ]);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
