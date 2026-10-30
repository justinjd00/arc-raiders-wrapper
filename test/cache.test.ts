import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryCache, type CacheEntry, type CacheStore } from '../src';
import { resolveTtl } from '../src/core/cache';
import { testClient } from './helpers';

afterEach(() => vi.useRealTimers());

describe('MemoryCache', () => {
  const entry = (value: number): CacheEntry => ({ value, storedAt: 0, expiresAt: 1 });

  it('evicts the least recently used entry', () => {
    const cache = new MemoryCache(2);
    cache.set('a', entry(1));
    cache.set('b', entry(2));
    cache.get('a'); // a is now most recent
    cache.set('c', entry(3));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')?.value).toBe(1);
    expect(cache.size).toBe(2);
  });
});

describe('resolveTtl', () => {
  it('uses per resource defaults, a global number or overrides', () => {
    expect(resolveTtl(undefined, 'events')).toBe(60_000);
    expect(resolveTtl({ ttl: 5 }, 'items')).toBe(5);
    expect(resolveTtl({ ttl: { traders: 7 } }, 'traders')).toBe(7);
    expect(resolveTtl({ ttl: { traders: 7 } }, 'items')).toBe(30 * 60_000);
  });
});

describe('client cache', () => {
  it('serves repeated calls from cache', async () => {
    const { client, fetch } = testClient();
    await client.arcs.all();
    await client.arcs.all();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache with fresh: true', async () => {
    const { client, fetch } = testClient();
    await client.arcs.all();
    await client.arcs.all({}, { fresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('expires entries after the TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { client, fetch } = testClient({ cache: { ttl: 1000 } });
    await client.arcs.all();
    vi.advanceTimersByTime(1001);
    await client.arcs.all();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('serves stale data while revalidating in the background', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { client, fetch } = testClient({ cache: { ttl: 1000, staleWhileRevalidate: 10_000 } });
    const first = await client.arcs.all();
    vi.advanceTimersByTime(2000);
    const stale = await client.arcs.all();
    expect(stale).toEqual(first);
    // One initial request plus one background refresh.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it('can be turned off', async () => {
    const { client, fetch } = testClient({ cache: false });
    await client.arcs.all();
    await client.arcs.all();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('works with async custom stores and clearCache()', async () => {
    const map = new Map<string, CacheEntry>();
    const store: CacheStore = {
      get: async (k) => map.get(k),
      set: async (k, v) => void map.set(k, v),
      delete: async (k) => void map.delete(k),
      clear: async () => map.clear(),
    };
    const { client, fetch } = testClient({ cache: { store } });
    await client.traders.getAll();
    expect(map.size).toBe(1);
    await client.traders.getAll();
    expect(fetch).toHaveBeenCalledTimes(1);
    await client.clearCache();
    expect(map.size).toBe(0);
  });
});
