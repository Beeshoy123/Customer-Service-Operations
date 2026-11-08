// Step 3 (dates), change 2: day-first vs month-first (suggestions.md X7).
// Expected values are worked out by hand from the calendar.
//
// Why this matters: Excel hands the importer a cell holding 5 Sep 2026 in the
// default date format as the TEXT "9/5/26" (month first). Reading that day-first
// gives 9 May, silently. A file that contains any day above 12 ("9/13/26")
// proves the order, so the whole sheet must be read that way.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectDateOrder, parseDateText } from './dateText.ts';
import { normalizeImportedValue } from './importPolicy.ts';
import { mapTableToNormalizedRows } from './schemaNormalizer.ts';
import { isDateLikeString } from './columnFingerprinter.ts';
import { normalizeDate } from '../helpers.ts';
import type { SheetTable } from './types.ts';

describe('parseDateText — order option', () => {
  it('defaults to day first (unchanged behaviour)', () => {
    assert.equal(parseDateText('05/09/2026'), '2026-09-05');
    assert.equal(parseDateText('05/09/2026', 'dayFirst'), '2026-09-05');
  });

  it('reads month first when asked', () => {
    assert.equal(parseDateText('05/09/2026', 'monthFirst'), '2026-05-09'); // 9 May
    assert.equal(parseDateText('9/5/26', 'monthFirst'), '2026-09-05'); // 5 Sep
  });

  it('slash dates fall back to the other order only when the preferred one is impossible', () => {
    assert.equal(parseDateText('13/09/2026', 'monthFirst'), '2026-09-13'); // month 13 impossible
    assert.equal(parseDateText('9/13/2026', 'dayFirst'), '2026-09-13'); // month 13 impossible
  });

  it('dash and dot dates never fall back', () => {
    assert.equal(parseDateText('09-05-2026', 'monthFirst'), '2026-09-05');
    assert.equal(parseDateText('09.05.2026', 'monthFirst'), '2026-09-05');
    assert.equal(parseDateText('13-09-2026', 'monthFirst'), null);
    assert.equal(parseDateText('09-13-2026', 'dayFirst'), null);
  });

  it('does not change year-first, month-name or month-only dates', () => {
    for (const order of ['dayFirst', 'monthFirst'] as const) {
      assert.equal(parseDateText('2026-09-05', order), '2026-09-05');
      assert.equal(parseDateText('Sep 5, 2026', order), '2026-09-05');
      assert.equal(parseDateText('9/2026', order), '2026-09-01');
    }
  });
});

describe('detectDateOrder', () => {
  it('a first part above 12 proves day first', () => {
    assert.deepEqual(detectDateOrder(['5/9/26', '13/9/26']), {
      order: 'dayFirst', certain: true, dayFirstProof: 1, monthFirstProof: 0,
    });
  });

  it('a second part above 12 proves month first', () => {
    assert.deepEqual(detectDateOrder(['9/5/26', '9/13/26', '9/14/2026']), {
      order: 'monthFirst', certain: true, dayFirstProof: 0, monthFirstProof: 2,
    });
  });

  it('no proof (every part is 12 or less) keeps the fallback', () => {
    assert.deepEqual(detectDateOrder(['5/9/26', '6/9/26']), {
      order: 'dayFirst', certain: false, dayFirstProof: 0, monthFirstProof: 0,
    });
    assert.equal(detectDateOrder(['5/9/26', '6/9/26'], 'monthFirst').order, 'monthFirst');
  });

  it('proof of both orders (a mixed file) is not certain and keeps the fallback', () => {
    const result = detectDateOrder(['13/9/26', '9/13/26']);
    assert.equal(result.certain, false);
    assert.equal(result.order, 'dayFirst');
    assert.equal(result.dayFirstProof, 1);
    assert.equal(result.monthFirstProof, 1);
  });

  it('a time of day does not hide the proof', () => {
    assert.equal(detectDateOrder(['13/09/2026 00:00:00']).dayFirstProof, 1);
  });

  it('ignores values that cannot prove an order', () => {
    const result = detectDateOrder([
      '2026-09-13', 'Sep 13, 2026', '46270', 46270, null, undefined, '13:45', '13/14/2026', 'hello',
    ]);
    assert.equal(result.dayFirstProof, 0);
    assert.equal(result.monthFirstProof, 0);
    assert.equal(result.certain, false);
  });
});

const table = (dates: string[]): SheetTable => ({
  workbookName: 'voc.xlsx',
  sheetName: 'Sep',
  index: 0,
  headerRow: ['Agent', 'Date', 'Resolve_2Hr_Count'],
  rows: dates.map((date, i) => [`Agent ${i + 1}`, date, '5']),
  rowCount: dates.length,
});

const datesOf = (rows: ReadonlyArray<Record<string, unknown>>) => rows.map((row) => row.date);

describe('a sheet is read with one order', () => {
  it('Excel "m/d/yy" text with a day above 12 is read month first, for every row', () => {
    // 5 Sep, 13 Sep and 1 Sep 2026. Day-first alone would give 2026-05-09 and 2026-01-09.
    const rows = mapTableToNormalizedRows(table(['9/5/26', '9/13/26', '9/1/26']), 'voc.xlsx');
    assert.deepEqual(datesOf(rows), ['2026-09-05', '2026-09-13', '2026-09-01']);
  });

  it('a day-first sheet is read day first', () => {
    const rows = mapTableToNormalizedRows(table(['5/9/26', '13/9/26']), 'voc.xlsx');
    assert.deepEqual(datesOf(rows), ['2026-09-05', '2026-09-13']);
  });

  it('a sheet with no proof defaults to day first', () => {
    const rows = mapTableToNormalizedRows(table(['5/9/26', '6/9/26']), 'voc.xlsx');
    assert.deepEqual(datesOf(rows), ['2026-09-05', '2026-09-06']);
  });

  it('the user choice decides a sheet with no proof', () => {
    const rows = mapTableToNormalizedRows(table(['5/9/26', '6/9/26']), 'voc.xlsx', {}, 'monthFirst');
    assert.deepEqual(datesOf(rows), ['2026-05-09', '2026-06-09']);
  });

  it('the user choice wins over the sheet\'s own proof; impossible readings still fall back', () => {
    const rows = mapTableToNormalizedRows(table(['9/5/26', '9/13/26']), 'voc.xlsx', {}, 'dayFirst');
    // "9/5/26" day first = 9 May; "9/13/26" has no month 13, so it falls back to 13 Sep.
    assert.deepEqual(datesOf(rows), ['2026-05-09', '2026-09-13']);
  });

  it('a mixed sheet keeps day first, and each impossible reading falls back', () => {
    const rows = mapTableToNormalizedRows(table(['13/9/26', '9/13/26', '5/9/26']), 'voc.xlsx');
    assert.deepEqual(datesOf(rows), ['2026-09-13', '2026-09-13', '2026-09-05']);
  });

  it('ISO dates and Excel serials are not affected by the order', () => {
    const rows = mapTableToNormalizedRows(table(['2026-09-05', '46270', '9/13/26']), 'voc.xlsx');
    assert.deepEqual(datesOf(rows), ['2026-09-05', '2026-09-05', '2026-09-13']);
  });
});

describe('normalizeImportedValue — order option', () => {
  it('uses the given order and defaults to day first', () => {
    assert.equal(normalizeImportedValue('date', '05/09/2026'), '2026-09-05');
    assert.equal(normalizeImportedValue('date', '05/09/2026', { dateOrder: 'monthFirst' }), '2026-05-09');
  });

  it('does not touch non-date fields or serial numbers', () => {
    assert.equal(normalizeImportedValue('date', '46270', { dateOrder: 'monthFirst' }), '2026-09-05');
    assert.equal(normalizeImportedValue('calls', '12', { dateOrder: 'monthFirst' }), 12);
  });
});

describe('isDateLikeString — month labels are recognised as dates', () => {
  it('accepts month-only labels', () => {
    for (const text of ['September 2026', 'Sep 2026', 'Sep-26', 'Jan-27', '9/2026', '2026-09']) {
      assert.equal(isDateLikeString(text), true, text);
    }
  });

  it('still rejects text and numbers that are not dates', () => {
    for (const text of ['Sep', 'Sep 5', 'hello', '120', 'Smarch 2026', 'Sep-85', '13/2026']) {
      assert.equal(isDateLikeString(text), false, text);
    }
  });
});

describe('helpers.normalizeDate uses the same parser as the importer', () => {
  it('reads ambiguous slash dates day first, like the importer', () => {
    assert.equal(normalizeDate('05/09/2026'), '2026-09-05');
  });

  it('keeps reading unambiguous month-first dates', () => {
    assert.equal(normalizeDate('4/15/2026'), '2026-04-15');
  });

  it('no longer returns an impossible date', () => {
    assert.equal(normalizeDate('13/09/2026'), '2026-09-13'); // was "2026-13-09"
  });
});
