import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLikelyDataSheet,
  evaluateSheet,
  selectSheetsWithDetails,
  selectSheets,
} from './sheetSelector';
import type { SheetTable } from './types';

describe('sheetSelector (Intelligent Data Sheet Detection)', () => {
  const createMockTable = (
    sheetName: string,
    headerRow: string[],
    rowCount: number,
    sampleValues?: unknown[][]
  ): SheetTable => {
    const rows = sampleValues || Array.from({ length: rowCount }, (_, r) =>
      headerRow.map((_h, c) => `val_${r}_${c}`)
    );
    return {
      workbookName: 'test_workbook.xlsx',
      sheetName,
      index: 0,
      headerRow,
      rows,
      rowCount,
    };
  };

  describe('isLikelyDataSheet & evaluateSheet', () => {
    it('retains sheets with >= 5 non-empty columns and > 5 rows by default without keywords', () => {
      const table = createMockTable(
        'CustomMetrics',
        ['Col_A', 'Col_B', 'Col_C', 'Col_D', 'Col_E'],
        12
      );
      const evalResult = evaluateSheet(table);
      assert.equal(evalResult.isLikelyData, true);
      assert.match(evalResult.reason, /Sufficient tabular data shape/);
      assert.equal(isLikelyDataSheet(table), true);
    });

    it('retains diverse account headers like Rep, Interaction Date, Handle Time', () => {
      const table = createMockTable(
        'InteractionLog',
        ['Rep', 'Interaction Date', 'Handle Time'],
        3
      );
      const evalResult = evaluateSheet(table);
      assert.equal(evalResult.isLikelyData, true);
      assert.match(evalResult.reason, /operational header keywords/);
      assert.equal(isLikelyDataSheet(table), true);
    });

    it('integrates with analyzeColumnValues to recognize date, duration, and call ID patterns', () => {
      // Obscure headers without any keywords, fewer than 5 columns and 4 rows
      const table = createMockTable(
        'ExportData',
        ['FLD_101', 'FLD_102', 'FLD_103'],
        4,
        [
          ['2024-03-01', '00:04:15', 'IVR_20240301_001'],
          ['2024-03-01', '00:02:45', 'IVR_20240301_002'],
          ['2024-03-02', '00:05:30', 'IVR_20240301_003'],
          ['2024-03-02', '00:01:20', 'IVR_20240301_004'],
        ]
      );
      const evalResult = evaluateSheet(table);
      assert.equal(evalResult.isLikelyData, true);
      assert.match(evalResult.reason, /Recognized operational data patterns/);
      assert.equal(isLikelyDataSheet(table), true);
    });

    it('skips empty sheets and provides descriptive reason', () => {
      const emptyTable: SheetTable = {
        workbookName: 'test.xlsx',
        sheetName: 'BlankSheet',
        index: 0,
        headerRow: [],
        rows: [],
        rowCount: 0,
      };
      const evalResult = evaluateSheet(emptyTable);
      assert.equal(evalResult.isLikelyData, false);
      assert.equal(evalResult.reason, 'Empty sheet (no data rows)');
      assert.equal(isLikelyDataSheet(emptyTable), false);
    });

    it('skips sheets matching excluded names like Notes, Instructions, Summary', () => {
      const notesTable = createMockTable('Release Notes', ['Title', 'Description'], 10);
      const evalResult = evaluateSheet(notesTable);
      assert.equal(evalResult.isLikelyData, false);
      assert.match(evalResult.reason, /Excluded by sheet name/);
      assert.equal(isLikelyDataSheet(notesTable), false);

      const summaryTable = createMockTable('Summary', ['Metric', 'Total'], 5);
      const summaryEval = evaluateSheet(summaryTable);
      assert.equal(summaryEval.isLikelyData, false);
      assert.match(summaryEval.reason, /Excluded by sheet name/);
    });

    it('skips sheets with low columns and low rows lacking keywords or recognizable patterns', () => {
      const smallTable = createMockTable('Misc', ['Col1', 'Col2'], 3, [
        ['abc', 'def'],
        ['ghi', 'jkl'],
        ['mno', 'pqr'],
      ]);
      const evalResult = evaluateSheet(smallTable);
      assert.equal(evalResult.isLikelyData, false);
      assert.match(evalResult.reason, /fewer than 5 columns/i);
      assert.equal(isLikelyDataSheet(smallTable), false);
    });
  });

  describe('selectSheetsWithDetails & selectSheets', () => {
    it('partitions sheets into selected and skipped with reasons and full table references', () => {
      const validDataSheet = createMockTable(
        'DailyCalls',
        ['Agent Name', 'Call Date', 'Total Calls', 'AHT Sec', 'CSAT Score'],
        20
      );
      const notesSheet = createMockTable('Instructions', ['Step', 'Action'], 4);
      const emptySheet: SheetTable = {
        workbookName: 'test.xlsx',
        sheetName: 'Empty',
        index: 2,
        headerRow: [],
        rows: [],
        rowCount: 0,
      };

      const result = selectSheetsWithDetails([validDataSheet, notesSheet, emptySheet]);
      assert.equal(result.selectedSheets.length, 1);
      assert.equal(result.selectedSheets[0].sheetName, 'DailyCalls');

      assert.equal(result.skippedSheets.length, 2);
      assert.equal(result.skippedSheets[0].sheetName, 'Instructions');
      assert.match(result.skippedSheets[0].reason, /Excluded by sheet name/);
      assert.equal(result.skippedSheets[0].table, notesSheet);

      assert.equal(result.skippedSheets[1].sheetName, 'Empty');
      assert.equal(result.skippedSheets[1].reason, 'Empty sheet (no data rows)');
    });

    it('allows manual override when selectedNames is provided', () => {
      const notesSheet = createMockTable('Instructions', ['Step', 'Action'], 4);
      const dataSheet = createMockTable('Data', ['Agent', 'Calls', 'AHT', 'Date', 'VXS'], 10);

      // User specifically chooses to include "Instructions"
      const result = selectSheetsWithDetails([notesSheet, dataSheet], ['Instructions']);
      assert.equal(result.selectedSheets.length, 1);
      assert.equal(result.selectedSheets[0].sheetName, 'Instructions');

      assert.equal(result.skippedSheets.length, 1);
      assert.equal(result.skippedSheets[0].sheetName, 'Data');
    });

    it('selectSheets returns selectedSheets array for backward compatibility', () => {
      const valid = createMockTable('Ops', ['Agent', 'Date', 'Calls', 'AHT', 'CSAT'], 15);
      const excluded = createMockTable('Readme', ['A', 'B'], 2);

      const selected = selectSheets([valid, excluded]);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].sheetName, 'Ops');
    });
  });
});
