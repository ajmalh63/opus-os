import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { permissions, roles, userRoles, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const rbacRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// Seed permission catalog (Section 33.2 - atomic permissions)
const PERMISSION_SEED: { code: string; family: string; label: string; ownerOnly?: boolean }[] = [
  { code: 'clients:read', family: 'client', label: 'View client records' },
  { code: 'clients:write', family: 'client', label: 'Create / edit clients' },
  { code: 'kanban:view', family: 'operational', label: 'View pipeline boards' },
  { code: 'kanban:move', family: 'operational', label: 'Move cards across stages' },
  { code: 'documents:manage', family: 'operational', label: 'Manage document vault' },
  { code: 'agreements:manage', family: 'legal', label: 'Create / sign agreements' },
  { code: 'consents:manage', family: 'legal', label: 'Capture / manage consents' },
  { code: 'payments:enter', family: 'finance', label: 'Record payments & calculate GST' },
  { code: 'tasks:manage', family: 'operational', label: 'Create / update staff tasks' },
  { code: 'marketing:run', family: 'marketing', label: 'Run enabled campaigns' },
  { code: 'approvals:manage', family: 'admin', label: 'Approve within thresholds', ownerOnly: true },
  { code: 'financials:view', family: 'finance', label: 'View master financials / profitability', ownerOnly: true },
  { code: 'compliance:view', family: 'finance', label: 'View GST/TDS/TCS compliance books', ownerOnly: true },
  { code: 'incentives:config', family: 'admin', label: 'Configure incentive rules & payouts', ownerOnly: true },
  { code: 'audit:export', family: 'admin', label: 'Export audit log', ownerOnly: true },
  { code: 'rbac:manage', family: 'admin', label: 'Manage roles & staff assignments', ownerOnly: true },
  { code: 'settings:edit', family: 'admin', label: 'Edit business profile / system config', ownerOnly: true },
];

// POST /api/admin/rbac/seed - idempotently ensure permission + default roles (owner-only via mount)
rbacRouter.post('/seed', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    for (const p of PERMISSION_SEED) {
      await db.insert(permissions).values({
        code: p.code, family: p.family, label: p.label,
        ownerOnly: !!p.ownerOnly, seeded: true
      }).onConflictDoNothing();
    }

    const roles_seed_array = [
      { id: 'role-super-admin', name: 'Super Admin (Owner)', code: 'super_admin', perms: PERMISSION_SEED.map(p => p.code), desc: 'Full system access (owner).' },
      { id: 'role-manager', name: 'Manager / Team Lead', code: 'manager', perms: ['clients:read','clients:write','kanban:read','kanban:move','documents:manage','agreements:manage','consents:manage','payments:enter','tasks:manage','marketing:run','approvals:manage'], desc: 'Runs daily operations without owner financials.' },
      { id: 'role-counselor', name: 'Counselor', code: 'counselor', perms: ['clients:read','clients:write','kanban:read','kanban:move','documents:manage','agreements:manage','consents:manage','payments:enter','tasks:manage'], desc: 'Client-facing counselor.' },
      { id: 'role-receptionist', name: 'Receptionist', code: 'receptionist', perms: ['clients:read','payments:enter','tasks:manage'], desc: 'Front desk.' },
      { id: 'role-coordinator', name: 'Coordinator', code: 'coordinator', perms: ['clients:read','kanban:read','documents:manage','tasks:manage'], desc: 'Back-office operations.' },
    ];

    for (const r of roles_seed_array) {
      await db.insert(roles).values({
        id: r.id, name: r.name, code: r.code, description: r.desc,
        permissionsJson: JSON.stringify(r.perms), system: true, editable: false,
        color: 'brand-gold', createdAt: now, updatedAt: now
      }).onConflictDoNothing();
    }

    return c.json({ success: true, message: 'Permission catalog + roles seeded.' });
  } catch (error: any) {
    return c.json({ error: "RBAC seed failed", details: error.message }, 500);
  }
});

export const rbacSeed = PERMISSION_SEED;

// GET /api/admin/rbac/permissions
rbacRouter.get('/permissions', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    let list = await db.select().from(permissions).all();
    if (list.length === 0) list = PERMISSION_SEED.map(p => ({
      code: p.code, family: p.family, label: p.label, ownerOnly: !!p.ownerOnly, seeded: true
    }));
    return c.json({ permissions: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch permissions", details: error.message }, 500);
  }
});

// GET /api/admin/rbac/roles
rbacRouter.get('/roles', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const list = await db.select().from(roles).all();
    const fallback = [
      { id: 'role-super_admin', name: 'Super Admin (Owner)', code: 'super_admin', description: 'Owner', permissionsJson: JSON.stringify(PERMISSION_SEED.map(p => p.code)), color: 'brand-gold', system: true, editable: false },
      { id: 'role-counselor', name: 'Counselor', code: 'counselor', description: 'Counselor', system: true },
    ];
    return c.json({ roles: list.length ? list : fallback });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch roles", details: error.message }, 500);
  }
});

const createRoleSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  parentCode: z.string().optional(),
  color: z.string().optional(),
});

// POST /api/admin/rbac/roles (create custom role)
rbacRouter.post('/roles', zValidator('json', createRoleSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const existing = await db.select().from(roles).where(eq(roles.code, data.code)).get();
    if (existing) return c.json({ error: "Role code already exists" }, 409);

    await db.insert(roles).values({
      id: crypto.randomUUID(),
      name: data.name,
      code: data.code,
      description: data.description || null,
      permissionsJson: JSON.stringify(data.permissions),
      parentId: data.parentCode || null,
      system: false,
      editable: true,
      color: data.color || 'brand-gold',
      createdAt: now,
      updatedAt: now
    });

    return c.json({ success: true, message: "Role created." });
  } catch (error: any) {
    return c.json({ error: "Role creation failed", details: error.message }, 500);
  }
});

// PUT /api/admin/rbac/roles/:id/permissions
rbacRouter.put('/roles/:id/permissions', zValidator('json', z.object({ permissions: z.array(z.string()) })), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const role = await db.select().from(roles).where(eq(roles.id, id)).get();
    if (!role) return c.json({ error: "Role not found" }, 404);

    // Owner-only ceiling: never grant owner-only perms to non-super_admin roles
    if (role.code !== 'super_admin') {
      const ownerCodes = PERMISSION_SEED.filter(p => p.ownerOnly).map(p => p.code);
      const hasOwner = data.permissions.some((pc: string) => ownerCodes.includes(pc));
      if (hasOwner) {
        return c.json({ error: "Owner-only permissions cannot be granted to this role." }, 403);
      }
    }

    await db.update(roles).set({ permissionsJson: JSON.stringify(data.permissions), updatedAt: Math.floor(Date.now() / 1000) }).where(eq(roles.id, id));
    return c.json({ success: true, message: "Role permissions updated." });
  } catch (error: any) {
    return c.json({ error: "Role update failed", details: error.message }, 500);
  }
});

// GET /api/admin/rbac/users/:id/roles
rbacRouter.get('/users/:id/roles', async (c) => {
  const userId = c.req.param('id');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const assignments = await db.select().from(userRoles).where(eq(userRoles.userId, userId)).all();
    return c.json({ assignments });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch user roles", details: error.message }, 500);
  }
});

// POST /api/admin/rbac/users/:id/roles (assign role with division scope + window)
rbacRouter.post('/users/:id/roles', zValidator('json', z.object({
  roleId: z.string(),
  divisions: z.array(z.string()).default([]),
  activeTo: z.number().optional()
})), async (c) => {
  const userId = c.req.param('id');
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const user = await db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return c.json({ error: "User not found" }, 404);

    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      userId,
      roleId: data.roleId,
      divisionScopeJson: JSON.stringify(data.divisions),
      activeFrom: Math.floor(Date.now() / 1000),
      activeTo: data.activeTo || null,
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({ success: true, message: "Role assigned to user." });
  } catch (error: any) {
    return c.json({ error: "Role assignment failed", details: error.message }, 500);
  }
});

// DELETE /api/admin/rbac/users/:id/roles/:assignmentId (revoke)
rbacRouter.delete('/users/:id/roles/:assignmentId', async (c) => {
  const { id: userId, assignmentId } = c.req.param();
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    await db.update(userRoles).set({ revokedAt: Math.floor(Date.now() / 1000) }).where(and(eq(userRoles.id, assignmentId), eq(userRoles.userId, userId)));
    return c.json({ success: true, message: "Role assignment revoked." });
  } catch (error: any) {
    return c.json({ error: "Role revocation failed", details: error.message }, 500);
  }
});