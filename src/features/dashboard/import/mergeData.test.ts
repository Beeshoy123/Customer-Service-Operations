import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeNormalizedRows,
  mergeNormalizedRowsWithDetails,
  detectDuplicateFiles,
} from './mergeData';
import type { NormalizedRow, ImportWarning } from './types';

describe('mergeNormalizedRows', () => {
  it('computes the true arithmetic mean across 3+ rows for averageFields (not pairwise average)', () => {
    // 3 rows for the same agent and date
    // Old pairwise average would calculate: ((10 + 20) / 2 + 30) / 2 = 22.5
    // Correct true mean: (10 + 20 + 30) / 3 = 20
    const rows: NormalizedRow[] = [
      {
        agentName: 'Alice Smith',
        employeeId: 'EMP001',
        date: '2026-01-01',
        aht: 10,
        hold: 60,
        calls: 5,
      },
      {
        agentName: 'Alice Smith',
        employeeId: 'EMP001',
        date: '2026-01-01',
        aht: 20,
        hold: 120,
        calls: 10,
      },
      {
        agentName: 'Alice Smith',
        employeeId: 'EMP001',
        date: '2026-01-01',
        aht: 30,
        hold: 180,
        calls: 15,
      },
    ];

    const merged = mergeNormalizedRows(rows);

    assert.equal(merged.length, 1);
    const result = merged[0];

    // Check true mean for averageFields
    assert.equal(result.aht, 20);
    assert.equal(result.hold, 120);

    // Check sum for sumFields
    assert.equal(result.calls, 30);
  });

  it('computes the true arithmetic mean across 4 rows with varying values', () => {
    // 4 rows: 10, 20, 30, 40 -> true mean = 25
    // Pairwise would be: (((10 + 20)/2 + 30)/2 + 40)/2 = (22.5 + 40)/2 = 31.25 (way off!)
    const rows: NormalizedRow[] = [
      { agentName: 'Bob', employeeId: 'EMP002', date: '2026-01-02', aht: 10 },
      { agentName: 'Bob', employeeId: 'EMP002', date: '2026-01-02', aht: 20 },
      { agentName: 'Bob', employeeId: 'EMP002', date: '2026-01-02', aht: 30 },
      { agentName: 'Bob', employeeId: 'EMP002', date: '2026-01-02', aht: 40 },
    ];

    const merged = mergeNormalizedRows(rows);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].aht, 25);
  });

  it('maintains expected behavior for common 2-row case', () => {
    const rows: NormalizedRow[] = [
      {
        agentName: 'Charlie',
        employeeId: 'EMP003',
        date: '2026-01-03',
        aht: 10,
        calls: 8,
        netOcc: 80,
      },
      {
        agentName: 'Charlie',
        employeeId: 'EMP003',
        date: '2026-01-03',
        aht: 20,
        calls: 12,
        netOcc: 90,
      },
    ];

    const merged = mergeNormalizedRows(rows);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].aht, 15);
    assert.equal(merged[0].netOcc, 85);
    assert.equal(merged[0].calls, 20);
  });

  it('handles rows where only a subset have values for an averageField', () => {
    // 3 rows, but only 2 have an aht value (row 2 has null/missing)
    const rows: NormalizedRow[] = [
      { agentName: 'Diana', employeeId: 'EMP004', date: '2026-01-04', aht: 20 },
      { agentName: 'Diana', employeeId: 'EMP004', date: '2026-01-04', aht: null },
      { agentName: 'Diana', employeeId: 'EMP004', date: '2026-01-04', aht: 40 },
    ];

    const merged = mergeNormalizedRows(rows);
    assert.equal(merged.length, 1);
    // (20 + 40) / 2 = 30
    assert.equal(merged[0].aht, 30);
  });

  it('preserves distinct keys as separate rows', () => {
    const rows: NormalizedRow[] = [
      { agentName: 'Alice', employeeId: 'EMP001', date: '2026-01-01', aht: 10 },
      { agentName: 'Bob', employeeId: 'EMP002', date: '2026-01-01', aht: 20 },
      { agentName: 'Alice', employeeId: 'EMP001', date: '2026-01-02', aht: 30 },
    ];

    const merged = mergeNormalizedRows(rows);
    assert.equal(merged.length, 3);
  });

  it('returns empty array when input is empty', () => {
    assert.deepEqual(mergeNormalizedRows([]), []);
  });
});

describe('Problem 7: Duplicate Source Detection & Prevention of Double Counting', () => {
  it('deduplicates rows from the exact same file and sheet so calls are not doubled on duplicate upload', () => {
    const rows: NormalizedRow[] = [
      {
        agentName: 'Sarah Connor',
        employeeId: 'EMP101',
        date: '2026-02-01',
        calls: 25,
        aht: 310,
        sourceFile: 'monthly_calls.xlsx',
        sourceSheet: 'Sheet1',
      },
      // Same record uploaded twice (e.g. user selected same file or same tab)
      {
        agentName: 'Sarah Connor',
        employeeId: 'EMP101',
        date: '2026-02-01',
        calls: 25,
        aht: 310,
        sourceFile: 'monthly_calls.xlsx',
        sourceSheet: 'Sheet1',
      },
    ];

    const warnings: ImportWarning[] = [];
    const merged = mergeNormalizedRows(rows, {
      onWarning: (w) => warnings.push(w),
    });

    assert.equal(merged.length, 1);
    // Crucial check: calls must remain 25, NOT doubled to 50!
    assert.equal(merged[0].calls, 25);
    assert.equal(merged[0].aht, 310);

    // Verify warning was emitted
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].code, 'DUPLICATE_SOURCE_RECORD');
    assert.ok(warnings[0].message.includes('Sarah Connor'));
    assert.ok(warnings[0].message.includes('monthly_calls.xlsx'));
  });

  it('merges distinct sources while deduplicating same-source duplicate rows', () => {
    const rows: NormalizedRow[] = [
      // Phone source (uploaded twice accidentally)
      {
        agentName: 'John Doe',
        employeeId: 'EMP102',
        date: '2026-02-02',
        calls: 20,
        aht: 300,
        sourceFile: 'phone_ops.xlsx',
        sourceSheet: 'Calls',
      },
      {
        agentName: 'John Doe',
        employeeId: 'EMP102',
        date: '2026-02-02',
        calls: 20,
        aht: 300,
        sourceFile: 'phone_ops.xlsx',
        sourceSheet: 'Calls',
      },
      // Chat source (distinct valid source)
      {
        agentName: 'John Doe',
        employeeId: 'EMP102',
        date: '2026-02-02',
        calls: 15,
        aht: 150,
        sourceFile: 'chat_ops.xlsx',
        sourceSheet: 'Chats',
      },
    ];

    const details = mergeNormalizedRowsWithDetails(rows);
    assert.equal(details.rows.length, 1);
    // Phone calls (20 deduped) + Chat calls (15) = 35 (not 55!)
    assert.equal(details.rows[0].calls, 35);
    // Arithmetic average across 2 distinct sources: (300 + 150) / 2 = 225
    assert.equal(details.rows[0].aht, 225);
    assert.equal(details.duplicateCount, 1);
    assert.equal(details.warnings.length, 1);
  });

  it('allows same-source duplicates when duplicateSourceHandling is set to allow', () => {
    const rows: NormalizedRow[] = [
      {
        agentName: 'Agent X',
        date: '2026-02-03',
        calls: 10,
        sourceFile: 'file.csv',
        sourceSheet: 'CSV',
      },
      {
        agentName: 'Agent X',
        date: '2026-02-03',
        calls: 10,
        sourceFile: 'file.csv',
        sourceSheet: 'CSV',
      },
    ];

    const merged = mergeNormalizedRows(rows, { duplicateSourceHandling: 'allow' });
    assert.equal(merged.length, 1);
    // Allowed duplicate sum: 10 + 10 = 20
    assert.equal(merged[0].calls, 20);
  });
});

describe('Problem 7: Per-Field Merge Strategy Parameter', () => {
  it('supports last-seen merge strategy for rate fields across conflicting scopes', () => {
    // Two workbooks with conflicting AHT: Phone (300) vs Chat (120)
    const rows: NormalizedRow[] = [
      {
        agentName: 'Alice',
        date: '2026-02-04',
        aht: 300,
        sourceFile: 'phone.xlsx',
        sourceSheet: 'Sheet1',
      },
      {
        agentName: 'Alice',
        date: '2026-02-04',
        aht: 120,
        sourceFile: 'chat.xlsx',
        sourceSheet: 'Sheet1',
      },
    ];

    // Default averages them: (300 + 120) / 2 = 210
    const defaultMerged = mergeNormalizedRows(rows);
    assert.equal(defaultMerged[0].aht, 210);

    // With mergeStrategy: last-seen takes 120
    const lastSeenMerged = mergeNormalizedRows(rows, {
      mergeStrategy: { aht: 'last-seen' },
    });
    assert.equal(lastSeenMerged[0].aht, 120);

    // With mergeStrategy: first-seen takes 300
    const firstSeenMerged = mergeNormalizedRows(rows, {
      mergeStrategy: { aht: 'first-seen' },
    });
    assert.equal(firstSeenMerged[0].aht, 300);
  });

  it('supports sum merge strategy override for rate fields', () => {
    const rows: NormalizedRow[] = [
      { agentName: 'Bob', date: '2026-02-05', aht: 100, sourceFile: 'f1.csv' },
      { agentName: 'Bob', date: '2026-02-05', aht: 200, sourceFile: 'f2.csv' },
    ];

    const merged = mergeNormalizedRows(rows, {
      mergeStrategy: { aht: 'sum' },
    });
    assert.equal(merged[0].aht, 300);
  });

  it('supports average merge strategy override for additive fields', () => {
    const rows: NormalizedRow[] = [
      { agentName: 'Charlie', date: '2026-02-06', calls: 20, sourceFile: 'f1.csv' },
      { agentName: 'Charlie', date: '2026-02-06', calls: 40, sourceFile: 'f2.csv' },
    ];

    const merged = mergeNormalizedRows(rows, {
      mergeStrategy: { calls: 'average' },
    });
    assert.equal(merged[0].calls, 30);
  });

  it('supports last-seen merge strategy for additive fields to avoid summing', () => {
    const rows: NormalizedRow[] = [
      { agentName: 'Diana', date: '2026-02-07', calls: 15, sourceFile: 'f1.csv' },
      { agentName: 'Diana', date: '2026-02-07', calls: 25, sourceFile: 'f2.csv' },
    ];

    const merged = mergeNormalizedRows(rows, {
      mergeStrategy: { calls: 'last-seen' },
    });
    assert.equal(merged[0].calls, 25);
  });
});

describe('Problem 7: detectDuplicateFiles', () => {
  it('detects duplicate files in upload batches based on filename and size', () => {
    const file1 = { name: 'Q1_Report.xlsx', size: 10240 } as File;
    const file2 = { name: 'q1_report.xlsx', size: 10240 } as File; // duplicate (case-insensitive)
    const file3 = { name: 'Q2_Report.xlsx', size: 12500 } as File;

    const { uniqueFiles, duplicateWarnings } = detectDuplicateFiles([file1, file2, file3]);

    assert.equal(uniqueFiles.length, 2);
    assert.equal(uniqueFiles[0].name, 'Q1_Report.xlsx');
    assert.equal(uniqueFiles[1].name, 'Q2_Report.xlsx');

    assert.equal(duplicateWarnings.length, 1);
    assert.equal(duplicateWarnings[0].code, 'DUPLICATE_FILE_UPLOAD');
    assert.ok(duplicateWarnings[0].message.includes('q1_report.xlsx'));
  });

  it('preserves all files when all are unique', () => {
    const f1 = { name: 'A.csv', size: 100 } as File;
    const f2 = { name: 'B.csv', size: 100 } as File;
    const f3 = { name: 'A.csv', size: 200 } as File; // different size

    const { uniqueFiles, duplicateWarnings } = detectDuplicateFiles([f1, f2, f3]);
    assert.equal(uniqueFiles.length, 3);
    assert.equal(duplicateWarnings.length, 0);
  });
});
