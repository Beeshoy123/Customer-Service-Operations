import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHeaderForMemory,
  rememberMapping,
  recallMapping,
  forgetMapping,
  clearMemory,
  getAllLearnedMappings,
  getLearnedMappingsCount,
  exportMemory,
  importMemory,
  MAPPING_MEMORY_STORAGE_KEY,
} from './mappingMemory';

// Simple in-memory localStorage mock for node:test environment
function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe('mappingMemory (Step 2 — Layer 3 Mapping Memory)', () => {
  let originalLocalStorage: unknown;
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createLocalStorageMock();
    originalLocalStorage = (globalThis as unknown as { localStorage?: Storage }).localStorage;
    (globalThis as unknown as { localStorage: Storage }).localStorage = mockStorage;
    clearMemory();
  });

  afterEach(() => {
    clearMemory();
    if (originalLocalStorage !== undefined) {
      (globalThis as unknown as { localStorage: unknown }).localStorage = originalLocalStorage;
    } else {
      delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    }
  });

  describe('normalizeHeaderForMemory', () => {
    it('normalizes headers with mixed casing, underscores, and special characters', () => {
      assert.equal(normalizeHeaderForMemory('Rep_ID'), 'rep id');
      assert.equal(normalizeHeaderForMemory('Avg Talk Time'), 'avg talk time');
      assert.equal(normalizeHeaderForMemory('  EMPLOYEE # ID  '), 'employee id');
      assert.equal(normalizeHeaderForMemory('VXS-Overall%Score'), 'vxs overall score');
      assert.equal(normalizeHeaderForMemory(''), '');
    });
  });

  describe('rememberMapping and recallMapping', () => {
    it('remembers a mapping and recalls it case- and format-insensitively', () => {
      rememberMapping('Avg Talk Time', 'aht');

      const recall1 = recallMapping('avg talk time');
      assert.ok(recall1);
      assert.equal(recall1.field, 'aht');
      assert.equal(recall1.count, 1);

      // Same header with different punctuation/casing
      const recall2 = recallMapping('AVG_TALK_TIME');
      assert.ok(recall2);
      assert.equal(recall2.field, 'aht');

      const recall3 = recallMapping('  avg   talk   time  ');
      assert.ok(recall3);
      assert.equal(recall3.field, 'aht');
    });

    it('increments count when the same mapping is reinforced', () => {
      rememberMapping('Rep_ID', 'employeeId');
      assert.equal(recallMapping('Rep_ID')?.count, 1);

      rememberMapping('Rep_ID', 'employeeId');
      assert.equal(recallMapping('Rep_ID')?.count, 2);

      rememberMapping('rep_id', 'employeeId');
      assert.equal(recallMapping('Rep_ID')?.count, 3);
    });

    it('updates mappedField and resets count when user corrects mapping', () => {
      rememberMapping('Rep_ID', 'employeeId');
      rememberMapping('Rep_ID', 'employeeId');
      assert.equal(recallMapping('Rep_ID')?.count, 2);

      // User changes their mind to agentName
      rememberMapping('Rep_ID', 'agentName');
      const updated = recallMapping('Rep_ID');
      assert.ok(updated);
      assert.equal(updated.field, 'agentName');
      assert.equal(updated.count, 1);
    });

    it('returns null for unlearned headers', () => {
      assert.equal(recallMapping('unknown_header_123'), null);
      assert.equal(recallMapping(''), null);
    });
  });

  describe('forgetMapping and clearMemory', () => {
    it('removes a specific mapping with forgetMapping', () => {
      rememberMapping('Header A', 'calls');
      rememberMapping('Header B', 'aht');

      assert.ok(recallMapping('Header A'));
      assert.ok(recallMapping('Header B'));

      forgetMapping('Header A');
      assert.equal(recallMapping('Header A'), null);
      assert.ok(recallMapping('Header B'));
    });

    it('setting mapping to "none" or "unmapped" removes it from memory', () => {
      rememberMapping('Header A', 'calls');
      assert.ok(recallMapping('Header A'));

      rememberMapping('Header A', 'none');
      assert.equal(recallMapping('Header A'), null);

      rememberMapping('Header B', 'calls');
      rememberMapping('Header B', 'unmapped');
      assert.equal(recallMapping('Header B'), null);
    });

    it('clears all memory with clearMemory', () => {
      rememberMapping('Col 1', 'calls');
      rememberMapping('Col 2', 'aht');
      rememberMapping('Col 3', 'vxs');
      assert.equal(getLearnedMappingsCount(), 3);

      clearMemory();
      assert.equal(getLearnedMappingsCount(), 0);
      assert.equal(recallMapping('Col 1'), null);
      assert.equal(recallMapping('Col 2'), null);
      assert.equal(recallMapping('Col 3'), null);
    });
  });

  describe('Scoped memory support', () => {
    it('prioritizes scoped memory and falls back to global memory', () => {
      // Global mapping for Rep_ID
      rememberMapping('Rep_ID', 'agentName');

      // Account A specifically uses Rep_ID as employeeId
      rememberMapping('Rep_ID', 'employeeId', 'account_a');

      // Query with Account A scope
      const accountAMatch = recallMapping('Rep_ID', 'account_a');
      assert.ok(accountAMatch);
      assert.equal(accountAMatch.field, 'employeeId');

      // Query with Account B scope (no Account B specific memory -> fallback to global)
      const accountBMatch = recallMapping('Rep_ID', 'account_b');
      assert.ok(accountBMatch);
      assert.equal(accountBMatch.field, 'agentName');

      // Query without scope -> returns global
      const globalMatch = recallMapping('Rep_ID');
      assert.ok(globalMatch);
      assert.equal(globalMatch.field, 'agentName');
    });

    it('filters getAllLearnedMappings and getLearnedMappingsCount by scope', () => {
      rememberMapping('Col A', 'calls');
      rememberMapping('Col B', 'aht', 'tenant1');
      rememberMapping('Col C', 'vxs', 'tenant1');

      assert.equal(getLearnedMappingsCount(), 3);
      assert.equal(getLearnedMappingsCount('tenant1'), 2);

      const tenant1Mappings = getAllLearnedMappings('tenant1');
      assert.equal(tenant1Mappings.length, 2);
      assert.ok(tenant1Mappings.some((m) => m.normalizedHeader === 'col b'));
      assert.ok(tenant1Mappings.some((m) => m.normalizedHeader === 'col c'));
    });
  });

  describe('exportMemory and importMemory', () => {
    it('exports memory store as JSON and imports it into a new instance', () => {
      rememberMapping('Col 1', 'calls');
      rememberMapping('Col 2', 'aht');

      const json = exportMemory();
      assert.ok(typeof json === 'string');
      const parsed = JSON.parse(json);
      assert.equal(parsed.version, 1);
      assert.equal(parsed.entries.length, 2);

      clearMemory();
      assert.equal(getLearnedMappingsCount(), 0);

      const success = importMemory(json);
      assert.equal(success, true);
      assert.equal(getLearnedMappingsCount(), 2);
      assert.equal(recallMapping('Col 1')?.field, 'calls');
      assert.equal(recallMapping('Col 2')?.field, 'aht');
    });

    it('handles invalid or corrupt JSON safely without throwing', () => {
      assert.equal(importMemory('invalid-json{['), false);
      assert.equal(importMemory('{"version": 1}'), false); // missing entries array
      assert.equal(importMemory('null'), false);
    });

    it('recovers gracefully from corrupted localStorage state', () => {
      mockStorage.setItem(MAPPING_MEMORY_STORAGE_KEY, 'corrupted{json');
      assert.equal(recallMapping('Any_Col'), null);

      // Saving still works and fixes corrupted storage
      rememberMapping('Fixed_Col', 'calls');
      assert.equal(recallMapping('Fixed_Col')?.field, 'calls');
    });
  });
});

