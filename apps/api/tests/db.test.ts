import { describe, it, expect } from 'vitest';
import { getDb } from '../src/db/client.js';
import { clients, pipelineStages } from '../src/db/schema.js';
import { MockD1Database } from './mockDb.js';
import { eq } from 'drizzle-orm';

describe('Database Client & Schema Mock Verification', () => {
  it('should initialize Drizzle and perform mock CRUD operations', async () => {
    const mockD1 = new MockD1Database();
    const db = getDb(mockD1 as any);

    // 1. Insert pipeline stage
    await db.insert(pipelineStages).values({
      id: '1',
      key: 'lead',
      name: 'Lead Intake',
      sequence: 1,
      wipLimit: 5,
      createdAt: Math.floor(Date.now() / 1000)
    });

    expect(mockD1.tables.pipeline_stages).toHaveLength(1);
    expect(mockD1.tables.pipeline_stages[0].key).toBe('lead');

    // 2. Insert client
    await db.insert(clients).values({
      id: 'OP-2026-0814',
      name: 'Rahul Sharma',
      phone: '+91 98765 43210',
      email: 'rahul.sharma@example.com',
      dob: '2004-10-12',
      city: 'Nizamabad',
      highestQualification: 'undergrad',
      passportNumber: 'U9876543',
      passportExpiry: '2027-02-15',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    });

    expect(mockD1.tables.clients).toHaveLength(1);
    expect(mockD1.tables.clients[0].name).toBe('Rahul Sharma');

    // 3. Query client
    const fetchedClient = await db.select().from(clients).where(eq(clients.id, 'OP-2026-0814')).get();
    expect(fetchedClient).toBeDefined();
    expect(fetchedClient?.name).toBe('Rahul Sharma');
  });
});
