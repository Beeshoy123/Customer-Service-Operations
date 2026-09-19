// account-profile-storage.ts
//
// Reads and writes the persisted account profiles (see account-profile-schema.ts)
// and the learned-alias cache (see metric-detection-engine.ts) to localStorage, so
// the setup wizard only ever runs once per account, not once per upload.

import type { AccountProfile } from './account-profile-schema';
import type { LearnedAliasCache } from './metric-detection-engine';

const PROFILE_KEY_PREFIX = 'cs-ops:account-profile:';
const ALIAS_CACHE_KEY = 'cs-ops:learned-aliases';

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

/** Loads the global learned-alias cache (shared across every account). */
export function loadLearnedAliases(): LearnedAliasCache {
  return safeParse<LearnedAliasCache>(localStorage.getItem(ALIAS_CACHE_KEY)) ?? {};
}

/** Saves the global learned-alias cache. */
export function saveLearnedAliases(cache: LearnedAliasCache): void {
  localStorage.setItem(ALIAS_CACHE_KEY, JSON.stringify(cache));
}
