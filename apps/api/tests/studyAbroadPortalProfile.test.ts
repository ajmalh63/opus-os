import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Study Abroad — Student Portal Profile & Documents (sync)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({
      id: 'OP-2026-9301', name: 'Priya Sharma', phone: '+91 99999 44444', email: 'priya@test.com',
      highest_qualification: 'undergrad', intake_context: JSON.stringify({ cgpa: 8.0 }),
      created_at: now, updated_at: now
    });
    mockD1.tables.engagements.push(
      { id: 'eng-9301', client_id: 'OP-2026-9301', division: 'study-abroad', title: 'Masters', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: now, updated_at: now }
    );
    mockD1.tables.study_abroad_applications.push({
      id: 'app-9301-xyz', client_id: 'OP-2026-9301', university_json: JSON.stringify({ name: 'UBC', country: 'Canada', program: 'MEng', intake: 'Fall 2027' }),
      status: 'shortlisted', docs_checklist_json: '{}', offer_conditions_json: '[]', offer_decision: 'pending',
      created_at: now, updated_at: now
    });
  });

  it('GET profile returns completeness (partial profile → <100%)', async () => {
    const res = await app.request('/api/public/portal/study-abroad/profile?token=OP-2026-9301', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.profile.cgpa).toBe(8.0);
    expect(data.completeness.pct).toBeLessThan(100);
    expect(data.completeness.missing.length).toBeGreaterThan(0);
    expect(data.universitySharingConsent).toBe(false);
  });

  it('PUT profile saves student data and raises completeness', async () => {
    const res = await app.request('/api/public/portal/study-abroad/profile?token=OP-2026-9301', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cgpa: 8.0, pct10th: 88, pct12th: 92, degreeName: 'B.Tech CSE', englishTest: 'IELTS', englishScore: 7.0,
        targetCountry: 'Canada', targetIntake: 'Fall 2027', preferredCourse: 'MEng', tuitionBudget: 25,
        universitySharingConsent: true
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.completeness.pct).toBe(100);
    expect(data.message).toContain('complete');

    const client = mockD1.tables.clients.find((c: any) => c.id === 'OP-2026-9301');
    const ctx = JSON.parse(client.intake_context);
    expect(ctx.targetCountry).toBe('Canada');
    expect(ctx.englishScore).toBe(7.0);

    // DPDP consent recorded
    const consent = mockD1.tables.consents.find((c: any) => c.client_id === 'OP-2026-9301' && c.consent_type === 'university-sharing');
    expect(consent).toBeTruthy();
    expect(consent.status).toBe('granted');
    expect(consent.sha256_hash).toMatch(/^[0-9a-f]{64}$/);

    // Staff alert fired on 100%
    const alert = mockD1.tables.staff_alerts.find((a: any) => a.type === 'profile_complete');
    expect(alert).toBeTruthy();
  });

  it('PUT profile rejects invalid values (zod)', async () => {
    const res = await app.request('/api/public/portal/study-abroad/profile?token=OP-2026-9301', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cgpa: 15 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(400);
  });

  it('POST presigned generates a signed upload URL for an application doc key', async () => {
    const res = await app.request('/api/public/portal/study-abroad/applications/app-9301-xyz/docs/transcript/presigned?token=OP-2026-9301&filename=marksheet.pdf', {
      method: 'POST'
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.url).toContain('/api/public/portal/study-abroad/documents/upload?token=OP-2026-9301');
    expect(data.url).toContain('signature=');
    expect(data.filename).toContain('transcript-app-9301-');
  });

  it('PUT upload stores the file and syncs the application checklist to received', async () => {
    const bucket = { put: vi.fn(async () => ({})) };
    // Re-sign a URL for the exact filename the upload endpoint expects
    const presigned = await app.request('/api/public/portal/study-abroad/applications/app-9301-xyz/docs/transcript/presigned?token=OP-2026-9301&filename=marksheet.pdf', {
      method: 'POST'
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    const { url } = await presigned.json() as any;
    const urlObj = new URL(url, 'http://localhost');
    const uploadUrl = urlObj.pathname + urlObj.search;

    const res = await app.request(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // %PDF-1.4 magic
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', BUCKET: bucket });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(bucket.put).toHaveBeenCalled();

    // Document row created
    const doc = mockD1.tables.documents.find((d: any) => d.client_id === 'OP-2026-9301');
    expect(doc).toBeTruthy();
    expect(doc.uploaded_by).toBe('client');

    // Checklist synced: transcript → received
    const appRow = mockD1.tables.study_abroad_applications.find((a: any) => a.id === 'app-9301-xyz');
    const checklist = JSON.parse(appRow.docs_checklist_json);
    expect(checklist.transcript).toBe('received');

    // Staff alert fired
    const alert = mockD1.tables.staff_alerts.find((a: any) => a.type === 'doc_uploaded');
    expect(alert).toBeTruthy();
  });

  it('GET documents returns vault + per-application checklist (sync view)', async () => {
    const res = await app.request('/api/public/portal/study-abroad/documents?token=OP-2026-9301', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.documents.length).toBe(1);
    expect(data.applications[0].docsChecklist.transcript).toBe('received');
  });

  it('PATCH /api/clients/:id persists internal notes (staff-only field)', async () => {
    const res = await app.request('/api/clients/OP-2026-9301', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ notes: 'Prefers Canada over USA; family budget tight; wants scholarship help.' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const client = mockD1.tables.clients.find((c: any) => c.id === 'OP-2026-9301');
    expect(client.notes).toContain('Prefers Canada');
  });
});