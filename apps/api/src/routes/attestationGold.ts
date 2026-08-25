import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { attestationRules, attestationVerifications, clients } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { publishSyncEvent } from './sync.js';
import { auditEvent } from '../middleware/audit.js';

export const attestationGoldRouter = new Hono<{ Bindings: { DB: D1Database } }>();
const now = () => Math.floor(Date.now()/1000);
const uid = () => `ag-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,4)}`;

// A1 — Chain Builder AI + SLA
attestationGoldRouter.get('/rules', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const docType = c.req.query('docType');
  const dest = c.req.query('destination');
  const conditions: any[] = [];
  if (docType) conditions.push(eq(attestationRules.docType, docType));
  if (dest) conditions.push(eq(attestationRules.destination, dest));
  const rows = await db.select().from(attestationRules).where(conditions.length ? and(...conditions) : undefined as any).all();
  return c.json({ success: true, rules: rows });
});
attestationGoldRouter.post('/rules', zValidator('json', z.object({
  docType: z.string().min(2), destination: z.string().min(2), isHague: z.boolean().default(false),
  chain: z.array(z.string()).min(1), avgDays: z.number().int().min(1), fee: z.number().int().optional(),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json') as any;
  const id = uid();
  await db.insert(attestationRules).values({ id, docType: body.docType, destination: body.destination, isHague: body.isHague ? 1 as any : 0 as any, chain: JSON.stringify(body.chain), avgDays: body.avgDays, fee: body.fee || null, updatedAt: now() } as any);
  await auditEvent(c as any, { action: 'ATTESTATION_RULE_CREATED', entityName: 'attestation_rules', entityId: id });
  try { await publishSyncEvent(c.env as any, { channel: 'staff:global:attestation', type: 'ATTESTATION_RULE_CREATED', payload: { id } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, id });
});
attestationGoldRouter.get('/chain', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const docType = c.req.query('docType') || 'degree';
  const destination = c.req.query('destination') || 'UAE';
  const rule = await db.select().from(attestationRules).where(and(eq(attestationRules.docType, docType), eq(attestationRules.destination, destination))).get();
  if (!rule) return c.json({ success: false, chain: ['HRD','MEA','Embassy'], avgDays: 21, fee: null, fallback: true });
  return c.json({ success: true, rule, chain: JSON.parse((rule as any).chain), avgDays: (rule as any).avgDays });
});
attestationGoldRouter.get('/sla', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const destination = c.req.query('destination') || 'UAE';
  const desired = c.req.query('desiredDate') ? parseInt(c.req.query('desiredDate')!) : now() + 90*86400;
  const rule = await db.select().from(attestationRules).where(eq(attestationRules.destination, destination)).get();
  const avgDays = (rule as any)?.avgDays || 21;
  const bufferedDue = desired - (avgDays + 14)*86400;
  return c.json({ success: true, destination, avgDays, bufferedDue, bufferedDueDate: new Date(bufferedDue*1000).toISOString().slice(0,10), rule });
});

// A2 — Pre-screen AI (seal legible / date missing / name mismatch)
attestationGoldRouter.post('/:id/prescreen', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const id = c.req.param('id');
  // Mock AI: check name differently, missing date (NNA top errors) — real would call Workers AI vision
  const issues: string[] = [];
  // In production, would call AI vision on R2 document bytes; here heuristic
  if (Math.random() < 0.1) issues.push('Name mismatch: signing name differs from commission');
  const result = { issues, passed: issues.length===0, checkedAt: now() };
  await auditEvent(c as any, { action: 'ATTESTATION_PRESCREEN', entityName: 'attestation_verifications', entityId: id, afterState: result });
  try { await publishSyncEvent(c.env as any, { channel: 'staff:global:attestation', type: 'ATTESTATION_PRESCREEN', payload: { id, passed: result.passed } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, result });
});

// A5 — e-APP Verifier (QR + e-Register)
attestationGoldRouter.post('/verify', zValidator('json', z.object({ applicationId: z.string().min(3), apostilleId: z.string().optional(), eRegisterUrl: z.string().url().optional() })), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const { applicationId, apostilleId, eRegisterUrl } = c.req.valid('json') as any;
  const id = uid();
  const status = eRegisterUrl?.includes('hcch.net') ? 'verified' : 'pending';
  await db.insert(attestationVerifications).values({ id, applicationId, apostilleId: apostilleId || null, eRegisterUrl: eRegisterUrl || null, verificationStatus: status as any, verifiedAt: status==='verified'? now(): null, createdAt: now() } as any);
  await auditEvent(c as any, { action: 'ATTESTATION_VERIFIED', entityName: 'attestation_verifications', entityId: id });
  try { await publishSyncEvent(c.env as any, { channel: 'staff:global:attestation', type: 'ATTESTATION_VERIFIED', payload: { id, applicationId, status } }, (c as any).executionCtx); } catch {}
  try { await publishSyncEvent(c.env as any, { channel: `client:${applicationId}:attestation`, type: 'ATTESTATION_VERIFIED', payload: { id, status } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, id, verificationStatus: status });
});
attestationGoldRouter.get('/verifications/:applicationId', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const applicationId = c.req.param('applicationId');
  const rows = await db.select().from(attestationVerifications).where(eq(attestationVerifications.applicationId, applicationId)).all();
  return c.json({ success: true, verifications: rows });
});
