/**
 * Cloudflare KV Edge Accelerator (Sub-Millisecond Global Read Caching)
 * Provides read-through caching and event-driven invalidation for public catalogs & rate cards.
 */

export interface CacheOptions {
  ttlSeconds?: number;
  tags?: string[];
}

/**
 * Read-through Cache Helper:
 * 1. Checks Cloudflare KV for the cached JSON payload.
 * 2. If present, returns the cached result immediately (<1ms).
 * 3. On cache-miss, executes the fetcher function, populates KV in background, and returns the result.
 */
export async function getCachedOrFetch<T>(
  kv: KVNamespace | undefined,
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const ttl = options.ttlSeconds || 300; // Default 5 minutes

  if (kv) {
    try {
      const cached = await kv.get<T>(key, 'json');
      if (cached !== null && cached !== undefined) {
        return cached;
      }
    } catch {
      // Non-fatal cache read error: continue to fetcher
    }
  }

  // Execute database/source fetcher
  const data = await fetcher();

  // Populate KV asynchronously
  if (kv && data !== null && data !== undefined) {
    try {
      await kv.put(key, JSON.stringify(data), {
        expirationTtl: ttl,
      });
    } catch {
      // Non-fatal cache write error
    }
  }

  return data;
}

/**
 * Invalides a specific cache key or array of keys in Cloudflare KV.
 */
export async function invalidateCacheKeys(
  kv: KVNamespace | undefined,
  keys: string | string[]
): Promise<void> {
  if (!kv) return;

  const keyList = Array.isArray(keys) ? keys : [keys];
  try {
    await Promise.all(
      keyList.map((k) => kv.delete(k).catch(() => {}))
    );
  } catch {
    // Non-fatal
  }
}

/**
 * Generates partition-aware cache keys for standard OpusOS domain resources.
 */
export const CacheKeys = {
  umrahDepartures: () => 'catalog:umrah:departures',
  umrahPackages: () => 'catalog:umrah:packages',
  studyAbroadPrograms: () => 'catalog:study_abroad:programs',
  attestationRateCards: () => 'catalog:attestation:rate_cards',
  publicBlogPosts: (page = 1, tag = 'all') => `public:blog:posts:${tag}:page_${page}`,
  activeMarketingCampaigns: () => 'marketing:active_campaigns',
  publicDivisionsConfig: () => 'config:divisions:enabled',
} as const;
