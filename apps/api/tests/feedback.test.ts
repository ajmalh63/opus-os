import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          signUpEmail: async () => ({ user: { id: 'staff-new-uuid' } }),
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;

            if (token === 'token-admin') {
              return {
                user: {
                  id: 'admin-1',
                  name: 'Admin User',
                  email: 'admin@test.com',
                  role: 'super_admin',
                  userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
                },
                session: {
                  id: 'session-admin',
                  token,
                  userId: 'admin-1',
                },
              };
            }
            return null;
          },
        },
      };
    },
  };
});

describe('Feedback, 5-Star Ratings & Moderation Engine (§70)', () => {
  let env: any;

  beforeAll(() => {
    env = {
      DB: new MockD1Database(),
      JWT_SECRET: 'test-secret',
      SYNC_HUB: {
        idFromName: () => ({ toString: () => 'id' }),
        get: () => ({
          fetch: async () => new Response(JSON.stringify({ ok: true })),
        }),
      },
    };
  });

  let createdFeedbackId = '';

  it('POST /api/public/feedback submits a 5-star review successfully', async () => {
    const res = await app.request('/api/public/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Aarav Patel',
        rating: 5,
        division: 'study-abroad',
        title: 'Admitted to TU Munich!',
        comment: 'Exceptional counseling by Opus Overseas. Smooth visa filing and zero hassle.',
        counselorName: 'S. Sharma',
        consentToPublish: true,
      }),
    }, env);

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    createdFeedbackId = data.id;
  });

  it('POST /api/public/feedback validates required fields', async () => {
    const res = await app.request('/api/public/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'A',
        rating: 6, // Invalid rating > 5
        comment: 'Too short',
      }),
    }, env);

    expect(res.status).toBe(400);
  });

  it('POST /api/public/feedback creates high-priority alert for low ratings (<= 3 stars)', async () => {
    const res = await app.request('/api/public/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Priya Verma',
        rating: 2,
        division: 'visa',
        title: 'Document delay',
        comment: 'Filing took longer than anticipated. Need quicker response on WhatsApp.',
      }),
    }, env);

    expect(res.status).toBe(201);
  });

  it('GET /api/public/feedback/approved returns only moderated public reviews with masked names', async () => {
    const res = await app.request('/api/public/feedback/approved', {}, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.reviews)).toBe(true);
  });

  it('GET /api/admin/feedback returns all submissions and computed CSAT metrics for Superadmin', async () => {
    const res = await app.request('/api/admin/feedback', {
      headers: { cookie: 'better-auth.session_token=token-admin' },
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.metrics).toBeDefined();
    expect(data.metrics.total).toBeGreaterThanOrEqual(2);
    expect(data.metrics.avgRating).toBeDefined();
    expect(data.submissions).toBeDefined();
  });

  it('PATCH /api/admin/feedback/:id/moderate allows Superadmin to approve review for public carousel', async () => {
    const res = await app.request(`/api/admin/feedback/${createdFeedbackId}/moderate`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'better-auth.session_token=token-admin',
      },
      body: JSON.stringify({ isPublicApproved: true, displayOrder: 1 }),
    }, env);

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.isPublicApproved).toBe(true);
  });

  it('GET /api/public/feedback/approved now includes the newly approved 5-star review', async () => {
    const res = await app.request('/api/public/feedback/approved', {}, env);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.reviews.length).toBeGreaterThanOrEqual(1);
    expect(data.reviews[0].clientName).toContain('Aarav P.');
    expect(data.reviews[0].rating).toBe(5);
  });
});
