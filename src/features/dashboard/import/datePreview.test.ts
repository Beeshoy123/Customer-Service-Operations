// Import preview, Dates section — the pure part. Expected values are worked out
// by hand from the calendar.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeSheetDates } from './datePreview.ts';
import type { SheetTable } from './types.ts';

const withDateColumn = [
  { mappedField: 'agentName', index: 0 },
  { mappedField: 'date', index: 1 },
];
const noDateColumn = [{ mappedField: 'agentName', index: 0 }];

const table = (dates: string[], sheetName = 'Sep'): SheetTable => ({
  workbookName: 'VOC.xlsx',
  sheetName,
  index: 0,
  headerRow: ['Agent', 'Date'],
  rows: dates.map((date, i) => [`Agent ${i + 1}`, date]),
  rowCount: dates.length,
});

const describe_ = (dates: string[], extra: { orderChoice?: 'dayFirst' | 'monthFirst' } = {}) =>
  describeSheetDates({ table: table(dates), columnMappings: withDateColumn, fileName: 'VOC.xlsx', ...extra });

describe('describeSheetDates — day/month order', () => {
  it('a month-first sheet is proven, and the proof value is shown first', () => {
    assert.deepEqual(describe_(['9/5/26', '9/13/26', '9/1/26']), {
      kind: 'order',
      proof: 'proven',
      detected: 'monthFirst',
      effective: 'monthFirst',
      overridesProof: false,
      numericCount: 3,
      proofExample: '9/13/26',
      examples: [
        { raw: '9/13/26', read: '2026-09-13' },
        { raw: '9/5/26', read: '2026-09-05' }, // 5 Sep
        { raw: '9/1/26', read: '2026-09-01' },
      ],
    });
  });

  it('a day-first sheet is proven day first', () => {
    assert.deepEqual(describe_(['13/09/2026', '05/09/2026']), {
      kind: 'order',
      proof: 'proven',
      detected: 'dayFirst',
      effective: 'dayFirst',
      overridesProof: false,
      numericCount: 2,
      proofExample: '13/09/2026',
      examples: [
        { raw: '13/09/2026', read: '2026-09-13' },
        { raw: '05/09/2026', read: '2026-09-05' },
      ],
    });
  });

  it('choosing the other order on a proven sheet is flagged as overriding the proof', () => {
    const result = describe_(['9/5/26', '9/13/26', '9/1/26'], { orderChoice: 'dayFirst' });
    assert.equal(result.kind, 'order');
    if (result.kind !== 'order') return;
    assert.equal(result.effective, 'dayFirst');
    assert.equal(result.overridesProof, true);
    assert.deepEqual(result.examples, [
      { raw: '9/13/26', read: '2026-09-13' }, // month 13 is impossible, so it falls back
      { raw: '9/5/26', read: '2026-05-09' }, // 9 May
      { raw: '9/1/26', read: '2026-01-09' }, // 9 Jan
    ]);
  });

  it('a sheet where no value can tell is unproven, defaults to day first, and shows 3 examples', () => {
    const result = describe_(['5/9/26', '6/9/26', '7/9/26', '8/9/26']);
    assert.deepEqual(result, {
      kind: 'order',
      proof: 'unproven',
      detected: 'dayFirst',
      effective: 'dayFirst',
      overridesProof: false,
      numericCount: 4,
      proofExample: null,
      examples: [
        { raw: '5/9/26', read: '2026-09-05' },
        { raw: '6/9/26', read: '2026-09-06' },
        { raw: '7/9/26', read: '2026-09-07' },
      ],
    });
  });

  it('the user choice changes how an unproven sheet is read, and is not an override of proof', () => {
    const result = describe_(['5/9/26', '6/9/26', '7/9/26'], { orderChoice: 'monthFirst' });
    assert.equal(result.kind, 'order');
    if (result.kind !== 'order') return;
    assert.equal(result.proof, 'unproven');
    assert.equal(result.overridesProof, false);
    assert.deepEqual(result.examples.map((e) => e.read), ['2026-05-09', '2026-06-09', '2026-07-09']);
  });

  it('a sheet that proves both orders is mixed; impossible readings still fall back', () => {
    const result = describe_(['13/9/26', '9/13/26', '5/9/26']);
    assert.equal(result.kind, 'order');
    if (result.kind !== 'order') return;
    assert.equal(result.proof, 'mixed');
    assert.equal(result.detected, 'dayFirst');
    assert.deepEqual(result.examples, [
      { raw: '13/9/26', read: '2026-09-13' },
      { raw: '9/13/26', read: '2026-09-13' },
      { raw: '5/9/26', read: '2026-09-05' },
    ]);
  });

  it('repeated values are shown once, but all are counted', () => {
    const result = describe_(['5/9/26', '5/9/26', '6/9/26']);
    assert.equal(result.kind, 'order');
    if (result.kind !== 'order') return;
    assert.equal(result.numericCount, 3);
    assert.deepEqual(result.examples.map((e) => e.raw), ['5/9/26', '6/9/26']);
  });

  it('only date-mapped columns count', () => {
    const t: SheetTable = {
      workbookName: 'VOC.xlsx',
      sheetName: 'Sep',
      index: 0,
      headerRow: ['Agent', 'Date', 'Note'],
      rows: [['A', '5/9/26', '13/9/26'], ['B', '6/9/26', 'x']],
      rowCount: 2,
    };
    const result = describeSheetDates({ table: t, columnMappings: withDateColumn, fileName: 'VOC.xlsx' });
    assert.equal(result.kind === 'order' && result.proof, 'unproven'); // the Note column's 13/9/26 is ignored
  });
});

describe('describeSheetDates — nothing to decide', () => {
  it('ISO dates, month names and serials need no choice', () => {
    assert.deepEqual(describe_(['2026-09-05', '2026-09-06']), { kind: 'none' });
    assert.deepEqual(describe_(['Sep 5, 2026', 'Sep 6, 2026']), { kind: 'none' });
    assert.deepEqual(describe_(['46270', '46271']), { kind: 'none' });
  });

  it('a sheet with no rows, or empty date cells, needs no choice', () => {
    assert.deepEqual(describe_([]), { kind: 'none' });
    assert.deepEqual(describe_(['', '']), { kind: 'none' });
  });

  it('an ordinary sheet with no date column and no month name needs no choice', () => {
    const result = describeSheetDates({ table: table(['x'], 'Data'), columnMappings: noDateColumn, fileName: 'VOC_2026.xlsx' });
    assert.deepEqual(result, { kind: 'none' });
  });
});

describe('describeSheetDates — month-named sheets', () => {
  const sheet = (sheetName: string, fileName: string, yearChoice?: number) =>
    describeSheetDates({ table: table(['x'], sheetName), columnMappings: noDateColumn, fileName, yearChoice });

  it('needs a year when the file name has none', () => {
    assert.deepEqual(sheet('Sep', 'VOC.xlsx'), { kind: 'monthSheet', month: 9, date: null, yearFrom: null });
  });

  it('takes the year the user picked', () => {
    assert.deepEqual(sheet('Sep', 'VOC.xlsx', 2026), { kind: 'monthSheet', month: 9, date: '2026-09-01', yearFrom: 'choice' });
  });

  it('takes the year from the file name', () => {
    assert.deepEqual(sheet('Sep', 'VOC_2025.xlsx'), { kind: 'monthSheet', month: 9, date: '2025-09-01', yearFrom: 'fileName' });
  });

  it('the picked year wins over the file name', () => {
    assert.deepEqual(sheet('Sep', 'VOC_2025.xlsx', 2026), { kind: 'monthSheet', month: 9, date: '2026-09-01', yearFrom: 'choice' });
  });

  it('a sheet name that carries its own year needs nothing', () => {
    assert.deepEqual(sheet('Sep-26', 'VOC.xlsx'), { kind: 'monthSheet', month: 9, date: '2026-09-01', yearFrom: 'sheetName' });
  });

  it('is not shown when the sheet has a date column', () => {
    const result = describeSheetDates({ table: table(['2026-09-05'], 'Sep'), columnMappings: withDateColumn, fileName: 'VOC.xlsx' });
    assert.deepEqual(result, { kind: 'none' });
  });
});
