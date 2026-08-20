import { newPortalToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, engagements } from '../db/schema.js';
import { auditEvent } from '../middleware/audit.js';

// Business Data import (§1.1) — owner-only CSV loader for existing clients/leads.
// Dedupe by email/phone; imported rows enter the pipeline at stage 'lead'.
// CSV columns (header row required): name, phone, email, division, highestQualification

const DIVISIONS = ['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'];
const QUALIFICATIONS = ['highschool', 'undergrad', 'postgrad'];
const PHONE_RE = /^(\+91[\s-]?)?[6-9]\d{9}$/;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    if (cells.some(c => c !== '')) rows.push(cells);
  }
  return rows;
}

export const importRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// POST /api/admin/import/leads — CSV in form field `csv`
importRouter.post('/leads', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const body = await c.req.parseBody();
    const csvStr = (body.csv as string) || '';
    if (!csvStr.trim()) return c.json({ error: 'CSV required (form field: csv)' }, 400);
    if (csvStr.length > 5 * 1024 * 1024) return c.json({ error: 'CSV exceeds 5 MB' }, 413);

    const rows = parseCsv(csvStr);
    if (rows.length < 2) return c.json({ error: 'CSV needs a header row + at least one data row' }, 400);
    const header = rows[0].map(h => h.toLowerCase().trim());
    const col = (name: string) => header.indexOf(name);
    const nameI = col('name'), phoneI = col('phone'), emailI = col('email');
    const divisionI = col('division'), qualI = col('highestqualification') >= 0 ? col('highestqualification') : col('qualification');
    if (nameI < 0 || (phoneI < 0 && emailI < 0)) {
      return c.json({ error: 'CSV must have name, and (phone or email) columns' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);
    const existing = await db.select().from(clients).all();
    const emails = new Set(existing.map(x => (x.email || '').toLowerCase().trim()));
    const phones = new Set(existing.map(x => (x.phone || '').replace(/\s/g, '')));

    const imported: { id: string; portalToken: string; name: string; phone: string; email: string; division: string; highestQualification: string }[] = [];
    const skipped: { row: number; reason: string }[] = [];

    rows.slice(1).forEach((r, idx) => {
      const lineNo = idx + 2;
      const name = r[nameI] || '';
      if (!name) { skipped.push({ row: lineNo, reason: 'empty name' }); return; }

      const phone = (phoneI >= 0 ? r[phoneI] || '' : '').trim();
      const email = (emailI >= 0 ? r[emailI] || '' : '').toLowerCase().trim();
      const division = (divisionI >= 0 ? r[divisionI] || '' : 'study-abroad').toLowerCase().trim() || 'study-abroad';
      const rawQual = (qualI >= 0 ? r[qualI] || '' : '').toLowerCase().trim();
      const highestQualification = QUALIFICATIONS.includes(rawQual) ? rawQual : 'highschool';

      if (!DIVISIONS.includes(division)) { skipped.push({ row: lineNo, reason: `bad division: ${division}` }); return; }
      const phoneNorm = phone.replace(/\s/g, '');
      if (phone && !PHONE_RE.test(phoneNorm)) { skipped.push({ row: lineNo, reason: `invalid phone: ${phone}` }); return; }
      if (email && emails.has(email)) { skipped.push({ row: lineNo, reason: `duplicate email: ${email}` }); return; }
      if (phoneNorm && phones.has(phoneNorm)) { skipped.push({ row: lineNo, reason: `duplicate phone: ${phone}` }); return; }

      const id = `OP-2026-${Math.floor(1000 + Math.random() * 9000)}`; // display id
      const portalToken = newPortalToken();
      if (email) emails.add(email);
      if (phoneNorm) phones.add(phoneNorm);
      imported.push({ id, portalToken, name, phone, email, division, highestQualification });
    });

    let created = 0;
    for (const rec of imported) {
      await db.insert(clients).values({
        id: rec.id, portalToken: rec.portalToken, name: rec.name, phone: rec.phone || 'TBD', email: rec.email || '',
        highestQualification: rec.highestQualification, leadSource: 'import', createdAt: now, updatedAt: now,
      });
      await db.insert(engagements).values({
        id: crypto.randomUUID(), clientId: rec.id, division: rec.division as any,
        title: `${rec.division.toUpperCase()} Import`, stageKey: 'lead',
        outstandingBalance: 0, status: 'active', createdAt: now, updatedAt: now,
      } as any);
      created++;
    }

    await auditEvent(c, {
      action: 'IMPORT_LEADS', entityName: 'clients', entityId: 'csv',
      afterState: { created, skipped: skipped.length },
    });
    return c.json({ success: true, created, skipped: skipped.slice(0, 25), note: 'Duplicates skipped; imported rows start at pipeline stage lead.' });
  } catch (e: any) {
    return c.json({ error: 'CSV import failed', details: e.message }, 500);
  }
});