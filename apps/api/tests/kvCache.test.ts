import { describe, it, expect, vi } from 'vitest';
import { getCachedOrFetch, invalidateCacheKeys, CacheKeys } from '../src/lib/cache/kvCache.js';

describe('Cloudflare KV Edge Accelerator', () => {
  it('fetches from source on cache-miss and stores in KV', async () => {
    const kvStore = new Map<string, string>();
    const mockKv = {
      get: vi.fn(async (key: string) => {
        const val = kvStore.get(key);
        return val ? JSON.parse(val) : null;
      }),
      put: vi.fn(async (key: string, val: string) => {
        kvStore.set(key, val);
      }),
      delete: vi.fn(async (key: string) => {
        kvStore.delete(key);
      }),
    } as any;

    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return [{ id: 'pkg-1', title: 'Luxury Umrah 14-Day' }];
    };

    // First call: Cache miss -> calls fetcher -> puts in KV
    const firstResult = await getCachedOrFetch(mockKv, CacheKeys.umrahPackages(), fetcher);
    expect(firstResult).toHaveLength(1);
    expect(fetchCount).toBe(1);
    expect(mockKv.put).toHaveBeenCalledWith(
      CacheKeys.umrahPackages(),
      JSON.stringify(firstResult),
      { expirationTtl: 300 }
    );

    // Second call: Cache hit -> returns directly from KV without calling fetcher
    const secondResult = await getCachedOrFetch(mockKv, CacheKeys.umrahPackages(), fetcher);
    expect(secondResult).toEqual(firstResult);
    expect(fetchCount).toBe(1); // Fetcher was NOT called again
  });

  it('invalidates cache keys on demand', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('catalog:umrah:departures', JSON.stringify([{ id: 'dep-1' }]));

    const mockKv = {
      delete: vi.fn(async (key: string) => {
        kvStore.delete(key);
      }),
    } as any;

    await invalidateCacheKeys(mockKv, [CacheKeys.umrahDepartures(), CacheKeys.umrahPackages()]);
    expect(mockKv.delete).toHaveBeenCalledWith(CacheKeys.umrahDepartures());
    expect(mockKv.delete).toHaveBeenCalledWith(CacheKeys.umrahPackages());
    expect(kvStore.has('catalog:umrah:departures')).toBe(false);
  });

  it('falls back seamlessly when KV is unconfigured', async () => {
    let fetchCount = 0;
    const result = await getCachedOrFetch(undefined, 'test:key', async () => {
      fetchCount++;
      return { status: 'ok' };
    });

    expect(result).toEqual({ status: 'ok' });
    expect(fetchCount).toBe(1);
  });
});
