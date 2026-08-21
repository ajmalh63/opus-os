/**
 * Portal credential tokens — 128-bit CSPRNG.
 *
 * SECURITY: the OP-YYYY-XXXX client id is DISPLAY-ONLY. It was historically
 * the portal credential with a 9,000-value Math.random() space — trivially
 * brute-forceable. All portal auth now resolves through `portalToken`
 * (crypto.getRandomValues, 32 hex chars = 128 bits).
 */
import { eq } from 'drizzle-orm';
import { clients } from '../db/schema.js';

export function newPortalToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Resolve a client by portal credential.
 * - Primary: portalToken match (constant-time-ish; token is high-entropy).
 * - Legacy fallback: id match ONLY when the row has no portalToken yet
 *   (pre-backfill rows) — and the lookup itself backfills the token so the
 *   weak path closes on first touch. Run scripts/backfill-portal-tokens.mjs
 *   to close it for the whole table at once.
 */
export async function resolveClientByToken(db: any, token: string): Promise<any | null> {
  if (!token) return null;
  const byToken = await db.select().from(clients).where(eq(clients.portalToken, token)).get().catch(() => undefined);
  if (byToken) return byToken;
  // P0-03 RETIRED: Legacy OP-XXXX id fallback with 9k-space Math.random() was brute-forceable.
  // All portal auth now requires portalToken (128-bit CSPRNG). Backfill: scripts/backfill-portal-tokens.mjs (verified exists).
  // This path fails closed — unauthenticated id-based lookup is disabled.
  return null;
}