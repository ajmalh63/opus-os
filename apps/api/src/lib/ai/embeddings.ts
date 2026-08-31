/**
 * Cloudflare Workers AI & Vectorize Semantic Engine
 * Provides Edge-native text embeddings and cosine similarity queries for candidate & program matching.
 */

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Generates 768-dimensional text embeddings using Workers AI (@cf/baai/bge-base-en-v1.5)
 */
export async function generateTextEmbedding(
  ai: Ai | undefined,
  text: string
): Promise<number[] | null> {
  if (!ai || !text || text.trim().length === 0) return null;

  try {
    const response = (await ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [text.slice(0, 1000)], // Limit to 1000 chars for optimal embedding quality
    })) as { data?: number[][] };

    return response?.data?.[0] || null;
  } catch (err: any) {
    console.warn('[workers-ai] Embedding generation error:', err?.message);
    return null;
  }
}

/**
 * Inserts or updates vector records into Cloudflare Vectorize.
 */
export async function upsertVectorRecord(
  vectorize: VectorizeIndex | undefined,
  id: string,
  values: number[],
  metadata?: Record<string, any>
): Promise<boolean> {
  if (!vectorize || !values || values.length === 0) return false;

  try {
    await vectorize.upsert([
      {
        id,
        values,
        metadata,
      },
    ]);
    return true;
  } catch (err: any) {
    console.warn('[vectorize] Vector upsert error:', err?.message);
    return false;
  }
}

/**
 * Queries Cloudflare Vectorize for nearest neighbor vector matches.
 */
export async function queryVectorIndex(
  vectorize: VectorizeIndex | undefined,
  vector: number[],
  topK = 5
): Promise<VectorSearchResult[]> {
  if (!vectorize || !vector || vector.length === 0) return [];

  try {
    const matches = await vectorize.query(vector, {
      topK,
      returnValues: false,
      returnMetadata: 'all',
    });

    return (matches?.matches || []).map((m) => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata,
    }));
  } catch (err: any) {
    console.warn('[vectorize] Vector query error:', err?.message);
    return [];
  }
}
