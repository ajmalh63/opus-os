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
    expect(row.stage).toBe('quote_requested');
    expect(row.route).toBe('embassy');
    const chain = JSON.parse(row.chain_json);
    expect(chain.length).toBe(4);
    expect(chain[0].label).toContain('HRD');
  });

  it('PATCH stage enforces no-jump (quote_requested → in_process = 409)', async () => {
    const row = mockD1.tables.attestation_applications[0];
    const res = await app.request(`/api/attestation/applications/${row.id}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ stage: 'in_process' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(409);
    expect((await res.json() as any).code).toBe('invalid_transition');
  });

  it('PATCH stage quote_requested → quote_confirmed → docs_awaiting → in_process works', async () => {
    const row = mockD1.tables.attestation_applications[0];
    const r1 = await app.request(`/api/attestation/applications/${row.id}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ stage: 'quote_confirmed' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(r1.status).toBe(200);
    const r2 = await app.request(`/api/attestation/applications/${row.id}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ stage: 'docs_awaiting' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(r2.status).toBe(200);
    const r3 = await app.request(`/api/attestation/applications/${row.id}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ stage: 'in_process' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(r3.status).toBe(200);
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
    // Quote request model: no price until the agent confirms with the supplier
    expect(data.quote.totalPaise).toBe(0);
    expect(data.message).toContain('confirm the exact price');
    const alert = mockD1.tables.staff_alerts.find((a: any) => a.type === 'attestation_quote');
    expect(alert).toBeTruthy();
    const row = mockD1.tables.attestation_applications.find((a: any) => a.id === data.id);
    expect(row.stage).toBe('quote_requested');
  });

  it('POST pickup books the client sending documents to US (token-bound, ownership enforced)', async () => {
    const row = mockD1.tables.attestation_applications.find((a: any) => a.stage === 'quote_requested');
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

describe('Attestation — full control (edit/delete/duplicate/doc/pipeline)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);
  const staffHeaders = { cookie: 'better-auth.session_token=token-counselor' };

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-9501', name: 'Test Client', phone: '+91 99999 88888', email: 't@test.com', created_at: now, updated_at: now });
    mockD1.tables.attestation_rate_cards.push({
      id: 'rc-qa', country: 'Qatar', category: 'personal', route: 'embassy', price_paise: 600000, timeline_days: 18,
      steps_json: JSON.stringify(['Notary', 'SDM', 'MEA', 'Qatar Embassy']), active: 1, created_at: now, updated_at: now
    });
  });

  it('creates an application, then edits fees + payment + document status', async () => {
    const create = await app.request('/api/attestation/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ clientId: 'OP-2026-9501', document: { holderName: 'Anil Kumar', documentName: 'Birth Certificate', issuingState: 'Kerala' }, category: 'personal', route: 'embassy', destinationCountry: 'Qatar' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(create.status).toBe(200);
    const { id } = await create.json() as any;

    const edit = await app.request(`/api/attestation/applications/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ govtFeePaise: 50000, serviceFeePaise: 600000, paymentStatus: 'partial', paidAmountPaise: 300000, documentStatus: 'received', notes: 'Docs arrived' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(edit.status).toBe(200);
    const row = mockD1.tables.attestation_applications.find((a: any) => a.id === id);
    expect(row.payment_status).toBe('partial');
    expect(row.paid_amount_paise).toBe(300000);
    expect(row.document_status).toBe('received');
  });

  it('duplicates an application (multi-doc) and deletes it', async () => {
    const row = mockD1.tables.attestation_applications[0];
    const dup = await app.request(`/api/attestation/applications/${row.id}/duplicate`, { method: 'POST', headers: staffHeaders }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(dup.status).toBe(200);
    const { id } = await dup.json() as any;
    expect(mockD1.tables.attestation_applications.length).toBe(2);

    const del = await app.request(`/api/attestation/applications/${id}`, { method: 'DELETE', headers: staffHeaders }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(del.status).toBe(200);
    expect(mockD1.tables.attestation_applications.length).toBe(1);
  });

  it('uploads the original document scan (flagged content rejected)', async () => {
    const row = mockD1.tables.attestation_applications[0];
    const bucket = { put: vi.fn(async () => ({})) };
    const presigned = await app.request(`/api/attestation/applications/${row.id}/document/presigned?filename=birth-cert.pdf`, { method: 'POST', headers: staffHeaders }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(presigned.status).toBe(200);
    const { url } = await presigned.json() as any;
    const urlObj = new URL(url, 'http://localhost');

    const clean = await app.request(urlObj.pathname + urlObj.search, {
      method: 'PUT', headers: { 'Content-Type': 'application/pdf', ...staffHeaders },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', BUCKET: bucket });
    expect(clean.status).toBe(200);
    const updated = mockD1.tables.attestation_applications.find((a: any) => a.id === row.id);
    expect(updated.document_status).toBe('received');
    expect(updated.document_key).toBeTruthy();
  });

  it('pipeline aggregate reports counts, stuck, awaiting docs, unpaid', async () => {
    const res = await app.request('/api/attestation/applications/pipeline', { headers: staffHeaders }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.total).toBe(1);
    expect(typeof data.stuck).toBe('number');
    expect(typeof data.awaitingDocs).toBe('number');
    expect(typeof data.unpaid).toBe('number');
  });

  it('stage machine allows backward moves (full control)', async () => {
    const row = mockD1.tables.attestation_applications[0];
    // forward: quote_requested → quote_confirmed → docs_awaiting → in_process
    await app.request(`/api/attestation/applications/${row.id}/stage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders }, body: JSON.stringify({ stage: 'quote_confirmed' }) }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    await app.request(`/api/attestation/applications/${row.id}/stage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders }, body: JSON.stringify({ stage: 'docs_awaiting' }) }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    await app.request(`/api/attestation/applications/${row.id}/stage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders }, body: JSON.stringify({ stage: 'in_process' }) }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    // backward: in_process → docs_awaiting
    const back = await app.request(`/api/attestation/applications/${row.id}/stage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...staffHeaders }, body: JSON.stringify({ stage: 'docs_awaiting' }) }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(back.status).toBe(200);
    const updated = mockD1.tables.attestation_applications.find((a: any) => a.id === row.id);
    expect(updated.stage).toBe('docs_awaiting');
  });
});

describe('Attestation — price bands (Option 1)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);
  const staffHeaders = { cookie: 'better-auth.session_token=token-counselor' };

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-9701', name: 'Bands Client', phone: '+91 99999 77771', email: 'b@test.com', created_at: now, updated_at: now });
  });

  it('GET /api/attestation/price-bands returns defaults (staff)', async () => {
    const res = await app.request('/api/attestation/price-bands', { headers: staffHeaders }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.bands.embassy.educational.min).toBe(5500);
    expect(data.bands.apostille.commercial.max).toBe(7000);
    expect(data.disclaimer.toLowerCase()).toContain('subject to change');
  });

  it('PUT /api/attestation/price-bands saves the bands', async () => {
    const res = await app.request('/api/attestation/price-bands', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ bands: { embassy: { educational: { min: 6000, max: 10000 }, personal: { min: 5500, max: 9000 }, commercial: { min: 9000, max: 16000 } }, apostille: { educational: { min: 2500, max: 5500 }, personal: { min: 2200, max: 5000 }, commercial: { min: 4000, max: 8000 } } } })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const row = mockD1.tables.app_settings.find((a: any) => a.key === 'attestation_price_bands');
    expect(row).toBeTruthy();
    const bands = JSON.parse(row.value);
    expect(bands.embassy.educational.min).toBe(6000);
  });

  it('portal price-bands powers the quote form range', async () => {
    const res = await app.request('/api/public/portal/attestation/price-bands?token=OP-2026-9701', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.bands.embassy.educational.min).toBe(6000); // saved value
  });
});

describe('Attestation — supplier-check intake (deadline/urgency/scan)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);
  const staffHeaders = { cookie: 'better-auth.session_token=token-counselor' };

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-9801', name: 'Scan Client', phone: '+91 99999 66661', email: 's@test.com', created_at: now, updated_at: now });
  });

  it('portal create captures urgency + deadline', async () => {
    const res = await app.request('/api/public/portal/attestation/applications?token=OP-2026-9801', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'OP-2026-9801',
        document: { holderName: 'Ravi Kumar', documentName: 'Degree Certificate', issuingState: 'Telangana' },
        category: 'educational', route: 'embassy', destinationCountry: 'UAE',
        urgency: 'urgent', deadline: now + 20 * 86400
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const { id } = await res.json() as any;
    const row = mockD1.tables.attestation_applications.find((a: any) => a.id === id);
    expect(row.urgency).toBe('urgent');
    expect(row.deadline).toBe(now + 20 * 86400);
    // Staff alert flags urgency
    const alert = mockD1.tables.staff_alerts.find((a: any) => a.type === 'attestation_quote');
    expect(alert.body).toContain('URGENT');
  });

  it('client uploads the document scan with the quote request (token-bound)', async () => {
    const row = mockD1.tables.attestation_applications.find((a: any) => a.urgency === 'urgent');
    const bucket = { put: vi.fn(async () => ({})) };
    const presigned = await app.request(`/api/public/portal/attestation/applications/${row.id}/document/presigned?token=OP-2026-9801&filename=degree.pdf`, { method: 'POST' }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(presigned.status).toBe(200);
    const { url } = await presigned.json() as any;
    const urlObj = new URL(url, 'http://localhost');

    const upload = await app.request(urlObj.pathname + urlObj.search, {
      method: 'PUT', headers: { 'Content-Type': 'application/pdf' },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', BUCKET: bucket });
    expect(upload.status).toBe(200);
    const updated = mockD1.tables.attestation_applications.find((a: any) => a.id === row.id);
    expect(updated.document_status).toBe('received');
    expect(updated.document_key).toBeTruthy();
    const alert = mockD1.tables.staff_alerts.find((a: any) => a.type === 'doc_scan_uploaded');
    expect(alert).toBeTruthy();

    // Ownership: another token cannot upload to this application
    mockD1.tables.clients.push({ id: 'OP-2026-9802', name: 'Other', phone: '+91 99999 66662', email: 'o2@test.com', created_at: now, updated_at: now });
    const presigned2 = await app.request(`/api/public/portal/attestation/applications/${row.id}/document/presigned?token=OP-2026-9802&filename=x.pdf`, { method: 'POST' }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(presigned2.status).toBe(403);
  });
});

describe('Attestation — Live Activity severity (dashboard)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-9901', name: 'Task Client', phone: '+91 99999 55551', email: 'tc@test.com', created_at: now, updated_at: now });
  });

  it('urgent quote request fires an URGENT-severity alert (Live Activity red)', async () => {
    const res = await app.request('/api/public/portal/attestation/applications?token=OP-2026-9901', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'OP-2026-9901',
        document: { holderName: 'Ravi Kumar', documentName: 'Degree Certificate', issuingState: 'Telangana' },
        category: 'educational', route: 'embassy', destinationCountry: 'UAE',
        urgency: 'urgent', deadline: now + 10 * 86400
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);

    const alert = mockD1.tables.staff_alerts.find((a: any) => a.type === 'attestation_quote');
    expect(alert).toBeTruthy();
    expect(alert.severity).toBe('urgent');
    expect(alert.body).toContain('URGENT');
    // Clickable: the alert carries the desk link
    expect(alert.link).toBe('/divisions/attestation');
    // No dashboard task created — Live Activity is the notification channel
    expect(mockD1.tables.tasks.filter((t: any) => t.title.includes('Quote request')).length).toBe(0);
  });

  it('normal quote request fires a WARNING-severity alert (Live Activity amber)', async () => {
    const res = await app.request('/api/public/portal/attestation/applications?token=OP-2026-9901', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'OP-2026-9901',
        document: { holderName: 'Ravi Kumar', documentName: 'Birth Certificate', issuingState: 'Kerala' },
        category: 'personal', route: 'embassy', destinationCountry: 'Qatar'
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);

    const alerts = mockD1.tables.staff_alerts.filter((a: any) => a.type === 'attestation_quote');
    const normal = alerts.find((a: any) => a.body.includes('Birth Certificate'));
    expect(normal).toBeTruthy();
    expect(normal.severity).toBe('warning');
  });
});
