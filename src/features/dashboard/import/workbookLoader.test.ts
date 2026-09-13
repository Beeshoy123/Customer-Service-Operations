import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseWorkbookSheets } from './workbookLoader';

describe('workbookLoader', () => {
  it('separates headerRow from data rows and sets rowCount to data row count', () => {
    // Create an in-memory workbook with 1 header row and 2 data rows
    const data = [
      ['Agent Name', 'Date', 'Calls'],
      ['Alice Smith', '2026-01-01', 10],
      ['Bob Jones', '2026-01-01', 15],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PerformanceData');

    const result = parseWorkbookSheets(workbook);

    assert.equal(result.sheets.length, 1);
    const sheet = result.sheets[0];

    // headerRow should contain the first row
    assert.deepEqual(sheet.headerRow, ['Agent Name', 'Date', 'Calls']);

    // rows should contain ONLY data rows, never the header row
    assert.equal(sheet.rows.length, 2);
    assert.deepEqual(sheet.rows[0], ['Alice Smith', '2026-01-01', '10']);
    assert.deepEqual(sheet.rows[1], ['Bob Jones', '2026-01-01', '15']);

    // rowCount must reflect the data row count
    assert.equal(sheet.rowCount, 2);
  });

  it('handles sheet with header only and 0 data rows', () => {
    const data = [
      ['Agent Name', 'Date', 'Calls'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'EmptyData');

    const result = parseWorkbookSheets(workbook);

    assert.equal(result.sheets.length, 1);
    const sheet = result.sheets[0];
    assert.deepEqual(sheet.headerRow, ['Agent Name', 'Date', 'Calls']);
    assert.equal(sheet.rows.length, 0);
    assert.equal(sheet.rowCount, 0);
  });
});

