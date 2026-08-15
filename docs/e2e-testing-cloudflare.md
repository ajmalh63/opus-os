# OpusOS — Real E2E Testing Checklist (Cloudflare Production)

**Status:** PLANNED · **Applies to:** the production deployment on Cloudflare (Workers + D1 + R2 + Queues + KV)
**Prerequisite:** Wave-1 tooling live (Telegram/Kuma/Umami/Listmonk) + real CF credentials + Razorpay live keys + OpenWA/Meta WhatsApp lane + ERPNext creds rotated.
**Method:** every item = concrete action → expected result. Mark ✅/❌ + date + evidence (screenshot / log / response).

---

## 0. Pre-Deployment Gates

- [ ] `wrangler secret put` for ALL secrets: `BETTER_AUTH_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `WA_WEBHOOK_SECRET`, `LISTMONK_*`, `TELEGRAM_BOT_TOKEN`, `OPS_TELEGRAM_CHAT_ID`, `KUMA_PUSH_URL`, `ERPNEXT_*`, `OPENWA_*`/`WA_PROVIDER=meta`, `AUTOMATION_TOKEN`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` (dev-only)
- [ ] Verify **no** secret exists in `[vars]` or code (grep for `mock_secret`, `rzp_test`, `default-secret`)
- [ ] `wrangler d1 migrations apply DB --remote` — all migrations 0000→0065 applied; verify `_journal` matches
- [ ] Seed ran: pipeline stages, clause library, roles/permissions, business profile, attestation price bands
- [ ] `pnpm typecheck` + `pnpm test` (432) + `pnpm --filter app build` green on the deploy commit
- [ ] CI workflow passes on the release branch
- [ ] Custom domain + DNS (SPF/DKIM/DMARC/MTA-STS/CAA/DNSSEC) verified with mail-tester ≥9/10
- [ ] Turnstile site+secret keys live (not test keys)

---

## 1. Auth & RBAC (52-probe matrix — re-run in prod)

- [ ] `POST /api/auth/bootstrap-admin` creates owner (or reuses existing)
- [ ] Owner login → session cookie → `/api/auth/me` returns role `super_admin`
- [ ] Staff registration via `POST /api/admin/register-staff` (owner-only) → staff can log in
- [ ] Password reset + email OTP + TOTP 2FA setup/verify/backup codes
- [ ] RBAC matrix (probe each as each role):
  - [ ] Owner: everything 200
  - [ ] Manager: clients/kanban/payments/agreements 200 · admin/infrastructure 403
  - [ ] Counselor: clients/kanban/tasks 200 · payments/marketing/compliance/incentives 403
  - [ ] Receptionist: limited (inquiry) · coordinator: applications
  - [ ] Public (no cookie): all staff routes 401
- [ ] Division scoping: counselor with `userDivisions:['umrah']` blocked from `/api/visa/*`
- [ ] Custom role creation cannot escalate to owner-only permissions (regression: bcbe113)
- [ ] Session expiry → 401 → redirect to login

## 2. Client Portal (token-auth) — all divisions

- [ ] Lead form (Turnstile) → client + token + engagement + consents + SLA task + scoring
- [ ] Token lookup `/api/public/portal` → journey view
- [ ] **Visa**: 9-step wizard partial-save → submit → doc uploads (presigned) → tracker states (draft→submitted→document_prep→slot_booked→granted/rejected→delivered) → rejection reason visible
- [ ] **Manpower**: jobs browse → apply wizard + resume upload (R2) → 4-stage tracker → exclusive community paywall (Razorpay) → membership unlock → secret jobs visible → apply to secret job
- [ ] **Umrah**: package browse → calendar availability → **party booking** (family of 4: 2 adults + 2 children) → ₹2,000 advance (4×₹500) → Razorpay → verify → reserved 72h → balance online → confirmed; solo supplement path; waitlist when full; self-heal after 24h/72h
- [ ] **Study Abroad**: profile wizard (4 steps) → completeness 100% → staff alert + email → applications tracker → offer accept/decline → doc checklist upload → staff verify → student sees verified
- [ ] **Attestation**: price bands shown → quote request (urgent + scan + deadline) → agent confirms exact price → client emailed → pickup booking (AWB) → chain timeline → delivered
- [ ] Ownership: token A cannot see/upload/download token B's data (403)

## 3. Staff Desks — all divisions

- [ ] **Visa**: applicants list + filters, status machine no-jump, doc checklist verify/reject, product inventory CRUD
- [ ] **Manpower**: job CRUD + lifecycle, candidate deployment pipeline, membership plans + grant/revoke
- [ ] **Umrah**: package CRUD (child/infant pricing), departure calendar announce/cancel, manifest (party passengers + occupancy + CSV), confirm-office, release
- [ ] **Study Abroad**: registry completeness bars, intake wizard (agent-assisted), application modal (live match badge), no-jump pipeline (global + per-student), offer record/accept, doc review approve/reject, internal notes, comms log
- [ ] **Attestation**: price bands editor, quote requests (urgency/scan/deadline), copy-supplier-message, chain step advance → auto-complete, fees edit + payment status, duplicate/delete, pickup status, CSV export
- [ ] Kanban F1/F2: WIP limit 409 + stage integrity (no jumps)

## 4. Payments (Razorpay) — money is paise, fail-closed

- [ ] Order creation with live keys (Umrah advance, Manpower membership, balance)
- [ ] Webhook `payment.captured` → ledger credit + outstanding balance drop — **exactly once** (replay the same payload → no double credit)
- [ ] Forged signature → 403/503 (fail-closed when secrets missing)
- [ ] Refund flow → ledger + ERP sync
- [ ] GST split (CGST/SGST vs IGST) correct in paise
- [ ] Transactions module: draft → manager confirm → ERP sync → receipt → balance recompute

## 5. Messaging & Webhooks

- [ ] WhatsApp send (Meta Cloud API) → delivered; OpenWA lane when `WA_PROVIDER=openwa`
- [ ] `POST /api/webhooks/wa` with valid HMAC → conversation created; invalid → 403
- [ ] Chatwoot webhook → conversation; widget loads on public pages
- [ ] Listmonk webhook → suppression table updated
- [ ] Transactional emails fire: offer received (study abroad), quote confirmed (attestation), doc verified, profile complete — verify in Listmonk sent log
- [ ] Staff inbox: thread view + reply → WhatsApp send

## 6. Documents (R2) — security

- [ ] Upload: extension allowlist, magic-byte sniff, size cap, SHA-256, owner-binding
- [ ] **Prompt-injection scan**: upload a PDF with hidden "ignore all previous instructions" text → flagged + staff alert + never enters AI context
- [ ] Downloads: staff scoped to clientId; portal owner-only (403 cross-user); `nosniff` + content-disposition headers
- [ ] Versioning: re-upload same filename → v1.1
- [ ] Rate limit: 20 uploads/hour/token → 429

## 7. Notifications & Dashboard

- [ ] New quote request → sound beep + toast (red for urgent) + Live Activity card (severity color) + click → attestation desk
- [ ] Mark all seen / clear done / per-alert dismiss work
- [ ] My Assigned Open Tasks: click → Client360 or kanban
- [ ] Telegram ops alerts fire (Wave-1)

## 8. ERPNext Sync

- [ ] `POST /api/erpnext/payments/:id/sync` → Customer upsert → Sales Invoice (GST template) → `erpnext_sync_log` row synced
- [ ] Retry pending via `/api/automation/erp/sync/pending` (bounded 25)
- [ ] Owner-only: counselor gets 403

## 9. Partner Portal

- [ ] Partner signup (Turnstile) → api_token → catalog browse (university/departure/job/visa/umrah_package)
- [ ] **Attestation NOT present** anywhere in partner catalog/links/commissions
- [ ] `/go/:ref/...` links track clicks → referral → commission maturation on sign
- [ ] Partner KYC: PAN/IFSC masked, bank details never plaintext

## 10. Security & Abuse

- [ ] Rate limits: auth OTP, lead form, portal lookup, partner signup, uploads
- [ ] Turnstile blocks bot submissions
- [ ] Audit log: PAYMENT_ENTER, AGREEMENT_SIGNED, DOC_UPLOAD, STAGE_CHANGE, CONSENT_GRANTED, ATTESTATION_* — all present with actor/IP
- [ ] DPDP: consent withdrawal endpoint works; university-sharing consent hashed
- [ ] No stack traces / internal errors leaked in responses
- [ ] CORS + secure headers on all responses

## 11. Performance (10ms CPU budget)

- [ ] All handlers return <10ms CPU (Cloudflare dashboard / logs)
- [ ] Heavy work (AI, PDF, email) goes through Queues/Cron — verify queue consumers
- [ ] Heartbeat cron (`0 */6 * * *`) pings Kuma push monitor with real D1 health
- [ ] `/api/health` returns healthy

## 12. Monitoring & DR

- [ ] Uptime Kuma monitors all services (import JSON) + Telegram notifications
- [ ] Umami events fire (8/8: lead_form_submit, booking_cta_click, chat_open, eligibility_check, jobs_click, umrah_departure_view, partner_register, share_link_copied)
- [ ] D1 → R2 full export (GitHub Action) scheduled; restore script tested
- [ ] Rollback plan: `wrangler rollback` + D1 Time-Travel restore documented

## 13. Fresh-Deploy Boot Test (the big one)

On a **brand-new D1** (simulates production first run):
- [ ] Migrations apply clean
- [ ] Seed idempotent (run twice → no dupes)
- [ ] Bootstrap admin → login → dashboard loads
- [ ] Lead form → client → SLA task → counselor sees it
- [ ] One full journey per division end-to-end (lead → portal → staff → payment → completion)

---

## Sign-off

| Area | Tester | Date | Result |
|---|---|---|---|
| Auth/RBAC | | | |
| Client portals (5) | | | |
| Staff desks (5) | | | |
| Payments | | | |
| Messaging | | | |
| Documents | | | |
| Notifications | | | |
| ERPNext | | | |
| Partner | | | |
| Security | | | |
| Performance | | | |
| Monitoring/DR | | | |
| Fresh boot | | | |

**Gate:** all ✅ before flipping `WA_PROVIDER=meta` + pointing the domain live.