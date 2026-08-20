import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { registerStaffSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { users, auditLog, runtimeLogs, appSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../auth.js';
import { auditEvent } from '../middleware/audit.js';
import { verifyChain } from '../lib/auditChain.js';
import { getDivisionsEnabled, DIVISION_KEYS, DIVISIONS_ENABLED_KEY } from '../lib/divisions.js';

// Drizzle returns camelCase props on real D1; MockD1Database stores snake_case.
// verifyChain/buildPayload read snake_case — normalize before verifying/exporting.
const AUDIT_COLUMNS = [
  'id', 'actor_id', 'action', 'entity_name', 'entity_id', 'before_state',
  'after_state', 'ip_address', 'created_at', 'category', 'actor_type',
  'result', 'auth_method', 'data_classification', 'request_id',
  'schema_version', 'prev_hash', 'record_hash',
];

function toSnakeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const col of AUDIT_COLUMNS) {
    const camel = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    out[col] = row[col] ?? row[camel] ?? null;
  }
  return out;
}

function tsOf(row: Record<string, any>): number {
  return Number(row.created_at ?? row.createdAt ?? 0);
}

// CSV column order per export contract (before/after_state last).
const CSV_COLUMNS = [
  'id', 'created_at', 'actor_id', 'action', 'entity_name', 'entity_id',
  'category', 'actor_type', 'result', 'auth_method', 'ip_address',
  'request_id', 'schema_version', 'prev_hash', 'record_hash',
  'before_state', 'after_state',
];
const CSV_HEADER = CSV_COLUMNS.join(',');

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, any>[]): string {
  const lines = rows.map((r) => CSV_COLUMNS.map((col) => csvEscape(r[col])).join(','));
  return [CSV_HEADER, ...lines].join('\n');
}

export const adminRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string } }>();

// GET /api/admin/divisions — division availability switch state (owner only).
// Same registry as the public endpoint + last-updated timestamp.
adminRouter.get('/divisions', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const enabled = await getDivisionsEnabled(c.env);
    const row = await db.select().from(appSettings).where(eq(appSettings.key, DIVISIONS_ENABLED_KEY)).get();
    return c.json({ enabled, list: [...DIVISION_KEYS], updatedAt: row?.updatedAt ?? null });
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch divisions', details: error.message }, 500);
  }
});

// POST /api/admin/divisions — owner toggles divisions. Body: { enabled: { key: bool } }.
// Partial maps are merged over the current state; unknown keys → 400.
// Every toggle is audited (DIVISION_TOGGLED, before/after maps).
const divisionsSchema = z.object({ enabled: z.record(z.string(), z.boolean()) });

adminRouter.post('/divisions', zValidator('json', divisionsSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const invalid = Object.keys(body.enabled).filter((k) => !(DIVISION_KEYS as readonly string[]).includes(k));
  if (invalid.length > 0) {
    return c.json({ error: `Invalid division key(s): ${invalid.join(', ')}`, code: 'INVALID_DIVISION_KEYS' }, 400);
  }
  try {
    const now = Math.floor(Date.now() / 1000);
    const current = await getDivisionsEnabled(c.env);
    const next: Record<string, boolean> = { ...current, ...body.enabled };
    await db
      .insert(appSettings)
      .values({ key: DIVISIONS_ENABLED_KEY, value: JSON.stringify(next), updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(next), updatedAt: now } });

    await auditEvent(c, {
      action: 'DIVISION_TOGGLED',
      entityName: 'app_settings',
      entityId: DIVISIONS_ENABLED_KEY,
      category: 'config',
      beforeState: current,
      afterState: next,
    }).catch(() => {});

    return c.json({ enabled: next, list: [...DIVISION_KEYS], updatedAt: now });
  } catch (error: any) {
    return c.json({ error: 'Failed to update divisions', details: error.message }, 500);
  }
});

// GET /api/admin/runtime-logs — in-OS runtime log viewer (super_admin)
adminRouter.get('/runtime-logs', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const limit = Math.min(Number(c.req.query('limit') || 200), 500);
  const level = c.req.query('level') || '';
  const source = c.req.query('source') || '';
  const rows = await db.select().from(runtimeLogs).all();
  const filtered = rows
    .filter(r => (!level || r.level === level) && (!source || r.source.includes(source)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  const sources = [...new Set(rows.map(r => r.source))].sort();
  return c.json({ success: true, logs: filtered, sources });
});

// GET /api/admin/audit-logs (Audit trails fetch) — newest first, bounded
adminRouter.get('/audit-logs', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const rows = await db.select().from(auditLog).all();
    const list = [...rows].sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 250);
    return c.json({ logs: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch audit logs", details: error.message }, 500);
  }
});

// GET /api/admin/staff (List staff users)
// NEVER returns the passwordHash — that column leaves the DB only for
// Better Auth's own verification; it is stripped from API responses.
adminRouter.get('/staff', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const rows = await db.select().from(users).all();
    const staff = rows.map((u: any) => {
      const { passwordHash, ...safe } = u;
      void passwordHash;
      return safe;
    });
    return c.json({ staff });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch staff list", details: error.message }, 500);
  }
});

// POST /api/admin/register-staff (Register staff & configure scopes)
adminRouter.post('/register-staff', zValidator('json', registerStaffSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // Create the account through Better Auth itself so password hashing +
    // verification share ONE implementation (avoids nodejs_compat scrypt drift
    // when we would hash manually). Returns a temp password when none given.
    const auth = getAuth(c.env);
    const tempPassword = data.password || `Opus${crypto.randomUUID().slice(0, 8)}!${Date.now().toString(36).slice(-4)}`;
    const result = await auth.api.signUpEmail({
      body: {
        name: data.name, email: data.email, password: tempPassword,
        role: data.role, userDivisions: JSON.stringify(data.userDivisions),
      },
      headers: c.req.raw.headers,
    });
    const id = (result as any)?.user?.id;
    if (!id) throw new Error('signUpEmail did not return a user id');
    await db.update(users).set({
      emailVerified: true, // staff accounts are admin-verified on creation
      role: data.role,
      userDivisions: JSON.stringify(data.userDivisions),
      updatedAt: new Date(),
    }).where(eq(users.id, id));

    return c.json({
      success: true,
      id,
      temporaryPassword: data.password ? undefined : tempPassword,
      message: "Staff user successfully registered and scoped."
    });
  } catch (error: any) {
    return c.json({ error: "Staff registration failed", details: error.message }, 500);
  }
});

// POST /api/admin/staff/:id/scope (Modify user division scopes)
const scopeSchema = z.object({ userDivisions: z.array(z.string().min(1)).max(10) });

adminRouter.post('/staff/:id/scope', zValidator('json', scopeSchema), async (c) => {
  const staffId = c.req.param('id');
  const body = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const user = await db.select().from(users).where(eq(users.id, staffId)).get();
    if (!user) {
      return c.json({ error: "Staff user not found" }, 404);
    }

    await db
      .update(users)
      .set({
        userDivisions: JSON.stringify(body.userDivisions),
        updatedAt: new Date()
      })
      .where(eq(users.id, staffId));

    // Audit: division scope changes alter what data staff can touch.
    await auditEvent(c, {
      action: 'STAFF_SCOPE_UPDATE',
      entityName: 'users',
      entityId: staffId,
      afterState: { userDivisions: body.userDivisions },
    });

    return c.json({ success: true, message: "Staff division scopes updated successfully." });
  } catch (error: any) {
    return c.json({ error: "Scope update transaction failed", details: error.message }, 500);
  }
});

// GET /api/admin/audit/verify-chain — verify the tamper-evident hash chain
// over ALL audit_log rows (newest-independent; verifyChain sorts by created_at).
adminRouter.get('/audit/verify-chain', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(auditLog).all();
    const chain = await verifyChain(rows.map(toSnakeRow));
    return c.json(chain);
  } catch (error: any) {
    return c.json({ error: "Chain verification failed", details: error?.message || String(error) }, 500);
  }
});

// GET /api/admin/audit/export?from&to&format=csv|json — export audit rows for
// [from, to] (epoch seconds, optional), newest first. JSON returns { logs, chain }
// where chain verifies the FULL log; CSV returns RFC-4180 text with a chain
// comment footer (tamper-evident export).
adminRouter.get('/audit/export', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const format = c.req.query('format') || 'json';
  const fromRaw = c.req.query('from');
  const toRaw = c.req.query('to');
  const from = fromRaw !== undefined && fromRaw !== '' ? Number(fromRaw) : undefined;
  const to = toRaw !== undefined && toRaw !== '' ? Number(toRaw) : undefined;

  try {
    const rows = (await db.select().from(auditLog).all()).map(toSnakeRow);
    const inRange = rows
      .filter((r) => (from === undefined || tsOf(r) >= from) && (to === undefined || tsOf(r) <= to))
      .sort((a, b) => tsOf(b) - tsOf(a));
    const chain = await verifyChain(rows);

    if (format === 'csv') {
      const comment = chain.valid
        ? `# chain: valid`
        : `# chain: BROKEN firstBreak=${chain.firstBreak} reason=${chain.reason}`;
      const csv = `${toCsv(inRange)}\n${comment}\n`;
      return c.text(csv, 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="audit-export.csv"',
      });
    }
    return c.json({ logs: inRange, chain });
  } catch (error: any) {
    return c.json({ error: "Audit export failed", details: error?.message || String(error) }, 500);
  }
});

// ============================================================
// INVOICE & BRANDING SETTINGS (Section 26 / GST Compliance)
// ============================================================
const DEFAULT_INVOICE_SETTINGS = {
  logoUrl: '/opus-logo.svg',
  companyLegalName: 'Cordial Crafts (Prop. AJMAL HUSSAIN)',
  brandName: 'OPUS OVERSEAS',
  gstin: '36ALPPH3337R1ZE',
  pan: 'ALPPH3337R',
  stateCode: '36',
  stateName: 'Telangana',
  addressLine1: 'H.No. 1-1-382, R & B Guest Road, Near Anganwadi School',
  addressLine2: 'Rakasipet, Bodhan, Dist. Nizamabad',
  city: 'Bodhan',
  pincode: '503185',
  billingEmail: 'support@opusoverseas.com',
  billingPhone: '+91 90000 00000',
  website: 'https://opusoverseas.com',
  bankName: '',
  bankAccountNo: '',
  bankIfsc: '',
  bankBranch: '',
  upiId: '',
  invoicePrefix: 'INV-2026-',
  invoiceNotes: 'This is a computer-generated GST tax invoice. Services rendered are subject to standard Opus Overseas terms and service agreements. No physical signature required.',
  authorizedSignatoryText: 'For OPUS OVERSEAS (Cordial Crafts) — Authorized Signatory',
};

export const INVOICE_SETTINGS_KEY = 'invoice_branding_settings';

adminRouter.get('/invoice-settings', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, INVOICE_SETTINGS_KEY)).get();
    if (!row || !row.value) {
      return c.json({ success: true, settings: DEFAULT_INVOICE_SETTINGS });
    }
    const saved = JSON.parse(row.value);
    return c.json({ success: true, settings: { ...DEFAULT_INVOICE_SETTINGS, ...saved } });
  } catch (error: any) {
    return c.json({ success: true, settings: DEFAULT_INVOICE_SETTINGS });
  }
});

const invoiceSettingsSchema = z.object({
  logoUrl: z.string().optional(),
  companyLegalName: z.string().min(1, 'Company legal name is required'),
  brandName: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  stateCode: z.string().optional(),
  stateName: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().optional(),
  billingEmail: z.string().optional(),
  billingPhone: z.string().optional(),
  website: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNo: z.string().optional(),
  bankIfsc: z.string().optional(),
  bankBranch: z.string().optional(),
  upiId: z.string().optional(),
  invoicePrefix: z.string().optional(),
  invoiceNotes: z.string().optional(),
  authorizedSignatoryText: z.string().optional(),
});

adminRouter.post('/invoice-settings', zValidator('json', invoiceSettingsSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);

  try {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, INVOICE_SETTINGS_KEY)).get();
    const prev = row && row.value ? JSON.parse(row.value) : DEFAULT_INVOICE_SETTINGS;
    const merged = { ...DEFAULT_INVOICE_SETTINGS, ...prev, ...body };

    await db
      .insert(appSettings)
      .values({ key: INVOICE_SETTINGS_KEY, value: JSON.stringify(merged), updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: JSON.stringify(merged), updatedAt: now } });

    await auditEvent(c, {
      action: 'INVOICE_SETTINGS_UPDATED',
      entityName: 'app_settings',
      entityId: INVOICE_SETTINGS_KEY,
      category: 'config',
      beforeState: prev,
      afterState: merged,
    }).catch(() => {});

    return c.json({ success: true, settings: merged, updatedAt: now });
  } catch (error: any) {
    return c.json({ error: 'Failed to save invoice settings', details: error?.message || String(error) }, 500);
  }
});

