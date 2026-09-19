import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHeaderToField,
  normalizeSheetHeaders,
  mapTableToNormalizedRows,
  normalizeCellValue,
} from './schemaNormalizer';
import { rememberMapping, clearMemory } from './mappingMemory';
import type { SheetTable } from './types';

describe('schemaNormalizer (Layer 6 — Auto-Import Pattern Fingerprinting & Memory)', () => {
  beforeEach(() => {
    clearMemory();
  });

  describe('normalizeHeaderToField with value samples', () => {
    it('resolves direct alias matches even without samples', () => {
      assert.equal(normalizeHeaderToField('Agent Name'), 'agentName');
      assert.equal(normalizeHeaderToField('Employee ID'), 'employeeId');
      assert.equal(normalizeHeaderToField('Supervisor'), 'supervisor');
      assert.equal(normalizeHeaderToField('Calls Handled'), 'calls');
    });

    it('resolves paired count fields properly', () => {
      assert.equal(normalizeHeaderToField('VXS_Overall_Rep_Pass'), 'vxs_Pass');
      assert.equal(normalizeHeaderToField('VXS_Overall_Rep_Cnt'), 'vxs_Cnt');
    });

    it('blocks false positive matches like IVR_Call_ID when sample values look like call IDs', () => {
      const callIdSamples = ['CALL_ABC_001', 'CALL_ABC_002', 'CALL_ABC_003', 'CALL_ABC_004'];
      const mapped = normalizeHeaderToField('IVR_Call_ID', callIdSamples);
      assert.equal(mapped, null, 'IVR_Call_ID should not be mapped to employeeId');
    });

    it('leverages value fingerprinting for fuzzy headers like "Avg Talk Time"', () => {
      const durationSamples = ['340', '420', '280', '510', '390'];
      const mapped = normalizeHeaderToField('Avg Talk Time', durationSamples);
      assert.equal(mapped, 'aht', 'Avg Talk Time with duration values should score to aht');
    });

    it('utilizes learned memory when samples or headers were previously remembered', () => {
      rememberMapping('Custom Service Satisfaction Metric', 'vxs');

      const mapped = normalizeHeaderToField('Custom Service Satisfaction Metric');
      assert.equal(mapped, 'vxs', 'Should recall learned mapping from memory');
    });
  });

  describe('normalizeSheetHeaders', () => {
    it('normalizes sheet headers without rows', () => {
      const headers = ['Agent Name', 'Handle Time'];
      const result = normalizeSheetHeaders(headers);
      assert.equal(result.length, 2);
      assert.equal(result[0].mappedField, 'agentName');
      assert.equal(result[1].mappedField, 'aht');
    });

    it('extracts sample values from rows to enhance header normalization', () => {
      const headers = ['Rep Tag', 'System Call ID'];
      const rows = [
        ['Alice Smith', 'CALL_111'],
        ['Bob Jones', 'CALL_222'],
        ['Charlie Brown', 'CALL_333'],
        ['David Miller', 'CALL_444'],
      ];

      const result = normalizeSheetHeaders(headers, rows);
      assert.equal(result[0].mappedField, 'agentName');
      assert.equal(result[1].mappedField, null);
    });
  });

  describe('normalizeCellValue', () => {
    it('normalizes percentages, numbers, and dates according to field policy', () => {
      assert.equal(normalizeCellValue('0.85', 'vxs'), 85);
      assert.equal(normalizeCellValue('85%', 'vxs'), 85);
      assert.equal(normalizeCellValue('1,250', 'calls'), 1250);
      assert.equal(normalizeCellValue('2026-09-15', 'date'), '2026-09-15');
      assert.equal(normalizeCellValue('', 'agentName'), null);
      assert.equal(normalizeCellValue(null, 'agentName'), null);
    });
  });

  describe('mapTableToNormalizedRows', () => {
    it('samples rows and resolves mappings once per sheet with fingerprinting support', () => {
      const table: SheetTable = {
        workbookName: 'daily_ops.xlsx',
        sheetName: 'Performance',
        index: 0,
        rowCount: 3,
        headerRow: ['Rep Name', 'Agent ID', 'Handle Time', 'IVR_Call_ID', 'CSAT Rate'],
        rows: [
          ['Smith, John', '1234567', '450', 'CALL_001', '0.88'],
          ['Doe, Jane', '2345678', '380', 'CALL_002', '0.94'],
          ['Brown, Charlie', '3456789', '510', 'CALL_003', '0.79'],
        ],
      };

      const normalized = mapTableToNormalizedRows(table, 'daily_ops.xlsx');
      assert.equal(normalized.length, 3);

      const first = normalized[0];
      assert.equal(first.agentName, 'Smith, John');
      assert.equal(first.employeeId, 1234567);
      assert.equal(first.aht, 450);
      assert.equal(first.vxs, 88);
      // IVR_Call_ID should NOT be mapped into the normalized row
      assert.equal(first.IVR_Call_ID, undefined);
      assert.equal(first.sourceFile, 'daily_ops.xlsx');
      assert.equal(first.sourceSheet, 'Performance');
    });

    it('returns empty array if table has no headers or mapped fields', () => {
      const emptyTable: SheetTable = {
        workbookName: 'empty.xlsx',
        sheetName: 'Sheet1',
        index: 0,
        rowCount: 0,
        headerRow: [],
        rows: [],
      };
      assert.deepEqual(mapTableToNormalizedRows(emptyTable, 'empty.xlsx'), []);
    });
  });
});
