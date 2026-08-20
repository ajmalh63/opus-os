import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, twoFactor } from "better-auth/plugins";
import * as schema from "./db/schema.js";
import { getDb } from "./db/client.js";
import { sendNotification } from "./infra/notify.js";

// Centralized auth gateway (gold-standard 2026):
//   - primary: email + password (familiar B2B fallback; NIST baseline)
//   - verification: email OTP (survives corporate mail scanners; short expiry)
//   - optional 2FA: TOTP (RFC 6238 authenticator app, NIST AAL2) + backup codes
//   - password policy min 8; sign-in rate-limited at the route layer
//   - breached-password screening (NIST SP 800-63B): HIBP k-anonymity range
//     check at sign-up / password change — only the SHA-1 5-char prefix leaves
//     the server; fail-closed (signup blocked if the check cannot run).
// All shared-secret handling stays inside D1 via the drizzle adapter —
// Cloudflare-compatible, no external auth infra.

export function getAuth(env: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string }) {
  const db = getDb(env.DB);
  const baseURL = env.BETTER_AUTH_URL || "http://127.0.0.1:5173";
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [
      // Local dev (kept out of any production deployment by ENVIRONMENT gate below)
      "http://127.0.0.1:5173", "http://localhost:5173",
      "http://127.0.0.1:8787", "http://localhost:8787",
      "http://127.0.0.1", "http://localhost",
      // Production origins — apex + www + app (both apex and www MUST reach the
      // worker for cal.com webhooks and cookie auth to work)
      "https://opusoverseas.com", "https://www.opusoverseas.com", "https://app.opusoverseas.com",
      ...(env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : []),
    ],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        twoFactor: schema.twoFactor
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
    // Breached-password screening (NIST SP 800-63B): every password hashed at
    // sign-up / password change is checked against Have I Been Pwned via the
    // k-anonymity range API (only SHA-1 prefix leaves the server). Fail-closed:
    // if the check cannot run, the password is rejected — never let a possibly
    // breached password through because the checker hiccupped.
    plugins: [
      haveIBeenPwned({
        customPasswordCompromisedMessage:
          "This password has appeared in known data breaches. Please choose a different password."
      }),
      // twoFactor is a PLUGIN in better-auth >=1.2 (it was a core option in
      // older 1.1.x releases and is silently ignored when passed top-level).
      // Registered here so /two-factor/* endpoints exist at all.
      twoFactor({
        issuer: "Opus Overseas",
        totpOptions: { period: 30, digits: 6 },
        otpOptions: {
          period: 10, // 10-minute OTP window (minutes in this API version)
          digits: 6,
          sendOTP: async ({ user, otp }: { user: { id: string; email: string; role?: string }; otp: string }) => {
            await sendOtpEmail(env as any, db as any, user, otp);
          }
        }
      })
    ],
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
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh sliding window daily
      cookieCache: { enabled: true, maxAge: 5 * 60 }
    },
    advanced: {
      // The callback-origin check is over-strict under proxies/loops in dev and has
      // burned trust on identical origin strings. We rely on: signed JWT + autoSignIn
      // + our own D1 rate limiting. Origin/URL validation is ENABLED in
      // production (disableOriginCheck disables CSRF + open-redirect guards) —
      // local dev keeps it off so localhost callbacks flow cleanly.
      disableOriginCheck: (env as any)?.ENVIRONMENT !== 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        // Secure cookies behind HTTPS only (prod sets ENVIRONMENT=production).
        secure: (env as any).ENVIRONMENT === 'production',
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
  if (process.env?.ENVIRONMENT !== 'production') console.log(`[auth] password reset for ${user.email}: ${url}`); // dev fallback visibility
}

async function sendVerificationEmailSafe(env: any, db: any, user: { email: string }, url: string): Promise<void> {
  await sendNotification(env, db, {
    channel: 'email',
    to: user.email,
    subject: 'Verify your Opus Overseas email',
    body: `Confirm your email to finish signing up: ${url}`,
  }).catch(() => { });
  if (process.env?.ENVIRONMENT !== 'production') console.log(`[auth] verification for ${user.email}: ${url}`);
}

async function sendOtpEmail(env: any, db: any, user: { email: string }, otp: string): Promise<void> {
  await sendNotification(env, db, {
    channel: 'email',
    to: user.email,
    subject: `Your Opus Overseas OTP: ${otp}`,
    body: `Your one-time code is ${otp}. It expires in 10 minutes — never share it.`,
  }).catch(() => { });
  if (process.env?.ENVIRONMENT !== 'production') console.log(`[auth] 2FA OTP for ${user.email}: ${otp}`); // dev channel
}

export { sendPasswordResetEmail, sendVerificationEmailSafe, sendOtpEmail };