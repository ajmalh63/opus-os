import { getDb } from "./db/client.js";
import { users } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { sendNotification } from "./infra/notify.js";
import { verificationEmailTemplate, passwordResetEmailTemplate, otpEmailTemplate } from "./infra/emailTemplates.js";
import { getListmonkTemplateId } from "./infra/listmonk.js";
import { hashPassword, verifyPassword, generateRandomToken, hashToken } from "./lib/auth/crypto.js";
import { createSession, validateSessionToken, invalidateSession, invalidateUserSessions, setSessionCookie, clearSessionCookie, getSessionTokenFromCookie } from "./lib/auth/session.js";
import { ensureSuperadmin, CANONICAL_ADMIN_EMAIL, CANONICAL_ADMIN_NAME, ALL_DIVISIONS } from "./lib/auth/bootstrap.js";
import { generateTotpSecret, verifyTotp, generateBackupCodes } from "./lib/auth/totp.js";

export {
  hashPassword,
  verifyPassword,
  generateRandomToken,
  hashToken,
  createSession,
  validateSessionToken,
  invalidateSession,
  invalidateUserSessions,
  setSessionCookie,
  clearSessionCookie,
  getSessionTokenFromCookie,
  ensureSuperadmin,
  generateTotpSecret,
  verifyTotp,
  generateBackupCodes,
  CANONICAL_ADMIN_EMAIL,
  CANONICAL_ADMIN_NAME,
  ALL_DIVISIONS
};

/**
 * Native Edge Auth Compatibility Gateway
 * Replaces Better Auth with 100% native WebCrypto, sub-millisecond D1 session engine.
 */
export function getAuth(env: { DB: D1Database; BETTER_AUTH_SECRET?: string; BETTER_AUTH_URL?: string; ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string }) {
  const db = getDb(env.DB);

  return {
    api: {
      async getSession(opts: { headers: Headers | Record<string, string> }) {
        let cookieHeader = '';
        if (opts?.headers instanceof Headers) {
          cookieHeader = opts.headers.get('cookie') || '';
        } else if (opts?.headers && typeof opts.headers === 'object') {
          cookieHeader = (opts.headers as any).cookie || (opts.headers as any).Cookie || '';
        }

        const match =
          cookieHeader.match(/(?:^|;\s*)opusos_session=([^;]+)/) ||
          cookieHeader.match(/(?:^|;\s*)__Secure-better-auth\.session_token=([^;]+)/) ||
          cookieHeader.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/);

        const token = match ? decodeURIComponent(match[1]) : null;
        if (!token) return null;

        const result = await validateSessionToken(db, token);
        if (!result) return null;

        return {
          user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            emailVerified: result.user.emailVerified,
            image: result.user.image,
            role: result.user.role,
            userDivisions: JSON.stringify(result.user.userDivisions),
            twoFactorEnabled: result.user.twoFactorEnabled,
            createdAt: result.user.createdAt,
            updatedAt: result.user.updatedAt,
          },
          session: {
            id: result.session.id,
            userId: result.session.userId,
            token: result.session.token,
            expiresAt: result.session.expiresAt,
            ipAddress: result.session.ipAddress,
            userAgent: result.session.userAgent,
          },
        };
      },

      async signUpEmail(opts: { body: { name: string; email: string; password?: string; role?: string; userDivisions?: string }; headers?: any }) {
        const { name, email, password, role = 'client', userDivisions = '[]' } = opts.body;
        const normalizedEmail = email.toLowerCase().trim();
        const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
        if (existing.length > 0) {
          throw new Error('User with this email already exists');
        }

        const passwordHash = password ? await hashPassword(password) : null;
        const userId = 'usr_' + generateRandomToken(12);
        const now = new Date();

        const [newUser] = await db
          .insert(users)
          .values({
            id: userId,
            name,
            email: normalizedEmail,
            emailVerified: role === 'super_admin' || role === 'counselor' || role === 'manager',
            role: role as any,
            userDivisions: typeof userDivisions === 'string' ? userDivisions : JSON.stringify(userDivisions),
            passwordHash,
            twoFactorEnabled: false,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return {
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            userDivisions: newUser.userDivisions,
          },
        };
      },
    },
  };
}

export async function sendPasswordResetEmail(env: any, db: any, user: { email: string; name?: string }, token: string): Promise<void> {
  const fallbackBase = (env as any)?.ENVIRONMENT === 'production' ? 'https://app.opusoverseas.com' : 'http://127.0.0.1:5173';
  const baseURL = env.BETTER_AUTH_URL || fallbackBase;
  const url = `${baseURL}/reset-password?token=${encodeURIComponent(token)}`;

  const { subject, html } = passwordResetEmailTemplate({
    name: user.name || 'Valued Member',
    resetUrl: url,
    expiresInMinutes: 60,
  });

  try {
    await sendNotification(env, db, {
      channel: 'email',
      to: user.email,
      subject,
      body: html,
      templateId: getListmonkTemplateId(env, 'passwordReset'),
      data: { Name: user.name || 'Valued Member', ResetUrl: url, BannerText: 'Use this secure link to set a new password for your account.', Subject: subject },
    });
  } catch (err: any) {
    console.error(`[auth-email] Password reset email exception for ${user.email}:`, err?.message || err);
  }
}

export async function sendVerificationEmailSafe(env: any, db: any, user: { email: string; name?: string }, token: string): Promise<void> {
  const fallbackBase = (env as any)?.ENVIRONMENT === 'production' ? 'https://app.opusoverseas.com' : 'http://127.0.0.1:5173';
  const baseURL = env.BETTER_AUTH_URL || fallbackBase;
  const url = `${baseURL}/verify-email?token=${encodeURIComponent(token)}`;

  const { subject, html } = verificationEmailTemplate({
    name: user.name || 'Valued Member',
    verifyUrl: url,
  });

  try {
    await sendNotification(env, db, {
      channel: 'email',
      to: user.email,
      subject,
      body: html,
      templateId: getListmonkTemplateId(env, 'verify'),
      data: { Name: user.name || 'Valued Member', VerifyUrl: url, BannerText: 'This activation link is personalized and secure for your account.', Subject: subject },
    });
  } catch (err: any) {
    console.error(`[auth-email] Verification email exception for ${user.email}:`, err?.message || err);
  }
}

export async function sendOtpEmail(env: any, db: any, user: { email: string; name?: string }, otp: string): Promise<void> {
  const { subject, html } = otpEmailTemplate({
    name: user.name,
    otpCode: otp,
    expiresInMinutes: 10,
  });

  try {
    await sendNotification(env, db, {
      channel: 'email',
      to: user.email,
      subject,
      body: html,
      templateId: getListmonkTemplateId(env, 'otp'),
      data: { OtpCode: otp, BannerText: 'This code is valid for 10 minutes. For your security, never share this code with anyone.', Subject: subject },
    });
  } catch (err: any) {
    console.error(`[auth-email] OTP email exception for ${user.email}:`, err?.message || err);
  }
}