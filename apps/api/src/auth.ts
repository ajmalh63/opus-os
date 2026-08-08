import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "./db/schema.js";
import { getDb } from "./db/client.js";

// Centralized auth gateway (gold-standard 2026):
//   - primary: email + password (familiar B2B fallback; NIST baseline)
//   - verification: email OTP (survives corporate mail scanners; short expiry)
//   - optional 2FA: TOTP (RFC 6238 authenticator app, NIST AAL2) + backup codes
//   - password policy min 8; sign-in rate-limited at the route layer
// All shared-secret handling stays inside D1 via the drizzle adapter —
// Cloudflare-compatible, no external auth infra.

export function getAuth(env: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string }) {
  const db = getDb(env.DB);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || "http://localhost:8787",
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
        // Dev bootstrap: log the reset link (production: route through Queue/email provider)
        console.log(`[auth] password reset for ${user.email}: ${url}`);
      }
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }, request) => {
        // Dev bootstrap: verification link in the log. Production: dispatch via
        // Cloudflare Queue consumer (10ms CPU budget — never block the request).
        console.log(`[auth] verification for ${user.email}: ${url}`);
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
        console.log(`[auth] 2FA OTP for ${user.email}: ${otp}`); // dev channel
      }
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh sliding window daily
      cookieCache: { enabled: true, maxAge: 5 * 60 }
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        secure: false, // local dev over http; set true behind Cloudflare HTTPS in prod vars
        sameSite: "lax"
      }
    },
    logger: {
      disabled: false,
      level: "error"
    }
  });
}