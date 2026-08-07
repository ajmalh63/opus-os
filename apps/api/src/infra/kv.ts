// KV infrastructure service (Sections 3.4 / 18.4.2).
// KV is used ONLY for cache + feature flags — sessions/live data stay in D1
// because KV free tier allows just 1,000 writes/day (verified 2026). Keep writes minimal.

const TTL_CACHE = 300; // 5 min cache default
const TTL_FLAG = 86400; // flags cached for a day (eviction on update via delete)

/** Read a JSON value; returns null on miss. */
export async function kvGetJson(env: any, key: string): Promise<unknown | null> {
  if (!env.KV) return null;
  try {
    const raw = await env.KV.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Cache a JSON value with a short TTL (default 5 min). */
export async function kvSetJson(env: any, key: string, value: unknown, ttl: number = TTL_CACHE): Promise<void> {
  if (!env.KV) return;
  try {
    await env.KV.put(key, JSON.stringify(value), { expirationTtl: ttl });
  } catch { /* best-effort */ }
}

/** Feature flag read (default true = enabled). */
export async function flagEnabled(env: any, flag: string): Promise<boolean> {
  const v = (await kvGetJson(env, `flag:${flag}`)) as { enabled?: boolean } | null;
  return v === null ? true : !!v?.enabled;
}

/** Toggle a feature flag (used by the kill-switch / rollout panel). */
export async function setFlag(env: any, flag: string, enabled: boolean): Promise<void> {
  await kvSetJson(env, `flag:${flag}`, { enabled }, TTL_FLAG);
}