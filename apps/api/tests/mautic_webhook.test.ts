import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({ api: { getSession: async () => null } }),
}));

describe('Mautic Webhook Integration (Two-Way Sync)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('handles form on submit event and creates client & task', async () => {
    const payload = {
      'mautic.form_on_submit': [
        {
          form: { id: 1, name: 'Fast-Track Lead Intake Form' },
          lead: {
            id: 101,
            email: 'student@example.com',
            name: 'Ali Khan',
            phone: '+919876543210',
          },
        },
      ],
    };

    const res = await app.request('/api/webhooks/mautic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, { DB: mockD1 });

    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
    expect(json.processed).toBe(true);
  });

  it('handles asset on download event and processes correctly', async () => {
    const payload = {
      'mautic.asset_on_download': [
        {
          asset: { id: 1, title: 'Study Abroad 2026/2027 Master Guide & University Cutoffs' },
          lead: { id: 101, email: 'student@example.com' },
        },
      ],
    };

    const res = await app.request('/api/webhooks/mautic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, { DB: mockD1 });

    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(json.success).toBe(true);
  });
});
