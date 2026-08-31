import { eq, and, gt } from 'drizzle-orm';
import type { Context } from 'hono';
import { setCookie, getCookie, deleteCookie } from 'hono/cookie';
import { sessions, users, twoFactor } from '../../db/schema.js';
import { generateRandomToken } from './crypto.js';

export const SESSION_COOKIE_NAME = 'opusos_session';
export const LEGACY_COOKIE_NAME = 'better-auth.session_token';
export const SECURE_LEGACY_COOKIE_NAME = '__Secure-better-auth.session_token';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const SESSION_SLIDING_WINDOW_SECONDS = 15 * 24 * 60 * 60; // 15 days

export interface AuthSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  role: string;
  userDivisions: string[];
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a new active session in D1 and returns the session record and token.
 */
export async function createSession(
  db: any,
  userId: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<{ session: AuthSession; token: string }> {
  const sessionId = 'ses_' + generateRandomToken(16);
  const token = generateRandomToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId,
      token,
      expiresAt,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return { session, token };
}

/**
 * Validates a session token against D1 and returns the authenticated user and session.
 * Automatically performs sliding-window renewal if the session is past half-life.
 */
export async function validateSessionToken(
  db: any,
  token: string
): Promise<{ user: AuthUser; session: AuthSession } | null> {
  if (!token) return null;

  const now = new Date();

  // 1. Query active session by token
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!session) {
    return null;
  }

  // 2. Query user by primary key id
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    return null;
  }

  // Gold standard: suspended/archived users are immediately denied even with valid session (no stale reads)
  const userStatus = (user as any).status || 'active';
  if (userStatus === 'suspended' || userStatus === 'archived') {
    return null;
  }

  // 3. Sliding window renewal: If less than 15 days remaining, extend by 30 days
  const remainingTime = new Date(session.expiresAt).getTime() - now.getTime();
  if (remainingTime < SESSION_SLIDING_WINDOW_SECONDS * 1000) {
    const newExpiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
    await db
      .update(sessions)
      .set({ expiresAt: newExpiresAt, updatedAt: now })
      .where(eq(sessions.id, session.id));
    session.expiresAt = newExpiresAt;
  }

  let userDivisions: string[] = [];
  try {
    userDivisions = typeof user.userDivisions === 'string' ? JSON.parse(user.userDivisions || '[]') : user.userDivisions || [];
  } catch {
    userDivisions = [];
  }

  const authUser: AuthUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    image: user.image,
    role: user.role,
    userDivisions,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return {
    user: authUser,
    session,
  };
}

/**
 * Invalidates (deletes) a specific session token from D1.
 */
export async function invalidateSession(db: any, token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.token, token));
}

/**
 * Invalidates all active sessions for a specific user.
 */
export async function invalidateUserSessions(db: any, userId: string): Promise<void> {
  if (!userId) return;
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Extracts the session token from incoming request cookies (supporting current and legacy cookie keys).
 */
export function getSessionTokenFromCookie(c: Context): string | null {
  return (
    getCookie(c, SESSION_COOKIE_NAME) ||
    getCookie(c, SECURE_LEGACY_COOKIE_NAME) ||
    getCookie(c, LEGACY_COOKIE_NAME) ||
    null
  );
}

/**
 * Sets the hardened session cookie on the Hono response.
 * Uses Partitioned + Secure + SameSite=Lax for cross-subdomain and preview compatibility.
 */
export function setSessionCookie(c: Context, token: string, maxAge = SESSION_MAX_AGE_SECONDS): void {
  const isProduction = (c.env as any)?.ENVIRONMENT === 'production';

  const cookieOptions: any = {
    path: '/',
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax',
    maxAge,
    partitioned: isProduction,
  };

  setCookie(c, SESSION_COOKIE_NAME, token, cookieOptions);
  // Also set legacy cookie key for seamless zero-downtime transition
  setCookie(c, isProduction ? SECURE_LEGACY_COOKIE_NAME : LEGACY_COOKIE_NAME, token, cookieOptions);
}

/**
 * Clears the session cookies on logout.
 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  deleteCookie(c, LEGACY_COOKIE_NAME, { path: '/' });
  deleteCookie(c, SECURE_LEGACY_COOKIE_NAME, { path: '/' });
}
