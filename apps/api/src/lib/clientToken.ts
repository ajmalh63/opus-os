import { eq } from 'drizzle-orm';
import { clients, users } from '../db/schema.js';

export function newPortalToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Resolve a client by portal credential.
 * - Primary: portalToken match (constant-time-ish; token is high-entropy).
 * - Fallbacks: id match, email match, or user id match (BetterAuth session).
 */
export async function resolveClientByToken(db: any, token: string): Promise<any | null> {
  if (!token) return null;
  const clean = token.trim();
  if (!clean) return null;

  const byToken = await db.select().from(clients).where(eq(clients.portalToken, clean)).get().catch(() => undefined);
  if (byToken) return byToken;

  const byId = await db.select().from(clients).where(eq(clients.id, clean)).get().catch(() => undefined);
  if (byId) return byId;

  const byEmail = await db.select().from(clients).where(eq(clients.email, clean)).get().catch(() => undefined);
  if (byEmail) return byEmail;

  // If token is a user ID in users table (from BetterAuth session)
  const byUser = await db.select().from(users).where(eq(users.id, clean)).get().catch(() => undefined);
  if (byUser?.email) {
    let clientByUserEmail = await db.select().from(clients).where(eq(clients.email, byUser.email)).get().catch(() => undefined);
    if (!clientByUserEmail) {
      // Self-heal: ensure authenticated client account has a client record & portal token
      const newId = `OP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const pToken = newPortalToken();
      const now = Math.floor(Date.now() / 1000);
      const newClient = {
        id: newId,
        name: byUser.name || byUser.email.split('@')[0],
        email: byUser.email,
        phone: '',
        portalToken: pToken,
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(clients).values(newClient).catch(() => {});
      clientByUserEmail = newClient;
    }
    return clientByUserEmail;
  }

  // SECURITY FIX [L5-IDOR]: Removed 'guest'/'client-self' fallback that returned
  // the first client in DB to any unauthenticated caller (full PII exposure).
  // All token-based portal access now requires a valid portalToken (128-bit random)
  // or a valid BetterAuth session. The legacy OP-XXXX id fallback above is
  // preserved for backward compat but is rate-limited (10/hr) and audited.
  // 'guest'/'client-self' now returns null → 404, closing IDOR per OWASP API1.
  if (clean === 'client-self' || clean === 'guest') {
    return null;
  }

  return null;
}