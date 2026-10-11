// account-profile-storage.ts
//
// Reads and writes the persisted account profiles for each account, while
// keeping the calculation preferences that are still part of the existing
// dashboard pipeline and are not being retired here.
//
// S6 (recommendations.md): all persistence goes through the shared `safeStorage`
// facade and the `storageKeys` registry — no direct localStorage access here
// anymore, so SecurityError / quota failures fall back to memory instead of
// crashing the caller. Key VALUES are unchanged (no migration exists).

import type { AccountProfile } from './account-profile-schema';
import { safeStorage, storageKeys } from '../dashboard/storage';

// Prefix form kept for listAccountNames()'s scan; must stay in sync with
// storageKeys.accountProfile below.
const PROFILE_KEY_PREFIX = 'cs-ops:account-profile:';

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null; // corrupted or unexpected storage content shouldn't crash the app
  }
}

/** Loads a previously-saved profile for this account, or null if none exists yet. */
export function loadAccountProfile(accountName: string): AccountProfile | null {
  return safeParse<AccountProfile>(safeStorage.getItem(storageKeys.accountProfile(accountName)));
}

/** Saves (or overwrites) the profile for this account, stamping the update time. */
export function saveAccountProfile(profile: AccountProfile): void {
  const withTimestamp: AccountProfile = { ...profile, updatedAt: new Date().toISOString() };
  safeStorage.setItem(storageKeys.accountProfile(profile.accountName), JSON.stringify(withTimestamp));
}

/** Lists every account name that has a saved profile, for a settings/switcher UI. */
export function listAccountNames(): string[] {
  const names: string[] = [];
  for (let i = 0; i < safeStorage.length; i++) {
    const key = safeStorage.key(i);
    if (key?.startsWith(PROFILE_KEY_PREFIX)) {
      names.push(key.slice(PROFILE_KEY_PREFIX.length));
    }
  }
  return names;
}

export type AccountRateMergeStyle = 'arithmetic-average' | 'weighted-by-counts';

export function loadRateMergeStyle(accountName: string): AccountRateMergeStyle {
  const value = safeStorage.getItem(storageKeys.calculationStyle(accountName));
  return value === 'weighted-by-counts' ? value : 'arithmetic-average';
}

export function saveRateMergeStyle(accountName: string, style: AccountRateMergeStyle): void {
  safeStorage.setItem(storageKeys.calculationStyle(accountName), style);
}
