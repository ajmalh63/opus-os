# OpusOS — Plan Verification Report

**Plan:** `OpusOS - Complete Development Plan.docx` (v1.0) · **Date:** 2026-08-09
**Method:** 4 parallel code audits (public workspace, workspaces/RBAC, pipelines/data/kanban/agreements, compliance/AI/security) + direct source verification (wrangler.toml, index.ts, schema, CI, roadmap).

---

## Scorecard (per plan §20 phase)

| Phase | Verdict | Evidence / gaps |
|---|---|---|
| **0 — Foundation** (auth, RBAC, divisions, pipeline, headers, CI) | ✅ DONE | Better Auth + D1 sessions, rbac.ts division scoping, `ensurePipelineStages`, secureHeaders (added in audit), CI typecheck+test. OTP email delivery not wired. |
| **0.5 — VPC & Open-Source layer** | ⚠️ PARTIAL | Oracle VPC live with OpenWA, Chatwoot, Cal.diy, ERPNext, Listmonk, Umami, n8n, Uptime Kuma, Twenty. **Missing:** Rallly, cloudflared tunnel (no hostnames/zero-inbound), Cloudflare Access wrap, sync-reconciler cron (one-way webhooks only) |
| **1 — Core Ops** (Client360, Kanban, vault, tasks) | ✅ DONE | Client360 + vault (HMAC presigned), drag-drop Kanban + WIP (advisory, not hard-block), tasks + SLA |
| **1.2 — Data import** | ❌ NO | No CSV/XLSX importer |
| **1.5 — Kanban advanced** (swimlanes, CFD, Monte Carlo) | ❌ NO | Not present |
| **2 — Money, Legal & Compliance** | ✅ DONE | Agreements + eSign (SHA-256), GST paise + split, milestone escalation, consents, TDS/TCS, business profile, clause library |
| **2.5 — Consent lifecycle** | ❌ NO | No re-consent cron, no consent withdrawal endpoint, no evidence exports |
| **3 — Umrah + Attestation** | ⚠️ PARTIAL | Departures/bookings ✅, attestation chains ✅, transit tracker ⚠️ mock; no package builder, no real courier API |
| **4 — Manpower + DPDP** | ⚠️ PARTIAL | Job ticker public✅, resume upload ❌ (spinner only), AI parser = mock / 501 in "real", subject-request workflow NO |
| **4.6 — Client Portal** | ✅ DONE | Token lookup + claim + consent matrix + vault view; onboarding tour/PWA not present (phase-scoped) |
| **5 — Public + Partners** | ⚠️ PARTIAL | GSAP site + 5 division pages + 5 live artifacts ✅; **Turnstile NOT implemented** (fake badge in form); referral+commission ✅, partner portal partial (no owner partner manager) |
| **5.5 — Team Hub** | ❌ NO | No Durable Objects, no WebSocket chat, no internal files/calls |
| **6 — Compliance complete** | ⚠️ PARTIAL | GSTR1/3B/2B, TDS/TCS, profile ✅; **employer compliance (PT/LWF/PF/ESI), MSME monitor, compliance calendar — missing** |
| **6.5 — Ops & Reliability** | ⚠️ PARTIAL | D1 Time-Travel DR documented ✅; Sentry ❌; 70%-guardrail cron planned but not built; incident runbook partial (PLAYBOOK) |
| **7 — Marketing & Growth** | ✅ DONE (core) | Scoring (hot/warm/cold) + stale queue ✅, nurture + campaigns ✅, experiments ✅, Listmonk/Umami/Chatwoot/n8n wired as spine (mostly setup) |
| **7.5 / 7.6 — Automation & deliverability** | ❌ NO | Notification engine (channel abstraction), SMS (DLT), SPF/DKIM/DMARC + warm-up, bounce hygiene — none |

**Mojibake note:** the repaired files pass typecheck/tests; source-readable.

---

## The seven biggest un-built gaps

1. **Turnstile** — fake badge, `TURNSTILE_SECRET_KEY` dead. All public forms extend.
2. **Resume upload + real AI parsing** (`MANPOWER_AI=real` returns 501, public-safe form never uploads).
3. **Notification engine** — WhatsApp-only today (OpenWA/Meta); no email/SMS adapters, no transactional streams.
4. **Consent lifecycle** — withdrawal, re-consent cron, evidence export (DPDP).
5. **Employer compliance** — GST done but PT/LWF/PF/ESI tables/routes missing.
6. **Team Hub** — real-time chat/files/calls (DO + WebSocket).
7. **Data import** + custom-RBAC enforcement (permission tables exist but middleware still role-code based) + partner portal Phase-5 admin + Kanban advanced (swimlanes/CFD/Monte Carlo).

## What's genuinely done (verified in routes/schema/tests/frontend)

- Hono + D1 + Drizzle; **47 tables** (§11 parity 100%)
- Better Auth (email+password+TOTP+OTP); RBAC 5 roles + division scoping + owner ceiling + audit (immutable-ish, hashed evidence)
- Agreements/consents/payments/umrah/attestation/transit/manpower/tasks/nurture/campaigns/experiments/incentives/compliance — all routed + unit-tested (135 tests passing)
- Public site: GSAP + ScrollTrigger + 5 live D1-backed artifacts (Eligibility, Visa status, Departure, Attestation chain, Job ticker), partner KYC with masked PAN
- Hygiene: `secureHeaders()`, structured errors, no stack leaks, no mojibake in source; CI (typecheck → test)

## Recommendation

Plan is **~70–75% implemented by §20 phases** — the remaining gaps are almost all "fully-written-but-not-built" follow-on phases (2.5, 5.5, 6.5, 7.5/7.6, 1.2) plus two true defects (Turnstile fake, resume/AI). Suggest: **next milestone = 7.6** (notifications/deliverability) + **consent withdrawal** + **Turnstile**: each is small, high-leverage and closes the biggest legal/pipeline risks. Full doc: this file, `agents/AGENTS.md` maintained.

---
*To close each gap: 1) write failing test, 2) implement route/UI, 3) `pnpm test` + typecheck + commit per ACE*.