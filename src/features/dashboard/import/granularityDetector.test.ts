import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectGranularity } from './granularityDetector';
import { normalizeSheetHeaders } from './schemaNormalizer';
import type { SheetTable } from './types';

describe('granularityDetector', () => {
  it('returns unknown when no column maps to agentName or employeeId', () => {
    const table: SheetTable = {
      workbookName: 'test.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Date', 'Calls', 'AHT'],
      rows: [
        ['2026-01-01', 10, 300],
        ['2026-01-02', 15, 250],
      ],
      rowCount: 2,
    };

    const mapping = normalizeSheetHeaders(table.headerRow as string[]);
    const result = detectGranularity(table, mapping);

    assert.equal(result.granularity, 'unknown');
    assert.equal(result.classification, 'unknown');
    assert.equal(result.averageRowsPerAgentDate, 0);
    assert.equal(result.totalGroups, 0);
  });

  it('returns unknown when no column maps to date', () => {
    const table: SheetTable = {
      workbookName: 'test.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Agent Name', 'Calls', 'AHT'],
      rows: [
        ['Alice Smith', 10, 300],
        ['Bob Jones', 15, 250],
      ],
      rowCount: 2,
    };

    const mapping = normalizeSheetHeaders(table.headerRow as string[]);
    const result = detectGranularity(table, mapping);

    assert.equal(result.granularity, 'unknown');
    assert.equal(result.classification, 'unknown');
    assert.equal(result.averageRowsPerAgentDate, 0);
    assert.equal(result.totalGroups, 0);
  });

  it('returns unknown when table has no data rows', () => {
    const table: SheetTable = {
      workbookName: 'test.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Agent Name', 'Date', 'Calls'],
      rows: [],
      rowCount: 0,
    };

    const result = detectGranularity(table);
    assert.equal(result.granularity, 'unknown');
    assert.equal(result.averageRowsPerAgentDate, 0);
  });

  it('classifies 1 row per agent per day as aggregate', () => {
    const table: SheetTable = {
      workbookName: 'daily_stats.xlsx',
      sheetName: 'Stats',
      index: 0,
      headerRow: ['Agent Name', 'Date', 'Calls', 'AHT'],
      rows: [
        ['Alice Smith', '2026-01-01', 25, 310],
        ['Alice Smith', '2026-01-02', 30, 290],
        ['Bob Jones', '2026-01-01', 20, 330],
        ['Bob Jones', '2026-01-02', 22, 315],
      ],
      rowCount: 4,
    };

    const result = detectGranularity(table);
    assert.equal(result.granularity, 'aggregate');
    assert.equal(result.classification, 'aggregate');
    assert.equal(result.averageRowsPerAgentDate, 1.0);
    assert.equal(result.totalGroups, 4);
    assert.equal(result.totalRows, 4);
  });

  it('classifies aggregate data with minor duplicates (avg <= 1.5) as aggregate', () => {
    // 5 rows across 4 unique (agent, date) groups -> avg = 5 / 4 = 1.25 <= 1.5
    const table: SheetTable = {
      workbookName: 'daily_with_split.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Employee ID', 'Date', 'Calls'],
      rows: [
        ['E101', '2026-01-01', 12],
        ['E101', '2026-01-01', 13], // split shift or adjustment
        ['E101', '2026-01-02', 25],
        ['E102', '2026-01-01', 20],
        ['E102', '2026-01-02', 18],
      ],
      rowCount: 5,
    };

    const result = detectGranularity(table);
    assert.equal(result.granularity, 'aggregate');
    assert.equal(result.averageRowsPerAgentDate, 1.25);
    assert.equal(result.totalGroups, 4);
    assert.equal(result.totalRows, 5);
  });

  it('classifies many rows per agent per day as transaction', () => {
    // 10 calls on same day for Alice, 10 calls for Bob -> avg = 20 / 2 = 10.0 > 1.5
    const rows: unknown[][] = [];
    for (let i = 0; i < 10; i += 1) {
      rows.push(['Alice Smith', '2026-01-01', 1, 180 + i * 10]);
    }
    for (let i = 0; i < 10; i += 1) {
      rows.push(['Bob Jones', '2026-01-01', 1, 200 + i * 5]);
    }

    const table: SheetTable = {
      workbookName: 'call_logs.xlsx',
      sheetName: 'CallDetail',
      index: 0,
      headerRow: ['Agent Name', 'Date', 'Calls', 'Handle Time'],
      rows,
      rowCount: rows.length,
    };

    const result = detectGranularity(table);
    assert.equal(result.granularity, 'transaction');
    assert.equal(result.classification, 'transaction');
    assert.equal(result.averageRowsPerAgentDate, 10.0);
    assert.equal(result.totalGroups, 2);
    assert.equal(result.totalRows, 20);
  });

  it('handles threshold boundary correctly', () => {
    // 3 rows for 2 groups -> 3 / 2 = 1.5 -> aggregate (<= 1.5)
    const tableAtThreshold: SheetTable = {
      workbookName: 'test.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Agent', 'Date'],
      rows: [
        ['Agent A', '2026-01-01'],
        ['Agent A', '2026-01-01'],
        ['Agent B', '2026-01-01'],
      ],
      rowCount: 3,
    };

    const resultAtThreshold = detectGranularity(tableAtThreshold);
    assert.equal(resultAtThreshold.averageRowsPerAgentDate, 1.5);
    assert.equal(resultAtThreshold.granularity, 'aggregate');

    // 8 rows for 5 groups -> 8 / 5 = 1.6 -> transaction (> 1.5)
    const tableAboveThreshold: SheetTable = {
      workbookName: 'test.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Agent', 'Date'],
      rows: [
        ['Agent A', '2026-01-01'],
        ['Agent A', '2026-01-01'],
        ['Agent A', '2026-01-01'], // 3 rows for (A, 01-01)
        ['Agent A', '2026-01-02'],
        ['Agent A', '2026-01-02'], // 2 rows for (A, 01-02)
        ['Agent B', '2026-01-01'], // 1 row
        ['Agent B', '2026-01-02'], // 1 row
        ['Agent B', '2026-01-03'], // 1 row
      ],
      rowCount: 8,
    };

    const resultAboveThreshold = detectGranularity(tableAboveThreshold);
    assert.equal(resultAboveThreshold.averageRowsPerAgentDate, 1.6);
    assert.equal(resultAboveThreshold.granularity, 'transaction');
  });

  it('supports custom threshold option', () => {
    const table: SheetTable = {
      workbookName: 'test.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Agent', 'Date'],
      rows: [
        ['Agent A', '2026-01-01'],
        ['Agent A', '2026-01-01'], // 2 rows, 1 group -> avg = 2.0
      ],
      rowCount: 2,
    };

    // With default threshold (1.5) -> transaction
    const defaultResult = detectGranularity(table);
    assert.equal(defaultResult.granularity, 'transaction');

    // With custom threshold (2.5) -> aggregate
    const customResult = detectGranularity(table, null, { threshold: 2.5 });
    assert.equal(customResult.granularity, 'aggregate');
  });

  it('supports column mapping as an explicit dictionary', () => {
    const table: SheetTable = {
      workbookName: 'custom_headers.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['CustomCol1', 'CustomCol2', 'Metric'],
      rows: [
        ['Agent 007', '2026-03-01', 50],
        ['Agent 007', '2026-03-02', 55],
      ],
      rowCount: 2,
    };

    const mapping = {
      CustomCol1: 'agentName',
      CustomCol2: 'date',
    };

    const result = detectGranularity(table, mapping);
    assert.equal(result.granularity, 'aggregate');
    assert.equal(result.averageRowsPerAgentDate, 1.0);
  });

  it('prioritizes employeeId over agentName when both are present', () => {
    // Two rows with same employeeId but slightly different agent name spellings
    const table: SheetTable = {
      workbookName: 'test.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Employee ID', 'Agent Name', 'Date'],
      rows: [
        ['EMP-999', 'Johnathan Doe', '2026-01-01'],
        ['EMP-999', 'John Doe', '2026-01-01'], // Same employee ID, should group together!
      ],
      rowCount: 2,
    };

    const result = detectGranularity(table);
    // Grouped by EMP-999 + 2026-01-01 -> 1 group of 2 rows -> avg = 2.0 -> transaction
    assert.equal(result.totalGroups, 1);
    assert.equal(result.averageRowsPerAgentDate, 2.0);
    assert.equal(result.granularity, 'transaction');
  });

  it('normalizes various date formats via schemaNormalizer logic', () => {
    const table: SheetTable = {
      workbookName: 'dates.xlsx',
      sheetName: 'Sheet1',
      index: 0,
      headerRow: ['Agent', 'Date'],
      rows: [
        ['Alice', '2026-01-15'],
        ['Alice', '01/15/2026'], // Normalized to 2026-01-15 -> same date!
      ],
      rowCount: 2,
    };

    const result = detectGranularity(table);
    // Both rows normalize to (Alice, 2026-01-15) -> 1 group, 2 rows -> avg = 2.0
    assert.equal(result.totalGroups, 1);
    assert.equal(result.averageRowsPerAgentDate, 2.0);
  });
});
