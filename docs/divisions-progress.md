# Divisions — Progress & Roadmap

Status of the five business divisions in the Opus OS workspace, what has been built, and what remains.

**Working pattern (per division):** research gold-standard practices → schema + migration → portal (client) routes → client-portal section → staff desk → partner surface → tests → typecheck/build → live e2e + UI smoke. One division at a time, fully verified before moving on.

---

## ✅ 1. Visa — COMPLETE

### What was built
**Client portal — "Visa Services"** (`ClientPortal.tsx`)
- Product catalogue (country → product cards with fee/processing/required docs) → **9-step application wizard** (Applicant → Passport → Contact → Employment → Travel → Financial → Visa History → Documents → Review) with dropdowns, pill radios, date/number fields, per-step validation, partial-save.
- **Document uploads** via token-auth presigned flow; per-doc uploaded/verified/rejected badges; re-upload for rejected docs.
- **Tracker**: status timeline (draft → submitted → document_prep → slot_booked → granted/rejected → delivered/cancelled), appointment info, staff notes, rejection-reason banner, edit-application.

**Staff desk** (`VisaPrepPortal.tsx`)
- Applicants list: status filter pills, country filter, search; rows show name/token/country/visaType/status/docs-verified.
- Application detail: form_json renderer (all 7 sections) + "Edit Form" modal, status transition bar (with required rejection reason + Mark Delivered), notes editor.
- **Document Checklist & Verification Vault** (per-doc verify/reject/view) + **"All Uploaded Files"** panel (every client upload, incl. non-checklist).
- **Visa Products Inventory Control**: gold-standard catalog — Category (Tourist/Business/Work/Student/Medical/Transit/Visit/Other), Tier (Standard/Express/Urgent), Validity/Max-stay, Insurance, category filter, **Duplicate-as-variant**, and a **right-side product detail + client-portal preview drawer**.

**Partner**: visa products listable/linkable for referral + commissions.

**Backend**: `visa_applications` extended (form_json, submitted_at, decision_at, rejection_reason, delivered_at), `visa_products` extended (category/tier/validity/max_stay/insurance), portal routes (`/api/public/portal/visa/*`), staff routes (filters, generic PATCH, 8-state machine with no-jump rules + doc interlock), shared zod schema, tests.

---

## ✅ 2. Manpower — COMPLETE

### What was built
**Client portal — "Jobs"** (`ClientPortal.tsx`)
- Browse public jobs (rich cards: employer, benefits, requirements, featured) → **apply wizard** (8-section candidate form) + **resume upload** (R2) → **4-stage tracker** (Selection → Medical → Visa → Flight).
- **Paid Exclusive Community**: paywall with admin-configured plans + Razorpay checkout → membership unlock → **secret jobs** (🔒 Exclusive badge + filter) visible only to members; apply to secret jobs allowed for members only.

**Staff desk** (`ManpowerPortal.tsx`)
- **Job Vacancies Board**: public/secret tier toggle, blue/white collar, rich add/edit job form (employer, salary range, currency, vacancies, benefits, requirements, trade, experience, visa/medical flags, deadline, featured).
- **Job lifecycle control**: status badges + filter (draft/open/paused/filled/closed/archived), and a **right-side job detail drawer** with lifecycle actions (Open · Pause · Mark Filled · Close · Archive · ✎ Edit).
- **Candidate Deployment Status**: candidate pool, deployment pipeline (selection/medical/visa/flight statuses with automations), application-form viewer, rejection reason.
- **Exclusive Community tab**: admin-managed membership plans (create/edit/deactivate, price/tier/duration/perks) + **Live/Coming Soon master switch** + candidate membership status with Grant/Revoke.

**Partner**: jobs catalog + referral links + commissions (per-type/item/partner).

**Backend**: `job_postings` rich fields + status lifecycle, `manpower_deployments` (form_json/resume_key/applied_at/rejection_reason), `membership_plans` + `app_settings` tables, portal routes (jobs gated by membership, apply gated, membership order/verify), admin routes (plan CRUD, settings, staff grant/revoke), tests.

---

## 🛠 Supporting work (applies to all divisions)
- **Upload hardening** (OWASP gold standard): extension allowlist, magic-byte sniffing, size caps, SHA-256 integrity, owner-binding, safe download headers (`nosniff`, content-disposition).
- **`BETTER_AUTH_SECRET`** fixed professionally (`.dev.vars` + documented + fail-closed).
- **Brand DNA sync**: workspace light theme (off-white canvas, brand-navy `#0A2D50`, gold accents) across all tabs/pages.

---

## ✅ 3. Umrah — COMPLETE (Phase 3, 2026-08-14)

### What was built
**Client portal — "Umrah"** (`ClientPortal.tsx` → 🕋 Umrah tab)
- **Package inventory browse**: rich package cards (tier, duration, flight, hotels, pricing) → full detail view (all 9 field groups: flight/hotels/visa/transport/duration/pricing/content) with inclusions, exclusions, documents, terms.
- **Tier guide**: Economy / Standard / Premium / Luxury — what each includes (hotel stars, Haram distance, meals, transport) shown to clients.
- **Availability calendar**: announced dates (capacity 30) with available/filled per date; trip ranges (start → end) render across cells.
- **Party booking (family/group/solo)**: traveller stepper (adults / children 2–11 with bed / children 2–4 no bed / infants 0–2, max 30), name rows (+ optional DOB), room preference (quad/triple/double/single), live price summary with per-person rates + group discount. **Advance = ₹500 × pax** (one checkout) → seats reserved 3 days → balance online (Razorpay) or at office. Solo = private room + supplement (single traveller only).
- **Tracker**: My Bookings — status (held/reserved/confirmed/waitlist/cancelled), party list with categories, reserved-until, party total, balance due, pay-online button.
- **Privacy**: clients see only aggregate fill counts; who-booked is staff-only.

**Staff desk** (`UmrahPortal.tsx`)
- **Packages tab**: rich package form (grouped sections), lifecycle (draft/open/paused/closed/archived), featured, wholesale/retail/advance pricing, **solo travel toggle + supplement**, **family pricing** (child with bed / child no bed / infant), **group discount** (% + min pax), **Live/Coming Soon master switch**.
- **Departure Calendar**: announce dates (start + end, capacity 30), cancel departure, book seat, view manifest, release booking.
- **Manifest**: passenger list with checklist toggles (passport/visa/vaccine/ticket), **per-booking party expansion** (every passenger with category + masked passport), occupancy (Shared/Solo), room config, **CSV export with travellers column**.

**Partner**: umrah packages + departures in catalog with availability; `/go` affiliate links; commission plans support `umrah_package`.

**Backend**: `umrah_packages` (55 cols), `group_departures.packageId/endDate/departureCity`, `seat_bookings` advance/hold/occupancy fields, `app_settings` switch, staff + portal + partner routes, 369 tests green.

---

## ⏳ 4. Study Abroad — PENDING

### To do
- Student registry, course search/shortlist, applications, documents (desk has a foundation).
- Client-facing + richer workflow pass (mirror the Visa/Manpower pattern): eligibility capture, offer letters, deadline alerts, fee milestones, document vault.

---

## ⏳ 5. Attestation — PENDING

### To do
- Rates, applications & stamping, India Post/courier tracking (staff-side exists).
- Client-facing + richer workflow pass: quote per chain, pickup booking, chain timeline (HRD → MEA → Embassy → MOFA), delivery proof.

---

## Notes / open items
- **Recurring membership** (Manpower exclusive community): currently one-time payment for a fixed duration; converting to recurring Razorpay Subscriptions + webhooks is deferred (user chose to revisit later).
- **Secret-job employer visibility**: optional enhancement to hide employer on secret jobs ("Confidential client, [country]") for a more exclusive feel.
- **Razorpay creds** (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`) must be set in `.dev.vars` / `wrangler secret put` for live payments.
