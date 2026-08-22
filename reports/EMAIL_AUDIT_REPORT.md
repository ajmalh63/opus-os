# Opus OS — Email System Audit & Professional Templates
**Date:** 2026-08-22  
**Issue:** Emails showing raw HTML gibberish (`<h2 style="margin:0 0 16px...">`) instead of rendered content  
**Status:** ✅ FIXED — all 15 email types now have professional branded templates with placeholder variables

---

## 1. Root Cause — Why Emails Were Gibberish

**Evidence from screenshots (2026-08-21):**  
Password-reset, verification, and OTP emails displayed escaped HTML tags as plain text. Brand header/footer (`OPUS OVERSEAS` navy banner) rendered correctly — only the inner body was gibberish.

**Two bugs confirmed:**

1. **Listmonk transactional template 5 used `{{ HTML .Tx.Data.Body }}`** — `HTML` is NOT a valid function in Listmonk v6.2.0 (`function "HTML" not defined`). Verified live via `POST /api/templates` → 500. This made every `/api/tx` call with `template_id:5` fail, falling through to fallback.

2. **`apps/api/src/infra/notify.ts:58` Cloudflare Email Workers fallback always escaped:**
   ```ts
   html: `<p>${body.replace(/</g,'&lt;')}</p>` // destroys any HTML body
   ```
   Even when Listmonk failed, the fallback re-escaped the already-built HTML from `emailTemplates.ts`.

**Fix strategy (no raw-HTML function exists — tested `safeHTML`, `raw`, `unescape` etc. — all fail):**  
Create **one Listmonk template per email kind** that lives on the mail server and uses **only scalar placeholders** (e.g. `{{ .Tx.Data.VerifyUrl }}`). Scalar escaping by Go `html/template` is correct/safe — HTML structure lives in the template itself, never as an escaped data string.

---

## 2. Fixed Live (2026-08-22)

- **Repaired template 5** (`OpusOS Transactional`) — replaced broken `{{ HTML .Tx.Data.Body }}` with safe `{{ .Tx.Data.Subject }}` / `{{ .Tx.Data.Body }}` generic fallback (`PUT /api/templates/5` → 200 OK).
- **Created 13 per-kind transactional templates** (all 200 OK, live on https://listmonk.opusoverseas.com):

| ID | Name | Kind key |
|----|------|----------|
| 15 | OpusOS · Verify Account | `verify` |
| 16 | OpusOS · Password Reset | `passwordReset` |
| 17 | OpusOS · OTP Code | `otp` |
| 18 | OpusOS · Payment Receipt | `paymentReceipt` |
| 19 | OpusOS · Agreement Invite | `agreementInvite` |
| 20 | OpusOS · Agreement Executed | `agreementExecuted` |
| 21 | OpusOS · Study Abroad Milestone | `studyAbroadMilestone` |
| 22 | OpusOS · Attestation Progress | `attestationProgress` |
| 23 | OpusOS · Partner Payout | `partnerPayout` |
| 24 | OpusOS · Payout Request Received | `payoutRequestReceived` |
| 25 | OpusOS · Consultation Confirmed | `consultationConfirmed` |
| 26 | OpusOS · Document Verified | `documentVerified` |
| 27 | OpusOS · Nurture Touch | `nurtureTouch` |

- **Fixed `notify.ts` CF Email Workers path** — now detects `body.trim().startsWith('<')` and sends HTML as-is (like the Listmonk path already did); plain text still auto-links URLs.

Verified live: `POST /api/tx` with template 15,16,17,18,20,26 → all `{"data":true}`; upserted `ajmalh63+opus-verify-fix-test@gmail.com` received correctly rendered emails (no gibberish).

---

## 3. Where Every Email Is Generated — Full Catalog

### A. `apps/api/src/infra/emailTemplates.ts` — Professional HTML engine (brand DNA: Navy #0a2d50 / Gold #d7a019 / Cream #FAF8F4, Montserrat + IBM Plex Sans)

All templates use shared helpers `ctaButton()` (gold pill), `infoBox()` (cream card), `highlightBanner()` (gold tint).

| # | Function | Subject pattern | Placeholders (JS) | Listmonk kind | Trigger |
|---|----------|-----------------|-------------------|---------------|---------|
| 1 | `verificationEmailTemplate` | `Verify & Activate Your Opus Overseas Account` | `name`, `verifyUrl` | `verify` (15) | `auth.ts: sendVerificationEmailSafe` → BetterAuth `sendOnSignUp` + `/send-verification-email` |
| 2 | `passwordResetEmailTemplate` | `Reset Your Opus Overseas Password` | `name`, `resetUrl`, `expiresInMinutes=10` | `passwordReset` (16) | `auth.ts: sendPasswordResetEmail` → `sendResetPassword` |
| 3 | `otpEmailTemplate` | `Your Opus Overseas Code: {{otpCode}}` | `name?`, `otpCode`, `expiresInMinutes=10` | `otp` (17) | `auth.ts: sendOtpEmail` (2FA TOTP) + `agreements.ts:466` (sign OTP) |
| 4 | `paymentReceiptTemplate` | `Opus Overseas — payment receipt {{paymentId}} (₹{{amount}})` | `clientName`, `amountPaise`, `milestoneName`, `paymentId`, `paymentMethod?`, `date?`, `portalUrl` | `paymentReceipt` (18) | `razorpay.ts`, `transactions.ts:486`, `portal.ts` (Visa sale) |
| 5 | `agreementInviteTemplate` | `Action Required: Please sign your {{agreementTitle}}` | `clientName`, `agreementTitle`, `signUrl`, `expiryDays=7` | `agreementInvite` (19) | Agreement invite flow (ready for use) |
| 6 | `agreementSignedTemplate` | `Executed Copy: {{agreementTitle}}` | `clientName`, `agreementTitle`, `downloadUrl`, `signedDate` | `agreementExecuted` (20) | `agreements.ts:347` (post-sign) |
| 7 | `studyAbroadMilestoneTemplate` | `Study Abroad Update: {{universityName}} — {{stageTitle}}` | `clientName`, `universityName`, `courseName?`, `stageTitle`, `details`, `portalUrl` | `studyAbroadMilestone` (21) | `studyAbroadApps.ts:129` (Offer), `:457` (Profile 100%) |
| 8 | `attestationProgressTemplate` | `Attestation Update: {{documentType}} — {{currentStage}}` | `clientName`, `documentType`, `currentStage`, `country?`, `awbNumber?`, `portalUrl` | `attestationProgress` (22) | `attestationApps.ts:404` (Quote confirmed) |
| 9 | `partnerPayoutTemplate` | `Partner Commission Credit: ₹{{amount}} ({{payoutId}})` | `partnerName`, `payoutAmountPaise`, `clientRef?`, `payoutId`, `partnerPortalUrl` | — (legacy) | — |
| 10 | `payoutStatusTemplate` ⭐ NEW | `Payout approved/settled — ₹{{amount}}` | `partnerName`, `amountPaise`, `status:'approved'|'paid'`, `payoutId?`, `partnerPortalUrl` | `partnerPayout` (23) | `partnerAdmin.ts` (approve/paid) |
| 11 | `payoutRequestReceivedTemplate` ⭐ NEW | `Payout request received — ₹{{amount}}` | `partnerName`, `amountPaise`, `requestedAt?`, `partnerPortalUrl` | `payoutRequestReceived` (24) | `partnerThrive.ts` (request) |
| 12 | `bookingConfirmationTemplate` | `Consultation Confirmed: {{meetingTime}} with {{counselorName}}` | `clientName`, `counselorName`, `meetingTime`, `meetingLink` | `consultationConfirmed` (25) | `cal.ts:302` (pending booking) |
| 13 | `documentVerifiedTemplate` ⭐ NEW | `Document verified ✓ — {{fileName}}` | `clientName`, `fileName`, `note?`, `portalUrl` | `documentVerified` (26) | `clients.ts:397` (was plain text) |
| 14 | `nurtureTouchTemplate` | `{{heading}}` | `leadName?`, `heading`, `messageBody`, `ctaLabel?`, `ctaUrl?` | `nurtureTouch` (27) | `automation.ts`, `nurture.ts:dispatch`, `index.ts` (cron) |
| 15 | Generic fallback | `{{Subject}}` | `Subject`, `Body` (plain) | 5 (`OpusOS Transactional`) | Any uncategorizes email |

⭐ = added this patch (were plain-text `Your document "x" has been verified.` etc.)

**Listmonk scalar placeholders (server-side, safe to escape):**  
`VerifyAccount`: `Name`, `VerifyUrl`, `BannerText`, `Subject`  
`PasswordReset`: `Name`, `ResetUrl`, `ExpiryMinutes`, `BannerText`  
`OTP`: `OtpCode`, `BannerText`  
`PaymentReceipt`: `ClientName`, `Amount`, `MilestoneName`, `PaymentId`, `DateStr`, `StatusText`, `PortalUrl`  
`DocumentVerified`: `ClientName`, `FileName`, `StatusText`, `BannerText`, `PortalUrl`  
`PartnerPayout`: `TitleText`, `PartnerName`, `StatusWord`, `Amount`, `PayoutId`, `StatusText`, `BannerText`, `BannerIcon`, `CtaLabel`, `PortalUrl`  
`NurtureTouch`: `Heading`, `LeadName`, `MessageBody`, `CtaLabel?`, `CtaUrl?` (with `{{if .Tx.Data.CtaUrl}}`)

---

## 4. Code Changes (apps/api)

- **`infra/notify.ts`** — added `templateId?` + `data?` to `SendNotificationInput`; `sendEmail()` now accepts `opts` and forwards to `listmonkSendTransactional(..., opts)`; CF Email Workers branch now mirrors Listmonk branch's HTML detection.
- **`infra/listmonk.ts`** — added `LISTMONK_TEMPLATE_IDS` + `getListmonkTemplateId(env, kind)` (env override `LISTMONK_TPL_VERIFY` etc.); `listmonkSendTransactional` now accepts `opts:{templateId?}` and merges `data` scalars alongside `Body`.
- **`infra/emailTemplates.ts`** — added `documentVerifiedTemplate`, `payoutStatusTemplate`, `payoutRequestReceivedTemplate` (+ helpers).
- **All email call sites updated to pass `templateId` + `data` scalars while keeping `body:html` as fallback for CF/stub:**
  - `auth.ts` (3), `clients.ts`, `partnerAdmin.ts`, `partnerThrive.ts`, `portal.ts`, `razorpay.ts`, `agreements.ts` (2), `attestationApps.ts`, `studyAbroadApps.ts` (2), `cal.ts`, `transactions.ts`, `automation.ts`, `nurture.ts`, `index.ts` (cron)

Typecheck: `pnpm --filter api typecheck` → **0 new errors** (only pre-existing `portal.ts:175` unrelated). Listmonk live: template 5 fixed + 13 per-kind all compile (`POST /api/templates` 200).

---

## 5. Previous Session (`/home/cordial/session-ses_fd75.md`, 2026-08-22) — What Was Done Before This Fix

The prior agent diagnosed **production email silence** (not gibberish):

- **Findings:** Local `.dev.vars` had `LISTMONK_API_USER/PASS`, `BETTER_AUTH_URL=http://127.0.0.1:5173`; `wrangler.toml` only shipped `LISTMONK_BASE_URL`. Yet `Signup.tsx` showed green “activation link sent” while `notifications` logged `provider:stub-email` (never delivered). Also `baseURL` fallback was `127.0.0.1` in prod (not clickable) + double-send burned rate-limit.
- **Patches landed:** `auth.ts` — production `baseURL` fallback → `https://app.opusoverseas.com` with warns; all 3 helpers now log `Dispatch result`, detect `!ok`/`stub-email` in prod, auto-retry via Cloudflare `EMAIL` binding; `Signup.tsx` — removed double-send, `handleResend` now handles `429`/`already verified` with 30s/60s cooldown.
- **Verification then:** `pnpm --filter api tsc --skipLibCheck` → 0, `pnpm --filter api test` → 100 files 647 passed, `curl /api/health` → true, template 5 “OpusOS Transactional” live, local D1 last 3 `provider:listmonk status:sent`.
- **Left for production:** `npx wrangler secret put LISTMONK_API_USER/PASS/FROM_EMAIL/TX_TEMPLATE_ID, BETTER_AUTH_URL/SECRET, ENVIRONMENT` + deploy + `wrangler tail`/`d1 execute` checks.

**This patch builds on that** — it keeps all those production-hardening changes and fixes the **rendering layer** (gibberish) they didn't address: per-kind server templates + escaping fix.

---

## 6. How to Verify

```bash
# All per-kind templates compile & send (already done):
curl -u opus_backend:... https://listmonk.opusoverseas.com/api/tx -d '{"template_id":15,"data":{"Name":"Test","VerifyUrl":"https://..."}}' → {"data":true}

# In Gmail (ajmalh63+...), verify: no <h2 style= text, proper gold CTA, branded header/footer, correct subject.
# Fallback path: set LISTMONK_BASE_URL="" in .dev.vars and trigger password-reset → EMAIL provider sends same HTML (no escaping).
```

Previews: `/tmp/opencode/email-previews/*.html` (15 files, wrap with same header/footer).

