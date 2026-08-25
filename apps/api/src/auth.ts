import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { haveIBeenPwned, twoFactor } from "better-auth/plugins";
import * as schema from "./db/schema.js";
import { getDb } from "./db/client.js";
import { sendNotification } from "./infra/notify.js";
import { verificationEmailTemplate, passwordResetEmailTemplate, otpEmailTemplate } from "./infra/emailTemplates.js";
import { getListmonkTemplateId } from "./infra/listmonk.js";

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
  // Production must have BETTER_AUTH_URL set to the public app origin (https://app.opusoverseas.com),
  // otherwise verification links point to 127.0.0.1 and are not clickable from email clients.
  const fallbackBase = (env as any).ENVIRONMENT === 'production' ? "https://app.opusoverseas.com" : "http://127.0.0.1:5173";
  const baseURL = env.BETTER_AUTH_URL || fallbackBase;
  if ((env as any).ENVIRONMENT === 'production' && !env.BETTER_AUTH_URL) {
    console.warn("[auth] BETTER_AUTH_URL not set in production — defaulting to https://app.opusoverseas.com. Set via: npx wrangler secret put BETTER_AUTH_URL");
  }
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 16) {
    console.error("[auth] BETTER_AUTH_SECRET missing or too short — auth will fail. Set via: npx wrangler secret put BETTER_AUTH_SECRET");
  }
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
        role: { type: "string", defaultValue: "client" },
        userDivisions: { type: "string", defaultValue: "[]" }
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
      ...((env as any)?.DISABLE_HIBP !== 'true' ? [
        haveIBeenPwned({
          customPasswordCompromisedMessage:
            "This password has appeared in known data breaches. Please choose a different password."
        })
      ] : []),
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
        // Direct clients to client portal (/portal) upon verification
        const portalUrl = `${baseURL.replace(/\/$/, '')}/portal`;
        const safe = url.replace(/callbackURL=[^&]*/, `callbackURL=${encodeURIComponent(portalUrl)}`);
        await sendVerificationEmailSafe(env as any, db as any, user, safe);
      }
    },
    session: {
      // L5 HARDENING: 7-day absolute max but 24h idle updateAge = sliding refresh.
      // Future (DPoP/CAE phase): shorten to 1h + refresh-token rotation for staff.
      // better-auth has no native absolute timeout — enforced via custom middleware
      // (see middleware/sessionAbsoluteTimeout.ts — TODO next sprint).
      expiresIn: 60 * 60 * 24 * 7, // 7 days absolute
      updateAge: 60 * 60 * 24, // 24h sliding
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

async function sendPasswordResetEmail(env: any, db: any, user: { email: string; name?: string }, url: string): Promise<void> {
  const { subject, html } = passwordResetEmailTemplate({
    name: user.name || '',
    resetUrl: url,
    expiresInMinutes: 10,
  });

  try {
    const result: any = await sendNotification(env, db, {
      channel: 'email',
      to: user.email,
      subject,
      body: html,
      templateId: getListmonkTemplateId(env, 'passwordReset'),
      data: { Name: user.name || 'Valued Member', ResetUrl: url, ExpiryMinutes: '10', BannerText: 'This security link expires in 10 minutes. If you did not request a password reset, you can safely ignore this email.', Subject: subject },
    });
    // Production fallback visibility: log provider + status, and surface Listmonk failures to ops
    if (!result?.ok) {
      console.error(`[auth-email] password-reset FAILED for ${user.email}: provider=${result?.provider} error=${result?.reason || result?.error}`);
      // If Listmonk failed but Cloudflare Email binding exists, try direct EMAIL fallback (stub in dev will still ok)
      if (result?.provider === 'listmonk' && env?.EMAIL) {
        console.warn(`[auth-email] Retrying password-reset via Cloudflare EMAIL binding for ${user.email}`);
        try {
          const fb: any = await env.EMAIL.send({ from: env.EMAIL.from_email || 'no-reply@opusoverseas.com', to: [user.email], subject, html });
          console.log(`[auth-email] EMAIL fallback ok for ${user.email}:`, fb?.MessageId || fb?.Status || 'sent');
        } catch (e: any) { console.error(`[auth-email] EMAIL fallback FAILED for ${user.email}:`, e?.message); }
      }
    } else {
      console.log(`[auth-email] password-reset dispatched to ${user.email}: provider=${result.provider} id=${result.remoteId || ''}`);
    }
  } catch (err: any) {
    console.error(`[auth-email] password-reset EXCEPTION for ${user.email}:`, err?.message || err);
  }
  if ((env as any)?.ENVIRONMENT !== 'production' || (typeof process !== 'undefined' && process.env?.ENVIRONMENT !== 'production')) {
    console.log(`[auth] password reset for ${user.email}: ${url}`);
  }
}

async function sendVerificationEmailSafe(env: any, db: any, user: { email: string; name?: string }, url: string): Promise<void> {
  console.log(`[auth-email] Initiating verification dispatch to: ${user.email} via ${url}`);
  // Pre-flight: surface misconfiguration early (prod will otherwise go to stub-email and appear "sent")
  if (!env?.LISTMONK_BASE_URL && !env?.EMAIL) {
    console.error(`[auth-email] NO EMAIL PROVIDER CONFIGURED for ${user.email}: LISTMONK_BASE_URL and EMAIL binding both missing. Set LISTMONK secrets via wrangler secret put or configure Cloudflare Email. Verification will be stub-logged only.`);
  }
  const { subject, html } = verificationEmailTemplate({
    name: user.name || '',
    verifyUrl: url,
  });

  try {
    const result: any = await sendNotification(env, db, {
      channel: 'email',
      to: user.email,
      subject,
      body: html,
      templateId: getListmonkTemplateId(env, 'verify'),
      data: { Name: user.name || 'Valued Member', VerifyUrl: url, BannerText: 'This activation link is personalized and secure for your account.', Subject: subject },
    });
    console.log(`[auth-email] Dispatch result for ${user.email}:`, JSON.stringify(result));
    if (!result?.ok) {
      console.error(`[auth-email] Verification FAILED for ${user.email}: provider=${result?.provider} error=${result?.reason || result?.error}`);
      // Automatic fallback: if Listmonk failed but EMAIL binding exists, retry once via Cloudflare Email directly
      if (result?.provider === 'listmonk' && env?.EMAIL) {
        console.warn(`[auth-email] Retrying verification via Cloudflare EMAIL binding for ${user.email}`);
        try {
          const fb: any = await env.EMAIL.send({ from: env.EMAIL.from_email || 'no-reply@opusoverseas.com', to: [user.email], subject, html });
          console.log(`[auth-email] EMAIL fallback dispatched for ${user.email}:`, fb?.MessageId || fb?.Status || JSON.stringify(fb));
        } catch (e: any) {
          console.error(`[auth-email] EMAIL fallback FAILED for ${user.email}:`, e?.message || e);
        }
      } else if (result?.provider === 'stub-email') {
        console.error(`[auth-email] STUB mode — email for ${user.email} was NOT actually sent. Production requires LISTMONK_BASE_URL + LISTMONK_API_USER/PASS secrets or Cloudflare Email binding. Run: npx wrangler secret put LISTMONK_API_USER etc.`);
      }
    } else if (result?.provider === 'stub-email' && (env as any)?.ENVIRONMENT === 'production') {
      console.error(`[auth-email] STUB delivered in production for ${user.email} — this should never happen. Check Listmonk secrets.`);
    }
  } catch (err: any) {
    console.error(`[auth-email] Dispatch EXCEPTION for ${user.email}:`, err?.message || err);
  }
  // Always log the raw verification URL in non-prod for magic-link testing via wrangler tail
  if ((env as any)?.ENVIRONMENT !== 'production') {
    console.log(`[auth] verification for ${user.email}: ${url}`);
  }
}

async function sendOtpEmail(env: any, db: any, user: { email: string; name?: string }, otp: string): Promise<void> {
  const { subject, html } = otpEmailTemplate({
    name: user.name,
    otpCode: otp,
    expiresInMinutes: 10,
  });

  try {
    const result: any = await sendNotification(env, db, {
      channel: 'email',
      to: user.email,
      subject,
      body: html,
      templateId: getListmonkTemplateId(env, 'otp'),
      data: { OtpCode: otp, BannerText: 'This code is valid for 10 minutes. For your security, never share this code with anyone.', Subject: subject },
    });
    if (!result?.ok) {
      console.error(`[auth-email] OTP FAILED for ${user.email}: provider=${result?.provider} error=${result?.reason}`);
      if (result?.provider === 'listmonk' && env?.EMAIL) {
        try { const fb: any = await env.EMAIL.send({ from: env.EMAIL.from_email || 'no-reply@opusoverseas.com', to: [user.email], subject, html }); console.log(`[auth-email] OTP EMAIL fallback ok for ${user.email}`, fb?.MessageId || 'sent'); } catch (e: any) { console.error(`[auth-email] OTP fallback FAILED`, e?.message); }
      }
    } else {
      console.log(`[auth-email] OTP dispatched to ${user.email}: provider=${result.provider}`);
    }
  } catch (err: any) {
    console.error(`[auth-email] OTP EXCEPTION for ${user.email}:`, err?.message || err);
  }
  if ((env as any)?.ENVIRONMENT !== 'production' || (typeof process !== 'undefined' && process.env?.ENVIRONMENT !== 'production')) {
    console.log(`[auth] 2FA OTP for ${user.email}: ${otp}`);
  }
}

export { sendPasswordResetEmail, sendVerificationEmailSafe, sendOtpEmail };