# Cal.com Integration Strategy for Opus OS

> **Status:** Proposed · **Trigger:** Owner signed up for cal.com free tier
> **Date:** 2026-08-16 · **Research:** cal.com API v2, webhooks, free-tier limits (2026)

---

## 1. What cal.com gives us (free tier, verified 2026)

| Capability | Free tier | Notes |
|---|---|---|
| Users | **1** | Team scheduling needs Teams plan ($15/mo) — upgrade trigger |
| Event types | **Unlimited** | One per division: study-abroad consult, visa consult, attestation intake, umrah planning, manpower consult |
| Bookings | **Unlimited** | |
| Calendar connections | **Unlimited** | Google Calendar sync for availability |
| Workflows / automation | ✅ | Email + SMS reminders, follow-ups |
| Payment processing | ✅ | Stripe/PayPal on bookings (paid consultations later) |
| API v2 (REST) | ✅ | Bearer token + `cal-api-version` header; 120 req/min |
| Webhooks | ✅ | `booking.created / cancelled / rescheduled / meeting.ended` + optional secret |
| Routing forms | ✅ | Qualify leads before they pick a slot |
| Branding | Cal.com branding | Acceptable; white-label needs Platform plan |

**Key architectural fact:** webhooks are the integration backbone — cal.com pushes booking lifecycle events to us; we never poll.

---

## 2. Per-division analysis (which divisions actually need scheduling)

| Division | Nature of the service | Consultation need? | Verdict |
|---|---|---|---|
| **Study Abroad** | Counselling-led, long sales cycle (months), multiple touchpoints: initial consult → shortlist → application → visa prep | **YES — counselling IS the conversion moment.** 30-60 min sessions, time-boxed, high value | ✅ **Primary use case** |
| **Visa** | Advisory + document prep; **interview prep is inherently appointment-based** (mock interviews, document review) | **YES — mock interviews and doc-review are time-boxed sessions** | ✅ **Strong fit** |
| **Manpower** | Two-sided: candidates + client companies; **screening interviews and client intake meetings are appointments** | **YES — screening interviews, skill assessments, client job-order intake** | ✅ **Good fit** |
| **Umrah** | Package-based, self-serve: pick package → pick departure → ₹500 advance (portal already does this) | **Weak** — only group/family *planning* calls add value; core flow needs no appointment | ⚠️ **Optional** (one "planning call" event type, low priority) |
| **Attestation** | **Document processing service** — submit docs → quote → process → deliver. No counselling conversation | **NO — clients drop documents and track progress.** A booking step adds friction, not value. Existing portal already handles quote requests + document intake + chain tracking + pickup | ❌ **Skip** (user is right) |

**Conclusion:** cal.com serves the **consultation-led divisions** (Study Abroad, Visa, Manpower) — not the **transactional divisions** (Attestation, and mostly Umrah). Scope = **3 event types** (study-abroad, visa, manpower) + optional umrah planning call.

---

## 2. The core value for Opus OS

**Consultations are the #1 conversion moment for all 5 divisions** (study abroad counselling, visa interview prep, attestation intake, umrah planning, manpower screening). Today they're booked by phone/WhatsApp manually. cal.com makes them **self-serve, scheduled, and visible inside the OS** — with zero staff time spent on back-and-forth.

---

## 3. Integration architecture

```
Client on public page          cal.com (cloud)              Opus OS (Workers + D1)
┌──────────────────┐   link    ┌──────────────────┐  webhook  ┌──────────────────────┐
│ "Book a free     │ ────────► │ Event type per   │ ────────► │ POST /api/webhooks/cal │
│ consultation"    │           │ division (30min) │  secret   │  → upsert client      │
│ button → cal.com │           │ availability +   │  verified │  → create engagement  │
│ booking page     │           │ reminders (SMS)  │           │  → create task        │
└──────────────────┘           └──────────────────┘           │  → staff alert        │
                                                              │  → Inbox conversation  │
                                                              └──────────────────────┘
```

### 3.1 New table: `bookings`
| Field | Purpose |
|---|---|
| `id`, `calUid` (unique) | identity; calUid dedupes webhook replays |
| `eventTypeId`, `division` | which service; division drives RBAC scoping |
| `title`, `startTime`, `endTime` | the slot |
| `attendeeName`, `attendeeEmail`, `attendeePhone` | who booked |
| `status` | `scheduled / cancelled / rescheduled / completed / no_show` |
| `clientId`, `taskId` | links into existing OS records |
| `createdAt`, `updatedAt` | audit |

### 3.2 New route: `apps/api/src/routes/cal.ts`
- **`POST /api/webhooks/cal`** (public, HMAC/secret-verified like the Razorpay webhook):
  - `booking.created` → upsert client by email/phone (leadSource = `cal.com`), create engagement (division from event type map), create task "Consultation: {title} with {attendee}", staff alert (severity info, link `/bookings`), communication row
  - `booking.cancelled` → task → cancelled, alert
  - `booking.rescheduled` → update task times, alert
  - `meeting.ended` → task → done, auto-create follow-up task (e.g. "Send study abroad shortlist")
- **`GET/POST /api/cal/config`** (manager+) — `cal_api_key`, `cal_webhook_secret`, `cal_event_types` (JSON: division → eventTypeId) in `app_settings`
- **`GET /api/cal/bookings`** (staff, division-scoped) — upcoming/today/past, filter by division + status
- **`GET /api/cal/slots`** (manager+) — next available slots per event type (API v2 `/v2/slots`) for public-page "next slot" display

### 3.3 New UI: **Bookings tab** (nav: Operations, all staff, division-scoped)
- Today's consultations (countdown), upcoming, past 30 days
- Per-booking: attendee, division, time, status badge, link to client record (Client360)
- Config panel (owner): API key, webhook secret, event-type map
- Sync contract: same D1 tables → every workspace sees the same bookings; division scoping via `userDivisions`; alerts via Live Activity bell

### 3.4 Public pages
- "Book a free consultation" buttons on all 5 division pages + home → cal.com booking links (per division)
- Optional: "Next available slot" chip via slots API
- Lead form stays primary capture; booking is the conversion step

### 3.5 Client portal
- "Your upcoming consultation" card with date/time + cancel/reschedule link (cal.com handles it)
- Post-consultation: follow-up tasks land in the OS automatically

---

## 4. Free-tier constraints & upgrade triggers

| Constraint | Impact now | Upgrade trigger |
|---|---|---|
| **1 user only** | All event types share one account's availability; owner manages slots | Teams plan ($15/mo) when 2+ counselors need own availability |
| Cal.com branding on booking pages | Acceptable for now | Platform plan if white-label needed |
| No round-robin/team scheduling | Manual assignment of bookings to counselors | Teams plan |
| API 120 req/min | Fine (webhook-driven, not polling) | — |

---

## 5. Phased rollout

| Phase | Scope | Effort |
|---|---|---|
| **P1 — Core pipeline** | `bookings` table + webhook receiver (secret-verified) + client/engagement/task/alert creation + config endpoints | ~half day |
| **P2 — Bookings tab** | UI with division scoping, status badges, Client360 links, config panel | ~half day |
| **P3 — Public + portal** | Booking buttons on 5 division pages + home; client-portal consultation card | ~half day |
| **P4 — Advanced** | Slots display, no-show handling, paid consultations (Stripe via cal.com), routing forms | later |

**Recommended:** P1 + P2 first (the OS-side pipeline), then P3 (public conversion). P4 when volume justifies it.

---

## 6. What the owner must do in cal.com (5 min)
1. Create **3 event types** (study-abroad, visa, manpower — 30 min each; optional 4th: umrah planning call) → copy each eventTypeId
2. Settings → Developer → Webhooks → add `https://<api>/api/webhooks/cal` with secret, triggers: booking.created/cancelled/rescheduled/meeting.ended
3. Settings → Developer → API keys → create key
4. Paste all three into the OS Bookings tab config panel
5. Copy the booking links → paste into the OS config (public buttons use them — study abroad, visa, manpower pages only)
---

## 6. Anti-spam funnel — IMPLEMENTED (2026-08-18)

Booking is now created **server-side** through the cal.com API v2 — the raw
cal.com page is no longer the primary booking path (it was a spammer's dream:
no bot gate, no rate limit, no lead validation).

### Defense layers (in order, per booking attempt)

| Layer | Where | Behavior |
|---|---|---|
| 1. Honeypot field | `POST /api/cal/public/book` | Hidden field bots fill → fake success, nothing booked, audit `BOT_TRAPPED` |
| 2. Cloudflare Turnstile | middleware on `/book` | Bot gate before any slot is locked (mock keys in dev, fail-closed in prod) |
| 3. Rate limit | `10 req / 5 min / IP` on `/book`, `60 / 5 min` on `/slots` | Mass-booking attempts throttled |
| 4. Zod validation | body schema | Division must be consultation-led; email format; phone pattern; slot must be a valid future time |
| 5. Suspicion scoring | `scoreBooking` (shared with webhook lane) | Disposable-email block, MX-record check, no-phone penalty, suspicious name/text, new-contact, last-minute → **score ≥ 50 rejected (403)**, 20–49 flagged in staff alert |
| 6. Flood limit | bookings table | Max **3 bookings per email/phone per 24h** → 429 + urgent staff alert |
| 7. Server-side creation | cal.com API v2 `POST /v2/bookings` | Slot locked only after all gates pass; local `bookings` row inserted (webhook dedupes by calUid) |

### Webhook lane (unchanged, still active)
HMAC signature verification (timing-safe) · webhook rate limit (120/h) ·
suspicion scoring + risk-severity staff alerts · `BOOKING_REQUESTED` →
pending-approval flow with email/WhatsApp notify · staff `verify` workflow ·
division-scoped bookings list.

### New endpoints
- `GET /api/cal/public/slots?division=&start=&end=&timeZone=` — rate-limited slot availability (503 `no_api_key`/`no_event_type` when unconfigured)
- `POST /api/cal/public/book` — the gated booking funnel above

### Frontend
`BookingModal` (slots picker + contact form + Turnstile + honeypot) wired into
StickyCallBar, the funnel modal, and the study-abroad / visa / manpower hero
CTAs. When no cal.com API key is configured the modal falls back to the direct
cal.com link (graceful degradation).

### Activation status — DONE (2026-08-18)
1. ✅ `cal_api_key` stored in D1 `app_settings` (runtime store — never in git). Key validated live against `GET /v2/event-types`.
2. ✅ `cal_event_types` auto-discovered from the live API and stored:
   - study-abroad → `6684819` (study-abroad-consultation)
   - visa → `6684820` (visa-consultation)
   - manpower → `6684821` (manpower-screening — note: slug is `manpower-screening`, NOT `manpower-consultation`; FE fallback URL fixed accordingly)
3. ✅ `cal_booking_links` stored (backend-authoritative public links).
4. ⚠️ **Webhook secret still unset** — set it in cal.com (Developer → Webhooks) + save the same value in Consultations → Cal.com Configuration to turn on HMAC verification.
5. ⚠️ **Availability not configured in cal.com** — the event types return 0 slots in a 7-day window. Open cal.com → Event Types → each event → Availability → set your working hours. Until then the booking modal shows "no slots" and falls back to the direct link.

### API versioning note (verified live 2026-08-18)
cal.com v2 is versioned **per endpoint** — one header for all calls 404s:
`GET /v2/event-types` → `2024-06-14` · `GET /v2/slots` → `2024-09-04` · `POST /v2/bookings` → `2026-02-25` (see `lib/calApi.ts`).
