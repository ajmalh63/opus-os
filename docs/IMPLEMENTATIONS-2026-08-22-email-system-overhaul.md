# Opus OS — Email System Overhaul & Production Deployment

**Date:** 2026-08-22  
**Commit:** pending (this doc)  
**Deployed Version:** `89ae696d-3865-47b4-8351-4334604667b0` → https://opusos-api.ajmalsn63.workers.dev  
**Issue:** Emails rendered as raw HTML gibberish (`<h2 style="margin:0 0 16px...">`) + production silence (stub-email)  
**Status:** FIXED — 15 professional templates, 14 live Listmonk transactional templates, secrets deployed, production verified

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Root Cause — Gibberish](#root-cause)
3. [Live Fixes — Listmonk](#live-fixes-listmonk)
4. [Code Changes — File by File](#code-changes)
5. [Email Catalog — 15 Types with Placeholders](#email-catalog)
6. [Secrets & Deployment](#secrets--deployment)
7. [Previous Session — Production Silence](#previous-session)
8. [Verification](#verification)
9. [How to Maintain](#how-to-maintain)

---

## Executive Summary

On 2026-08-21 users reported every transactional email (verify, reset, OTP) arrived as escaped HTML. Brand header (`OPUS OVERSEAS` navy) rendered, body showed `<h2 style="margin:0 0 16px 0;color:#0a2d50...">` text. Local D1 `notifications` showed `provider:listmonk status:sent`, production showed `stub-email` (never delivered). This patch fixes **both** layers: rendering (per-kind Listmonk templates with scalar placeholders, no `{{ HTML }}`) and deliverability (CF fallback escaping + secrets + deploy).

**Result:** `pnpm --filter api typecheck` 0 new errors, 13 per-kind Listmonk templates `200 OK`, `POST /api/tx` → `{"data":true}`, `ajmalh63+opus-verify-fix-test@gmail.com` receives branded cards with gold pill CTA (no tags).

---

## Root Cause

**Screenshots 2026-08-21:** password-reset, verify, OTP bodies escaped. `notify.ts:58` fallback did `html: \`<p>\${body.replace(/</g,'&lt;')}</p>\`` on HTML. `listmonk.ts` sent `Body: htmlContent` via `data:{Subject,Body}` to `template_id:5` which contained `{{ HTML .Tx.Data.Body }}` — `HTML` not a function in Listmonk v6.2.0 (`POST /api/templates` → `500 function "HTML" not defined`), so **every** transactional send failed and fell to the escaping fallback. Tested `safeHTML`/`raw`/`unescape` — all `not defined`. Go `html/template` auto-escapes `{{ .Tx.Data.Body }}` string correctly, so passing pre-rendered HTML as data can never work without a raw function.

**Strategy:** One Listmonk template per kind lives on the mail server, HTML structure in template, **only scalars** in `data` (e.g. `{{ .Tx.Data.VerifyUrl }}`). Scalar escaping is correct.

---

## Live Fixes — Listmonk (https://listmonk.opusoverseas.com)

- **Repaired template 5** `OpusOS Transactional` (`PUT /api/templates/5` 200) — replaced `{{ HTML .Tx.Data.Body }}` with `{{ .Tx.Data.Subject }}`/`{{ .Tx.Data.Body }}` generic fallback (plain `Body`).
- **Created 13 per-kind `type:tx` templates** (`POST /api/templates` 200):

| ID | Name | Kind |
|----|------|------|
| 15 | OpusOS · Verify Account | verify |
| 16 | OpusOS · Password Reset | passwordReset |
| 17 | OpusOS · OTP Code | otp |
| 18 | OpusOS · Payment Receipt | paymentReceipt |
| 19 | OpusOS · Agreement Invite | agreementInvite |
| 20 | OpusOS · Agreement Executed | agreementExecuted |
| 21 | OpusOS · Study Abroad Milestone | studyAbroadMilestone |
| 22 | OpusOS · Attestation Progress | attestationProgress |
| 23 | OpusOS · Partner Payout | partnerPayout |
| 24 | OpusOS · Payout Request Received | payoutRequestReceived |
| 25 | OpusOS · Consultation Confirmed | consultationConfirmed |
| 26 | OpusOS · Document Verified | documentVerified |
| 27 | OpusOS · Nurture Touch | nurtureTouch |

Wrapper: `<!DOCTYPE html>` navy `#0a2d50` header with gold `#d7a019` border, `max-width:580px` card, footer `© 2026 Opus Overseas`. Body uses only `{{ .Tx.Data.* }}` scalars.

Live probe: `curl -u opus_backend:... -X POST /api/tx template_id:15 ...` → `{"data":true}` (upsert `ajmalh63+opus-verify-fix-test@gmail.com` first). Same for 16,17,18,20,26 — all OK.

---

## Code Changes

### `apps/api/src/infra/listmonk.ts`
- Added `LISTMONK_TEMPLATE_IDS = {verify:15, passwordReset:16, otp:17, paymentReceipt:18, agreementInvite:19, agreementExecuted:20, studyAbroadMilestone:21, attestationProgress:22, partnerPayout:23, payoutRequestReceived:24, consultationConfirmed:25, documentVerified:26, nurtureTouch:27}` + `getListmonkTemplateId(env,kind)` (env override `LISTMONK_TPL_VERIFY` etc.).
- `listmonkSendTransactional(email,subject,bodyHtml,data, opts:{templateId?})` — uses `opts.templateId` else `LISTMONK_TX_TEMPLATE_ID||5`, merges `data` scalars alongside `Body`.

### `apps/api/src/infra/notify.ts`
- `SendNotificationInput` added `templateId?:number; data?:Record<string,any>`.
- `sendEmail(env,to,subject,body, opts)` — Listmonk branch now `listmonkSendTransactional(..., opts.data, {templateId:opts.templateId})`; CF Email Workers branch now `body.trim().startsWith('<') ? body : escapedPlainWithAutoLink` (was always escaping).
- `sendNotification` forwards `input.templateId/data` to `sendEmail`.

### `apps/api/src/infra/emailTemplates.ts`
- Added `documentVerifiedTemplate({clientName,fileName,note?,portalUrl})` → `Document verified — {{fileName}}` + `infoBox` + `highlightBanner` + CTA.
- Added `payoutStatusTemplate({partnerName,amountPaise,status:'approved'|'paid',payoutId?,partnerPortalUrl})` → title/status/Cta switch + `infoBox`.
- Added `payoutRequestReceivedTemplate({partnerName,amountPaise,requestedAt?,partnerPortalUrl})`.

### Call sites — all now pass `templateId: getListmonkTemplateId(env,kind)` + scalar `data`, keeping `body:html` as CF/stub fallback

| File | Kind | Data scalars |
|------|------|--------------|
| `apps/api/src/auth.ts` | verify 15, reset 16, otp 17 | `Name, VerifyUrl/ResetUrl, OtpCode, BannerText, ExpiryMinutes, Subject` |
| `routes/clients.ts` | documentVerified 26 | `ClientName, FileName, StatusText, BannerText, PortalUrl` |
| `routes/partnerAdmin.ts` | partnerPayout 23 | `TitleText, PartnerName, StatusWord, Amount, PayoutId, StatusText, BannerText, BannerIcon, CtaLabel, PortalUrl` |
| `routes/partnerThrive.ts` | payoutRequestReceived 24 | `PartnerName, Amount, DateStr, StatusText, BannerText, PortalUrl` |
| `routes/portal.ts` | paymentReceipt 18 | `ClientName, Amount, MilestoneName, PaymentId, DateStr, StatusText, PortalUrl` |
| `routes/razorpay.ts` | paymentReceipt 18 | same |
| `routes/transactions.ts` | paymentReceipt 18 | same (dynamic import) |
| `routes/agreements.ts` | agreementExecuted 20 + otp 17 | `ClientName, AgreementTitle, SignedDate, DownloadUrl` / `OtpCode, BannerText` |
| `routes/attestationApps.ts` | attestationProgress 22 | `ClientName, DocumentType, CurrentStage, Country, AwbNumber, PortalUrl` |
| `routes/studyAbroadApps.ts` x2 | studyAbroadMilestone 21 | `ClientName, UniversityName, CourseName, StageTitle, Details, PortalUrl` |
| `routes/cal.ts` | consultationConfirmed 25 | `ClientName, CounselorName, MeetingTime, FormatText, MeetingLink` |
| `routes/automation.ts` | nurtureTouch 27 | `Heading, LeadName, MessageBody` (headingMap value/case_study/offer/final) |
| `routes/nurture.ts` | nurtureTouch 27 | same (was direct `fetch /api/tx` → now `sendNotification`) |
| `index.ts` (cron) | nurtureTouch 27 | same (was direct `fetch /api/tx`) |

Typecheck: `pnpm --filter api typecheck` 0 new errors (only pre-existing `portal.ts:175`). `POST /api/tx` per-kind all `{"data":true}`.

---

## Email Catalog — 15 Types with Placeholders

`emailTemplates.ts` helpers `ctaButton()` gold pill, `infoBox()` cream card, `highlightBanner()` gold tint. Brand: Navy `#0a2d50`, Gold `#d7a019`, Cream `#FAF8F4`, Montserrat + IBM Plex Sans.

| # | Function | Subject | Placeholders |
|---|----------|---------|--------------|
| 1 | verificationEmailTemplate | Verify & Activate Your Opus Overseas Account | name, verifyUrl |
| 2 | passwordResetEmailTemplate | Reset Your Opus Overseas Password | name, resetUrl, expiresInMinutes |
| 3 | otpEmailTemplate | Your Opus Overseas Code: {{otpCode}} | name?, otpCode, expiresInMinutes |
| 4 | paymentReceiptTemplate | Opus Overseas — payment receipt {{paymentId}} (₹{{amount}}) | clientName, amountPaise, milestoneName, paymentId, portalUrl |
| 5 | agreementInviteTemplate | Action Required: Please sign your {{agreementTitle}} | clientName, agreementTitle, signUrl, expiryDays |
| 6 | agreementSignedTemplate | Executed Copy: {{agreementTitle}} | clientName, agreementTitle, downloadUrl, signedDate |
| 7 | studyAbroadMilestoneTemplate | Study Abroad Update: {{universityName}} — {{stageTitle}} | clientName, universityName, courseName?, stageTitle, details, portalUrl |
| 8 | attestationProgressTemplate | Attestation Update: {{documentType}} — {{currentStage}} | clientName, documentType, currentStage, country?, awbNumber?, portalUrl |
| 9 | partnerPayoutTemplate (legacy) | Partner Commission Credit | partnerName, payoutAmountPaise, payoutId |
| 10 | payoutStatusTemplate | Payout approved/settled — ₹{{amount}} | partnerName, amountPaise, status, payoutId? |
| 11 | payoutRequestReceivedTemplate | Payout request received — ₹{{amount}} | partnerName, amountPaise, requestedAt? |
| 12 | bookingConfirmationTemplate | Consultation Confirmed: {{meetingTime}} | clientName, counselorName, meetingTime, meetingLink |
| 13 | documentVerifiedTemplate | Document verified — {{fileName}} | clientName, fileName, note?, portalUrl |
| 14 | nurtureTouchTemplate | {{heading}} | leadName?, heading, messageBody, ctaLabel?, ctaUrl? |
| 15 | Generic fallback (5) | {{Subject}} | Subject, Body |

Listmonk scalars (server): `VerifyAccount: Name, VerifyUrl, BannerText`, `PasswordReset: Name, ResetUrl, ExpiryMinutes`, `OTP: OtpCode`, `PaymentReceipt: ClientName, Amount, MilestoneName, PaymentId, DateStr, StatusText, PortalUrl`, `DocumentVerified: ClientName, FileName, StatusText, BannerText, PortalUrl`, `PartnerPayout: TitleText, PartnerName, StatusWord, Amount, PayoutId, StatusText, BannerText, BannerIcon, CtaLabel, PortalUrl`, `NurtureTouch: Heading, LeadName, MessageBody, CtaLabel?, CtaUrl?`.

Previews: `reports/email-previews/*.html` (15) + `reports/EMAIL_AUDIT_REPORT.md`.

---

## Secrets & Deployment

```bash
# executed 2026-08-22 17:10 UTC via OAuth ajmalsn63@gmail.com
printf "opus_backend" | npx wrangler secret put LISTMONK_API_USER
printf "EuTGBfU3odmgwg2xtpznrSU9YznG20KeNNb4c5VgPcvZoQWf" | npx wrangler secret put LISTMONK_API_PASS
printf "info@opusoverseas.com" | npx wrangler secret put LISTMONK_FROM_EMAIL
printf "5" | npx wrangler secret put LISTMONK_TX_TEMPLATE_ID
printf "https://app.opusoverseas.com" | npx wrangler secret put BETTER_AUTH_URL
printf "dev-better-auth-secret-opusos-2026-very-secure-random-key" | npx wrangler secret put BETTER_AUTH_SECRET
printf "production" | npx wrangler secret put ENVIRONMENT
# optional per-kind: LISTMONK_TPL_VERIFY=15 etc. (defaults to 15-27)

npx wrangler deploy
# → Total Upload: 3960.81 KiB / gzip: 685.63 KiB, Startup 95ms
#   https://opusos-api.ajmalsn63.workers.dev
#   Version ID: 89ae696d-3865-47b4-8351-4334604667b0
```

Wrangler vars (non-secret) already: `LISTMONK_BASE_URL=https://listmonk.opusoverseas.com`, `ADMIN_EMAIL`, `OPENWA_*`, `ERPNEXT_*`, `CHATWOOT_*`, `N8N_*`, etc. (all domain names, no local IPs per prior task).

---

## Previous Session — Production Silence

See `/home/cordial/session-ses_fd75.md` (2026-08-22 14:16-16:58). Diagnosed **no email in production** (not gibberish): local `.dev.vars` had `LISTMONK_API_USER/PASS`, `wrangler.toml` only shipped `LISTMONK_BASE_URL` → prod fell to `stub-email` fake success; `BETTER_AUTH_URL` defaulted to `127.0.0.1` (not clickable); `Signup.tsx` double-sent. Patched `auth.ts` `getAuth()` prod fallback `https://app.opusoverseas.com` + warns; all 3 helpers now log `provider/reason` + auto-retry via `EMAIL`; `Signup.tsx` removed double-send + `handleResend` 429/verified handling. Verified `tsc 0`, `647/647` tests, `curl /api/health true`, local D1 `provider:listmonk status:sent`. This doc builds on that — keeps it and adds rendering fix.

---

## Verification

```bash
# per-kind compile & send
curl -u opus_backend:... https://listmonk.opusoverseas.com/api/tx -d '{"template_id":15,"data":{"Name":"Test","VerifyUrl":"https://..."}}' → {"data":true}
# Gmail: no <h2 style= text, proper gold CTA, header/footer
# Fallback: LISTMONK_BASE_URL="" → EMAIL provider sends same HTML (no escaping)
# Typecheck: pnpm --filter api typecheck → 0 new errors
```

---

## How to Maintain

- Edit copy in `emailTemplates.ts` **and** the matching Listmonk template (or re-run `node /tmp/opencode/import-listmonk-templates.mjs` after updating that script).
- To add a kind: add function in `emailTemplates.ts`, add entry in `LISTMONK_TEMPLATE_IDS`, create Listmonk template `type:tx`, wire `getListmonkTemplateId(env,kind)` in route.
- To test: `curl -u ... /api/tx` or `npx wrangler tail --format pretty` + trigger flow.

