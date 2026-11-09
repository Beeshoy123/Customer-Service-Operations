// Step 3 (dates), change 3: a sheet named for a month supplies the date for rows
// that have no date column (suggestions.md X1). Expected values are worked out by
// hand: 1st of the month, month from the sheet name, year from the file name.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planSheetDate, readSheetDateSettings, resolveSheetMonth, yearFromFileName } from './sheetMonth.ts';
import { mapTableToNormalizedRows, mapTableToNormalizedRowsAsync } from './schemaNormalizer.ts';
import { validateNormalizedRows } from './validation.ts';
import type { ImportWarning, SheetTable } from './types.ts';

describe('yearFromFileName', () => {
  it('finds the one year in a file name', () => {
    assert.equal(yearFromFileName('VOC_Sep_2026.xlsx'), 2026);
    assert.equal(yearFromFileName('2026 VOC.xlsx'), 2026);
    assert.equal(yearFromFileName('VOC-2026'), 2026);
  });

  it('accepts the same year written twice', () => {
    assert.equal(yearFromFileName('VOC_2026_final_2026.xlsx'), 2026);
  });

  it('returns null when there is no year, or two different years', () => {
    assert.equal(yearFromFileName('VOC.xlsx'), null);
    assert.equal(yearFromFileName('VOC_2025_vs_2026.xlsx'), null);
  });

  it('does not read part of a longer number as a year', () => {
    assert.equal(yearFromFileName('export_20260905.xlsx'), null); // a full date, not a year
    assert.equal(yearFromFileName('ticket120260.xlsx'), null);
  });
});

describe('resolveSheetMonth', () => {
  it('a bare month takes the year from the file name', () => {
    assert.deepEqual(resolveSheetMonth('Sep', 'VOC_2026.xlsx'), { status: 'ok', date: '2026-09-01', yearFrom: 'fileName' });
    assert.deepEqual(resolveSheetMonth('SEPT', 'VOC_2026.xlsx'), { status: 'ok', date: '2026-09-01', yearFrom: 'fileName' });
    assert.deepEqual(resolveSheetMonth(' september ', 'VOC_2026.xlsx'), { status: 'ok', date: '2026-09-01', yearFrom: 'fileName' });
    assert.deepEqual(resolveSheetMonth('Dec', 'VOC_2025.xlsx'), { status: 'ok', date: '2025-12-01', yearFrom: 'fileName' });
    assert.deepEqual(resolveSheetMonth('Feb.', 'VOC_2028.xlsx'), { status: 'ok', date: '2028-02-01', yearFrom: 'fileName' });
  });

  it('a bare month with no usable year in the file name needs a year', () => {
    assert.deepEqual(resolveSheetMonth('Sep', 'VOC.xlsx'), { status: 'needsYear', month: 9 });
    assert.deepEqual(resolveSheetMonth('Sep', 'VOC_2025_vs_2026.xlsx'), { status: 'needsYear', month: 9 });
  });

  it('a sheet name that already has the year does not need the file name', () => {
    assert.deepEqual(resolveSheetMonth('September 2026', 'VOC.xlsx'), { status: 'ok', date: '2026-09-01', yearFrom: 'sheetName' });
    assert.deepEqual(resolveSheetMonth('Sep-26', 'VOC_2025.xlsx'), { status: 'ok', date: '2026-09-01', yearFrom: 'sheetName' });
    assert.deepEqual(resolveSheetMonth('2026-09', 'VOC.xlsx'), { status: 'ok', date: '2026-09-01', yearFrom: 'sheetName' });
  });

  it('anything else is not a month sheet', () => {
    for (const name of ['Data', 'Summary', 'Sheet1', 'Sep VOC', 'CSV', '9', '2026', '', 'Sep 5, 2026']) {
      assert.deepEqual(resolveSheetMonth(name, 'VOC_2026.xlsx'), { status: 'none' }, JSON.stringify(name));
    }
    assert.deepEqual(resolveSheetMonth(undefined, 'VOC_2026.xlsx'), { status: 'none' });
  });
});

describe('resolveSheetMonth — year picked in the import preview', () => {
  it('a picked year fills a bare month and wins over the file name', () => {
    assert.deepEqual(resolveSheetMonth('Sep', 'VOC.xlsx', 2026), { status: 'ok', date: '2026-09-01', yearFrom: 'choice' });
    assert.deepEqual(resolveSheetMonth('Sep', 'VOC_2025.xlsx', 2026), { status: 'ok', date: '2026-09-01', yearFrom: 'choice' });
  });

  it('an unusable picked year is ignored', () => {
    assert.deepEqual(resolveSheetMonth('Sep', 'VOC.xlsx', 1999), { status: 'needsYear', month: 9 });
    assert.deepEqual(resolveSheetMonth('Sep', 'VOC.xlsx', 2026.5), { status: 'needsYear', month: 9 });
    assert.deepEqual(resolveSheetMonth('Sep', 'VOC_2025.xlsx', 1999), { status: 'ok', date: '2025-09-01', yearFrom: 'fileName' });
  });

  it('a sheet name that carries its own year ignores the picked year', () => {
    assert.deepEqual(resolveSheetMonth('Sep-26', 'VOC.xlsx', 2025), { status: 'ok', date: '2026-09-01', yearFrom: 'sheetName' });
  });

  it('planSheetDate says the year was picked', () => {
    const plan = planSheetDate('Sep', 'VOC.xlsx', false, 2026);
    assert.equal(plan.date, '2026-09-01');
    assert.match(plan.warning?.message ?? '', /year you picked in the import preview/);
  });
});

describe('readSheetDateSettings — what the import preview attaches to a sheet', () => {
  it('reads a valid day/month order and year', () => {
    assert.deepEqual(readSheetDateSettings({ granularity: 'daily', dateOrder: 'monthFirst', sheetYear: 2026 }), {
      dateOrder: 'monthFirst',
      sheetYear: 2026,
    });
    assert.deepEqual(readSheetDateSettings({ dateOrder: 'dayFirst' }), { dateOrder: 'dayFirst' });
  });

  it('returns nothing when the preview set nothing', () => {
    assert.deepEqual(readSheetDateSettings({ granularity: 'daily', columnMappings: {} }), {});
    assert.deepEqual(readSheetDateSettings(undefined), {});
    assert.deepEqual(readSheetDateSettings(null), {});
    assert.deepEqual(readSheetDateSettings('x'), {});
  });

  it('drops values that are not valid', () => {
    assert.deepEqual(readSheetDateSettings({ dateOrder: 'MM/DD', sheetYear: '2026' }), {});
    assert.deepEqual(readSheetDateSettings({ dateOrder: 1, sheetYear: 1999 }), {});
    assert.deepEqual(readSheetDateSettings({ sheetYear: 'skip' }), {});
  });
});

describe('planSheetDate', () => {
  it('does nothing when the sheet has a date column', () => {
    assert.deepEqual(planSheetDate('Sep', 'VOC_2026.xlsx', true), { date: null, warning: null });
  });

  it('gives the date and an explanatory warning', () => {
    const plan = planSheetDate('Sep', 'VOC_2026.xlsx', false);
    assert.equal(plan.date, '2026-09-01');
    assert.equal(plan.warning?.code, 'DATE_FROM_SHEET_NAME');
    assert.equal(plan.warning?.sheetName, 'Sep');
    assert.match(plan.warning?.message ?? '', /2026-09-01/);
  });

  it('warns and gives no date when the year is missing', () => {
    const plan = planSheetDate('Sep', 'VOC.xlsx', false);
    assert.equal(plan.date, null);
    assert.equal(plan.warning?.code, 'SHEET_MONTH_NEEDS_YEAR');
  });

  it('is silent for ordinary sheets', () => {
    assert.deepEqual(planSheetDate('Data', 'VOC_2026.xlsx', false), { date: null, warning: null });
  });
});

const noDateTable = (sheetName: string): SheetTable => ({
  workbookName: 'VOC.xlsx',
  sheetName,
  index: 0,
  headerRow: ['Agent', 'Resolve_2Hr_Count'],
  rows: [['Alice Smith', '5'], ['Bob Jones', '7']],
  rowCount: 2,
});

const withDate = (sheetName: string): SheetTable => ({
  workbookName: 'VOC.xlsx',
  sheetName,
  index: 0,
  headerRow: ['Agent', 'Date', 'Resolve_2Hr_Count'],
  rows: [['Alice Smith', '2026-08-03', '5'], ['Bob Jones', '', '7']],
  rowCount: 2,
});

describe('mapTableToNormalizedRows — month-named sheets', () => {
  it('dates every row of a no-date sheet, warns once, and the rows pass validation', () => {
    const warnings: ImportWarning[] = [];
    const rows = mapTableToNormalizedRows(noDateTable('Sep'), 'VOC_Sep_2026.xlsx', {}, undefined, (w) => warnings.push(w));
    assert.deepEqual(rows.map((row) => row.date), ['2026-09-01', '2026-09-01']);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'DATE_FROM_SHEET_NAME');

    const validated = validateNormalizedRows(rows, 'VOC_Sep_2026.xlsx');
    assert.equal(validated.rows.length, 2);
    assert.equal(validated.warnings.length, 0);
  });

  it('without a year, rows stay undated, are skipped by validation, and the warning says why', () => {
    const warnings: ImportWarning[] = [];
    const rows = mapTableToNormalizedRows(noDateTable('Sep'), 'VOC.xlsx', {}, undefined, (w) => warnings.push(w));
    assert.deepEqual(rows.map((row) => row.date), [undefined, undefined]);
    assert.deepEqual(warnings.map((w) => w.code), ['SHEET_MONTH_NEEDS_YEAR']);
    assert.equal(validateNormalizedRows(rows, 'VOC.xlsx').rows.length, 0);
  });

  it('never patches a sheet that has a date column, even when some cells are empty', () => {
    const warnings: ImportWarning[] = [];
    const rows = mapTableToNormalizedRows(withDate('Sep'), 'VOC_Sep_2026.xlsx', {}, undefined, (w) => warnings.push(w));
    assert.deepEqual(rows.map((row) => row.date), ['2026-08-03', undefined]);
    assert.equal(warnings.length, 0);
  });

  it('leaves an ordinary no-date sheet alone, with no warning', () => {
    const warnings: ImportWarning[] = [];
    const rows = mapTableToNormalizedRows(noDateTable('Data'), 'VOC_2026.xlsx', {}, undefined, (w) => warnings.push(w));
    assert.deepEqual(rows.map((row) => row.date), [undefined, undefined]);
    assert.equal(warnings.length, 0);
  });

  it('each sheet of a workbook gets its own month', () => {
    const aug = mapTableToNormalizedRows(noDateTable('Aug'), 'VOC_2026.xlsx');
    const sep = mapTableToNormalizedRows(noDateTable('Sep'), 'VOC_2026.xlsx');
    assert.equal(aug[0].date, '2026-08-01');
    assert.equal(sep[0].date, '2026-09-01');
  });

  it('the async (worker) path gives the same result', async () => {
    const warnings: ImportWarning[] = [];
    const rows = await mapTableToNormalizedRowsAsync(
      noDateTable('Sep'), 'VOC_2026.xlsx', undefined, {}, undefined, (w) => warnings.push(w),
    );
    assert.deepEqual(rows.map((row) => row.date), ['2026-09-01', '2026-09-01']);
    assert.deepEqual(warnings.map((w) => w.code), ['DATE_FROM_SHEET_NAME']);
  });
});
