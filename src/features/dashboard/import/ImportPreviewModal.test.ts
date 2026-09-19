import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialSheetStates,
  getCanonicalFieldLabel,
} from './ImportPreviewModal';
import { rememberMapping, clearMemory, getAllLearnedMappings, forgetMapping } from './mappingMemory';
import type { SheetTable } from './types';

describe('ImportPreviewModal & UI integration', () => {
  beforeEach(() => {
    clearMemory();
  });

  describe('getCanonicalFieldLabel', () => {
    it('returns human-readable labels for known canonical fields', () => {
      assert.equal(getCanonicalFieldLabel('agentName'), 'Agent Name');
      assert.equal(getCanonicalFieldLabel('aht'), 'Average Handle Time (AHT)');
      assert.equal(getCanonicalFieldLabel('vxs'), 'Customer Satisfaction (VXS / CSAT)');
      assert.equal(getCanonicalFieldLabel('employeeId'), 'Employee ID');
    });

    it('falls back to raw field name if unknown', () => {
      assert.equal(getCanonicalFieldLabel('customField123'), 'customField123');
    });
  });

  describe('buildInitialSheetStates with scoring & fingerprinter', () => {
    it('populates fingerprint, candidates, and score for columns with sample values', () => {
      const mockTable: SheetTable = {
        workbookName: 'test_workbook.xlsx',
        sheetName: 'Sheet1',
        index: 0,
        rowCount: 10,
        headerRow: ['Rep Name', 'Agent ID', 'Handle Time', 'CSAT Rate', 'IVR_Call_ID'],
        rows: [
          ['Smith, John', '1234567', '450', '0.85', 'CALL_ABC_123'],
          ['Doe, Jane', '2345678', '380', '0.92', 'CALL_DEF_456'],
          ['Johnson, Bob', '3456789', '510', '0.78', 'CALL_GHI_789'],
          ['Miller, Alice', '4567890', '420', '0.88', 'CALL_JKL_012'],
          ['Davis, Mark', '5678901', '390', '0.91', 'CALL_MNO_345'],
        ],
      };

      const states = buildInitialSheetStates([mockTable]);
      assert.equal(states.length, 1);
      const sheet = states[0];
      assert.equal(sheet.columnMappings.length, 5);

      // Rep Name -> agentName
      const repCol = sheet.columnMappings[0];
      assert.equal(repCol.mappedField, 'agentName');
      assert.equal(repCol.confidence, 'exact');
      assert.ok(repCol.candidates && repCol.candidates.length > 0);
      assert.ok(repCol.score && repCol.score > 0);
      assert.equal(repCol.fingerprint, 'name-like');

      // Agent ID -> employeeId
      const idCol = sheet.columnMappings[1];
      assert.equal(idCol.mappedField, 'employeeId');
      assert.equal(idCol.fingerprint, 'employee-id-like');

      // Handle Time -> aht
      const ahtCol = sheet.columnMappings[2];
      assert.equal(ahtCol.mappedField, 'aht');
      assert.equal(ahtCol.fingerprint, 'duration-seconds');

      // CSAT Rate -> vxs
      const csatCol = sheet.columnMappings[3];
      assert.equal(csatCol.mappedField, 'vxs');
      assert.equal(csatCol.fingerprint, 'percent-decimal');

      // IVR_Call_ID -> unmapped (false-positive blocked by call-id-like fingerprint)
      const callIdCol = sheet.columnMappings[4];
      assert.equal(callIdCol.mappedField, null);
      assert.equal(callIdCol.confidence, 'none');
      assert.equal(callIdCol.matchType, 'unmapped');
    });

    it('identifies remembered mappings with "remembered" confidence and matchType', () => {
      // User previously mapped "custom rep tag" to "agentName"
      rememberMapping('custom rep tag', 'agentName');

      const mockTable: SheetTable = {
        workbookName: 'test_ops.xlsx',
        sheetName: 'Agents',
        index: 0,
        rowCount: 5,
        headerRow: ['custom rep tag', 'Unknown Header'],
        rows: [
          ['Alice Walker', 'value1'],
          ['Charlie Brown', 'value2'],
        ],
      };

      const states = buildInitialSheetStates([mockTable]);
      const rememberedCol = states[0].columnMappings[0];

      assert.equal(rememberedCol.mappedField, 'agentName');
      assert.equal(rememberedCol.confidence, 'remembered');
      assert.equal(rememberedCol.matchType, 'remembered');
      assert.ok(rememberedCol.score && rememberedCol.score >= 85);
    });

    it('samples up to 50 rows for robust pattern fingerprinting', () => {
      const rows: unknown[][] = [];
      for (let i = 0; i < 60; i++) {
        rows.push([`${1000000 + i}`, (0.8 + (i % 10) * 0.01).toFixed(2)]);
      }

      const mockTable: SheetTable = {
        workbookName: 'large_sample.xlsx',
        sheetName: 'Data',
        index: 0,
        rowCount: rows.length,
        headerRow: ['User Code', 'Satisfaction'],
        rows,
      };

      const states = buildInitialSheetStates([mockTable]);
      const userCodeCol = states[0].columnMappings[0];
      const satCol = states[0].columnMappings[1];

      assert.equal(userCodeCol.fingerprint, 'employee-id-like');
      assert.equal(satCol.fingerprint, 'percent-decimal');
      assert.equal(satCol.mappedField, 'vxs');
    });
  });

  describe('Mapping memory integration behavior', () => {
    it('allows forgetting a mapping which clears remembered association', () => {
      rememberMapping('agent alias header', 'agentName');
      assert.equal(getAllLearnedMappings().length, 1);

      forgetMapping('agent alias header');
      assert.equal(getAllLearnedMappings().length, 0);
    });
  });
});

