import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  parseWorkbookSheets,
  convertWorkbookToSheets,
  getSheetRowCountFromRef,
  isSheetOverThreshold,
  iterateSheetRowsBatched,
  DEFAULT_LARGE_SHEET_ROW_THRESHOLD,
  DEFAULT_BATCH_ROW_SIZE,
} from './workbookLoader';
import type { ImportProgress } from './types';

describe('workbookLoader', () => {
  it('separates headerRow from data rows and sets rowCount to data row count', async () => {
    // Create an in-memory workbook with 1 header row and 2 data rows
    const data = [
      ['Agent Name', 'Date', 'Calls'],
      ['Alice Smith', '2026-01-01', 10],
      ['Bob Jones', '2026-01-01', 15],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PerformanceData');

    const result = await parseWorkbookSheets(workbook);

    assert.equal(result.sheets.length, 1);
    assert.equal(result.totalSheets, 1);
    assert.deepEqual(result.skippedSheets, []);
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

  it('handles sheet with header only and 0 data rows', async () => {
    const data = [
      ['Agent Name', 'Date', 'Calls'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'EmptyData');

    const result = await parseWorkbookSheets(workbook);

    assert.equal(result.sheets.length, 1);
    assert.equal(result.totalSheets, 1);
    assert.deepEqual(result.skippedSheets, []);
    const sheet = result.sheets[0];
    assert.deepEqual(sheet.headerRow, ['Agent Name', 'Date', 'Calls']);
    assert.equal(sheet.rows.length, 0);
    assert.equal(sheet.rowCount, 0);
  });

  it('exposes correct default threshold constants', () => {
    assert.equal(DEFAULT_LARGE_SHEET_ROW_THRESHOLD, 50000);
    assert.equal(DEFAULT_BATCH_ROW_SIZE, 5000);
  });

  it('correctly calculates row count from !ref dimension', () => {
    const sheetWithRef = { '!ref': 'A1:C307201' };
    assert.equal(getSheetRowCountFromRef(sheetWithRef), 307201);

    const sheetWithOffset = { '!ref': 'B5:E15' };
    assert.equal(getSheetRowCountFromRef(sheetWithOffset), 11);

    const emptySheet = {};
    assert.equal(getSheetRowCountFromRef(emptySheet), 0);

    const invalidRef = { '!ref': 'invalid' };
    assert.equal(getSheetRowCountFromRef(invalidRef), 0);
  });

  it('detects when sheet exceeds row threshold or file size threshold', () => {
    const smallSheet = { '!ref': 'A1:C1000' };
    assert.equal(isSheetOverThreshold(smallSheet), false);

    const largeSheet = { '!ref': 'A1:C50000' };
    assert.equal(isSheetOverThreshold(largeSheet), true);

    const customThresholdSheet = { '!ref': 'A1:C500' };
    assert.equal(isSheetOverThreshold(customThresholdSheet, { largeSheetRowThreshold: 400 }), true);
    assert.equal(isSheetOverThreshold(customThresholdSheet, { largeSheetRowThreshold: 600 }), false);

    // Large file size threshold trigger
    assert.equal(isSheetOverThreshold(smallSheet, { fileSize: 15 * 1024 * 1024 }), true);
    assert.equal(isSheetOverThreshold(smallSheet, { fileSize: 5 * 1024 * 1024 }), false);
  });

  it('iterates sheet rows in batches via async generator and yields between batches', async () => {
    const data = [
      ['Header1', 'Header2'],
      ['Row1', '1'],
      ['Row2', '2'],
      ['Row3', '3'],
      ['Row4', '4'],
      ['Row5', '5'],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const batches: unknown[][][] = [];

    for await (const batch of iterateSheetRowsBatched(worksheet, { batchSize: 2 })) {
      batches.push(batch);
    }

    // 6 rows total with batchSize: 2 = 3 batches
    assert.equal(batches.length, 3);
    assert.deepEqual(batches[0], [['Header1', 'Header2'], ['Row1', '1']]);
    assert.deepEqual(batches[1], [['Row2', '2'], ['Row3', '3']]);
    assert.deepEqual(batches[2], [['Row4', '4'], ['Row5', '5']]);
  });

  it('processes large sheet in batches and threads progress callback with expected format', async () => {
    // Generate a sheet with 6,000 rows
    const data: unknown[][] = [['Agent Name', 'Date', 'Score']];
    for (let i = 1; i <= 6000; i += 1) {
      data.push([`Agent ${i}`, '2026-01-01', i]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'LargeData');

    const progressReports: ImportProgress[] = [];

    // Use a custom low threshold of 2,000 rows and 2,000 batch size to test batching
    const result = await parseWorkbookSheets(workbook, {
      largeSheetRowThreshold: 2000,
      batchRowSize: 2000,
      onProgress: (progress) => {
        progressReports.push(progress);
      },
    });

    // Check return shape
    assert.equal(result.sheets.length, 1);
    assert.equal(result.totalSheets, 1);
    assert.deepEqual(result.skippedSheets, []);
    assert.equal(result.sheets[0].rowCount, 6000);

    // Verify progress callbacks reported "Processing sheet X of Y: N / M rows"
    const processingReports = progressReports.filter((p) => p.message?.startsWith('Processing sheet 1 of 1:'));
    assert.ok(processingReports.length > 0, 'Expected batched progress reports');

    // Check message format
    const lastReport = processingReports[processingReports.length - 1];
    assert.match(lastReport.message ?? '', /^Processing sheet 1 of 1: \d{1,3}(,\d{3})* \/ \d{1,3}(,\d{3})* rows$/);
  });

  it('supports 50,000+ row threshold detection and batch processing', async () => {
    // Generate 50,001 rows
    const data: unknown[][] = [['Agent', 'Value']];
    for (let i = 1; i <= 50001; i += 1) {
      data.push([`Agent_${i}`, i]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    assert.equal(isSheetOverThreshold(worksheet), true);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '50kSheet');

    const progressMessages: string[] = [];

    const result = await parseWorkbookSheets(workbook, {
      onProgress: (p) => {
        if (p.message) progressMessages.push(p.message);
      },
    });

    assert.equal(result.sheets.length, 1);
    assert.equal(result.sheets[0].rowCount, 50001);

    // Verify batched progress was called multiple times (50,000 / 5,000 = 10+ batches)
    const batchMessages = progressMessages.filter((m) => m.startsWith('Processing sheet 1 of 1:'));
    assert.ok(batchMessages.length >= 10, `Expected at least 10 batch updates, got ${batchMessages.length}`);
    assert.ok(batchMessages.some((m) => m.includes('5,000') || m.includes('10,000')));
  });

  it('aborts batch iteration when signal is aborted', async () => {
    const data: unknown[][] = [['Header1']];
    for (let i = 1; i <= 1000; i += 1) {
      data.push([`Row ${i}`]);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const controller = new AbortController();

    const iteratePromise = (async () => {
      let count = 0;
      for await (const _ of iterateSheetRowsBatched(worksheet, { batchSize: 10, signal: controller.signal })) {
        count += 1;
        if (count === 2) {
          controller.abort();
        }
      }
    })();

    await assert.rejects(iteratePromise, (error: any) => {
      return error.name === 'AbortError';
    });
  });

  it('convertWorkbookToSheets accepts file and threads progress callback', async () => {
    const data = [
      ['Agent Name', 'Calls'],
      ['Alice', 10],
      ['Bob', 20],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TestSheet');

    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const progressCalls: ImportProgress[] = [];
    const result = await convertWorkbookToSheets(file, (p) => {
      progressCalls.push(p);
    });

    assert.equal(result.sheets.length, 1);
    assert.equal(result.totalSheets, 1);
    assert.equal(result.sheets[0].sheetName, 'TestSheet');
    assert.equal(result.sheets[0].rowCount, 2);
    assert.ok(progressCalls.length > 0);
  });
});
