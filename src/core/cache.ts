export interface CacheEntry<T = unknown> {
  value: T;
  /** Epoch ms when the value was stored. */
  storedAt: number;
  /** Epoch ms after which the value is stale. */
  expiresAt: number;
}

/**
 * Anything that can hold cache entries. Methods may be sync or async, so you
 * can plug in Redis, IndexedDB, localStorage or a file without adapters.
 */
export interface CacheStore {
  get(key: string): CacheEntry | undefined | Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

/** In-memory LRU store. The default. */
export class MemoryCache implements CacheStore {
  private readonly map = new Map<string, CacheEntry>();

  constructor(private readonly maxEntries = 500) {}

  get(key: string): CacheEntry | undefined {
    const entry = this.map.get(key);
    if (entry) {
      // Re-insert to mark as most recently used.
      this.map.delete(key);
      this.map.set(key, entry);
    }
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    this.map.delete(key);
    this.map.set(key, entry);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Groups of endpoints that change at different speeds. */
export type CacheResource = 'items' | 'arcs' | 'quests' | 'maps' | 'traders' | 'events';

/**
 * Defaults follow how often MetaForge itself refreshes the data: game data is
 * fairly static, trader stock rotates, the event schedule moves every minute.
 */
export const DEFAULT_TTL: Readonly<Record<CacheResource, number>> = {
  items: 30 * 60_000,
  arcs: 30 * 60_000,
  quests: 30 * 60_000,
  maps: 60 * 60_000,
  traders: 5 * 60_000,
  events: 60_000,
};

export interface CacheOptions {
  /** Custom store. Defaults to an in-memory LRU. */
  store?: CacheStore;
  /** Max entries for the default in-memory store. */
  maxEntries?: number;
  /** One TTL for everything, or per resource. In ms. */
  ttl?: number | Partial<Record<CacheResource, number>>;
  /**
   * How long an expired entry may still be served while a fresh copy is
   * fetched in the background. In ms, default 0 (off).
   */
  staleWhileRevalidate?: number;
}

export function resolveTtl(options: CacheOptions | undefined, resource: CacheResource): number {
  const ttl = options?.ttl;
  if (typeof ttl === 'number') return ttl;
  return ttl?.[resource] ?? DEFAULT_TTL[resource];
}
