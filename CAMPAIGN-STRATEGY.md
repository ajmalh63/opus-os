# Campaign Strategy — Zoho-Mapped Journey Engine (Wave 4)

Status: **code complete (2026-08-10) · 254 tests green.** One-pager for how the
OS nurture engine maps to Zoho Marketing Automation 2.0's framework, what was
decided from the research, and what's opinionated here.

## 1. The Zoho framework, mapped 1:1

| Zoho MA 2.0 concept | OpusOS equivalent | Status |
|---|---|---|
| Journey (visual workflow) | `campaigns` + `campaign_touches` (day-offset nodes) | ✅ builder UI |
| Dynamic segment (audience rule) | `eligibilityJson` predicate on intake context — evaluated fresh at plan time | ✅ builder UI |
| Journey node (email/SMS/WhatsApp step) | `channel` per touch (`email` / `whatsapp`) | ✅ migration 0029 |
| Entry trigger (list membership/form/behavior) | lead intake (division + context) → `pickCampaign` at nurture-plan | ✅ |
| Lead score / qualification | `scoring_events` + SLQA task routing | ✅ (existing) |
| A/B testing (subject/content, winner rollout) | Listmonk/Zoho Campaigns-side campaign A/B (UI tier) — OS stores the hypothesis gates | ⏳ pending ESP tier |
| Handoff (MQL → SQL) | kanban stage moves trigger follow-up | ✅ (existing) |
| Reports (journey-level) | `/api/automation/digest/weekly` nurture funnel section | ✅ |

## 2. Decisions taken from the research (2026)

1. **Segments are dynamic, lists are static** (Zoho KB): eligibility predicates are
   re-evaluated per lead at planning time — never materialized lists. Already how
   `pickCampaign` works.
2. **Channel per node, consent per channel** (Zoho MA cross-channel + DPDP):
   email nodes need `marketing-campaigns`, WhatsApp nodes need `whatsapp-updates`;
   email is suppression-aware (hard/3×soft/unsub/complaint) — all enforced at due
   AND at send (double re-check).
3. **Never guess a division** (list-health gold standard): unknown intent ⇒ the
   journey is skipped with reason captured; the human correction loop is the
   Client360 "Primary interest" override (manager+).
4. **Journey identity is immutable** (key + division fixed at creation): planner
   targeting stays deterministic; content/eligibility/status are editable.
5. **A/B discipline (ab-test-setup skill):** one variable per test, primary metric
   frozen, MDE + sample size first, no peeking. OS stores hypotheses in the
   existing `experiments` surface; the actual variant sends live in Listmonk
   (A/B campaigns) once A4 is configured.

## 3. Intake → targeting pipeline (how a new lead is marketed to)

```
LEAD FORM (division + context fields)
   → clients.intent_divisions / primary_division  (declared interest)
   → engagement (division) + SLQA task
NURTURE PLAN (manager/automation trigger)
   → resolvePrimaryDivision: engagement → declared → context inference → SKIP (no guess)
   → pickCampaign: first ACTIVE journey for that division whose eligibility
     predicate passes against intakeContext → campaign touches (channel-aware)
   → touches staged with dueAt = plan + day*86400  (Zoho "wait" nodes)
SEND (n8n poller → /nurture/:id/send)
   → per-channel consent re-check + email suppression re-check → Listmonk /api/tx
   → marked sent; failure keeps touch scheduled (retry)
```

## 4. What was built this pass

- `lib/intent.ts` — declared → inference (strong/weak signals) → skip; tolerant
  row access; 9 unit tests + funnel skip test.
- Migration `0028` (client intent columns) + `0029` (touch channel).
- Journey editor UI (`CampaignsTab`): create + **edit** (meta/eligibility/nodes),
  channel picker with consent hints, dynamic-segment copy, status toggle, channel
  chips on the catalog.
- `PATCH /api/admin/campaigns/:key` (full journey update, atomic touch replacement)
  + emulator DELETE support.
- `PATCH /api/clients/:id/intent` (manager+) + Client360 primary-interest select.
- `nurture` planner respects touch channel.
- `ops/restore-d1.sh` — official restore path (`wrangler d1 execute --file`),
  post-restore table-count verification, Kuma heartbeat outcome.

## 6. TOOL-FIRST ADDENDUM (2026-08-11, approved direction)

**Decision:** the OS campaign module is now **informational**. Operations live in
best-of-breed tools — Listmonk (email), Mautic (journey engine, VPS docker),
Chatwoot (conversations), OpenWA (WhatsApp). The OS stays the BRAIN (intent,
dual-consent, suppression, scoring, ledger) and the FACE (unified dashboard).

- **Adapters shipped** (`apps/api/src/integrations/`): one contract
  (`ToolSnapshot`/`ToolFeedItem`), four tools — Listmonk (reference adapter:
  campaigns/subscribers/bounces + A-3 event log feed), Mautic (OAuth2
  client-credentials → campaigns/contacts/segments), Chatwoot, OpenWA.
- **Endpoints:** `GET /api/integrations/status` (per-tool state ok/unconfigured/error + metrics),
  `GET /api/integrations/live` (near-real-time unified feed) — manager+.
- **Dashboard:** CampaignsTab is read-only: tool status cards, live event feed,
  legacy OS-defined catalog. POST/PATCH admin-campaign endpoints removed.
- **Still OS-owned:** consent re-check at send, Listmonk bounce/unsub suppression,
  intent engine, digest, staff performance — unchanged.
- **Guard contract (next):** tool → OS "may I send to X?" verdict before delivery.

## 8. GUARD CONTRACT SHIPPED (2026-08-11) — the co-pilot pillar

`POST /api/automation/guard/check` — tools (n8n/Listmonk/Mautic workflows) ask
"may I send to X?" before delivering. Verdict pipeline (fail-closed, ordered):
1. contact validity (format allowlist) → block `invalid_contact`
2. identity: OS-known client (by clientId or contact match); unknown →
   informational `allow (no_os_profile)` — the OS only vetoes what it knows
3. suppression registry (hard/3×soft/unsub/complaint) → **block** both purposes
4. consent (marketing only): email→`marketing-campaigns`, whatsapp→
   `whatsapp-updates`; missing or withdrawn → **block** (privacy-as-default);
   transactional purpose bypasses consent by design
Response: `{ ok, verdict, reason, checks[] }`; every verdict audited with
**sanitized payloads** (no raw contact in the audit). 8 tests. Auth:
`X-Service-Token` lane (same token as the automation lane).

From here every tool send can be co-piloted by the OS without changing tools:
workflow = guard/check → allow ? send : log block.

## 7. CONTROL-PANEL PHASE 1 (2026-08-11) — shipped

**Module renamed → Marketing Automation** (slug `/workspaces/marketing`; legacy
`/workspaces/campaigns` alias). It is a **control panel**: operations in the
backend tools' VPC APIs, driven from the OS frontend.

- **Command envelope** (`POST /api/integrations/:tool/:resource/:action`):
  RBAC (manager+) → executor → audit → normalized result. 8 tests.
- **Listmonk ops live:** campaigns (list/create/status/test/delete), templates
  (list/delete), lists (create/delete), subscribers, bounces (read).
- **UI tabs:** Overview (live board) · Campaigns · Templates · Audiences ·
  Suppression (bounce evidence). Reads via paged passthrough.
- **Guard still OS-side:** consent + suppression registry keep vetoing sends;
  tool tokens live server-side only.
- **P2 next:** Mautic journeys (after creds) · **P3:** Chatwoot conversations ·
  **P4:** WhatsApp sends.