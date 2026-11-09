import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const { idbGet, idbSet, idbDelete } = await import('./idbStore');

test('idbSet then idbGet returns the same value (nested objects, null kept)', async () => {
  const value = { agents: [{ id: 'A1', name: 'Fake One' }], history: { A1: { '2026-09-01': { calls: 10, aht: null } } } };
  assert.equal(await idbSet('t1', value), true);
  assert.deepEqual(await idbGet('t1'), value);
});

test('idbGet on a missing key returns undefined', async () => {
  assert.equal(await idbGet('nope'), undefined);
});

test('idbSet overwrites the old value', async () => {
  await idbSet('t2', { n: 1 });
  await idbSet('t2', { n: 2 });
  assert.deepEqual(await idbGet('t2'), { n: 2 });
});

test('idbDelete removes a value, and deleting a missing key is fine', async () => {
  await idbSet('t3', { n: 1 });
  assert.equal(await idbDelete('t3'), true);
  assert.equal(await idbGet('t3'), undefined);
  assert.equal(await idbDelete('t3'), true);
});

test('a value that cannot be copied returns false instead of throwing', async () => {
  assert.equal(await idbSet('t4', { fn: () => 1 }), false);
  assert.equal(await idbGet('t4'), undefined);
});

test('a real-size payload (3,000 agents x 50 days = 150,000 agent-days) survives', async () => {
  const history: Record<string, Record<string, { calls: number; aht: number }>> = {};
  for (let a = 0; a < 3000; a++) {
    const days: Record<string, { calls: number; aht: number }> = {};
    for (let d = 1; d <= 50; d++) days[`2026-${String(Math.ceil(d / 28)).padStart(2, '0')}-${String(((d - 1) % 28) + 1).padStart(2, '0')}`] = { calls: a + d, aht: 300 + d };
    history[`AG${a}`] = days;
  }
  assert.equal(await idbSet('big', { historicalData: history }), true);
  const back = await idbGet<{ historicalData: typeof history }>('big');
  let count = 0;
  for (const id of Object.keys(back!.historicalData)) count += Object.keys(back!.historicalData[id]).length;
  assert.equal(count, 150000);
  assert.equal(back!.historicalData.AG2999['2026-01-01'].calls, 2999 + 1);
});
