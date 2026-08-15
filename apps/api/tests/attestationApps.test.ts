import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;
            if (token === 'token-counselor') {
              return {
                user: { id: 'counselor-1', name: 'Counselor', email: 'c@test.com', role: 'counselor', userDivisions: JSON.stringify(['attestation']) },
                session: { id: 's1', token, userId: 'counselor-1' }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

describe('Attestation Division (gold-standard)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);
  const staffHeaders = { cookie: 'better-auth.session_token=token-counselor' };

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({
      id: 'OP-2026-9401', name: 'Ravi Kumar', phone: '+91 99999 66666', email: 'ravi@test.com',
      created_at: now, updated_at: now
    });
    // Seed a rate card (UAE educational embassy)
    mockD1.tables.attestation_rate_cards.push({
      id: 'rc-uae-edu', country: 'UAE', category: 'educational', route: 'embassy',
      price_paise: 600000, timeline_days: 18,
      steps_json: JSON.stringify(['State HRD / GAD', 'MEA', 'UAE Embassy', 'UAE MOFA (in destination)']),
      active: 1, created_at: now, updated_at: now
    });
  });

  it('GET /api/attestation/rate-cards lists seeded cards (staff)', async () => {
    const res = await app.request('/api/attestation/rate-cards', { headers: staffHeaders }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.rateCards.length).toBe(1);
    expect(data.rateCards[0].steps.length).toBe(4);
  });

  it('POST /api/attestation/applications creates a quote from the rate card', async () => {
    const res = await app.request('/api/attestation/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({
        clientId: 'OP-2026-9401',
        document: { holderName: 'Ravi Kumar', documentName: 'B.Tech Degree Certificate', issuingState: 'Telangana', issuingYear: 2024 },
        category: 'educational', route: 'embassy', destinationCountry: 'UAE', translationNeeded: true
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.quote.totalPaise).toBe(600000 + 90000); // service + 15% translation
    expect(data.timelineDays).toBe(18);
    expect(data.message).toContain('indicative');

    const row = mockD1.tables.attestation_applications.find((a: any) => a.id === data.id);
    expect(row).toBeTruthy();
    expect(row.stage).toBe('quote');
    expect(row.route).toBe('embassy');
    const chain = JSON.parse(row.chain_json);
    expect(chain.length).toBe(4);
    expect(chain[0].label).toContain('HRD');
  });

  it('PATCH stage enforces no-jump (quote → in_process = 409)', async () => {
    const row = mockD1.tables.attestation_applications[0];
    const res = await app.request(`/api/attestation/applications/${row.id}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ stage: 'in_process' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(409);
    expect((await res.json() as any).code).toBe('invalid_transition');
  });

  it('PATCH stage quote → docs_awaiting → in_process works and creates a task', async () => {
    const row = mockD1.tables.attestation_applications[0];
    const r1 = await app.request(`/api/attestation/applications/${row.id}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ stage: 'docs_awaiting' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(r1.status).toBe(200);
    const r2 = await app.request(`/api/attestation/applications/${row.id}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ stage: 'in_process' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(r2.status).toBe(200);
    const task = mockD1.tables.tasks.find((t: any) => t.title.includes('Awaiting documents'));
    expect(task).toBeTruthy();
  });

  it('PATCH chain advances steps and auto-completes when all done', async () => {
    const row = mockD1.tables.attestation_applications[0];
    const chain = JSON.parse(row.chain_json);
    for (const step of chain) {
      const res = await app.request(`/api/attestation/applications/${row.id}/chain`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders },
        body: JSON.stringify({ stepKey: step.key, status: 'done' })
      }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
      expect(res.status).toBe(200);
    }
    const updated = mockD1.tables.attestation_applications.find((a: any) => a.id === row.id);
    expect(updated.stage).toBe('completed');
    const task = mockD1.tables.tasks.find((t: any) => t.title.includes('Dispatch attested'));
    expect(task).toBeTruthy();
  });

  it('GET /api/public/portal/attestation/rate-cards returns ranges + disclaimer (no supplier names)', async () => {
    const res = await app.request('/api/public/portal/attestation/rate-cards?token=OP-2026-9401', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.countries).toContain('UAE');
    expect(data.disclaimer).toContain('indicative');
    expect(data.disclaimer.toLowerCase()).toContain('subject to change');
    expect(JSON.stringify(data)).not.toMatch(/siza|supplier|agency name/i);
  });

  it('POST /api/public/portal/attestation/applications creates a quote (token-bound)', async () => {
    const res = await app.request('/api/public/portal/attestation/applications?token=OP-2026-9401', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'OP-2026-9401',
        document: { holderName: 'Ravi Kumar', documentName: 'Degree Certificate', issuingState: 'Telangana' },
        category: 'educational', route: 'embassy', destinationCountry: 'UAE'
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.quote.totalPaise).toBe(600000);
    const alert = mockD1.tables.staff_alerts.find((a: any) => a.type === 'attestation_quote');
    expect(alert).toBeTruthy();
  });

  it('POST pickup books the client sending documents to US (token-bound, ownership enforced)', async () => {
    const row = mockD1.tables.attestation_applications.find((a: any) => a.stage === 'quote');
    const res = await app.request(`/api/public/portal/attestation/applications/${row.id}/pickup?token=OP-2026-9401`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickupAddress: 'Hyderabad, Telangana', courierInbound: 'BLUEDART123456' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const updated = mockD1.tables.attestation_applications.find((a: any) => a.id === row.id);
    expect(updated.courier_inbound).toBe('BLUEDART123456');
    expect(updated.pickup_address).toContain('Hyderabad');

    // Ownership: another token cannot book this pickup
    mockD1.tables.clients.push({ id: 'OP-2026-9402', name: 'Other', phone: '+91 99999 77777', email: 'o@t.com', created_at: now, updated_at: now });
    const res2 = await app.request(`/api/public/portal/attestation/applications/${row.id}/pickup?token=OP-2026-9402`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickupAddress: 'Mumbai' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res2.status).toBe(403);
  });

  it('GET /api/public/portal/attestation/applications returns the tracker with chain timeline', async () => {
    const res = await app.request('/api/public/portal/attestation/applications?token=OP-2026-9401', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.applications.length).toBe(2);
    const a = data.applications.find((x: any) => x.stage === 'completed');
    expect(a.chain.every((s: any) => s.status === 'done')).toBe(true);
    expect(a.fees.totalQuotePaise).toBeGreaterThan(0);
  });

  it('partner catalog no longer exposes attestation (division disabled for partners)', async () => {
    // The partnerLinks + commissionPlans catalogType enums no longer include 'attestation'
    const schemaSrc = await import('node:fs').then(fs => fs.readFileSync('src/db/schema.ts', 'utf8'));
    const partnerLinksBlock = schemaSrc.split("export const partnerLinks")[1].split('});')[0];
    const commissionBlock = schemaSrc.split("export const commissionPlans")[1].split('});')[0];
    expect(partnerLinksBlock).not.toContain("'attestation'");
    expect(commissionBlock).not.toContain("'attestation'");
    // goRedirect VALID map no longer routes attestation links
    const goSrc = await import('node:fs').then(fs => fs.readFileSync('src/routes/goRedirect.ts', 'utf8'));
    expect(goSrc).not.toContain("attestation: '/attestation'");
  });
});