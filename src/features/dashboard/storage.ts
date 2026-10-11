// storage.ts — S6 (recommendations.md): one storage facade + one key registry
// for every persisted value in the app. Replaces three divergent safety
// strategies (raw localStorage in account-profile-storage.ts, a private shim in
// mappingMemory.ts, try/catch+console.warn in persistence.ts) with the single
// complete implementation that already existed in mappingMemory.ts:
//   window.localStorage → globalThis.localStorage → in-memory fallback,
// all reads/writes wrapped so SecurityError (restricted iframes / private
// browsing) and quota errors can never crash the app.
//
// ⚠️ KEY VALUES ARE THE CURRENT PRODUCTION VALUES, DELIBERATELY UNCHANGED.
// There is no migration code in this repo; renaming any key here silently
// discards saved account profiles, learned mappings and dashboard state.
// Namespace consolidation under `cs-ops:` is a separate change that must ship
// with a migration (see recommendations.md S6).

import { inMemoryStore } from './storageMemory';

export type SafeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/**
 * Resolves the best available backing store, exactly as mappingMemory.ts's
 * getStorage() did before S6 lifted it here. Returns null when neither
 * window.localStorage nor globalThis.localStorage is reachable.
 */
function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    // Storage access may throw SecurityError in restricted iframes / private browsing
  }
  return null;
}

/**
 * The only storage surface application code should touch. Every method is
 * total: if real localStorage is unavailable or throws, the call falls back to
 * the shared in-memory store so reads/writes keep working for the session.
 */
function wrap(): SafeStorage {
  return {
    getItem(key: string): string | null {
      const storage = getStorage();
      if (!storage) return inMemoryStore.getItem(key);
      try {
        return storage.getItem(key);
      } catch {
        return inMemoryStore.getItem(key);
      }
    },
    setItem(key: string, value: string): void {
      const storage = getStorage();
      if (!storage) {
        inMemoryStore.setItem(key, value);
        return;
      }
      try {
        storage.setItem(key, value);
      } catch {
        // Quota exceeded / SecurityError on write — keep the value in memory
        // for this session instead of crashing the caller.
        inMemoryStore.setItem(key, value);
      }
    },
    removeItem(key: string): void {
      const storage = getStorage();
      if (!storage) {
        inMemoryStore.removeItem(key);
        return;
      }
      try {
        storage.removeItem(key);
      } catch {
        inMemoryStore.removeItem(key);
      }
    },
    key(index: number): string | null {
      const storage = getStorage();
      if (!storage) return inMemoryStore.key(index);
      try {
        return storage.key(index);
      } catch {
        return inMemoryStore.key(index);
      }
    },
    get length(): number {
      const storage = getStorage();
      if (!storage) return inMemoryStore.length;
      try {
        return storage.length;
      } catch {
        return inMemoryStore.length;
      }
    },
  };
}

export const safeStorage: SafeStorage = wrap();

/** Single registry of every persisted key. Values are unchanged from their originals. */
export const storageKeys = {
  /** Per-account saved profile. Was `cs-ops:account-profile:<name>` in account-profile-storage.ts. */
  accountProfile: (name: string) => `cs-ops:account-profile:${name}`,
  /** Per-account rate-merge preference. Was `cs-ops:calculation-style:<name>` in account-profile-storage.ts. */
  calculationStyle: (name: string) => `cs-ops:calculation-style:${name}`,
  /** Learned column mappings. Was hardcoded in mappingMemory.ts:14. */
  mappingMemory: 'dashboard_column_mapping_memory_v1',
  /** Heavy dashboard data payload. Was DASHBOARD_STORAGE_KEY in persistence.ts. */
  dashboardState: 'customer-service-dashboard-state-v1',
  /** Tiny timeframe/date/month selections. Was DASHBOARD_VIEW_STORAGE_KEY in persistence.ts. */
  dashboardView: 'customer-service-dashboard-view-v1',
} as const;
