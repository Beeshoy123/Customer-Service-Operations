import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeNormalizedRows } from './mergeData';
import type { NormalizedRow } from './types';

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

