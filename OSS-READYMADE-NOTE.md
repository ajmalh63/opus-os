# Readymade Open-Source Options — OpusOS (Decision Note)

**Date:** 2026-08-09 · **Author:** Engineering (OpusOS workspace) · **Status:** Advisory — no action taken yet

This note summarizes what open-source software already covers the OpusOS problem space,
what a ready-made alternative would give us, and the honest trade-offs — so the decision
is recorded before more UI is invested.

---

## 1. What OpusOS needs (the real requirements)

- Front office: public site, lead intake, Client 360, Kanban, staff workspaces, WhatsApp
  commerce, bookings, payments (Razorpay), GST-aware money math (integer paise).
- Back office: Sales Invoices, GST/e-invoice, TDS/TCS — pushed one-way to ERPNext.
- Trust layer: DPDP consents (with notice-hash + IP), audit trail, per-role ceilings,
  rate-limited public endpoints, webhook HMACs.
- Automation: nurture/campaign engine (division + context targeting), WhatsApp dispatch
  lane, n8n spine, monitoring (Kuma), analytics (Umami).

## 2. Layer 1 — Full ready-made apps that already cover OpusOS domains

| OSS project | What it provides | Status in OpusOS | Notes |
|---|---|---|---|
| ERPNext (Frappe) | Full ERP: dashboard, role workspaces, GST/e-invoicing, HR, accounts | ✅ Integrated — books lane (`/api/erpnext`) | One-way sync already shipped; tax template resolved |
| Twenty CRM | Modern CRM workspace (contacts, deals, kanban, notes, API, workflows) | ⚙️ Installed on VPS (tailnet :3001), shelved | Could mirror leads read-only via n8n; avoid dual-write |
| Chatwoot | Unified inbox, CSAT, automation rules, agent workspace | ✅ Installed; webhook wiring = one UI click | OS Inbox surface talks to it |
| Cal.com (Cal.diy) | Booking / scheduling | ✅ Installed; wizard = one UI click | `VITE_BOOKING_URL` CTA |
| Odoo | Everything-in-one suite | Not used | ERP alternatives: ERPNext chosen (modern + MIT-ish, AGPL core) |

## 3. Layer 2 — Open-source admin/workspace shells (could substitute the UI)

| Project | Type | Would give us | Fit |
|---|---|---|---|
| **Appsmith** | Internal-tool builder | Drag-drop admin UI over our `/api/*` routers | High-speed, RBAC built in, JS SDKs |
| **ToolJet** | Internal-tool builder | Admin panel + dashboards + JS | Strongest candidate for a "readymade alternate UI" |
| **Budibase** | Low-code internal tools | CRUD + roles + automations | Slower on complex flows |
| **NocoDB** | Spreadsheet-gives a UI over DB | Instant tables/views over D1/Db | Good for read-only mirrors |
| **Directus** | Headless CMS / data studio | REST/GraphQL + admin | Not a business app surface |
| **shadcn-admin** | React + Vite admin template | Styling foundation only | Not an app |
| **Metabase / Superset** | BI dashboards | Funnel / GST / revenue charts | Analytics-only |

## 4. The honest trade-off (why we keep building OpusOS)

OpusOS's value is in the **backend logic already written and tested** (135 tests):

- money = integer paise; GST split (CGST/SGST/IGST) at the boundary only
- DPDP consents with notice + hash + IP; consent-gated nurture
- campaign/nurture engine (division + context targeting, `/api/automation` dispatch)
- WhatsApp gateway (OpenWA + Meta lane), HMAC webhooks, rate limit layers
- role ceilings (super_admin-only surfaces), audit trail
- /api/automation lane for the n8n spine

A ready-made shell (Appsmith/ToolJet/NocoDB) would ship a dashboard in days but would
force re-implementing or adapter-ing all the above, plus lose the bespoke homepage-grade
glass/GSAP UI requested earlier. It is a **redesign risk, not a time saver**, once the
backend is already wired.

## 5. Recommended stance

1. **Keep OpusOS custom.** The workspace is ~90% finished here; domain logic is the moat.
2. **Use ready-made OSS where it already fits:**
   - ERPNext → books (done) · Chatwoot → inbox (wire webhook) · Cal.diy → booking (wizard)
   - Twenty → optional CRM mirror (read-only) — park the decision until CRM needs grow
3. **If a "readiness shortcut" is ever desired:** evaluate **ToolJet or Appsmith** pointed
   at `app/api/*` (they are the strongest side-by-side candidates), and **Metabase** for
   pure analytics widgets.
4. Anything else gets a **comparison doc + starred/active GitHub scan (2026)** before adoption.

---
*This note is advisory. To act on any option: update this file, flip `PENDING-CONFIGS.md` and the roadmap accordingly, and re-run the test suite.*