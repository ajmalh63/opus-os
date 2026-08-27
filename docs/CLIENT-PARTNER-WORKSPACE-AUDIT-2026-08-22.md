# Opus OS — Client & Partner Workspace Audit
**Date:** 2026-08-22  
**Scope:** Client Portal (`/portal`, token + session) + Partner Command Center (`/partner`) — all 5 divisions  
**Method:** `ux-audit` (Nielsen 10 + mobile ergonomics), `product-design` (Apple 10 principles, cognitive load), `ui-ux-pro-max` (50+ styles, 99 guidelines), `platform-design` (HIG/M3/WCAG), `product-manager` (RICE, Jobs-to-be-Done), `saas-multi-tenant`  
**Gold standards researched:** Vezert SaaS portal 8 patterns, Ralabs/Trafft booking UX, ApplyBoard ATS, FirstPromoter/Rewardful partner portals, Kibo B2B ordering

---

## 1) Current Architecture — What Exists Today

### Client Workspace (`/portal`)
- **Auth:** Dual plane — public token lookup (`?token=OP-2026-XXXX`, no account) + BetterAuth session (`/api/public/portal/session`, credential `portalToken` bind). Header shows `Live Workspace Sync` (DO `SYNC_HUB` plane `client`).
- **Shell:** Sticky header (Logo, Live Sync pill, Counselor Live Chat, Hotline, Sign Out) + Left sidebar (64px, hidden on md) with **7 tabs**: `dashboard` (ClientDashboardHub) + 5 divisions + `journey`. Mobile: horizontal strip.
- **Dashboard Hub:** `ClientDashboardHub` — pipeline progress, assigned counselor, counts per division (study/visa/umrah/attest/jobs), quick nav.
- **Divisions:**
  - **Study Abroad** (`StudyAbroadClientSection`): 3 sub-tabs `profile` (StudentProfileWizard 4-step), `applications` (MilestoneStepper 7 stages + offer accept/decline + match tier), `documents` (per-app per-doc checklist + upload + Other docs with label). *No self-service ordering* — applications created by counsellor.
  - **Visa** (`ClientVisaWidget` inside `ClientPortal.tsx:790+`): `DEFAULT_PRODUCTS` 6 visas + DB products, status card (Docs Vault / Embassy details / Mock interview), `Browse Active Visa Offerings` grid + **Catalog Checkout Form** (select country → filter → select product → `selectedCatalogProduct` panel with required docs upload + checkout → `/api/public/portal/visa/inquiry` → R2 presigned uploads → inquiry). Payment via Razorpay for outstanding balance. Razorpay checkout for catalog? Inquiry first, then payment later on engagement balance.
  - **Umrah** (`UmrahClientSection`): Most mature — `browse` (tier guide + calendar + packages list), `detail` (Tier info, flight/hotel/meals/transport/visa/payment cards, inclusions/exclusions, departure dates), **Booking modal** with party builder (adult/child/infant steppers, name/DOB rows, solo vs shared, room config quad/double/triple/single, live price preview `previewPartyPrice`, Razorpay advance then balance). `tracker` (MyBookings with status held/reserved/confirmed/waitlist/cancelled, party manifest, balance pay).
  - **Attestation** (`AttestationClientSection`): `browse` (price bands + featured products + **Request a quote** form: country/category/docName/holder/issuingState/translation/urgency/deadline/scan → `POST /api/public/portal/attestation/applications`), `tracker` (chain timeline, fees, pickup form with address/AWB, courier tracking).
  - **Manpower/Manpower** (`ManpowerApplyWizard`): 4-step wizard `Identity (2 fields) → Contact (phone/email) → Experience (skills/years/role + passport toggle) → Review (resume drag-drop + review cards)` — Baymard 3-4 fields/step, progress `step/4`, draft auto-save, quota guard. List of jobs + tracker of my applications (elsewhere).
- **Records:** `journey` tab — verified journeys list (clientId, docs count, consents, payments). Documents vault fragmented per division.
- **Support:** `ChatWidget`, `💬 Counselor Live Chat` (Chatwoot toggle), hotline `tel:+919876543210`.

### Partner Workspace (`/partner`, `PartnerDashboard.tsx` ~1500 lines)
- **Auth:** Session (`/api/public/partners/session`, cookie) + legacy `opus_partner_id/token` fallback. KYC register (name/email/password/PAN/bank/IFSC) → instant approval.
- **Tabs:** `overview` (hero + simulator + auth), `links` (catalog browser + generated links + QR), `referrals` (ledger with statusChip, MilestoneTimeline, filters), `payouts` (config + ledger + request), `tiers` (Thrive ladder).
- **Overview:** Highlights ribbon (4 stats), simulator (5 sliders), 2-col KYC + login.
- **Links:** `DIVISIONS` 5 configs (commission ranges), `SWIPE_TEMPLATES` 4 copies, `catalog` query, `createLinkMutation`, generic `universalReferralLink` (`/lead-form?ref=`), `linksData` list.
- **Referrals:** `ledgerRows` merged from `referrals` + `referralDetail`, `filteredLedger` (status/search), `MilestoneTimeline`, manual referral LOG input (`manualClientId` + rate).
- **Payouts:** `payoutMethod` (bank/upi + detail + threshold), `requestPayout`, ledger `requested/approved/paid/rejected`.
- **Thrive:** Tier ladder, points, boost, perks, progress.
- **Ads:** Division path, avgCommission, typicalFee, whatsappText generator.

---

## 2) Client Audit — Per Division Ordering / Booking Gaps (Client View)

### Audit Lens (applied to every division)
- **Heuristics:** Visibility of system status (1), Match real world (2), User control (3), Consistency (4), Error prevention (5), Recognition over recall (6), Flexibility (7), Minimalist (8), Recovery (9), Help/onboarding (10) + mobile reachability, thumb zone, input burden.
- **Gold standards:** ApplyBoard (search → compare → 1-click apply, requirements tab, ATS with due dates), VFS/Atlys (instant eligibility, fee calculator, appointment slot, up-front price), Booking.com (calendar + party + sticky CTA + price breakdown), Notarize (quote → pickup → chain tracking like FedEx), Indeed/Naukri (wizard with 25% progress chunks).

#### 2.1 Study Abroad — **No Ordering, High Friction**

**Current ordering flow (actual):** Client cannot order. They complete `StudentProfileWizard` (7 sections: gender, city, DOB, etc.) → counselor creates `AppRow` (shortlisted) → client sees `MilestoneStepper` (7 steps) + `docsChecklist` per doc key. Ordering is **counsellor-driven, not client-driven**.

**Friction (Heuristic violations):**
- **H1 Visibility (Critical):** No CTA above fold in `applications` when empty — shows `No applications yet. Complete your profile...` with no button. User must guess to go to `profile`.
- **H3 User control (High):** No way to **browse universities** or **shortlist** themselves. ApplyBoard gold standard is 140k programs searchable with filters (country/field/level/intake/tuition). Here, discovery is offline.
- **H5 Error prevention (Medium):** `transcript, cv, sop, lor1, lor2, ielts, passport, finance, portfolio` checklist shows state `missing/received/verified` but no **due dates or blocker** — ApplyBoard shows `Applicant Requirements Tab` with `missing → blocks payment`. Here, client can upload but doesn't know what blocks submission.
- **H6 Recognition (Medium):** Offer panel shows `offerType, conditions, acceptanceDeadline` but no **comparison view** (ApplyBoard `Search Compare` up to 24 programs side-by-side). Client with 2 offers cannot compare.
- **H10 Help (High):** Empty `profile` shows `{pct}% complete. Missing: ...` but not **actionable deep links** to missing fields.

**Gold-standard gap:** ApplyBoard's `Quick Search` (country/field/level/intake/tuition slider + success prediction) + `Application Requirements Tab` (progress at a glance + missing docs block submission) + `ATS with due dates`.

**Opportunity — Jobs-to-be-Done:** *When I am a student with 60% profile, I want to see which universities I can apply to right now and what is blocking me, so I can place an order without waiting for counselor.*

**Strategic Design — Study Abroad Self-Service Ordering (P0)**

- **Add `University Catalog` sub-tab** (before `applications`): Search bar `What to study?` + `Where?` + left filters (Country, Field, Level, Intake, Tuition 0–50L slider, IELTS band, Budget) — mirrors ApplyBoard. Cards show `university.name, country, program, intake, yearly tuition, application fee, success prediction (match score)`, CTA `Shortlist` / `Apply Now` (disabled until profile pct ≥ 80 with tooltip).
- **Shortlist drawer** (like e-commerce cart): `Shortlisted (3)` pill in header, slide-over with selected programs, `Place Application Orders` button batches `POST /api/public/portal/study-abroad/applications/batch` (create multiple `AppRow` with status `shortlisted`). Show `Total application fees: ₹X` with breakdown, **price upfront** (Ralabs: show full price before checkout).
- **Unified Docs Gate:** In `documents` tab, show **global checklist** merged from all shortlisted apps — `transcript (required for 2 apps) → Upload once → fulfills both`. Progress `4/9 docs` sticky top, `Pay & Submit` button disabled with `Missing: SOP for Toronto` tooltip — prevents error (H5).
- **Offer Comparison:** When ≥2 `offer_letter`, show `Compare Offers` table (university, tuition, scholarship, deposit, deadline, conditions) + `Accept` radio + sticky `Confirm Decision` bar (thumb-zone, 44px, `cursor-pointer`).

#### 2.2 Visa — **Catalog Exists But Ordering Is Inquiry, Not Checkout**

**Current:** `DEFAULT_PRODUCTS` 6 visas (Dubai, Thailand, etc.) + DB `publicVisaProducts`. `Browse Active Visa Offerings` grid → `selectedCatalogProduct` → **Checkout Form Panel** (email/phone/terms + required docs per `getRequiredDocs` + `catalogFiles` upload) → `POST /api/public/portal/visa/inquiry` → R2 uploads. Payment **later** via `activeVisaEng.outstandingBalance` Razorpay. So ordering = inquiry, payment decoupled.

**Friction:**
- **H1 Visibility (Critical):** Inquiry success shows `alert()` only, no status card update until reload. No `live status` like VFS.
- **H4 Consistency (High):** Two separate upload surfaces: `Catalog Checkout` (during inquiry) + `Docs Vault` (quick upload). User doesn't know which is canonical.
- **H8 Minimalist (Medium):** 6 products only, no **filter by entryType/processingTime/fee**, no **eligibility quiz** (Atlys asks 3 questions → instant eligible/ineligible).
- **H3 Control (High):** No **cart** for multi-country (family applying Dubai + Thailand) — must repeat flow.

**Gold gap:** Atlys/VFS: eligibility check (nationality + purpose → instant yes/no + docs), fee calculator, **single-page checkout with order summary + price breakdown**, appointment slot.

**Strategic Design — Visa Instant Order (P0)**

- **Transform inquiry → checkout:** Replace `Catalog Checkout Form Panel` with **2-step checkout** (Baymard 3-4 fields/step):
  - Step 1 `Travellers & Docs` (email/phone prefilled from `journey.client`, terms checkbox, `catalogFiles` with `[Required]` chips, `Add another country` → cart array)
  - Step 2 `Review & Pay` (order summary: `Dubai Tourist Single Entry — ₹7,200 × 1`, `Docs fee: included`, `Processing: 3-4 Days`, `Total: ₹7,200`, `Pay now` Razorpay CTA sticky bottom, `Price Breakdown` expandable — Ralabs: show full price early, reduce drop-off)
- **Eligibility badge:** Above grid, `Nationality: Indian → Dubai Tourist: ✅ Eligible` pills (fetched from `GET /api/public/visa/eligibility?nationality=IN&country=AE`).
- **Cart drawer:** Header `Cart (2)` → slide-over with line items, `Proceed to inquiry` → one `POST` with array, one R2 batch upload loop, one Razorpay order (if sum >0). Enables family bulk.

#### 2.3 Attestation — **Quote Request Is Good, Ordering Is Opaque**

**Current:** `browse` has price bands + featured products + **Request a quote** form (7 fields + scan + urgency/deadline) → `createMutation` → `tracker` shows `chain` timeline, fees `INR(total)`, `pickupMutation` (address + AWB). One doc per request.

**Friction:**
- **H1 Status (High):** After `Get a Quote`, user sees `Quote requested. We'll update you shortly.` but no **ETA or queue position** (FedEx shows `Quote in 2h`). Anxiety.
- **H7 Flexibility (Medium):** One doc at a time — no **bulk** (3 degree certs for one country). User must repeat.
- **H2 Match real world (Medium):** `Pickup` form asks `Your address (we'll courier...)` + `Courier AWB (after you ship)` — user must self-ship? Gold standard is **doorstep pickup scheduling** (Notarize: pick date/time, courier is dispatched).
- **H10 Help (Medium):** No **cost simulator** beyond band `₹X – ₹Y` — Kibo B2B shows `instant display of negotiated prices on product page and cart`.

**Gold gap:** FedEx/UPS tracking (chain like `Quote → Confirmed → Docs received → MEA → Embassy → Dispatched → Delivered`), Kibo `real-time inventory + quick reorder`, Notarize `pickup scheduling`.

**Strategic Design — Attestation One-Click Reorder (P1)**

- **Bulk quote builder:** Change form to **cart array** — `+ Add another document` pushes row (docName/holder/issuingState/category). `Get a Quote` now `POST` array → backend returns `quoteId` with per-doc bands + `bundleDiscount (3 docs → 5% off)`. Show `Quote ETA: 2 hours, 14:30 IST` badge.
- **Pickup scheduler (not AWB input):** Replace AWB text with **date picker + slot** (`Tomorrow 10-2, 2-6`) + `Confirm address` → `POST .../pickup` schedules courier (inbound AWB auto-generated, shown as `Courier Inbound: DEL123`). Removes user having to ship.
- **Chain as Delivery Tracker:** Render `chain` as horizontal stepper with `expected date` per step (from `rateData.timelineDays`), `Track` button opens `Courier Inbound/Outbound/Return` live map (India Post API already in `indiaPost.ts`). Add `Re-order same docs for another country` 1-click (like `quick reorder`).

#### 2.4 Umrah — **Gold Standard Already, Needs Polish**

**Current:** Tier guide (4), calendar (`UmrahCalendar`), packages `browse` → `detail` (flight/hotel/meals/transport/visa/payment cards + inclusions/exclusions + departures `Book Seat` → **Booking modal** with party builder `adult/child_with_bed/child_no_bed/infant` steppers + name/DOB rows + solo/shared + room config + `previewPartyPrice` + Razorpay advance/balance) → `tracker` with status `held/reserved/confirmed/waitlist`, party manifest, balance pay. Coming soon gate.

**Friction (minor, already strong):**
- **H6 Recognition (Medium):** `Browse` shows packages but **no wishlist/compare** — Booking.com shows `Save` heart + compare 3 packages.
- **H8 Minimalist (Medium):** Package `detail` has 7 cards (flight, Makkah, Madinah, meals, transport, visa, payment) — wall of text. Needs **progressive disclosure** (accordion).
- **H3 Control (Low):** `tracker` `held` shows `Pay advance` but no **14-min HMAC timer** visible? Actually `reservedUntil` exists but not prominent — Booking.com shows red `Hold expires in 14:23`.
- **H5 Error prevention (Low):** Party builder allows `infant` without `adult`? Checked: `!paxRows.some(adult)` shows error but still allows `Pay & Reserve`.

**Gold gap:** Booking.com: wishlist, flexible date nearby suggestions, sticky price summary, urgency `Only 3 seats left`, reviews.

**Strategic Design — Umrah Conversion Polish (P1)**

- **Above-fold sticky CTA:** On `detail`, `Book Seat` button sticky bottom on mobile (Ralabs: `+4.17% conversion` from sticky CTA). Show `Available: 3 seats left` amber pill when `available <=5` + `Next departure if full: 12 Aug` suggestion.
- **Accordion detail:** Collapse 7 cards into `▼ Flights & Hotels` etc., open first by default, others closed — reduces cognitive load.
- **Wishlist + Compare:** Heart icon on package card → `localStorage wishlist` (like `ManpowerApplyWizard` draft) → `Wishlist (2)` header + `Compare` table (price, hotel stars, distance, meals, visa).
- **Hold timer:** On `reserved` card, show `⏳ Reserved until 14:32 — 02:14:11 remaining` live countdown, `Pay balance` sticky, `Add to calendar` link. Prevents anxiety.

#### 2.5 Manpower / Manpower Services — **Wizard Is Excellent, Discovery Is Missing**

**Current:** `ManpowerApplyWizard` 4-step (Identity 2 fields, Contact phone/email, Experience skills/years/role + passport toggle, Review + resume drag-drop, quota guard, draft auto-save, match score on submit). `ClientPortal` `jobs` tab shows `ManpowerJobs token` (tracking of my applications with status).

**Friction:**
- **H1 Visibility (High):** In client portal, `jobs` tab only shows **my applications**, not **browse jobs**. Discovery is on public `/recruitment` page, not in portal. Client must leave portal to find work.
- **H4 Consistency (Medium):** Wizard uses `localStorage draft` but **jobs list doesn't show match %** before apply — Indeed shows `Match: 85% — 3 skills missing` on card.
- **H10 Help (Medium):** No **1-click apply** with profile — user must re-enter same skills even if profile complete (StudyAbroad profile not reused).

**Gold gap:** Indeed/Naukri: job cards with `Apply` + `Save`, match score, 1-click with profile, quota `2/3 active`.

**Strategic Design — Manpower Job Marketplace Inside Portal (P0)**

- **Embed `ManpowerPortal` job grid inside `jobs` tab** (above tracker): Search `Role + Country` + filters (sector, salary, experience) + cards with `Match 92% — 1 skill gap` (computed from `StudentProfileWizard` + `ManpowerApplyWizard` profile) + `Quick Apply` (pre-fills wizard from saved profile, step 3 done) vs `Apply` (full wizard). `Saved (5)` filter.
- **Profile reuse:** On wizard open, pre-fill `fullName, phone, email, city, skills, qualification` from `studyProfile` if exists — reduces input burden (Baymard: pre-fill lifts completion 30%).
- **Quota progress:** Sticky `Quota: 2/3 active — 1 slot left` with `Manage applications` link.

---

## 3) Partner Workspace Audit — Per Division Monetization

**Current partner hub:** 5 DIVISIONS configs with `avgCommission, typicalFee, whatsappText` + `SWIPE_TEMPLATES` 4 copies + `catalog` → `createLinkMutation` (per item) + `universalReferralLink` (`/lead-form?ref=`) + ledger (`referralDetail` + `filteredLedger` + `MilestoneTimeline`) + slog + tiers.

### Division-Specific Gaps (Monetization Friction)

| Division | Current Link | Commission | Gap vs FirstPromoter/Rewardful |
|----------|--------------|------------|-------------------------------|
| **Study Abroad** | Generic `/study-abroad?ref=` | ₹15-35k | No **per-university deep link** (`/study-abroad/toronto?ref=X&program=Y`) — partner can't promote a specific intake where commission is higher. |
| **Visa** | `/visa-services?ref=` | ₹3-12k | No **per-country prefilled** (`/visa-services?country=Dubai&ref=`) — partner sharing `Dubai visa 3-4 days ₹7,200` can't deep link to that product. |
| **Umrah** | `/umrah-travel?ref=` | ₹5-10k | No **package-specific** link with departure pre-selected — partner with group of 10 can't link to `Premium 10N/11D 15Aug departure`. |
| **Attestation** | `/attestation?ref=` | ₹1.5-4.5k | No **country+category** link — partner can't share `UAE Embassy attestation ₹X`. |
| **Manpower** | `/recruitment?ref=` | ₹10-25k | No **per-job** link — recruiter can't share a specific `Welder — Saudi ₹1.2L` posting. |

**Cross-division partner H's:**
- **H1 (Critical):** `links` tab shows `catalogType: university` filter but **catalog not division-filtered** — partner must scroll all items to find Dubai visa.
- **H6 (High):** No **UTM builder** — partner copies `?ref=OPUS-123` but can't add `utm_campaign=ramadan` to track which WhatsApp blast worked. FirstPromoter has subID.
- **H7 (Medium):** `generic link copied` is only link — no **QR auto-branded** beyond modal, no **short link** (`go.opusoverseas.com/abc`), no **cloaked link** (Komissio first-party tracking — ad-blocker survives).
- **H10 (High):** `referrals` ledger shows `clientId` but **no lead magnet** — partner refers, then blind until `matured`. No **pending lead** with `stage: lead` to see pipeline.

**Strategic Design — Partner Monetization Engine (Gold: FirstPromoter)**

- **Deep Link Builder:** Replace single `catalogType` select with **5 division pills** → `Study Abroad: Search Toronto → program row → Generate Link` → `https://opusoverseas.com/study-abroad/university-of-toronto?program=mscs&intake=fall2026&ref=OPUS-123&utm_campaign=whatsapp_june`. Same for `Visa → Dubai Tourist → /visa-services/dubai?ref=`, `Umrah → Package 123 + Departure 15Aug → /umrah-travel/p/123?dep=xyz&ref=`, `Attestation → UAE/Educational → /attestation?c=UAE&cat=edu&ref=`, `Manpower → Job 456 → /recruitment/jobs/456?ref=`. Store `catalogItemId` + `utm_campaign` in `partner_links` (new cols `utm_campaign, deep_params`).
- **SubID & UTM dashboard:** On `linksData` table, add `Clicks | Signups | Matured | UTM` columns. Partner filters `utm_campaign=ramadan` → sees `12 clicks → 3 referrals → 1 matured ₹8k`. Like FirstPromoter subID.
- **Pending Lead Pipeline:** Show `referrals` with `status: lead` (created on `/lead-form?ref=` submit before agreement) + `stage: lead → qualified → matured` progress bar (like client `MilestoneStepper`). Partner sees **future earnings** `Pending: ₹24k (3 leads × ₹8k avg)`.
- **1-Click Creative Kit per Division:** Below link, auto-generate **branded banner** (1080×1080 for IG, 1200×628 for FB) with division color (study `#235a96`, visa `#0d9488`...), `avgCommission` badge, QR with logo, `whatsappText` + `Swipe Copy` copy button. No manual design.
- **Team sub-accounts & Bulk:** `Invite sub-partner` (email → `partner_team` row, `parent_id`) + `Import CSV` (clientId list → bulk `logReferralMutation`).

---

## 4) Cross-Cutting Friction — Client & Partner Portal Shell

**Client shell (token + session, 7 tabs, 5 divisions):**
- **Token friction (H6):** Public lookup requires pasting `OP-2026-XXXX`. Gold standard (ApplyBoard) uses **email OTP login, no token**. Keep token for walk-ins but **hide it behind `Sign in` primary, `Track with token` secondary**.
- **Dashboard without action (H1):** `ClientDashboardHub` shows counts but **no 1 clear action** (Vezert: dashboard needs one primary action above fold). New user with 0 engagements sees 5 cards, not `Complete your profile → 2 min`.
- **Billing not forecasting (H1):** `outstandingBalance` shows `₹X` + `Pay` but **no usage forecast** (SaaS pattern: `You will owe ₹Y next month if you add attestation`). Add `Billing forecast` card.
- **Help center missing (H10):** Only `Counselor Live Chat` global. Gold: **in-product help center + search** (Vezert: 30-50% ticket deflection) + contextual tooltips on each division.
- **Settings scattered:** `journey` tab shows consents/payments but **no profile/password/notification prefs** in one place — settings group by role, not by frequency.
- **Mobile thumb zone:** Sidebar hidden on md, but **bottom nav missing** — thumb can't reach top header.

**Partner shell (5 tabs, simulator):**
- **Integrations marketplace missing:** No **Shopify/WordPress plugin** or **API key** for programmatic link creation — FirstPromoter has 30 integrations. Add `Developers` tab with `API key + webhook` (`referral.matured` → Zapier).
- **Empty state not delightful:** `No bookings yet. Browse packages` is okay but not **opportunity-framed** (`Still no bookings? Create your first link — 60% of partners earn within 7 days` + CTA).

---

## 5) Strategic Implementation Roadmap — Prioritized with RICE

| P | Feature | Reach | Impact | Confidence | Effort | RICE | Division |
|---|---------|-------|--------|------------|--------|------|----------|
| **P0** | Study Abroad University Catalog + Shortlist Cart | 60% clients | 10 | 80% | 2w | **240** | Study |
| **P0** | Visa Instant Checkout (cart + eligibility + sticky CTA) | 45% | 9 | 85% | 1.5w | **230** | Visa |
| **P0** | Manpower Job Marketplace inside Portal (with match) | 30% | 9 | 80% | 1.5w | **180** | Manpower |
| **P0** | Partner Deep Link Builder (5 divisions + UTM) | 100% partners | 10 | 90% | 2w | **450** | All |
| **P1** | Attestation Bulk Quote + Pickup Scheduler | 25% | 8 | 85% | 1w | **170** | Attest |
| **P1** | Umrah Wishlist/Compare + Hold Timer | 20% | 7 | 80% | 1w | **112** | Umrah |
| **P1** | Client Unified Cart + Billing Forecast | 100% | 7 | 75% | 1.5w | **117** | All |
| **P1** | In-product Help Center + contextual tooltips | 100% | 6 | 90% | 1w | **180** | All |
| **P2** | Client bottom nav thumb zone + onboarding <4min | 80% mobile | 6 | 70% | 1w | **84** | Shell |
| **P2** | Partner Pending Lead Pipeline + SubID dashboard | 70% | 7 | 60% | 1w | **73** | Partner |

**Phase 1 (2 weeks):** P0s — unlocks ordering for 3 highest-friction divisions + partner monetization; lifts activation 25-40% (Vezert), partner link CTR +20%.
**Phase 2 (1 week):** P1s — polish Attestation/Umrah + unified cart.
**Phase 3 (1 week):** P2s — help center + mobile nav.

---

## 6) Wireframe Specs — Ready to Build

### 6.1 Study Abroad Catalog (Client)

```
[Header: 🎓 Study Abroad — Browse Universities]
[Search: [What to study?________] [Where?________] [Search]]
[Left filters: Country□ City□ Level□ Intake□ Tuition slider 0–50L □ PG Work Permit□]
[Right: Cards 2-col: Toronto — MSc CS — Fall 2026 — ₹18L/yr — Match 92% — [Shortlist] [Apply Now]]
[Sticky footer: Shortlisted (2) — Total fees ₹36L — [Place Application Orders →]]
[Doc gate: Global checklist 4/9 — [Pay & Submit] disabled tooltip "Missing SOP for Toronto"]
```

API: `GET /api/public/study-abroad/catalog?token=&country=CA&field=CS` → `POST /api/public/portal/study-abroad/applications/batch` (array).

### 6.2 Visa Cart (Client)

```
[Eligibility: Nationality Indian → Dubai Tourist ✅ Eligible]
[Products grid: Dubai Tourist | Thailand Tourist | ... — each card: country flag, entryType, processing 3-4 Days, fee ₹7,200, docs: Passport... [Add to cart]]
[Drawer: Cart (2) — Dubai ×1 ₹7,200 — Thailand ×2 ₹9,000 — Total ₹16,200 — [Proceed] ]
[Checkout 2-step: (1) Travellers & Docs (email prefilled, files [Required] chips, Add another country) → (2) Review & Pay (order summary + Breakdown ▾ + sticky Pay ₹16,200)]
```

### 6.3 Partner Deep Link Builder

```
[Pills: Study Abroad | Visa | Umrah | Attestation | Manpower — Visa active]
[Search: Dubai [Search] → Rows: Dubai Tourist — Single Entry — 3-4 Days — ₹7,200 — [Generate Link]]
[Preview: https://opusoverseas.com/visa-services/dubai?ref=OPUS-123&utm_campaign=ramadan → [Copy] [WhatsApp] [QR]]
[Table: Link | Clicks | Signups | Matured | UTM | Revenue → filter ramadan → 12→3→1 ₹8k]
```

---

## 7) How to Verify

- Client: Login `http://127.0.0.1:5173/portal` with session, check each division: Study Abroad `Shortlist` → cart, Visa `Cart (n)` → checkout, Attestation `+ Add another document`, Umrah `♥ Wishlist`, Manpower `Quick Apply`.
- Partner: `http://127.0.0.1:5173/partner` → Links → pick division pill → Generate deep link → copy `?ref=` with `utm_campaign`, check Clicks table.
- Metrics: `activation rate` +25%, `support tickets` −30%, `partner link CTR` +20% (Vezert/Ralabs benchmarks).

