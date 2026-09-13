import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTransactions, findPassCountPairs } from './aggregateTransactions';
import type { NormalizedRow } from './types';

describe('aggregateTransactions', () => {
  describe('findPassCountPairs', () => {
    it('detects X_Pass and X_Cnt pairs', () => {
      const keys = ['agentName', 'date', 'vxs_Pass', 'vxs_Cnt', 'aht'];
      const pairs = findPassCountPairs(keys);

      assert.equal(pairs.length, 1);
      assert.equal(pairs[0].passField, 'vxs_Pass');
      assert.equal(pairs[0].cntField, 'vxs_Cnt');
      assert.equal(pairs[0].targetField, 'vxs');
    });

    it('detects camelCase and Total suffixes', () => {
      const keys = ['resolve2hrPass', 'resolve2hrTotal', 'calls'];
      const pairs = findPassCountPairs(keys);

      assert.equal(pairs.length, 1);
      assert.equal(pairs[0].passField, 'resolve2hrPass');
      assert.equal(pairs[0].cntField, 'resolve2hrTotal');
      assert.equal(pairs[0].targetField, 'resolve2hr');
    });

    it('detects custom metric pass/total pairs', () => {
      const keys = ['customMetric_Pass', 'customMetric_Count'];
      const pairs = findPassCountPairs(keys);

      assert.equal(pairs.length, 1);
      assert.equal(pairs[0].passField, 'customMetric_Pass');
      assert.equal(pairs[0].cntField, 'customMetric_Count');
      assert.equal(pairs[0].targetField, 'custommetric');
    });
  });

  describe('aggregateTransactions rules', () => {
    it('sets calls to the count of rows in the group, not summing calls column', () => {
      const rows: NormalizedRow[] = [
        { agentName: 'Alice', date: '2026-01-01', calls: 999 },
        { agentName: 'Alice', date: '2026-01-01', calls: 999 },
        { agentName: 'Alice', date: '2026-01-01', calls: 999 },
      ];

      const result = aggregateTransactions(rows);
      assert.equal(result.length, 1);
      // calls must be row count (3), not sum (2997)
      assert.equal(result[0].calls, 3);
    });

    it('sums number fields (like aht) and divides by row count to compute per-call average', () => {
      const rows: NormalizedRow[] = [
        { agentName: 'Alice', date: '2026-01-01', aht: 180 },
        { agentName: 'Alice', date: '2026-01-01', aht: 240 },
        { agentName: 'Alice', date: '2026-01-01', aht: 300 },
      ];

      const result = aggregateTransactions(rows);
      assert.equal(result.length, 1);
      // sum is 720 / 3 = 240
      assert.equal(result[0].aht, 240);
      assert.equal(result[0].calls, 3);
    });

    it('computes pass/cnt pairs as sum(pass) / sum(cnt) * 100 instead of row-by-row average', () => {
      // Row 1: 2 passes out of 2 (100%)
      // Row 2: 0 passes out of 1 (0%)
      // Row 3: 0 passes out of 0 (no survey)
      // Row-by-row avg would be (100 + 0) / 2 = 50%
      // sum(pass)/sum(cnt)*100 = 2 / 3 * 100 = 66.67%
      const rows: NormalizedRow[] = [
        { agentName: 'Bob', date: '2026-01-01', vxs_Pass: 2, vxs_Cnt: 2 },
        { agentName: 'Bob', date: '2026-01-01', vxs_Pass: 0, vxs_Cnt: 1 },
        { agentName: 'Bob', date: '2026-01-01', vxs_Pass: 0, vxs_Cnt: 0 },
      ];

      const result = aggregateTransactions(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].vxs, 66.67);
      assert.equal(result[0].vxs_Pass, 2);
      assert.equal(result[0].vxs_Cnt, 3);
      assert.equal(result[0].calls, 3);
    });

    it('takes the most frequent non-empty value for text fields (mode)', () => {
      const rows: NormalizedRow[] = [
        { agentName: 'Alice', date: '2026-01-01', supervisor: 'Sarah Connor', location: 'Building A' },
        { agentName: 'Alice', date: '2026-01-01', supervisor: 'Sarah Connor', location: 'Building B' },
        { agentName: 'Alice', date: '2026-01-01', supervisor: 'S. Connor', location: 'Building A' },
        { agentName: 'Alice', date: '2026-01-01', supervisor: '', location: null },
      ];

      const result = aggregateTransactions(rows);
      assert.equal(result.length, 1);
      // 'Sarah Connor' (count 2) beats 'S. Connor' (count 1)
      assert.equal(result[0].supervisor, 'Sarah Connor');
      // 'Building A' (count 2) beats 'Building B' (count 1)
      assert.equal(result[0].location, 'Building A');
    });

    it('handles standalone percent fields without pass/cnt pairs by averaging non-null rows', () => {
      const rows: NormalizedRow[] = [
        { agentName: 'Alice', date: '2026-01-01', vxs: 100 },
        { agentName: 'Alice', date: '2026-01-01', vxs: 100 },
        { agentName: 'Alice', date: '2026-01-01', vxs: 40 },
        { agentName: 'Alice', date: '2026-01-01', vxs: null }, // un-surveyed call should not deflate average
      ];

      const result = aggregateTransactions(rows);
      assert.equal(result.length, 1);
      // (100 + 100 + 40) / 3 = 80
      assert.equal(result[0].vxs, 80);
      assert.equal(result[0].calls, 4);
    });

    it('groups by employeeId when present, even if agentName has slight differences', () => {
      const rows: NormalizedRow[] = [
        { employeeId: 'E101', agentName: 'Alice M. Smith', date: '2026-01-01', aht: 200 },
        { employeeId: 'E101', agentName: 'Alice Smith', date: '2026-01-01', aht: 300 },
        { employeeId: 'E101', agentName: 'Alice Smith', date: '2026-01-01', aht: 400 },
      ];

      const result = aggregateTransactions(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].employeeId, 'E101');
      assert.equal(result[0].agentName, 'Alice Smith'); // Most frequent
      assert.equal(result[0].calls, 3);
      assert.equal(result[0].aht, 300);
    });

    it('separates different agents and dates into distinct collapsed rows', () => {
      const rows: NormalizedRow[] = [
        // Alice on 2026-01-01 (2 rows)
        { agentName: 'Alice', date: '2026-01-01', aht: 100 },
        { agentName: 'Alice', date: '2026-01-01', aht: 200 },
        // Alice on 2026-01-02 (1 row)
        { agentName: 'Alice', date: '2026-01-02', aht: 150 },
        // Bob on 2026-01-01 (3 rows)
        { agentName: 'Bob', date: '2026-01-01', aht: 300 },
        { agentName: 'Bob', date: '2026-01-01', aht: 300 },
        { agentName: 'Bob', date: '2026-01-01', aht: 300 },
      ];

      const result = aggregateTransactions(rows);
      assert.equal(result.length, 3);

      const aliceDay1 = result.find((r) => r.agentName === 'Alice' && r.date === '2026-01-01');
      assert.ok(aliceDay1);
      assert.equal(aliceDay1.calls, 2);
      assert.equal(aliceDay1.aht, 150);

      const aliceDay2 = result.find((r) => r.agentName === 'Alice' && r.date === '2026-01-02');
      assert.ok(aliceDay2);
      assert.equal(aliceDay2.calls, 1);
      assert.equal(aliceDay2.aht, 150);

      const bobDay1 = result.find((r) => r.agentName === 'Bob' && r.date === '2026-01-01');
      assert.ok(bobDay1);
      assert.equal(bobDay1.calls, 3);
      assert.equal(bobDay1.aht, 300);
    });

    it('returns empty array when input is empty', () => {
      assert.deepEqual(aggregateTransactions([]), []);
    });

    it('preserves metadata like sourceFile and sourceSheet', () => {
      const rows: NormalizedRow[] = [
        { agentName: 'Alice', date: '2026-01-01', sourceFile: 'jan_calls.xlsx', sourceSheet: 'Sheet1' },
        { agentName: 'Alice', date: '2026-01-01', sourceFile: 'jan_calls.xlsx', sourceSheet: 'Sheet1' },
      ];

      const result = aggregateTransactions(rows);
      assert.equal(result.length, 1);
      assert.equal(result[0].sourceFile, 'jan_calls.xlsx');
      assert.equal(result[0].sourceSheet, 'Sheet1');
    });
  });
});

