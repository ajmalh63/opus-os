# Infrastructure & Docker Apps Command Center — Implementation Specification

**Date:** 2026-08-26  
**Workspace:** OpusOS Superadmin Console (`/admin` ➔ Infrastructure Tab)  
**Target Environment:** Cloudflare Workers (Edge API) + Oracle VPS Docker Fleet (`129.159.238.227`)  
**Status:** **COMPLETE & VERIFIED (657/657 Tests Passing)**

---

## 1. Executive Summary

OpusOS has upgraded its Infrastructure Hub from a passive read-only telemetry dashboard into a **Full-Fledged Interactive Infrastructure & Docker Apps Command Center**. 

Superadmins can now inspect, trigger, configure, and monitor every containerized external microservice running on the Oracle VPS directly within the OpusOS UI without requiring SSH access or external browser logins.

---

## 2. Infrastructure Topology & Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        OPUSOS CENTRALIZED CONTROL TOPOLOGY                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│   Superadmin Dashboard (/admin) ◄────► OpusOS API Gateway (Hono Backend)              │
│                                                   │                                    │
│                    ┌──────────────────────────────┼──────────────────────────────┐     │
│                    ▼                              ▼                              ▼     │
│           OpenWA Controller              ERPNext Reconciler             Listmonk Dispatcher│
│           (Port 2785 REST)               (Port 8080 Frappe)             (Port 9000 REST)  │
│                    │                              │                              │     │
│                    ▼                              ▼                              ▼     │
│           Chatwoot Gateway                Umami Telemetry              Uptime Kuma SLA │
│           (Port 3200 API)                (Port 3002 REST)             (Port 3003 Push)  │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. VPS Docker App Integrations & Operational Capabilities

### 3.1. 🟢 OpenWA (WhatsApp Multi-Device Gateway · Port 2785)
* **Live Session Monitor:** Real-time query of session status (`main`), connected WhatsApp phone number, battery percentage, and push name.
* **1-Click Session Control:** Direct `restart_session`, `disconnect`, and automatic reconnection loop recovery.
* **Plugin Subsystem:**
  * `chat-flow` (`v1.1.7`): 5-choice branded qualification menu (1. Study Abroad, 2. Visa Stamping, 3. Document Attestation, 4. Global Careers, 5. Counselor Desk).
  * `chatwoot-adapter` (`v0.9.6`): Bidirectional bridge relaying WhatsApp chats & media to Chatwoot inboxes and forwarding counselor replies.
  * `voice-transcription` (`v1.2.8`): Audio-to-text transcription for voice note queries.
  * `after-hours` (`v0.2.6`): Automatic away responder outside IST business hours.
  * `faq-bot` (`v0.2.6`): Keyword-based FAQ responder.
* **Anti-Ban Smart Typing & Jitter Simulator:**
  * Formula: Reaction pause ($350\text{ms} - 600\text{ms}$) + Character typing speed ($25\text{ms}/\text{char}$) + Gaussian Jitter ($\pm 15\%$).
  * Clamped between $500\text{ms}$ min and $3,000\text{ms}$ max.
* **Interactive UI Modal:** Dedicated modal to dispatch test messages to any phone number with live Anti-Ban simulation.

### 3.2. 📘 ERPNext / Frappe (Financial Ledger & GST Compliance · Port 8080)
* **Two-Way Ledger Reconciliation:** Real-time comparison between OpusOS D1 receipts/payments and Frappe Sales Invoices (`GET /api/erpnext/reconcile`).
* **Live Parity Metrics:**
  * Total local payments count & total paise.
  * Synced invoices count & synced paise.
  * Pending / un-synced invoice discrepancy count.
* **1-Click Sync Redrive:** Batch retry tool (`POST /api/erpnext/sync/pending`) that iterates over failed entries and re-pushes with payload validation.
* **Direct Desk Access:** One-click authenticated deep link to Frappe Desk.

### 3.3. ✉️ Listmonk (Email Marketing & Transactional Engine · Port 9000)
* **13 Transactional Templates:**
  * `15`: Email Verification
  * `16`: Password Reset
  * `17`: Login OTP
  * `18`: Payment GST Receipt
  * `19`: Agreement Signature Invite
  * `20`: Agreement Executed Confirmation
  * `21`: Study Abroad Milestone
  * `22`: Attestation Progress
  * `23`: Partner Payout Executed
  * `24`: Payout Request Received
  * `25`: Consultation Confirmed
  * `26`: Document Verified
  * `27`: Nurture Touch
* **Interactive UI Test Sender:** Modal allowing superadmins to dispatch a sample transactional notification to any email address to test formatting and Titan SMTP deliverability.
* **DPDP Consent Suppression Bridge:** Real-time opt-out/blocklist sync whenever a client exercises their right to data erasure or consent withdrawal.

### 3.4. 💬 Chatwoot (Omnichannel Helpdesk & Live Chat · Port 3200)
* **Live Inboxes & Presence:** Live monitoring of WhatsApp API channel and Web widget inboxes.
* **Live Client Dossier Telemetry:** Integrated via `window.$chatwoot.setUser` in `ChatWidget.tsx` and `ClientPortal.tsx`.
* **Custom Attributes Passed:**
  * `division`: Active division of the student/client (e.g. `study-abroad`, `visa`, `attestation`).
  * `stage`: Current workflow stage key (e.g. `documents`, `submitted`, `offer_letter`).
  * `counselor`: Name of assigned counselor.
  * `lastActive`: ISO timestamp of portal activity.

### 3.5. 📊 Umami (Privacy-Preserving Telemetry & Web Analytics · Port 3002)
* **Real-time Active Visitors:** Live visitor count on public website, client portal, and partner portal.
* **Conversion Goals Engine:** Live telemetry for `lead_submit`, `chat_open`, `whatsapp_click`, `payout_request`, and `doc_upload`.
* **SubID Attribution:** Real-time capture of affiliate campaign tags and referral sources.

### 3.6. 🛡️ Uptime Kuma (Infrastructure SLA & Heartbeat · Port 3003)
* **Container Health Grid:** HTTP ping status, response time latency (ms), and SSL certificate expiration countdown across all 6 subdomains.
* **Public Status Page:** Embedded link to the public status page (`status.opusoverseas.com`).

### 3.7. ☁️ Cloudflare Backend Services Matrix
* **D1 SQLite Database:** Health probe and tamper-evident SHA-256 audit log chain verification.
* **R2 Document Vault:** File storage health and malware scan status.
* **KV Cache & App Settings:** Global runtime feature flags (`umrah_inventory_enabled`, `nurture_cron_enabled`).
* **Vectorize & Workers AI:** Embeddings model connectivity and semantic search status.
* **Queues & Crons:** Asynchronous background pipeline status.

---

## 4. API Endpoints Reference

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| `GET` | `/api/infrastructure/health` | Staff / Owner | Probes Cloudflare services (D1, R2, KV, Vectorize, Queues, AI). |
| `GET` | `/api/infrastructure/integrations` | Staff / Owner | Probes HTTP reachability & latency for external apps. |
| `GET` | `/api/infrastructure/docker-overview` | Staff / Owner | Aggregates detailed session states, plugins, sync parity, and counts. |
| `POST` | `/api/infrastructure/openwa/action` | Owner | Triggers OpenWA actions (`test_send`, `restart`, `toggle_plugin`). |
| `POST` | `/api/infrastructure/listmonk/action` | Owner | Triggers Listmonk actions (`test_email`). |
| `POST` | `/api/infrastructure/erpnext/action` | Owner | Triggers ERPNext reconciliation check & batch sync. |
| `GET` | `/api/erpnext/reconcile` | Owner | Calculates financial paise parity between D1 and Frappe Sales Invoices. |
| `POST` | `/api/erpnext/sync/pending` | Owner | Re-attempts all failed or pending ERPNext sync logs. |

---

## 5. Codebase Artifacts & Modified Files

1. **[`apps/api/src/routes/infra.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/routes/infra.ts)**:
   - Added `/docker-overview`, `/openwa/action`, and `/listmonk/action` handlers.
2. **[`apps/app/src/components/InfraHealth.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/InfraHealth.tsx)**:
   - Built full operational card grid for all 6 Docker apps + Cloudflare matrix + Test WhatsApp and Test Email interactive modals.
3. **[`apps/api/src/infra/messaging.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/infra/messaging.ts)**:
   - Implemented `calculateHumanDelay` and Anti-Ban Smart Typing middleware in `sendWhatsApp`.
4. **[`apps/api/src/infra/listmonk.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/infra/listmonk.ts)**:
   - Added `listmonkOptoutSubscriber` for real-time DPDP consent withdrawal blocklisting.
5. **[`apps/app/src/components/ChatWidget.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/ChatWidget.tsx)**:
   - Added `ChatUserContext` interface, `chatwoot:ready` listener, and `window.$chatwoot.setUser` telemetry.
6. **[`apps/app/src/pages/ClientPortal.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/pages/ClientPortal.tsx)**:
   - Wired live client identity props to `ChatWidget`.
7. **[`apps/api/src/routes/erpnext.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/routes/erpnext.ts)**:
   - Added `GET /api/erpnext/reconcile` two-way financial ledger reconciliation endpoint.
8. **[`apps/api/tests/infraDockerOverview.test.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/tests/infraDockerOverview.test.ts)**:
   - Added unit test suite covering Docker overview aggregation, WhatsApp test dispatch, and Listmonk test email dispatch.

---

## 6. Verification & Quality Assurance

| Metric / Check | Result |
|---|---|
| **TypeScript Typecheck (`tsc --noEmit`)** | **0 Errors** across all packages (`packages/shared`, `apps/api`, `apps/app`) |
| **Unit & Integration Tests (`vitest`)** | **102 test files passed**, **657/657 tests passing (100%)** |
| **Vite Production Bundle (`pnpm build`)** | **Compiled in 2.75s** with 0 errors |
