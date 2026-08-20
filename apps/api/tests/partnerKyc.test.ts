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

  // ============ Audit trail for partner registration ============
  it('partner registration writes a PARTNER_REGISTERED audit row (public actor → null)', async () => {
    const res = await app.request('/api/public/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, panNumber: 'ABCDE1234F', name: 'Audit Agency' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'PARTNER_REGISTERED' && l.entity_id === j.partnerId);
    expect(row).toBeTruthy();
    expect(row.actor_id).toBeNull();
    expect(row.entity_name).toBe('partners');
    expect(JSON.parse(row.after_state).maskedPan).toBe('******234F');
  });

  it('partner referral logging writes a REFERRAL_LOGGED audit row', async () => {
    mockD1.tables.partners.push({ id: 'p-aud', name: 'Audit Agency', panNumber: '******234F', bank_account: 'unkeyed:6789', ifsc_code: 'HDFC0000001', status: 'active', referral_code: 'OPUS-AUD', api_token: 'tok-aud', created_at: 1 });
    mockD1.tables.clients.push({ id: 'OP-2026-7777', portal_token: 'OP-2026-7777', name: 'C', phone: '+91 90000 00000', email: 'c@x.io', created_at: 1, updated_at: 1 } as any);
    const res = await app.request('/api/public/partners/referrals', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer tok-aud' },
      body: JSON.stringify({ partnerId: 'p-aud', clientId: 'OP-2026-7777', commissionRate: 7 }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'REFERRAL_LOGGED');
    expect(row).toBeTruthy();
    expect(row.entity_name).toBe('referrals');
    expect(row.entity_id).toBe(j.referralId);
    expect(JSON.parse(row.after_state).commissionRate).toBe(7);
  });
});