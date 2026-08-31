import { describe, it, expect, vi } from 'vitest';
import {
  generateTextEmbedding,
  upsertVectorRecord,
  queryVectorIndex,
} from '../src/lib/ai/embeddings.js';

describe('Workers AI & Vectorize Semantic Engine', () => {
  it('generates 768-dim text embeddings using Workers AI binding', async () => {
    const mockEmbedding = new Array(768).fill(0.123);
    const mockAi = {
      run: vi.fn(async (_model: string, _input: any) => ({
        data: [mockEmbedding],
      })),
    } as any;

    const embedding = await generateTextEmbedding(mockAi, 'Experienced Nurse with NHS credentials');
    expect(embedding).toHaveLength(768);
    expect(mockAi.run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
      text: ['Experienced Nurse with NHS credentials'],
    });
  });

  it('upserts and queries nearest neighbor vectors from Vectorize', async () => {
    const mockVectorize = {
      upsert: vi.fn(async (_records: any[]) => {}),
      query: vi.fn(async (_vec: number[], _opts: any) => ({
        matches: [
          { id: 'job-101', score: 0.94, metadata: { title: 'Senior ICU Nurse' } },
          { id: 'job-102', score: 0.81, metadata: { title: 'General Nurse' } },
        ],
      })),
    } as any;

    const queryVec = new Array(768).fill(0.1);
    const upserted = await upsertVectorRecord(mockVectorize, 'cand-1', queryVec, { name: 'Candidate 1' });
    expect(upserted).toBe(true);

    const matches = await queryVectorIndex(mockVectorize, queryVec, 2);
    expect(matches).toHaveLength(2);
    expect(matches[0].id).toBe('job-101');
    expect(matches[0].score).toBe(0.94);
    expect(matches[0].metadata?.title).toBe('Senior ICU Nurse');
  });

  it('gracefully handles missing AI/Vectorize bindings', async () => {
    const emb = await generateTextEmbedding(undefined, 'text');
    expect(emb).toBeNull();

    const upserted = await upsertVectorRecord(undefined, 'id', [1, 2]);
    expect(upserted).toBe(false);

    const queryRes = await queryVectorIndex(undefined, [1, 2]);
    expect(queryRes).toEqual([]);
  });
});
