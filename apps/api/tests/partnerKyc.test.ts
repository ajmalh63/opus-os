import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Partner KYC hardening (gold-standard validation + bank encryption)', () => {
  let mockD1: MockD1Database;
  beforeAll(() => { mockD1 = new MockD1Database(); });

  const base = { name: 'KYC Agency', bankAccount: '50100123456789', ifscCode: 'HDFC0000001' };

  it('rejects malformed PAN', async () => {
    const res = await app.request('/api/public/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, panNumber: 'garbage' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(400);
    const j = await res.json() as any;
    expect(j.error).toContain('PAN');
  });

  it('rejects malformed IFSC', async () => {
    const res = await app.request('/api/public/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, panNumber: 'ABCDE1234F', ifscCode: 'SBIN' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toContain('IFSC');
  });

  it('accepts valid KYC, stores masked PAN and non-plaintext bank', async () => {
    const res = await app.request('/api/public/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, panNumber: 'ABCDE1234F' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.maskedPan).toBe('******234F');
    const row = (mockD1.tables.partners as any[]).find((p) => p.id === j.partnerId);
    expect(row.pan_number).toBe('******234F');
    // bank not stored in plaintext: either aes: prefix or unkeyed: last-4 tag
    expect(String(row.bank_account)).not.toBe('50100123456789');
    expect(String(row.bank_account)).toMatch(/^(aes:|unkeyed:)/);
  });
});