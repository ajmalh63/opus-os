import { MiddlewareHandler } from 'hono';
import { getAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { engagements } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type RbacEnv = {
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string };
  Variables: { user: any; session: any };
};

export const rbacMiddleware = (allowedRoles: string[], checkDivision: boolean = false): MiddlewareHandler<RbacEnv> => {
  return async (c, next) => {
    if (!c.env || !c.env.DB) {
      return c.json({ error: "Unauthorized: DB not available" }, 401);
    }

    const auth = getAuth(c.env);
    
    // Retrieve session from request headers
    const sessionResult = await auth.api.getSession({
      headers: c.req.raw.headers
    });

    if (!sessionResult) {
      return c.json({ error: "Unauthorized: Invalid or expired session" }, 401);
    }

    const { user, session } = sessionResult as { user: any; session: any };


    // 1. Role validation
    if (!allowedRoles.includes(user.role)) {
      return c.json({ error: "Forbidden: Insufficient role privileges" }, 403);
    }

    // 2. Division scope validation (for counselors and coordinators)
    if (checkDivision && ['counselor', 'coordinator'].includes(user.role)) {
      let allowedDivisions: string[] = [];
      try {
        allowedDivisions = JSON.parse((user as any).userDivisions || '[]');
      } catch {
        allowedDivisions = [];
      }

      // Check if accessing client details route: /api/clients/:id
      // Extract client ID from URL path (e.g. /api/clients/OP-2026-1234) since c.req.param() is not populated in wildcard middleware
      const pathParts = c.req.path.split('/');
      const idParam = pathParts.find(p => p.startsWith('OP-'));
      const db = getDb(c.env.DB);

      if (idParam && c.req.path.includes('/api/clients/')) {
        // Fetch the client's engagements
        const clientEngagements = await db
          .select({ division: engagements.division })
          .from(engagements)
          .where(eq(engagements.clientId, idParam))
          .all();

        // If client has active engagements, user must have access to at least one of their divisions
        if (clientEngagements.length > 0) {
          const hasAccess = clientEngagements.some(eng => allowedDivisions.includes(eng.division));
          if (!hasAccess) {
            return c.json({ error: "Forbidden: Client belongs to a division outside your permitted scope" }, 403);
          }
        }
      }

      // Check if moving kanban card: /api/kanban/board/move
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
              return c.json({ error: "Forbidden: Engagement card division outside your permitted scope" }, 403);
            }
          }
        } catch {
          // Ignore JSON parsing errors here, handled by validation middleware downstream
        }
      }
    }

    // Add user and session context to request variables
    c.set('user', user);
    c.set('session', session);

    await next();
  };
};
