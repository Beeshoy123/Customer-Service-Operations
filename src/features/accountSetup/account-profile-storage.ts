// account-profile-storage.ts
//
// Reads and writes the persisted account profiles for each account to localStorage,
// while keeping the calculation preferences that are still part of the existing
// dashboard pipeline and are not being retired here.

import type { AccountProfile } from './account-profile-schema';

const PROFILE_KEY_PREFIX = 'cs-ops:account-profile:';
const CALCULATION_STYLE_KEY_PREFIX = 'cs-ops:calculation-style:';

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
  return safeParse<AccountProfile>(localStorage.getItem(PROFILE_KEY_PREFIX + accountName));
}

/** Saves (or overwrites) the profile for this account, stamping the update time. */
export function saveAccountProfile(profile: AccountProfile): void {
  const withTimestamp: AccountProfile = { ...profile, updatedAt: new Date().toISOString() };
  localStorage.setItem(PROFILE_KEY_PREFIX + profile.accountName, JSON.stringify(withTimestamp));
}

/** Lists every account name that has a saved profile, for a settings/switcher UI. */
export function listAccountNames(): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PROFILE_KEY_PREFIX)) {
      names.push(key.slice(PROFILE_KEY_PREFIX.length));
    }
  }
  return names;
}

export type AccountRateMergeStyle = 'arithmetic-average' | 'weighted-by-counts';

export function loadRateMergeStyle(accountName: string): AccountRateMergeStyle {
  const value = localStorage.getItem(CALCULATION_STYLE_KEY_PREFIX + accountName);
  return value === 'weighted-by-counts' ? value : 'arithmetic-average';
}

export function saveRateMergeStyle(accountName: string, style: AccountRateMergeStyle): void {
  localStorage.setItem(CALCULATION_STYLE_KEY_PREFIX + accountName, style);
}
