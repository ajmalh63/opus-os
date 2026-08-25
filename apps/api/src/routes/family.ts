import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { familyMembers, clients } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { publishSyncEvent } from './sync.js';
import { auditEvent } from '../middleware/audit.js';
import { getAuth } from '../auth.js';
import { resolveClientByToken } from '../lib/clientToken.js';

export const familyRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string } }>();

// Auth helper: staff session OR client token matching clientId
async function isAuthorized(c:any, clientId:string): Promise<boolean> {
  try {
    const auth = getAuth(c.env);
    const sess = await auth.api.getSession({ headers: c.req.raw.headers }).catch(()=>null);
    if (sess?.user) return true; // staff
  } catch {}
  const token = c.req.header('x-portal-token') || c.req.header('X-Portal-Token') || c.req.query('token');
  if (token) {
    try {
      const db = getDb(c.env.DB);
      const row = await resolveClientByToken(db, token);
      if (row && (row.id === clientId || row.portalToken === token)) return true;
    } catch {}
  }
  return false;
}

const now = () => Math.floor(Date.now()/1000);
const uid = () => `fam-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,4)}`;

// Helper: ensure client exists
async function ensureClient(db:any, clientId:string) {
  const row = await db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!row) throw new Error('Client not found');
  return row;
}

// GET /api/family/:clientId/members — staff or client token (realtime: client:{id}:family)
familyRouter.get('/:clientId/members', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.param('clientId');
  if (!await isAuthorized(c, clientId)) return c.json({ error: 'Unauthorized' }, 401);
  try { await ensureClient(db, clientId); } catch { return c.json({ error: 'Client not found' }, 404); }
  const rows = await db.select().from(familyMembers).where(eq(familyMembers.clientId, clientId)).all();
  return c.json({ success: true, members: rows });
});

// POST /api/family/:clientId/members — add parent/guardian
familyRouter.post('/:clientId/members', zValidator('json', z.object({
  relation: z.enum(['father','mother','guardian','spouse','sibling','other']),
  name: z.string().min(2).max(80),
  phone: z.string().min(8).max(20),
  email: z.string().email().optional().or(z.literal('')),
  isPrimaryContact: z.boolean().optional(),
  canReceiveUpdates: z.boolean().optional(),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.param('clientId');
  if (!await isAuthorized(c, clientId)) return c.json({ error: 'Unauthorized' }, 401);
  try { await ensureClient(db, clientId); } catch { return c.json({ error: 'Client not found' }, 404); }
  const body = c.req.valid('json') as any;
  const id = uid();
  const ts = now();
  await db.insert(familyMembers).values({
    id, clientId, relation: body.relation, name: body.name, phone: body.phone, email: body.email || null,
    isPrimaryContact: body.isPrimaryContact ? 1 as any : 0 as any,
    canReceiveUpdates: body.canReceiveUpdates === false ? 0 as any : 1 as any,
    createdAt: ts, updatedAt: ts,
  } as any);
  await auditEvent(c as any, { action: 'FAMILY_MEMBER_ADDED', entityName: 'family_members', entityId: id, afterState: { clientId, relation: body.relation } });
  try { await publishSyncEvent(c.env as any, { channel: `client:${clientId}:family`, type: 'FAMILY_MEMBER_ADDED', payload: { id, clientId, relation: body.relation } }, (c as any).executionCtx); } catch {}
  try { await publishSyncEvent(c.env as any, { channel: 'staff:global:family', type: 'FAMILY_MEMBER_ADDED', payload: { id, clientId } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, id });
});

familyRouter.patch('/members/:id', zValidator('json', z.object({
  relation: z.enum(['father','mother','guardian','spouse','sibling','other']).optional(),
  name: z.string().min(2).optional(),
  phone: z.string().min(8).optional(),
  email: z.string().email().optional().or(z.literal('')),
  isPrimaryContact: z.boolean().optional(),
  canReceiveUpdates: z.boolean().optional(),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = c.req.valid('json') as any;
  const patch: any = { updatedAt: now() };
  if (body.relation) patch.relation = body.relation;
  if (body.name) patch.name = body.name;
  if (body.phone) patch.phone = body.phone;
  if (body.email !== undefined) patch.email = body.email || null;
  if (body.isPrimaryContact !== undefined) patch.isPrimaryContact = body.isPrimaryContact ? 1 : 0;
  if (body.canReceiveUpdates !== undefined) patch.canReceiveUpdates = body.canReceiveUpdates ? 1 : 0;
  await db.update(familyMembers).set(patch).where(eq(familyMembers.id, id));
  const row = await db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
  if (row) {
    try { await publishSyncEvent(c.env as any, { channel: `client:${(row as any).clientId}:family`, type: 'FAMILY_MEMBER_UPDATED', payload: { id } }, (c as any).executionCtx); } catch {}
    try { await publishSyncEvent(c.env as any, { channel: 'staff:global:family', type: 'FAMILY_MEMBER_UPDATED', payload: { id } }, (c as any).executionCtx); } catch {}
  }
  return c.json({ success: true });
});

familyRouter.delete('/members/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const row = await db.select().from(familyMembers).where(eq(familyMembers.id, id)).get();
  await db.delete(familyMembers).where(eq(familyMembers.id, id));
  if (row) {
    try { await publishSyncEvent(c.env as any, { channel: `client:${(row as any).clientId}:family`, type: 'FAMILY_MEMBER_REMOVED', payload: { id } }, (c as any).executionCtx); } catch {}
    try { await publishSyncEvent(c.env as any, { channel: 'staff:global:family', type: 'FAMILY_MEMBER_REMOVED', payload: { id } }, (c as any).executionCtx); } catch {}
  }
  return c.json({ success: true });
});
