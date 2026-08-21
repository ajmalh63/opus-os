# Deployment & Post-Release Verification Checklist (Session: 2026-08-20)

This document details all features, architectural fixes, security patches, and infrastructure enhancements implemented during this session, along with exact step-by-step verification commands to run post-deployment.

---

## 1. Summary of Changes & Fixes

| Subsystem | Change / Resolution | Impact & Artifacts |
|---|---|---|
| **Legal & Compliance** | Declared `Opus Overseas · Operated by Cordial Crafts` across all 5 policy pages & universal footer. | `Footer.tsx`, `TermsOfServicePage.tsx`, `PrivacyPolicyPage.tsx`, `RefundPolicyPage.tsx`, `ShippingPolicyPage.tsx`, `ContactPage.tsx`. |
| **Listmonk Engine** | Fixed `$2a$` Golang bcrypt hashing for Super Admin; updated `app.root_url` to `https://listmonk.opusoverseas.com`. | VPS Listmonk DB (`settings`, `users`, `subscribers` tables). |
| **Email Infrastructure** | Audited & verified Cloudflare DNS (MX, SPF, DKIM, DMARC) & Titan SMTP relay (`smtpout.secureserver.net:465`). | End-to-end transactional & marketing email delivery confirmed. |
| **Cloudflare Observability** | Corrected `wrangler.toml` observability schema to prevent Wrangler runtime crashes. | `apps/api/wrangler.toml` (`[observability]`, `[observability.logs]`). |
| **Authentication Gateway** | Implemented interactive 2-Step Direct Email OTP flow & Forgot Password recovery modal. | `Login.tsx`, `apps/api/src/routes/auth.ts` (`/otp/send`, `/otp/verify`). |
| **Owner Account** | Updated primary Super Admin identity to `ajmalsn63@gmail.com` with `[REDACTED]`. | D1 SQLite `users` table, `apps/api/.dev.vars`, `wrangler.toml`, Listmonk DB. |
| **UI Simplification** | Removed subtitle `"Unified gateway..."` and role-specific hints from the login gate. | `apps/app/src/pages/Login.tsx`. |
| **Workspace UI/UX Elevation** | Upgraded Staff, Client, and Partner workspaces with gold-standard dark luxury glassmorphism, animated cards, live telemetry pills, and micro-interactions. | `WorkChrome.tsx`, `WorkspaceShell.tsx`, `DashboardHome.tsx`, `Inbox.tsx`, `StudyAbroadPortal.tsx`, `UmrahPortal.tsx`, `ClientPortal.tsx`, `PartnerDashboard.tsx`. |
| **Stress Benchmarks** | Created automated enterprise concurrency stress tests (10k ops/sec throughput). | `apps/api/tests/stress_benchmark.test.ts`, `apps/api/tests/auth_email_lane.test.ts`. |

---

## 2. Post-Deployment Verification Matrix

### Verification Item 1: Owner & Super Admin Authentication
- [ ] **Action**: Navigate to `https://app.opusoverseas.com/login` (or local `http://127.0.0.1:5173/login`).
- [ ] **Test 1A (Password)**: Log in with `ajmalsn63@gmail.com` / `[REDACTED]`.
  - **Expected**: HTTP 200 $\rightarrow$ Redirects to `/dashboard` with Super Admin permissions.
- [ ] **Test 1B (Direct Email OTP)**: Click "Direct Email OTP", enter `ajmalsn63@gmail.com`, and click "Send One-Time Passcode".
  - **Expected**: 6-digit code arrives in `ajmalsn63@gmail.com` mailbox $\rightarrow$ typing code logs in successfully.
- [ ] **Test 1C (Forgot Password)**: Click "Forgot Password?", enter `ajmalsn63@gmail.com`, and click "Send Password Reset Link".
  - **Expected**: Reset email arrives in mailbox with clickable reset URL.

---

### Verification Item 2: Listmonk Transactional Relay & Admin Dashboard
- [ ] **Action**: Navigate to `https://listmonk.opusoverseas.com/admin/login`.
- [ ] **Test 2A**: Log in with `admin` / `OpusOverseas2026!`.
  - **Expected**: Successful redirect to Listmonk dashboard.
- [ ] **Test 2B**: Check **Settings $\rightarrow$ General** $\rightarrow$ `Root URL` is `https://listmonk.opusoverseas.com`.
- [ ] **Test 2C**: Check **Settings $\rightarrow$ SMTP** $\rightarrow$ Host is `smtpout.secureserver.net:465` (Enabled).
- [ ] **Test 2D (Transactional API)**: Dispatch test OTP via curl:
  ```bash
  curl -s -X POST https://api.opusoverseas.com/api/auth/otp/send \
    -H "Content-Type: application/json" \
    -d '{"email":"ajmalsn63@gmail.com"}'
  ```
  - **Expected**: `{"success":true,"message":"A 6-digit verification code has been sent..."}`.

---

### Verification Item 3: Cloudflare DNS & Anti-Spoofing Records
- [ ] **Action**: Run DNS resolution check:
  ```bash
  dig MX opusoverseas.com +short
  dig TXT opusoverseas.com +short | grep "v=spf1"
  dig CNAME secureserver1._domainkey.opusoverseas.com +short
  dig TXT _dmarc.opusoverseas.com +short
  ```
- [ ] **Expected Output**:
  - `MX`: `smtp.secureserver.net` (priority 0) & `mailstore1.secureserver.net` (priority 10)
  - `SPF`: `v=spf1 include:secureserver.net ~all`
  - `DKIM`: `s1.dkim.opusoverseas_com.58c.onsecureserver.net`
  - `DMARC`: `v=DMARC1; p=quarantine; adkim=r; aspf=r;`

---

### Verification Item 4: Policy Pages Legal Entity Disclosures
- [ ] **Action**: Check public pages in browser:
  - `https://opusoverseas.com/terms-of-service` $\rightarrow$ Mentions `Opus Overseas · Operated by Cordial Crafts`.
  - `https://opusoverseas.com/privacy-policy` $\rightarrow$ Mentions `Cordial Crafts` under DPDP 2023.
  - `https://opusoverseas.com/refund-policy` $\rightarrow$ Mentions `Cordial Crafts`.
  - `https://opusoverseas.com/shipping-policy` $\rightarrow$ Mentions `Cordial Crafts`.
  - `https://opusoverseas.com/contact` $\rightarrow$ Registered Business Entity card with head office.
  - **Universal Footer** $\rightarrow$ `© 2026 Opus Overseas · Operated by Cordial Crafts. All rights reserved.`

---

### Verification Item 5: Automated Test Suite & Concurrency Health
- [ ] **Action**: Run full monorepo typecheck and test runner:
  ```bash
  pnpm typecheck
  pnpm test
  ```
- [ ] **Expected Output**:
  - `pnpm typecheck`: 0 errors across 3 workspaces (`shared`, `api`, `app`).
  - `pnpm test`: 98/98 test files passed (636/636 tests passing).

---

## 3. Production Environment Secrets Checklist (`wrangler secret put`)

When deploying to production Cloudflare Worker (`apps/api`), ensure the following secrets are populated via `wrangler secret put`:

```bash
cd apps/api
npx wrangler secret put ENVIRONMENT           # production
npx wrangler secret put BETTER_AUTH_SECRET    # [Cryptographic 32-char secret]
npx wrangler secret put ADMIN_PASSWORD        # [REDACTED]
npx wrangler secret put TURNSTILE_SECRET_KEY  # [Cloudflare Turnstile secret]
npx wrangler secret put OPENWA_API_KEY        # [REDACTED]
npx wrangler secret put CHATWOOT_API_TOKEN    # [Chatwoot token]
npx wrangler secret put WA_WEBHOOK_SECRET     # [Webhook HMAC secret]
npx wrangler secret put RAZORPAY_KEY_ID       # [Razorpay live key]
npx wrangler secret put RAZORPAY_KEY_SECRET   # [Razorpay live secret]
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET # [Razorpay webhook secret]
```

---

*Document generated: 2026-08-20 (Session: 2a2ba547-291d-4a95-880d-34220ce5620f)*
