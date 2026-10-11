// storageMemory.ts — S6 (recommendations.md): the string→string in-memory
// fallback backing store, moved out of mappingMemory.ts's private shim.
//
// NOTE on the original doc spec: mappingMemory.ts's old `inMemoryStore` was a
// typed MappingMemoryStore ({version, entries}), not a string→string store, so
// it could not satisfy `Pick<Storage, …>` directly. This module is the generic
// Map<string,string> fallback the doc flagged as needing its own design
// decision. Same semantics as before: reads/writes succeed against memory when
// real localStorage is unavailable (restricted iframes, private browsing, SSR).

class MemoryBackedStore {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  key(index: number): string | null {
    const keys = Array.from(this.map.keys());
    return index >= 0 && index < keys.length ? keys[index] : null;
  }

  get length(): number {
    return this.map.size;
  }
}

/** One process-wide instance so every safeStorage caller shares the fallback. */
export const inMemoryStore = new MemoryBackedStore();
