import { describe, it, expect, beforeAll } from 'vitest';
import { seedDatabase } from '../src/db/seed.js';
import { getDb } from '../src/db/client.js';
import { MockD1Database } from './mockDb.js';
import { pipelineStages, clauseLibrary, permissions, roles, businessProfile } from '../src/db/schema.js';

describe('DB seed bootstrap (B-2)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
  });

  it('seeds stages, clauses, permissions+roles, business profile into a fresh DB', async () => {
    await seedDatabase(getDb(mockD1 as any));

    const stages = mockD1.tables.pipeline_stages as any[];
    expect(stages.length).toBe(5);
    expect(stages.map((s) => s.key)).toEqual(expect.arrayContaining(['lead', 'qualified', 'documents', 'processing', 'complete']));

    const clauses = mockD1.tables.clause_library as any[];
    expect(clauses.length).toBeGreaterThanOrEqual(6);

    const perms = mockD1.tables.permissions as any[];
    expect(perms.length).toBeGreaterThan(0);
    expect(perms.some((p) => p.code === 'clients:read')).toBe(true);

    const roleRows = mockD1.tables.roles as any[];
    expect(roleRows.some((r) => r.code === 'super_admin')).toBe(true);
    expect(roleRows.some((r) => r.code === 'counselor')).toBe(true);

    const profiles = mockD1.tables.business_profile as any[];
    expect(profiles.length).toBe(1);
    expect(profiles[0].legal_name).toBe('Opus Overseas');
  });

  it('is idempotent — re-running does not duplicate rows', async () => {
    await seedDatabase(getDb(mockD1 as any));
    await seedDatabase(getDb(mockD1 as any));

    expect((mockD1.tables.pipeline_stages as any[]).length).toBe(5);
    expect((mockD1.tables.business_profile as any[]).length).toBe(1);
    expect((mockD1.tables.roles as any[]).length).toBeGreaterThanOrEqual(5);
  });
});