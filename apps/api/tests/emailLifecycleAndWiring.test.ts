import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Email Lifecycle & Notification Engine Wiring Audit', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();

    // Seed test user
    mockD1.tables.users.push({
      id: 'usr_audit_email_001',
      name: 'Priya Sharma',
      email: 'priya.sharma@example.com',
      role: 'client',
      email_verified: 0,
      status: 'active',
      user_divisions: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Seed verified user
    mockD1.tables.users.push({
      id: 'usr_audit_email_002',
      name: 'Aarav Patel',
      email: 'aarav.patel@example.com',
      role: 'client',
      email_verified: 1,
      status: 'active',
      user_divisions: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  });

  it('1. POST /api/auth/otp/send dispatches 6-digit OTP email and logs notification', async () => {
    const res = await app.request('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'priya.sharma@example.com' }),
    }, {
      DB: mockD1,
      BETTER_AUTH_SECRET: 'test_secret_123',
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    // Verify verification row created
    const verRow = mockD1.tables.verifications.find((v: any) => v.identifier === 'otp:priya.sharma@example.com');
    expect(verRow).toBeTruthy();
    expect(verRow.value).toBeTruthy();

    // Verify notification was logged in notifications table
    const notifRow = (mockD1.tables.notifications as any[]).find(
      (n: any) => n.to === 'priya.sharma@example.com' && n.channel === 'email'
    );
    expect(notifRow).toBeTruthy();
    expect(notifRow.subject).toContain('Your Opus Overseas Code:');
  });

  it('2. POST /api/auth/send-verification-email generates activation link for unverified users', async () => {
    const res = await app.request('/api/auth/send-verification-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'priya.sharma@example.com', callbackURL: 'https://app.opusoverseas.com' }),
    }, {
      DB: mockD1,
      BETTER_AUTH_SECRET: 'test_secret_123',
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    // Verify verification row created
    const verRow = mockD1.tables.verifications.find((v: any) => v.identifier === 'verification:usr_audit_email_001');
    expect(verRow).toBeTruthy();

    // Verify notification logged
    const notifRow = (mockD1.tables.notifications as any[]).find(
      (n: any) => n.to === 'priya.sharma@example.com' && n.subject?.includes('Verify & Activate')
    );
    expect(notifRow).toBeTruthy();
  });

  it('3. POST /api/auth/send-verification-email is enumeration-safe: already verified returns 200 generic (OWASP)', async () => {
    const res = await app.request('/api/auth/send-verification-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'aarav.patel@example.com' }),
    }, {
      DB: mockD1,
      BETTER_AUTH_SECRET: 'test_secret_123',
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/If an account exists/i);
  });
});
