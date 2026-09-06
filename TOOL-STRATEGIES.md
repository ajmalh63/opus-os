# OpusOS — Open-Source Stack: Full-Potential Strategy Playbook

**Version 1.0 · 2026-08-09 · Owner: Opus Overseas Engineering**
**Scope:** All self-hosted open-source apps on the VPC (OpenWA, Chatwoot, ERPNext, Listmonk,
Umami, Uptime Kuma, n8n, Twenty) + Oracle VPC orchestration — maximize value **as an integrated
system**, not as nine isolated tools.
**Method:** Desk research (2026 vendor docs, best-practice guides) + elite skills mined from the
local skill repository.
**Rule:** Every strategy respects the OpusOS invariants (AGENTS.md): paise-int money, 10 ms CPU,
DPDP consent-gating, audit trail, one-way ERP sync, owner ceiling.

---

## 1. Executive Summary

All nine tools are installed; **five are only half-configured** (OpenWA session/webhook, Chatwoot
webhook, Cal.diy wizard, Listmonk/Umami/n8n/Uptime Kuma wizards, ERP tax template). The largest
unlocked value is **not** in any single app — it is in the **glue layer**:

1. **n8n as the integration spine** — webhook bridges, digests, retries, alerts, bulk-send
   orchestration that keeps OS workers under the 10 ms CPU budget.
2. **Unified capture engine** (OpenWA templates + Chatwoot routing + OS tasks) with a
   consent-first nurture sequence (WhatsApp via OpenWA, email via Listmonk) feeding the OS
   experiment table.
3. **ERPNext as the finance source of truth** — GST 2.0 e-invoice (IRN), 2B reconciliation,
   TDS/TCS: replaces manual returns; then push monthly digests into WhatsApp/email.
4. **Umami as the decision layer** — funnel + events + revenue fields over the OS funnels,
   no consent banner needed, fed into n8n digests.
5. **Uptime Kuma as the canary** — push monitors for every scheduled job (backups, D1 export,
   sync retries) + Telegram alerts → n8n auto-remediation for the VPC stack.

**Realistic sequencing** (6 waves, ~4–6 weeks of effort) is in §8. Wave 0 removes the current
production blockers (single-day work).

---

## 2. Research Findings — Tool by Tool (2026)

### 2.1 OpenWA (WhatsApp gateway — the ban-risk reality check)

**What the product actually offers (2026):**
- Multi-session, bulk, labels, message templates with `{{name}}` placeholders, message tester,
  reactions, edits, read receipts, groups API, audit logs, per-session webhooks with
  HMAC + **pre-dispatch filters** + retry queue, Swagger, typed SDK `@rmyndharis/openwa`.
- Official plugins: `auto-reply`, `webhook-relay`, `broadcast`, `chat-logger` on a sandboxed
  integration fabric; Chatwoot + n8n community integrations.

**The hard truth (from official docs & industry reports):**
- OpenWA is *unofficial* — it talks to WhatsApp through `whatsapp-web.js` (headless Chromium,
  ~300–500 MB RAM/session, **lower ban risk**) or `baileys` (WebSocket direct, ~30–80 MB,
  **higher ban risk**).
- **Never connect your primary business number.** Use a dedicated number you can afford to lose.
- **Bulk messaging is the top ban trigger.** Official safe-sending guidance: only contact people
  who have opted in and saved the number; random human-like delays (5–15 s), personalized
  payloads per recipient, seed engagement (real humans chatting a little on the account),
  warm-up ramps (start ~50/day, double weekly).
- WhatsApp *does* track fraud; indefinite cold bounces/bulk = permanent suspension.

**Strategy implications for OpusOS (see §5):**
- Treat OpenWA as the **opt-in, follow-up engine** (already consented leads: WhatsApp consent
  is a DPDP field in OS) — never as cold-blast tool.
- Use **session-per-division** so a ban on one number doesn't kill all channels.
- Keep Meta Cloud API (`WA_PROVIDER=meta`) as the production/regulated lane for broadcasts
  (templates + 24 h service window) once prod Cloudflare domain exists.

### 2.2 Chatwoot (live-chat + shared inbox)

**Rows you can pull 2026:**
- **Automation Rules** (Event → Conditions → Actions): assign to agent/team, add label, send
  webhook, send attachment, message, snooze, resolve, cancel.
- **Macros** (one-click saved quick flows), **Canned responses**, **Campaigns** (one-time
  batches, plus wildcard URL campaigns; button on resolved CSAT via WhatsApp templates).
- **Assignment policies:** round-robin on new conversations, agent capacity policies per
  inbox, business hours + after-hours auto-responder.
- **SLA policies + under SLA Buyers**, CSAT with **your own approved WhatsApp template**,
  audit logs, contact identity validation & custom attributes, segments/filter folders,
  command bar, keyboard shortcuts, webhooks per inbox.
- **Captain** (Chatwoot's AI assistant): FAQ/docs-based team copilot, memories, self-hosted
  install — potential first AI surface that stays on-prem.
- Framework facts: CE role model is agent/administrator only (no custom roles; Enterprise has
  them); check #14095 for responder reassign restrictions in CE — they assign to anyone
  (mitigation: teach ownership policy, or use filters + CSAT audit, or n8n rule bridging).

**Strategy implications (§5):** build division-based Teams + inbox rules to auto-route,
label by division/stage, keep CSAT collection on WhatsApp templates on resolve, everything
webhooks to OS `conversations` so the single inbox (OS/Inbox) stays canonical.

---

## 3. Skill Repository — Tool Mapping (elite skills to use)

| Tool | Skills to invoke (source: ~/.agents/skills) | What the skill contributes |
|---|---|---|
| OpenWA / WhatsApp | `whatsapp-cloud-api` (HMAC, templates, webhooks; Node/Python boilerplates), `whatsapp-automation` (button, broadcast patterns), `telegram-bot-builder` (admin alert channel cross-ref) | Safe-send templates, HMAC contract, 24 h-window rules, broadcast hygiene: pipes |
| Chatwoot | `customer-support` (omnichannel CS ops), `churn-prevention` (recovery flows), `copywriting`/`copy-editing` (canned tone) | Routing/SLA playbooks + reply-latency metrics, win-back scripts via inbox |
| ERPNext | `billing-automation` (AP workflow & metrics), `tax` (India GST/TDS patterns — verify scenario), `finance` (asset normalization inflection), `analytics-tracking` (KPIs to report) | Invoice lifecycle, close cadence, month-end runbook skeleton |
| Listmonk | `email-systems` (SPF/DKIM/DMARC, transactional vs marketing, bounces, double opt-in, preview text, hourly queues), `email-sequence` (sequence smoke tests), `cold-email` (Reply-to hygiene) | The email deliverability bible — apply wholesale |
| n8n | `n8n-workflow-patterns` (5 core patterns), `n8n-node-configuration`, `n8n-mcp-tools-expert`, `n8n-expression-syntax`, `n8n-code-*` (JS/Python), `workflow-automation` | Architect every workflow: Trigger → Validate → Transform → Deliver → Error Handler |
| Umami | `analytics-tracking` (measurement-readiness index: event model, funnels, attribution), `analytics-product` (funne/segments/revenue), `alex/data-analyst` style reporting; `growth-engine` (experiments wiring to marketing ideas) | Event taxonomy, funnel design, KPI deck per decision |
| Uptime Kuma | `observability-monitoring-monitor-setup`, `prometheus-configuration`, `grafana-dashboards` (pair with /metrics, +Alertmanager/Grafana), `incident-responder` (rollback priorities) | Type "probes + push-cron" playbook, alerting quality |
| Twenty CRM | `crm-alternatives-review` (CRM selection attention, `product-inventor`/`product-manager` for fit decision), `revops` (lead handoffs) | Decision: keep as optional shelf, avoid dual-CRM drift |
| Oracle VPC / ops | `bash-linux` + `windows-shell-reliability` (scripts), `deployment-procedures`, `12-factor` infra | Runbook hygiene for docker services on <internal-ip> |

Every tool workflow must be reviewed with the OS invariants in mind: **n8n = glue, not the
system of truth**; OS D1 remains canonical; **money math never in n8n** (only carry paise,
no floats).

---

## 4. Scenario Brainstorming (what the stack should COVER)

Ranked by business impact (Owner + Manager), scenario namespace:

1. **Lead → first human contact (15-min SLA)** — currently the biggest leak point.
2. **Long-cycle nurture (21-day)** — WhatsApp + email multi-touch read of program-specific
   outreach, consent-gated, experimentable.
3. **Client-happy-path dashboards** — Umami funnel (home→division→leadform), Event = lead,
   experiment acceleration; Uptime on ERP/WhatsApp so agent QoS synchronized.
4. **GST/TDS month-end close** — ERPNext (GSTR1/3B/2B matching, TDS/TCS, e-invoice) with
   monthly push-digest to WhatsApp/email.
5. **Seasonal surges** — Admissions (Study Abroad Jan–Aug) and Umrah (Ramadan) — surge
   routing in Chatwoot, capacity policies, automation rules, priority queue labels.
6. **Finance parity** — payments money track: OS paise ↔ ERPNext ledger (Sales Invoice + GST),
   sync-log failures alerted (Uptime Kuma push cron + n8n).
7. **Team ops & audit** — inbox QA (CSAT, SLA reasons, labels) in Chatwoot reports; OS audit
   trail export monthly; n8n reconciliations (conversations↔clients 360).
8. **Backup/DR automation** — Kuma push monitors heartbeat each nightly task (D1 export,
   ERP db backup, etc.), n8n retries + Telegram alert if any silent fail.
9. **Genuine AI assistant** — n8n AI agent workflow (LangChain), fed from OS endpoints
   (eligible/unmatched shortlists, sights) — suggested-only by invariant.
10. **Marketing experiments** — OS A/B harness wired to Umami funnel events and ListMonk
   senders (variant B), winners auto-promoted.

(Below — each scenario becomes a runnable playbook in §6.)

---

## 5. Per-Tool Strategy Playbooks (maximum value)

### 5.1 OpenWA — WhatsApp capture + nurture lane
- **Setup:** dedicated number per division (multi-session) — never the owner's personal line; session per division (`main` = umbrella, later `studyabroad`, `visa`, `umrah`, `attestation`, `manpower`).
- **Safe-sending protocol (anti-ban):** only consented contacts; `{{name}}`-personalized templates; random 5–15 s delays between sends; warm-up ramp; seed manual chats; daily cap guard (log + pause via n8n).
- **Webhooks:** register `message.received` (HMAC secret) → OS `/api/webhooks/wa` (already built); use pre-dispatch filters to drop noise (group spam, media-only).
- **Bulk:** use for **nurture stage broadcasts** (consented list) not cold blasts; wrap in n8n queue with pace + retry; log each send (message id) for audit.
- **Plugins:** `broadcast` (campaign), `auto-reply` (off-hours acknowledgment), `webhook-relay`, `chat-logger` — enable and monitor in dashboard.
- **Observability:** Uptime Kuma HTTP monitor on `:2785/api/health`; session QR/status events to n8n alert.

### 5.2 Chatwoot — omnichannel shared inbox
- **Routing:** create 5 Teams (one per division) + inbox-level automation rules: new conversation → assign team by keyword/phone-prefix/browser-language; add labels `division-*`, `stage-*`, `priority-*`.
- **SLA:** per-inbox SLA policies (15 min first response, 4 h resolution); SLA Reports weekly; agent capacity policies to avoid overload during surges.
- **CSAT:** enable CSAT; when WhatsApp templates approved, use WhatsApp CSAT template on resolve (auto, once per conversation).
- **Canned/macros:** document-request, payment-reminder, appointment-follow-up macros; macros save keystrokes and standardize tone.
- **After-hours:** business-hours + auto-responder rule ("we're away; here's our booking link") to protect SLA stats.
- **Webhook:** register OS webhook in Inbox Settings → conversations stay canonical in OS D1 (already done server-side, needs the one UI click).
- **Captain AI (self-hosted):** train on FAQ docs → staff-side assistant for quick answers; helps scale without adding agents (CE ok).
- **Reports:** weekly agent/team/label/conversation reports → owner digest via n8n (see 5.6).

### 5.3 ERPNext — finance source of truth + GST 2.0
- **Unblock:** create `CGST@9+SGST@9` Sales Taxes and Charges Template + set company default → OS invoice sync passes validation (P3 closed).
- **GST 2.0 readiness (2026):** India Compliance app — 30-day IRN rule, mandatory MFA, Ship-To GSTIN mandate (Aug 2026) — set up e-invoice + e-way bill for B2B; GSTR-1/3B become review-and-submit from booked transactions.
- **AP/AR discipline:** 3-way matching (PO→GRN→Bill), auto-create bills, vendor master cleanup, approval workflows on Purchase Invoices, MSME 43B(h) 45/15-day clock from `purchase_invoices.paid_at` (OS already stores it).
- **Automation:** scheduled jobs (Scheduler) for auto-close invoices, email alerts (payment due/overdue, TDS pending), report auto-emails (aging, GSTR) — e.g. "Outstanding > 30 days" to owner on the 1st.
- **Reporting:** formula-driven financial statements (v16) — P&L, cash flow forecast; share dashboards to management.
- **OS ↔ ERP discipline:** one-way only; sync-log monitoring; retry `/api/erpnext/sync/pending`; never dual-write.

### 5.4 Listmonk — email marketing + transactional
- **Foundation:** SPF + DKIM + DMARC for the sending domain; warm-up ramp; separate transactional vs marketing (different lists/templates/headers); List-Unsubscribe + one-click; plain-text alternates; preview text.
- **Lists/segments:** double opt-in lists per division + "all consented"; SQL segmentation on attributes (division, city, leadSource, engagement stage); subscriber attributes synced from OS (D1 → API).
- **Campaigns:** scheduled + A/B; **21-day nurture series** (value → case_study → offer → final) driven by OS `nurture_touches` (status due/sent); track clicks/opens per touch.
- **Transactional API:** `/api/tx` for receipts, OTPs, agreement links (template with `{{ .Tx.Data.* }}`) — replaces ad-hoc emailing; attachments supported.
- **Bounce hygiene:** consume `/webhooks/bounce` → hard-bounce suppression, 3× soft → remove; bounce < 2% target; complaints → unsubscribe instantly (DPDP/CAN-SPAM).
- **Templates:** brand-consistent HTML in repo (or Listmonk template editor) with `{{ template "content" . }}`; version/A-B.

### 5.5 Umami — privacy-first analytics
- **Install:** one script tag on public pages (PublicHome, PublicService, LeadForm, Portal, Partner) — cookieless, GDPR/DPDP-friendly, no consent banner needed.
- **Events taxonomy (feed experiments + funnel):** `lead_form_submit`, `booking_cta_click`, `chat_open`, `eligibility_check`, `jobs_click`, `umrah_departure_view`, `download_sop_guide`.
- **Funnels:** Home → division page → lead form; Eligibility → lead; Job → contact. Attribute by UTM (auto-captured) and referrer.
- **Reports:** weekly traffic + conversion digest to owner (n8n → email/WhatsApp); compare UTM channels monthly.
- **Revenue tracking:** (later) map leads → payment amount via OS API join in n8n — gives per-channel ROI.
- **Dashboards:** shared read-only dashboards per division manager; data stays on VPS.

### 5.6 n8n — the glue spine
- **Library patterns (from n8n-workflow-patterns):** Webhook Processing, HTTP API Integration, Database Ops, AI Agent, Scheduled Tasks — each with Error Handler.
- **Error handling standard:** every workflow ends with Error Trigger → notify (Telegram) + retry on failure; `Stop And Error` for business-rule violations; keep executions + pruning.
- **Priority workflows (Wave 2):**
  1. `lead-followup`: OS lead webhook → if no reply in 15 min → WhatsApp nudge (OpenWA) → log in `audit_log`.
  2. `nurture-due`: poll `/api/marketing/nurture/due` every 30 min → send via OpenWA/Listmonk → POST `/api/marketing/nurture/:id/send`.
  3. `monthly-close`: GSTR pending + TDS + 2B reconcile report → WhatsApp/email to owner.
  4. `kuma-alerts` bridge: Kuma webhook → enrichment → Telegram channel + incident log.
  5. `erp-sync-health`: daily check `/api/erpnext/sync-log` failed rows → retry + alert.
- **Queue mode:** enable later if load requires (Redis + Postgres execution data; lock encryption key); start single-instance.
- **Metrics:** `N8N_METRICS=true` → `/metrics` → Grafana/Prometheus on VPC.

### 5.7 Uptime Kuma — monitoring canary
- **Monitors:** HTTP on every VPC app (OpenWA :2785, Chatwoot :3200, Cal :3000, ERPNext :8080, Listmonk :9009, Umami :3002, n8n :5678, Twenty :3001) + `/api/infrastructure/health`; TCP on DBs (loopback); SSL expiry; keyword check (e.g. "status":"healthy").
- **Push monitors:** heartbeat for every cron/backup (D1 export, ERP DB dump, nightly sync) — silent failure detection.
- **Notifications:** Telegram (critical) + email digest; per-monitor channel routing; maintenance windows (Friday patch nights); alert cooldowns (resend every 4 h).
- **Status page:** public page with uptime history for client-facing trust (when prod domain ready).
- **Pair with:** Prometheus scrape on `/metrics` endpoints + Grafana dashboards (VPC).

### 5.8 Twenty CRM — decision gate
- **Keep shelved for now.** OS has Client360/kanban/inbox which cover the current team's needs; dual-CRM introduces data drift. Revisit only if partner/client collaboration or deal-stage forecasting needs a separate sales view; AGPL + Postgres fits VPC.
- If kept: bridge via n8n webhooks (leads → Twenty contacts) — read-only mirror, never dual-write.

### 5.9 Cal.diy (only pending wizard click — included for completeness)
- Finish onboarding (one browser click); set `VITE_BOOKING_URL`; add booking webhook → OS task creation + WhatsApp confirmation (n8n).

---

## 6. Scenario Playbooks (business moments)

### 6.1 "Lead just came in" (15-min SLA)
1. OS `POST /api/public/leads` → client + consent + scoring + SLA task.
2. n8n webhook: pick division team; Chatwoot conversation created/labeled (if phone known).
3. OpenWA: personalized welcome/qualification template (consented) → reply captured → OS conversation.
4. If no reply 15 min → Chatwoot team alert (label `priority-1`), staff reply from Inbox.
5. Umami event `lead_form_submit` logged; experiment variant tracked.

### 6.2 Admissions surge (Jan–Aug)
- Chatwoot: division team + capacity policy + SLA per inbox; labels per program; after-hours auto-responder.
- ERPNext: package-based milestone invoices; e-invoice for B2B (agents); payment reminders automated.
- Listmonk: program-specific nurture; Umami funnel per program; n8n weekly pipeline digest.

### 6.3 Umrah season (Ramadan)
- Umrah departures + seat holds in OS; WhatsApp availability broadcast (consented) with template; Cal booking links.
- ERP: package invoices with GST (interstate IGST logic); TCS 206C(1H) recording for overseas packages (OS `tcs_records`).
- Uptime Kuma: surge-time monitors tightened (30 s intervals); n8n alert on any outage.

### 6.4 Month-end finance close (GST/TDS)
- ERPNext GSTR-1/3B + 2B reconciliation from booked transactions; TDS (new IT codes) + TCS statements; e-invoice for B2B.
- n8n: pull pending sync failures → retry → WhatsApp/email report to owner; OS audit export (CSV) archived to R2.

### 6.5 DR / silent-failure night
- Uptime Kuma push monitors verify backups each night; failure → Telegram + n8n retry/report.
- D1 export → R2; ERPNext DB dump → volume; documented restore in PLAYBOOK.md §14.

---

## 7. KPIs to track after each wave

| Metric | Source |
|---|---|
| Lead→first-reply time (min) | Chatwoot SLA + OS tasks |
| Nurture open/click/conversion | Listmonk campaign stats |
| WhatsApp reply rate / delivery | OpenWA logs + OS conversations |
| Funnel conversion per division | Umami funnels |
| GST filing accuracy / e-invoice IRN rate | ERPNext |
| Uptime 30-day % / alert count | Uptime Kuma |
| Workflow success rate / errors | n8n Insights |
| CSAT score | Chatwoot reports |

---

## 8. Implementation Waves (what to apply, in what order)

> Gates: each wave is independently testable, rollback-safe, respects AGENTS.md invariants.

**Wave 0 — Unblock (1 day)** ✅ **EXECUTED 2026-08-09**
- ✅ **ERPNext tax template — RESOLVED:** created `CGST@9 + SGST@9 - OO` template +
  `CGST/SGST/IGST Output - OO - OO` accounts + Company default; verified via admin session
  (`ACC-SINV-2026-00001`, HTTP 200). `ops@` API user lacks template perms → admin-only.
- ✅ **OS code:** `buildInvoicePayload` now emits GST `taxes[]` (CGST+SGST 9/9, IGST 18, or
  componentized paise); 3 new tests, suite total 125 green.
- ⏳ **Chatwoot webhook:** API `POST /webhooks` → 404 on this build; needs **one UI click**
  (Inbox Settings → Webhooks → `http://100.69.139.47:8787/api/webhooks/chatwoot`).
- ⏳ **Cal.diy:** booking slug 404 until SSG wizard clicked in-browser; afterwards set
  `VITE_BOOKING_URL=http://127.0.0.1:3000/opus-owner/consultation` (verify `/book/…`).
- 🚫 **OpenWA pairing deferred** (no dedicated number; owner confirmed skip — production
  falls back to Meta Cloud API lane when domain is live).

**Wave 1 — Observability + email foundation (3–5 days)** 🚧 2026-08-10: code 100% (umami 8/8 events, Kuma import JSON, heartbeat cron, Telegram channel) — user clicks/DNS pending
- [ ] Uptime Kuma: import `WAVE1-HANDOFF-KIT.md` §2 monitor JSON + Telegram bot alerts (bot token/chats pending) + `wrangler secret put KUMA_PUSH_URL` (push monitor ready in JSON; Worker cron pings it i6h — test `wave1_heartbeat`).
- [ ] Listmonk: admin wizard, SPF/DKIM/DMARC, warm-up plan, double opt-in lists, first transactional template (wizard + DNS pending; full steps in kit §3–4).
- [ ] Umami: website id → `apps/app/.env VITE_UMAMI_BASE_URL` + `VITE_UMAMI_WEBSITE_ID` (script + events already in code; nothing to build).

**Wave 2 — Glue + automation (1 week)** 🚧 2026-08-09: OS automation lane shipped; n8n import pending
- ✅ **OS automation lane** (`/api/automation`, service-token, fail-closed): health,
  nurture/due, nurture/:id/send, erp/sync-log, erp/sync/pending. 7 new tests — suite **132 green**.
- ✅ **n8n spine JSONs** in `automation/n8n/` (lead-followup, nurture-due, erp-sync-health,
  monthly-close, kuma-alerts) — import after n8n `/setup` wizard + creds.
- ⏳ WhatsApp first-contact pilot (10 consented leads) — **blocked: no dedicated number**.
- ⏳ Umami funnels + first manager dashboards — waits on Wave 1 Umami setup.

**Wave 3 — Scale (2 weeks)** 🚧 2026-08-10: email lane + hygiene shipped in code; Listmonk UI/DNS still pending (PENDING-CONFIGS A4–A7)
- ✅ Email nurture lane: `nurture/:id/send` dispatches email touches via Listmonk `/api/tx` (personalized, consent `marketing-campaigns` re-check, suppression at send) — 4 tests.
- ✅ Bounce hygiene: `/api/webhooks/listmonk` consumer + `listmonk_suppressions` (hard/3× soft/unsub/complaint; DPDP) — nurture `due` excludes suppressed — 7 tests.
- ✅ Intent engine: `lib/intent.ts` (declared → context inference → NO blind guesses) — clients carry intent (migration 0028); planner skips unknown-intent leads — 10 tests.
- ✅ Journey editor (Zoho MA-mapped, see `CAMPAIGN-STRATEGY.md`): full CRUD incl. `PATCH` (meta/eligibility/touch replace) + channel-per-node (migration 0029) + intent override route/UI — 4 tests.
- ⏳ Listmonk campaigns/A-B (UI) · ⏳ e-invoice IRN/e-way bill (ERP app) · ⏳ Chatwoot CSAT/capacity (UI).

**Wave 4 — Growth & decision support (ongoing)** 🚧 2026-08-10: digest lane shipped
- ✅ `/api/automation/digest/weekly` (7 KPIs, ⚠️ exceptions) + `06-owner-weekly-digest.json` n8n artifact (Mon 09:00 → Telegram) — 3 tests.
- ✅ **Staff Performance module** (balanced scorecard — output × on-time quality × workload): `/api/performance` (BAN headlines, per-staff roster, 7/30/90d throughput, median cycle, SLA %, workload, approval queue) + PerformanceTab — 4 tests.
- ✅ **Task Boards — Kanban SYSTEM** (2026-08-11, gold-standard six practices):
  WIP caps **enforced server-side** (409 + UI drop-block; expedite bypasses per
  class-of-service), Expedite lane (limit 1), blocked flags + strip, TRUE cycle
  time (`in_progress_at`), policies (DoD) in `board_prefs`, flow strip
  (throughput/cycle p50/p85/WIP/blocked), aging, My-tasks, staff picker; flow
  metrics flow into performance + weekly digest (cycle p85, blocked count).
  Migration **0030** at deploy — 6 board-system tests.
- ⏳ Experiments↔Umami funnels (needs A3 site) · ⏳ Meta Cloud API lane (prod domain).

**Wave 5 — Hardening & autonomy** 🚧 2026-08-10: scripts shipped; testing = VPS cron + restore drill
- ✅ `ops/backup-d1.sh` (wrangler d1 export → gzip → R2 → Kuma push; retention 7) · `ops/erp-db-dump.sh` (VPS mysqldump, same contract) · `ops/restore-d1.sh` (official `wrangler d1 execute --file` restore + verify + heartbeat).
- ⏳ Restore drill end-to-end · n8n secret hygiene · Twenty decision gate.

---

## 9. Decisions Needed From You

> **2026-08-09 resolution:** (1) OpenWA → deferred (no number) · (2) Wave 0 → executed
> (details §8) · (3) n8n → all 5 priority workflows approved for Wave 2 · (5) alerts → Telegram
> bot approved.

1. ~~OpenWA number~~ — deferred until a dedicated number exists.
2. **Wave 1 kickoff:** proceed next with Uptime Kuma + Telegram bot + Listmonk + Umami wiring (needs VPS access + your wizards clicks)?
3. **n8n spine (Wave 2):** approved — planned: lead-followup, nurture-due, monthly-close, kuma-alerts, erp-sync-health. Any additions?
4. **Listmonk domain/DNS:** which sending domain + are you ready to add SPF/DKIM/DMARC records?
6. **Umami revenue join:** allow n8n to read OS API (leads→payments) for per-channel ROI? (No writes.)
7. **Twenty:** keep shelved (recommended) / bridge read-only / decommission to free memory?
8. **ERP admin password rotation:** rotate `Administrator`/`admin` before Cloudflare phase (high).

---

## 10. References

- OpenWA: open-wa.org · docs.open-wa.org (webhooks, plugins, ban-risk guidance) · GitHub rmyndharis/OpenWA
- Chatwoot: chatwoot.com/hc/user-guide (automation, CSAT, SLA, Captain) · GitHub issues #14095
- ERPNext: frappe.io/erpnext (v16) · mith.tech GST e-invoicing 2026 guide · india-compliance app (Resilient Tech)
- Listmonk: listmonk.app/docs (API, transactional, config, bounce) · listmonk PyPI client
- Umami: umami.is (funnels, events, UTM, revenue) · docs
- n8n: blog.n8n.io (15 practices for AI agents; queue mode) · docs (Error Trigger, metrics, audit) · hatchworks/ones 2026 checklists
- Uptime Kuma: louislam/uptime-kuma wiki (Prometheus, push, status pages) · ossalt 2026 guide
- Twenty: docs.twenty.com (workflows, API) · Dench review 2026
- Local skills: ~/.agents/skills (email-systems, n8n-workflow-patterns, analytics-tracking, referral-program, whatsapp-cloud-api, growth-engine, churn-prevention)