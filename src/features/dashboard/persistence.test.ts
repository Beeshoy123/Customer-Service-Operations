import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// Same pattern as account-profile-storage.test.ts: mock localStorage BEFORE importing
// the module under test (the safeStorage facade reads globalThis.localStorage).
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
// persistence.ts only runs in a browser (`typeof window`); make node look like one.
(globalThis as any).window = globalThis;

const { idbGet, idbSet, idbDelete } = await import('./idbStore');
const {
  preloadPersistedDashboardState,
  readPersistedDashboardState,
  saveDashboardPayload,
  resetPersistenceForTests,
} = await import('./persistence');
const { storageKeys } = await import('./storage');

const IDB_KEY = 'dashboard-state';
const sample = (calls: number) => ({
  agents: [{ id: 'A1', name: 'Fake One' }],
  supervisors: ['Fake Sup'],
  oamName: 'Fake Manager',
  historicalData: { A1: { '2026-09-01': { calls } } },
  hasUploadedData: true,
});

beforeEach(async () => {
  store.clear();
  resetPersistenceForTests();
  await idbDelete(IDB_KEY); // remove any value from the previous test
});

test('nothing saved: preload then read returns null', async () => {
  await preloadPersistedDashboardState();
  assert.equal(readPersistedDashboardState(), null);
});

test('data saved in IndexedDB is loaded, and the view choices come from browser storage', async () => {
  await idbSet(IDB_KEY, sample(10));
  store.set(storageKeys.dashboardView, JSON.stringify({ activeTimeframe: 'weekly', selectedMonth: '2026-09' }));
  await preloadPersistedDashboardState();
  const state: any = readPersistedDashboardState();
  assert.equal(state.historicalData.A1['2026-09-01'].calls, 10);
  assert.equal(state.activeTimeframe, 'weekly');
  assert.equal(state.selectedMonth, '2026-09');
});

test('old save in localStorage is copied to IndexedDB once, then removed', async () => {
  store.set(storageKeys.dashboardState, JSON.stringify(sample(7)));
  await preloadPersistedDashboardState();
  const state: any = readPersistedDashboardState();
  assert.equal(state.historicalData.A1['2026-09-01'].calls, 7);
  const inIdb: any = await idbGet(IDB_KEY);
  assert.equal(inIdb.historicalData.A1['2026-09-01'].calls, 7);
  assert.equal(store.has(storageKeys.dashboardState), false, 'old copy removed after the move');
});

test('IndexedDB wins over an old localStorage copy', async () => {
  await idbSet(IDB_KEY, sample(50));
  store.set(storageKeys.dashboardState, JSON.stringify(sample(1)));
  await preloadPersistedDashboardState();
  const state: any = readPersistedDashboardState();
  assert.equal(state.historicalData.A1['2026-09-01'].calls, 50);
});

test('a broken old localStorage value is ignored, not a crash', async () => {
  store.set(storageKeys.dashboardState, '{not json');
  await preloadPersistedDashboardState();
  assert.equal(readPersistedDashboardState(), null);
});

test('saveDashboardPayload: three quick saves end with the newest one', async () => {
  const results = await Promise.all([
    saveDashboardPayload(sample(1)),
    saveDashboardPayload(sample(2)),
    saveDashboardPayload(sample(3)),
  ]);
  assert.deepEqual(results, [true, true, true]);
  const inIdb: any = await idbGet(IDB_KEY);
  assert.equal(inIdb.historicalData.A1['2026-09-01'].calls, 3);
});

test('saveDashboardPayload returns false when the browser refuses the value', async () => {
  const bad: any = { ...sample(1), historicalData: { fn: () => 1 } };
  assert.equal(await saveDashboardPayload(bad), false);
});

test('a saved payload comes back after a "reload" (preload again)', async () => {
  await saveDashboardPayload(sample(42));
  resetPersistenceForTests();
  await preloadPersistedDashboardState();
  const state: any = readPersistedDashboardState();
  assert.equal(state.historicalData.A1['2026-09-01'].calls, 42);
});
