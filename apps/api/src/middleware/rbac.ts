import { MiddlewareHandler } from 'hono';
import { getAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { engagements, roles, userRoles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditBounded } from './audit.js';

type RbacEnv = {
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string };
  Variables: { user: any; session: any };
};

// SOC 2 CC6.1: failed/denied access IS logged — bounded at 20/hr per
// (identity, action) so scanner floods never bloat the audit log. Fail-open.
async function auditDenied(c: any, reason: string) {
  await auditBounded(c, {
    action: 'ACCESS_DENIED',
    entityName: 'rbac',
    entityId: c.req?.path || 'unknown',
    result: 'denied',
    category: 'access',
    afterState: { reason, method: c.req?.method },
  }, 'denial');
}

// Custom-role permissions (permission tables now actually ENFORCE, plan §5.3).
// Semantics (additive, preserves legacy):
//   1. Primary role code in `allowedRoles` → pass (legacy behavior intact).
//   2. User has an ACTIVE custom-role assignment whose role's permission set
//      contains any of `requiredPermissions` → pass.
//   3. super_admin always passes permissions.
// Division scoping for counselors/coordinators is unchanged (OP- token +
// kanban move checks below).
export async function userHasPermission(env: any, userId: string, primaryRole: string, required: string[] | undefined): Promise<boolean> {
  if (!required || required.length === 0) return false;
  if (primaryRole === 'super_admin') return true;
  if (!env?.DB) return false;

  const db = getDb(env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const assignments = await db.select().from(userRoles).all();
    const val = (row: any, k: string, alt: string) => row[k] ?? row[alt];
    const active = assignments.filter(
      (a: any) =>
        String(val(a, 'userId', 'user_id')) === String(userId) &&
        !val(a, 'revokedAt', 'revoked_at') &&
        (!val(a, 'activeFrom', 'active_from') || Number(val(a, 'activeFrom', 'active_from')) <= now) &&
        (!val(a, 'activeTo', 'active_to') || Number(val(a, 'activeTo', 'active_to')) > now)
    );
    if (active.length === 0) return false;

    const roleIds = active.map((a: any) => String(val(a, 'roleId', 'role_id')));
    const roleRows = await db.select().from(roles).all();
    const userCodes = new Set<string>();
    for (const rrow of roleRows) {
      const r: any = rrow;
      if (!roleIds.includes(String(r.id))) continue;
      try {
        const blob = r.permissionsJson ?? r.permissions_json;
        (JSON.parse(blob || '[]') as string[]).forEach((p) => userCodes.add(p));
      } catch { /* malformed json — skip */ }
    }
    return required.some((r) => userCodes.has(r));
  } catch {
    return false; // fail-safe: infra errors never grant permission
  }
}

export const rbacMiddleware = (
  allowedRoles: string[],
  checkDivision: boolean = false,
  requiredPermissions?: string[]
): MiddlewareHandler<RbacEnv> => {
  return async (c, next) => {
    if (!c.env || !c.env.DB) {
      return c.json({ error: "Unauthorized: DB not available" }, 401);
    }

    const auth = getAuth(c.env);
    const sessionResult = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!sessionResult) {
      await auditDenied(c, 'Unauthorized: Invalid or expired session');
      return c.json({ error: "Unauthorized: Invalid or expired session" }, 401);
    }

    const { user, session } = sessionResult as { user: any; session: any };

    // 1. Role OR permission validation (additive)
    const roleMatch = allowedRoles.includes(user.role);
    const permMatch = roleMatch || (await userHasPermission(c.env, user.id, user.role, requiredPermissions));
    if (!roleMatch && !permMatch) {
      await auditDenied(c, 'Forbidden: Insufficient role privileges');
      return c.json({ error: "Forbidden: Insufficient role privileges" }, 403);
    }

    // 2. Division scope validation (for counselors and coordinators)
    if (checkDivision && ['counselor', 'coordinator'].includes(user.role)) {
      let allowedDivisions: string[] = [];
      try { allowedDivisions = JSON.parse((user as any).userDivisions || '[]'); } catch { allowedDivisions = []; }

      // /api/clients/OP-XXXX — division membership check
      const pathParts = c.req.path.split('/');
      const idParam = pathParts.find(p => p.startsWith('OP-'));
      const db = getDb(c.env.DB);

      if (idParam && c.req.path.includes('/api/clients/')) {
        // FAIL-CLOSED: a counselor/coordinator with NO divisions configured gets
        // nothing (previously empty userDivisions skipped the check entirely —
        // full PII directory exposure).
        if (allowedDivisions.length === 0) {
          await auditDenied(c, 'Forbidden: No divisions assigned to your account');
          return c.json({ error: "Forbidden: No divisions assigned to your account" }, 403);
        }
        const clientEngagements = await db
          .select({ division: engagements.division })
          .from(engagements)
          .where(eq(engagements.clientId, idParam))
          .all();
        if (clientEngagements.length > 0) {
          const hasAccess = clientEngagements.some(eng => allowedDivisions.includes(eng.division));
          if (!hasAccess) {
            await auditDenied(c, 'Forbidden: Client belongs to a division outside your permitted scope');
            return c.json({ error: "Forbidden: Client belongs to a division outside your permitted scope" }, 403);
          }
        }
      }

      // Kanban move — division check on the card
      if (c.req.path.endsWith('/board/move') && c.req.method === 'POST') {
        try {
          const rawBody = await c.req.text();
          const body: { cardId?: string } | null = rawBody ? JSON.parse(rawBody) : null;
          const cardId = body?.cardId;
          if (cardId) {
            const cardEngagement = await db
              .select({ division: engagements.division })
              .from(engagements)
              .where(eq(engagements.id, cardId))
              .get();
            if (cardEngagement && !allowedDivisions.includes(cardEngagement.division)) {
              await auditDenied(c, 'Forbidden: Engagement card division outside your permitted scope');
              return c.json({ error: "Forbidden: Engagement card division outside your permitted scope" }, 403);
            }
          }
        } catch { /* ignore */ }
      }
    }

    c.set('user', user);
    c.set('session', session);
    await next();
  };
};