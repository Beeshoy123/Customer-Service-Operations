export interface MappingMemoryEntry {
  normalizedHeader: string;
  mappedField: string;
  count: number;
  lastSeen: string;
  scope?: string;
}

export interface MappingMemoryStore {
  version: number;
  entries: MappingMemoryEntry[];
}

export const MAPPING_MEMORY_STORAGE_KEY = 'dashboard_column_mapping_memory_v1';
const CURRENT_VERSION = 1;

// In-memory fallback for environments without localStorage or when storage access fails
let inMemoryStore: MappingMemoryStore = {
  version: CURRENT_VERSION,
  entries: [],
};

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
 * Normalizes a header for storage and comparison in memory.
 * Converts to lowercase and collapses non-alphanumerics into single spaces.
 * e.g. "Rep_ID" -> "rep id", "Avg Talk Time" -> "avg talk time"
 */
export function normalizeHeaderForMemory(header: string): string {
  return `${header ?? ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Reads the memory store from localStorage or fallback memory.
 */
function readStore(): MappingMemoryStore {
  const storage = getStorage();
  if (!storage) {
    return inMemoryStore;
  }

  try {
    const raw = storage.getItem(MAPPING_MEMORY_STORAGE_KEY);
    if (!raw) {
      return { version: CURRENT_VERSION, entries: [] };
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
      return {
        version: parsed.version || CURRENT_VERSION,
        entries: parsed.entries.filter(
          (e: unknown) =>
            e &&
            typeof e === 'object' &&
            typeof (e as MappingMemoryEntry).normalizedHeader === 'string' &&
            typeof (e as MappingMemoryEntry).mappedField === 'string'
        ),
      };
    }
  } catch (error) {
    console.warn('[mappingMemory] Failed to read memory store, resetting:', error);
  }

  return { version: CURRENT_VERSION, entries: [] };
}

/**
 * Writes the memory store to localStorage and fallback memory.
 */
function writeStore(store: MappingMemoryStore): void {
  inMemoryStore = store;
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(MAPPING_MEMORY_STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn('[mappingMemory] Failed to persist memory store:', error);
  }
}

/**
 * Returns today's date formatted as YYYY-MM-DD.
 */
function getTodayIsoDate(): string {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return '1970-01-01';
  }
}

/**
 * Remembers a manual column mapping choice made by the user.
 * Increments count if already remembered, or sets/updates mapping.
 */
export function rememberMapping(header: string, field: string, scope?: string): void {
  const normalizedHeader = normalizeHeaderForMemory(header);
  if (!normalizedHeader) return;

  // If unmapped or explicitly set to 'none', remove existing association
  if (!field || field === 'none' || field === 'unmapped') {
    forgetMapping(header, scope);
    return;
  }

  const store = readStore();
  const today = getTodayIsoDate();
  const normalizedScope = scope?.trim().toLowerCase() || undefined;

  const existingIndex = store.entries.findIndex(
    (e) =>
      e.normalizedHeader === normalizedHeader &&
      (normalizedScope ? e.scope === normalizedScope : !e.scope)
  );

  if (existingIndex >= 0) {
    const existing = store.entries[existingIndex];
    if (existing.mappedField === field) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = today;
    } else {
      // User changed mapping for this header
      existing.mappedField = field;
      existing.count = 1;
      existing.lastSeen = today;
    }
  } else {
    const newEntry: MappingMemoryEntry = {
      normalizedHeader,
      mappedField: field,
      count: 1,
      lastSeen: today,
    };
    if (normalizedScope) {
      newEntry.scope = normalizedScope;
    }
    store.entries.push(newEntry);
  }

  writeStore(store);
}

/**
 * Recalls a previously learned mapping for a header.
 * Checks scoped mapping first (if scope provided), then falls back to global mapping.
 */
export function recallMapping(
  header: string,
  scope?: string
): { field: string; count: number } | null {
  const normalizedHeader = normalizeHeaderForMemory(header);
  if (!normalizedHeader) return null;

  const store = readStore();
  const normalizedScope = scope?.trim().toLowerCase();

  if (normalizedScope) {
    const scopedMatch = store.entries.find(
      (e) => e.normalizedHeader === normalizedHeader && e.scope === normalizedScope
    );
    if (scopedMatch) {
      return { field: scopedMatch.mappedField, count: scopedMatch.count };
    }
  }

  // Global / unscoped fallback
  const globalMatch = store.entries.find(
    (e) => e.normalizedHeader === normalizedHeader && !e.scope
  );
  if (globalMatch) {
    return { field: globalMatch.mappedField, count: globalMatch.count };
  }

  return null;
}

/**
 * Removes a learned mapping for a specific header.
 */
export function forgetMapping(header: string, scope?: string): void {
  const normalizedHeader = normalizeHeaderForMemory(header);
  if (!normalizedHeader) return;

  const store = readStore();
  const normalizedScope = scope?.trim().toLowerCase() || undefined;

  store.entries = store.entries.filter(
    (e) =>
      !(
        e.normalizedHeader === normalizedHeader &&
        (normalizedScope ? e.scope === normalizedScope : !e.scope)
      )
  );

  writeStore(store);
}

/**
 * Clears all learned mappings from memory.
 */
export function clearMemory(): void {
  const emptyStore: MappingMemoryStore = {
    version: CURRENT_VERSION,
    entries: [],
  };
  writeStore(emptyStore);
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(MAPPING_MEMORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Returns all learned mappings, optionally filtered by scope.
 */
export function getAllLearnedMappings(scope?: string): MappingMemoryEntry[] {
  const store = readStore();
  const normalizedScope = scope?.trim().toLowerCase();
  if (normalizedScope) {
    return store.entries.filter((e) => e.scope === normalizedScope);
  }
  return [...store.entries];
}

/**
 * Returns the count of learned mappings.
 */
export function getLearnedMappingsCount(scope?: string): number {
  return getAllLearnedMappings(scope).length;
}

/**
 * Exports learned mappings as a JSON string for backups or sharing across teams.
 */
export function exportMemory(): string {
  const store = readStore();
  return JSON.stringify(store, null, 2);
}

/**
 * Imports learned mappings from a JSON string.
 * Merges entries into existing memory store.
 */
export function importMemory(jsonString: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) {
      return false;
    }

    const currentStore = readStore();
    const today = getTodayIsoDate();

    for (const rawEntry of parsed.entries) {
      if (
        rawEntry &&
        typeof rawEntry === 'object' &&
        typeof rawEntry.normalizedHeader === 'string' &&
        typeof rawEntry.mappedField === 'string'
      ) {
        const normalized = normalizeHeaderForMemory(rawEntry.normalizedHeader);
        const field = String(rawEntry.mappedField).trim();
        const scope = typeof rawEntry.scope === 'string' ? rawEntry.scope.trim().toLowerCase() : undefined;
        const count = typeof rawEntry.count === 'number' && rawEntry.count > 0 ? rawEntry.count : 1;
        const lastSeen = typeof rawEntry.lastSeen === 'string' ? rawEntry.lastSeen : today;

        if (!normalized || !field) continue;

        const existing = currentStore.entries.find(
          (e) => e.normalizedHeader === normalized && e.scope === scope
        );

        if (existing) {
          existing.mappedField = field;
          existing.count = Math.max(existing.count, count);
          existing.lastSeen = lastSeen;
        } else {
          currentStore.entries.push({
            normalizedHeader: normalized,
            mappedField: field,
            count,
            lastSeen,
            ...(scope ? { scope } : {}),
          });
        }
      }
    }

    writeStore(currentStore);
    return true;
  } catch (error) {
    console.warn('[mappingMemory] Failed to import memory JSON:', error);
    return false;
  }
}

