// Vector infrastructure service (Section 3.4 / 3.9.2).
// - Embeddings: Workers AI @cf/baai/bge-base-en-v1.5 (768-dim), free tier.
// - Storage + search: Cloudflare Vectorize index (opusos-embeddings).
// Graceful fallback: if AI or VECTOR_INDEX isn't bound (local dev), return degraded
// results instead of crashing the request. Heavy embedding work should be offloaded
// to a Queue consumer to respect the 10ms CPU budget (AGENTS.md).

export const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

/** Embed a text string into 768 dims via Workers AI. Returns [] if AI unavailable. */
export async function embedText(env: any, text: string): Promise<number[]> {
  const ai = env.AI as any;
  if (!ai || !text) return [];
  try {
    const res = await ai.run(EMBEDDING_MODEL, { text });
    return res?.data?.[0]?.embedding || [];
  } catch {
    return [];
  }
}

/** Store an embedding + metadata (e.g., namespace "university:OP-..."). */
export async function upsertVector(
  env: any,
  id: string,
  values: number[],
  metadata: Record<string, string>
): Promise<{ inserted: boolean; index: string }> {
  if (!env.VECTOR_INDEX || values.length === 0) return { inserted: false, index: 'unavailable' };
  try {
    await env.VECTOR_INDEX.insert([{ id, values, metadata }]);
    return { inserted: true, index: 'opusos-embeddings' };
  } catch (e: any) {
    console.error('vector upsert failed', e?.message);
    return { inserted: false, index: 'failed' };
  }
}

/** Cosine semantic search on the vector index. */
export async function queryVectors(env: any, query: number[], topK = 5): Promise<SearchResult[]> {
  if (!env.VECTOR_INDEX || query.length === 0) return [];
  try {
    const res = await env.VECTOR_INDEX.query(query, { topK });
    return (res?.matches || []).map((m: any) => ({ id: m.id, score: m.score, metadata: m.metadata || {} }));
  } catch (e: any) {
    console.error('vector query failed', e?.message);
    return [];
  }
}

/** One-shot convenience: embed text, then search the index. */
export async function semanticSearch(env: any, text: string, topK = 5): Promise<SearchResult[]> {
  const vec = await embedText(env, text);
  if (vec.length === 0) return [];
  return queryVectors(env, vec, topK);
}

/** Index health check for the ops dashboard / uptime pings. */
export async function vectorHealth(env: any): Promise<{ bound: boolean; index: string; status: string }> {
  if (!env.VECTOR_INDEX) return { bound: false, index: 'opusos-embeddings', status: 'not_bound' };
  try {
    const info = await env.VECTOR_INDEX.describe();
    return { bound: true, index: info?.name || 'opusos-embeddings', status: 'ok' };
  } catch {
    return { bound: true, index: 'opusos-embeddings', status: 'error' };
  }
}
