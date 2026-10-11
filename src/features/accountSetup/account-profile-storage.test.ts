import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage BEFORE importing the module under test (same pattern as
// mappingMemory.test.ts). The S6 safeStorage facade reads globalThis.localStorage.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const { listAccountNames, loadAccountProfile, ensureSeedAccount, SEED_ACCOUNT_NAME } =
  await import('./account-profile-storage');

test('listAccountNames seeds "Verizon Consumer" on first run', () => {
  const names = listAccountNames();
  assert.ok(names.includes(SEED_ACCOUNT_NAME), `expected ${SEED_ACCOUNT_NAME} in ${JSON.stringify(names)}`);
});

test('seeded profile is loadable and carries the seed name', () => {
  const profile = loadAccountProfile(SEED_ACCOUNT_NAME);
  assert.ok(profile, 'seeded profile should exist');
  assert.equal(profile!.accountName, SEED_ACCOUNT_NAME);
  assert.ok(profile!.createdAt, 'seeded profile should have createdAt');
});

test('ensureSeedAccount is idempotent — does not overwrite existing data', () => {
  // Mutate the seeded profile, then re-run the guard.
  const existing = loadAccountProfile(SEED_ACCOUNT_NAME)!;
  const patched = { ...existing, accountName: SEED_ACCOUNT_NAME };
  (patched as any).customerExperience = { ...(patched as any).customerExperience, label: 'MY-CUSTOM-LABEL' };
  // Write directly through the same key the module uses.
  (globalThis as any).localStorage.setItem(`cs-ops:account-profile:${SEED_ACCOUNT_NAME}`, JSON.stringify(patched));

  ensureSeedAccount(); // second call: flag already set → no-op anyway
  const after = loadAccountProfile(SEED_ACCOUNT_NAME)!;
  assert.equal((after as any).customerExperience.label, 'MY-CUSTOM-LABEL', 'user data must survive');
});

test('VZ alias detection resolves to the seeded account', async () => {
  const { detectAccountFromAliases } = await import('../dashboard/import/accountDetector');
  const hit = detectAccountFromAliases(['VZ_Operations_Q2.csv'], listAccountNames());
  assert.equal(hit, SEED_ACCOUNT_NAME);
});
