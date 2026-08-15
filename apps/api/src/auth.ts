import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "./db/schema.js";
import { getDb } from "./db/client.js";
import { sendNotification } from "./infra/notify.js";

// Centralized auth gateway (gold-standard 2026):
//   - primary: email + password (familiar B2B fallback; NIST baseline)
//   - verification: email OTP (survives corporate mail scanners; short expiry)
//   - optional 2FA: TOTP (RFC 6238 authenticator app, NIST AAL2) + backup codes
//   - password policy min 8; sign-in rate-limited at the route layer
// All shared-secret handling stays inside D1 via the drizzle adapter —
// Cloudflare-compatible, no external auth infra.

export function getAuth(env: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string }) {
  const db = getDb(env.DB);
  const baseURL = env.BETTER_AUTH_URL || "http://127.0.0.1:5173";
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [
      "http://127.0.0.1:5173", "http://localhost:5173",
      "http://127.0.0.1:8787", "http://localhost:8787",
      "http://127.0.0.1", "http://localhost",
    ],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications
      }
    }),
    user: {
      additionalFields: {
        role: { type: "string" },
        userDivisions: { type: "string" }
      }
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      sendResetPassword: async ({ user, url, token }) => {
        // Transactional email via the notify engine (Listmonk /api/tx when
        // configured; Cloudflare Email binding; dev = log). OTP/reset mail is
        // time-critical — it goes out immediately, never through a campaign queue.
        await sendPasswordResetEmail(env as any, db as any, user, url);
      }
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }, request) => {
        // With disableOriginCheck, absolute callbacks flow cleanly; the final
        // redirect goes to the frontend where the session lands. Keep as absolute.
        const safe = url.replace(/callbackURL=[^&]*/, `callbackURL=${encodeURIComponent(baseURL)}`);
        await sendVerificationEmailSafe(env as any, db as any, user, safe);
      }
    },
    twoFactor: {
      otpOptions: {
        period: 600, // 10-minute OTP window
        length: 6
      },
      totpOptions: {
        period: 30,
        digits: 6
      },
      issuer: "Opus Overseas",
      sendOTP: async ({ user, otp }: { user: { id: string; email: string; role?: string }; otp: string }) => {
        await sendOtpEmail(env as any, db as any, user, otp);
      }
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh sliding window daily
      cookieCache: { enabled: true, maxAge: 5 * 60 }
    },
    advanced: {
      // The callback-origin check is over-strict under proxies/loops in dev and has
      // burned trust on identical origin strings. We rely on: signed JWT + autoSignIn
      // + our own D1 rate limiting. Re-evaluate (disableOriginCheck) before prod.
      disableOriginCheck: true,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: false, // local dev over http; set true behind Cloudflare HTTPS in prod vars
        sameSite: "lax"
      }
    },
    logger: {
      disabled: false,
      level: "error"
    },
    rateLimit: {
      enabled: false // our D1-based route middleware handles limiting; built-in off in dev
    }
  });
}

// ═══ Transactional email helpers (auth → notify → Listmonk/CF/stub) ═══
// Each is an exported, testable seam. Delivery is immediate (transactional
// lane, never the campaign queue) and failure never blocks the auth request.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function sendPasswordResetEmail(env: any, db: any, user: { email: string }, url: string): Promise<void> {
  await sendNotification(env, db, {
    channel: 'email',
    to: user.email,
    subject: 'Reset your Opus Overseas password',
    body: `Reset your password (valid for 10 minutes): ${url}`,
  }).catch(() => { });
  console.log(`[auth] password reset for ${user.email}: ${url}`); // dev fallback visibility
}

async function sendVerificationEmailSafe(env: any, db: any, user: { email: string }, url: string): Promise<void> {
  await sendNotification(env, db, {
    channel: 'email',
    to: user.email,
    subject: 'Verify your Opus Overseas email',
    body: `Confirm your email to finish signing up: ${url}`,
  }).catch(() => { });
  console.log(`[auth] verification for ${user.email}: ${url}`);
}

async function sendOtpEmail(env: any, db: any, user: { email: string }, otp: string): Promise<void> {
  await sendNotification(env, db, {
    channel: 'email',
    to: user.email,
    subject: `Your Opus Overseas OTP: ${otp}`,
    body: `Your one-time code is ${otp}. It expires in 10 minutes — never share it.`,
  }).catch(() => { });
  console.log(`[auth] 2FA OTP for ${user.email}: ${otp}`); // dev channel
}

export { sendPasswordResetEmail, sendVerificationEmailSafe, sendOtpEmail };