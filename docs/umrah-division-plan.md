# Umrah Division — Detailed Implementation Plan (Phase 3)

Status: **COMPLETE** — backend + frontend + tests all green (369 tests).
Last updated: 2026-08-14

---

## 1. Goal

Build the Umrah division to the same gold-standard depth as Visa and Manpower:

1. **Rich inventory** (packages) that answers ~98% of client doubts before they call.
2. **Calendar** of announced departure dates (capacity 30 per group) with live
   available/filled visibility on the **staff desk**, **client portal** (after
   login) and **partner portal** (for affiliate referral).
3. **Booking model**: ₹500 non-refundable advance → slot reserved for **3 days**
   → balance online (Razorpay) or at the office.
4. **Coming Soon master switch** (like Manpower's `exclusive_community_enabled`)
   until partners exist.
5. **Single source of truth** — staff inventory, client portal and partner
   catalog all read the same tables; no duplication.

---

## 2. Research — Gold-Standard Umrah Package Structure (2026)

Sources: Atyab Travels, Akbar Travels, BookMyUmrahTrip, DMC B2B portals
(dmcquote.com), Aqdas Travel distance guides, Taqwa Tours, UmrahPackages.bd.

### 2.1 Tiers (driven by hotel star + proximity to Haram — proximity is the #1 value driver)

| Tier | Hotel | Distance from Haram | Meals | Transport |
|---|---|---|---|---|
| Economy | 2–3★ | 600m–1.5km (Makkah), 5–8 min (Madinah) | none/breakfast | shared/group bus, LCC flights |
| Standard | 3–4★ | 300–500m | half-board | private AC transport, group leader |
| Premium | 5★ | 50–200m (clock tower views) | full-board buffet | private luxury car, VIP visa |
| Luxury | 5★ | 50–100m / Haram view | full-board | private car + driver, express immigration |

### 2.2 Distance zones (computed from meters — honest walk times)

| Zone | Distance | Off-peak walk | Peak/Ramadan walk |
|---|---|---|---|
| Ultra-close | 0–200m | 2–3 min | 4–6 min |
| Comfortable | 200–500m | 4–7 min | 8–12 min |
| Manageable | 500–800m | 8–11 min | 14–20 min |
| Shuttle | 800m–2km | 15–25 min | often impractical on foot |

> Clients distrust "5 minutes from Haram" claims — always show exact meters +
> walk time + zone badge.

### 2.3 Flight (per package)

- Airline(s), flight type (**direct / 1-stop / 2-stop**), departure city,
  arrival airport (Jeddah/Madinah), baggage allowance (e.g. 30kg + 7kg hand),
  flight class (economy/business), Zamzam (5L) included.
- Baggage is a top doubt: most airlines allow 2×23kg for Umrah groups; LCCs
  differ (e.g. EgyptAir 1 bag).

### 2.4 Duration & itinerary

- 7 / 10 / 14 nights, split Makkah + Madinah nights.
- Day-by-day itinerary (Ihram at Miqat → Tawaf/Sa'i → Ziyarat → Madinah).

### 2.5 Visa & documents

- Umrah visa + KSA insurance included; ~21-day lead time.
- Documents: passport (6-month validity), photos, mahram for females,
  vaccination (polio/meningitis as required).

### 2.6 Payment model (industry standard)

- **Deposit/advance to confirm** (~30% or a small token like ₹500).
- Balance due ~30 days before departure; installment plans common.
- Refundable deposit within 48h if nothing booked; non-refundable once
  flights/hotels are locked.
- **Wholesale model**: wholesale 15–35% below retail; retail markup 25–40%;
  group volume discounts (20+ pax → 5–8%, 50+ pax → 8–12%).
- Seasonality: Ramadan/school holidays swing prices 30–40% → per-departure
  price override.

### 2.7 Booking lifecycle (software gold standard)

Inquiry → package config → supplier confirmation → visa workflow triggers →
deposit processed (updates ledger) → balance collected → voucher generation →
post-trip CRM record. Minimize manual re-entry across booking/visa/invoicing.

---

## 3. Inventory Field Set (umrah_packages table)

All money = **integer paise**. JSON lists stored as stringified JSON.

### Flight
- `flightType`: direct | one_stop | two_stop | varies
- `airline`, `departureCity`, `arrivalAirport`, `baggageAllowance`
- `flightClass`: economy | business
- `zamzamIncluded`: bool

### Duration
- `totalDays`, `makkahNights`, `madinahNights`

### Makkah hotel (symmetric for Madinah)
- `makkahHotel`, `makkahHotelStars` (3/4/5)
- `makkahDistanceMeters`, `makkahWalkMinutes`
- `makkahHaramView`: none | partial | full

### Room & meals
- `roomSharing`: quad | triple | double | single
- `mealsPlan`: none | breakfast | half_board | full_board
- `shuttleService`: bool

### Transport & tours
- `airportTransfer`: bool
- `intercityTransport`: group_bus | private_car | luxury_car | none
- `ziyaratTours`: bool
- `groupLeader`: bool
- `guideLanguage`: e.g. "Telugu / Urdu / Hindi / English" (Nizamabad market)

### Visa
- `visaIncluded`, `ksaInsurance`: bool
- `visaLeadDays`: int (default 21)

### Pricing (paise)
- `wholesalePricePaise` (supplier cost — owner-only view)
- `retailPricePaise` (per person)
- `advanceFeePaise` (default 50000 = ₹500, non-refundable)
- `reserveHoldHours` (default 72 = 3 days)
- `balanceDueDaysBefore` (default 30)
- `installmentAvailable`: bool
- `groupDiscountPct`, `groupDiscountMinPax`

### Content & trust
- `description`
- `inclusionsJson`, `exclusionsJson`, `documentsJson`, `itineraryJson`, `termsJson`
- `specialNeeds` (wheelchair, elderly-friendly, family rooms)
- `supplierRef`, `coverImageKey` (R2)
- `featured`: bool
- `status`: draft | open | paused | closed | archived
- `tier`: economy | standard | premium | luxury

---

## 4. Calendar (announced dates, capacity 30)

### Data (already exists)
- `group_departures`: departureDate, capacity (default 30), bookedSeats,
  price (seasonal override), bookingFee (advance), status, + new `packageId`,
  `departureCity`.
- `seat_bookings`: departureId, clientId, status
  (held | reserved | confirmed | waitlist | cancelled), + new `advancePaid`,
  `reservedUntil`, `balancePaid`, `advancePaymentId`, `balancePaymentId`,
  `createdAt`, `updatedAt`.

### Availability
- `available = capacity − bookedSeats`; `fillPct = bookedSeats / capacity`.
- **Self-heal** (no cron): held (advance unpaid) expires after 24h; reserved
  expires at `reservedUntil` (72h). Expired → cancelled + bookedSeats−1.
  Runs lazily on calendar/my-bookings reads.

### Surfaces
| Surface | View | Actions |
|---|---|---|
| Staff desk | Month grid, all departures | Announce date (capacity 30), manifest, cancel, release hold, confirm office balance |
| Client portal (post-login) | Future open departures, available/filled per date | Book → ₹500 advance → tracker |
| Partner portal | Future open departures, availability | "Refer for this date" → /go link (click-tracked) |

---

## 5. Booking Model (₹500 advance → 3-day hold)

1. Client (token-auth) books a seat on an announced date.
   - Creates `seat_bookings` status **held**; `bookedSeats+1` immediately
     (prevents oversell).
   - Creates Razorpay **order** for `advanceFeePaise` (₹500).
   - Response tells the client: advance is **non-refundable**, seat reserved
     for **3 days** once paid, balance due = retail − advance (online or office).
2. Client pays → `verify-advance` (Razorpay signature HMAC-SHA256):
   - status → **reserved**, `advancePaid=true`, `reservedUntil = now + 72h`.
   - Payments ledger entry (method `online`), staff alert, audit.
3. Balance:
   - **Online**: `pay-balance` (Razorpay order for balance) → `verify-balance`
     → status **confirmed**, `balancePaid=true`, ledger + alert + audit.
   - **Office**: staff `confirm-office` (cash/UPI/bank) → confirmed + ledger.
4. Expiry: held > 24h unpaid → auto-release; reserved past 72h → auto-release.
   Full departure → **waitlist** (no payment; staff contacts when seat opens).

### Razorpay pattern (mirrors Manpower membership)
- `POST /orders` with basic auth (key:secret), amount in paise, receipt,
  notes {clientId, bookingId, departureId, kind}.
- Verify: HMAC-SHA256 over `order_id|payment_id` with `RAZORPAY_KEY_SECRET`,
  timing-safe compare.

---

## 6. Coming Soon Master Switch

- `app_settings` key: **`umrah_inventory_enabled`** (`'true'`/`'false'`).
- Staff: toggle in UmrahPortal Packages tab (Live/Coming Soon pill) →
  `POST /api/umrah/settings` (audited `SETTINGS_UPDATED`).
- Client/partner surfaces compute `comingSoon = !enabled || no open packages`
  and show a Coming Soon state instead of inventory.

---

## 7. Sync Architecture (single source of truth)

```
STAFF INVENTORY (umrah_packages + group_departures)
   │  status='open' AND umrah_inventory_enabled='true'
   ├──► CLIENT PORTAL  (browse → detail → calendar → book → tracker)
   └──► PARTNER PORTAL (catalog + /go affiliate links + commissions)
```

- Partner catalog: `partnerLinks.catalogType` now includes `umrah_package`
  (migration) + fixed `departure` entry (real columns + availability).
- `goRedirect` VALID map now includes `visa` and `umrah_package` (fixed a
  pre-existing bug where visa links 400'd).
- Partners see availability but **cannot book** — they refer; the client books
  (keeps commissions clean).

---

## 8. API Surface

### Staff (`/api/umrah`, RBAC counselor+)
| Method | Path | Purpose |
|---|---|---|
| GET | `/packages` | All packages + departure counts + fill stats |
| POST | `/packages` | Create package (zod) |
| GET | `/packages/:id` | Detail + departures |
| PATCH | `/packages/:id` | Update fields |
| PATCH | `/packages/:id/status` | Lifecycle draft/open/paused/closed/archived |
| POST | `/packages/:id/departures` | Announce date (capacity 30, price/advance inherit) |
| GET | `/departures/calendar?month=YYYY-MM` | Availability per date (self-heals) |
| GET | `/settings` | umrah_inventory_enabled |
| POST | `/settings` | Toggle Live/Coming Soon (audited) |
| POST | `/bookings/:id/confirm-office` | Balance settled at office (ledger + alert) |
| POST | `/bookings/:id/release` | Release hold/reservation |

### Client portal (`/api/public/portal/umrah`, token-auth, Turnstile on book)
| Method | Path | Purpose |
|---|---|---|
| GET | `/packages` | Open packages (Coming Soon gate) |
| GET | `/packages/:id` | Detail + open departures |
| GET | `/calendar` | Future open departures + availability |
| POST | `/departures/:id/book` | Held booking + ₹500 Razorpay order |
| POST | `/bookings/:id/verify-advance` | Signature verify → reserved 3 days |
| POST | `/bookings/:id/pay-balance` | Razorpay order for balance |
| POST | `/bookings/:id/verify-balance` | Verify → confirmed |
| GET | `/my-bookings?token=` | Tracker (status, reservedUntil, balance due) |

### Partner (`/api/public/partners` + `/api/public/catalog`)
- Catalog `type=departure` fixed (real columns + availability).
- Catalog `type=umrah_package` added (open packages, retail price, meta).
- `linkSchema` enum includes `umrah_package`; `/go/:ref/umrah_package/:id`
  redirects to `/umrah-travel?ref=...` with click tracking.

---

## 9. Frontend Plan

### New: `apps/app/src/components/UmrahCalendar.tsx` (reusable)
- Month grid, prev/next; each cell: date, fill bar (X/30), status chip
  (Open / Full / Waitlist / Confirmed / Cancelled).
- Modes: `staff` | `client` | `partner` (different click actions).

### `apps/app/src/pages/divisions/UmrahPortal.tsx` (staff)
- New **Packages** tab: rich package form (grouped sections: Flight / Makkah
  Hotel / Madinah Hotel / Visa / Transport / Pricing / Content), lifecycle
  actions, featured toggle, **Live/Coming Soon master switch**.
- Departure Inventory becomes calendar-driven (announce dates, capacity 30).
- Manifest + checklist (existing) + office balance confirm + release actions.

### `apps/app/src/pages/ClientPortal.tsx` (client)
- New **Umrah** tab (portalTab `'umrah'`): Coming Soon state when disabled;
  package cards → detail drawer (all fields) → calendar with availability →
  Book (₹500 advance, non-refundable, 3-day hold notice) → Razorpay checkout →
  tracker (My Bookings: reserved-until, balance due, pay online / pay at office).

### `apps/app/src/pages/PartnerDashboard.tsx` (partner)
- Umrah availability calendar + "Refer for this date" → creates partnerLink →
  shows `/go/:ref/departure/:id` link.

---

## 10. Implementation Status

### ✅ Done
- Schema: `umrah_packages` (55 cols), `group_departures.packageId/departureCity`,
  `seat_bookings` advance fields, `partnerLinks` enum + `payments.method` 'online'.
- Migration `0050_dusty_lady_bullseye.sql` generated + applied to local D1.
- Shared validation: `createUmrahPackageSchema`, `updateUmrahPackageSchema`,
  `bookUmrahSlotSchema`, `verifyUmrahAdvanceSchema`, `payUmrahBalanceSchema`,
  `confirmUmrahOfficeSchema` (+ extended `createDepartureSchema`).
- Staff routes in `umrah.ts`: packages CRUD/status, per-package departures,
  calendar, settings toggle, confirm-office, release, self-heal helper.
- Client portal: `apps/api/src/routes/portalUmrah.ts` (full booking flow).
- Partner: catalog fixed + `umrah_package` type; `goRedirect` VALID map fixed.
- `index.ts`: portalUmrah mounted + Turnstile on book route.

### ⚠️ Known issue (fix before continuing)
- `apps/api/src/routes/umrah.ts` around the legacy `POST /departures/:id/book`
  handler: the `seat_bookings` insert was edited with corrupted text
  (`updatedAt: nowTs nowTs` on line ~425). **Must be repaired** — the correct
  line is `updatedAt: nowTs`. Typecheck currently fails on:
  1. that corrupted line,
  2. `payments.method` enum (fixed in schema — needs migration regen),
  3. legacy book insert missing `updatedAt` (partially applied).

### ⏳ Pending
- Regenerate migration for `payments.method` 'online' + apply.
- Fix corrupted `umrah.ts` line; re-run `pnpm --filter api typecheck`.
- Frontend: UmrahCalendar, UmrahPortal Packages tab, ClientPortal Umrah tab,
  PartnerDashboard calendar.
- Tests: `umrahPackages.test.ts`, `umrahPortalBooking.test.ts`.
- Verify: `pnpm typecheck` → `pnpm test` → `pnpm --filter app build` →
  live e2e + UI smoke against dev servers (API :8787, app :5173).

---

## 11. Open Decisions / Notes

- **Deposit model**: user chose ₹500 non-refundable advance → 3-day hold
  (72h — matches industry norm). Balance online or at office.
- **Waitlist**: no payment; staff contacts when a seat opens (existing
  behavior preserved).
- **Wholesale price** is owner-only visibility (margin tracking); never shown
  to clients/partners.
- **Guide language**: include Telugu (Nizamabad, Telangana market).
- **Seasonality**: per-departure `price`/`bookingFee` override (Ramadan).


---

## 12. Completed Features (2026-08-14)

### ✅ All planned features shipped + verified
1. **Rich package inventory** — 55-field catalog (flight, hotels, visa, transport,
   duration, pricing, content) with wholesale/retail/advance pricing.
2. **Calendar** — capacity-30 groups, announced dates, fill bars, tier labels,
   staff/client/partner surfaces.
3. **₹500 advance → 3-day hold** — Razorpay order + HMAC verify, balance online
   or at office, self-healing holds (24h/72h).
4. **Coming Soon switch** — `umrah_inventory_enabled` in app_settings.
5. **Sync** — single source of truth: staff → client → partner catalog.
6. **Trip range (start → end date)** — announce a multi-day trip; calendar
   renders it across all cells with "↔ trip" indicator (migration 0051).
7. **Solo travel** — `soloAvailable` + `soloSupplementPaise` per package;
   client chooses Shared/Solo at booking; balance includes supplement;
   manifest shows occupancy (migration 0052).
8. **Privacy** — clients see only aggregate fill counts; manifest is staff-only.

### Verification
- `pnpm typecheck` — all 3 workspaces green
- `pnpm test` — **369 tests** (68 files)
- `pnpm --filter app build` — succeeds
- Live e2e smoke — all endpoints exercised; headless browser renders verified
- Dev servers: API :8787, app :5173

### Notes
- Commission plans now support `umrah_package` + `visa` catalog types.
- Partner catalog `departure` entry fixed (real columns + availability).
- `/go` redirect supports `visa` + `umrah_package`.

---

## 13. Family & Group (Party) Booking — COMPLETE (2026-08-14)

**Problem:** the original model was strictly 1 booking = 1 seat = 1 client — a family
of 4 could not book together (4 tokens, 4 advances, 4 unlinked manifest rows).

**Research (gold standard, 2026):** IKHLAS / BookMyUmrahTrip (Indian market),
WauHub, Zam Zam Travels, airline group-booking (Altexsoft/Spotnana):
- Passenger categories: **Adult (18+) · Child with Bed (2–11) · Child no Bed (2–4) · Infant (0–2, airfare-only)**; ≥1 adult per party; child with 1 adult = adult rate.
- **Booking = party**: one payer/contact + N passenger records; per-passenger readiness ("one missing passport holds the group"); printable passenger lists.
- **Deposit first, names later** — advance per person; names can be added before ticketing.
- Room types Single/Double/Triple/Quad; per-person price varies by occupancy; family of 4 = quad or two doubles.
- Group discounts by volume (20+ pax → 5–8%).

**What was built:**
1. **`booking_passengers` table** (migration 0053): id, bookingId, name, dob, passportNumber, category, specialNeeds. Passport stored plaintext in D1 but **masked at the API boundary** (`lib/umrahParty.ts` `maskPassport` — first 2 + last 2).
2. **`seat_bookings` += `paxCount` (default 1), `roomConfig`** (single/double/triple/quad, advisory).
3. **`umrah_packages` += `childWithBedPricePaise` / `childNoBedPricePaise` / `infantPricePaise`** (nullable → fallback to adult retail = safe, no accidental discounts).
4. **Pricing engine** `apps/api/src/lib/umrahParty.ts` `computePartyPrice()`: per-person by category + solo supplement (only pax=1 & solo) + **group discount finally wired** (`groupDiscountPct` when pax ≥ `groupDiscountMinPax` — fields existed unused since Phase 3).
5. **Capacity**: `bookedSeats += paxCount` (all pax count — conservative, no oversell); self-heal release decrements by paxCount.
6. **Advance**: `pax × bookingFee` (₹500 × 4 = ₹2,000) — one Razorpay order per party; ledger entry at pax × fee.
7. **Waitlist**: whole party waitlisted when available < pax (no payment, no seat increment).
8. **Validation** (`bookUmrahSlotSchema`): passengers 1–30, ≥1 adult, name ≥2 chars; `roomConfig` enum.
9. **Surfaces**: client booking modal = party stepper (adults/children/infants) + name rows + room preference + live price summary; tracker shows party + per-person breakdown + group discount; staff manifest lists every passenger per booking + pax badge + CSV export with travellers column; staff package form has child/infant price fields.

**Verification:** `pnpm typecheck` green (3 workspaces) · `pnpm test` **379 tests** (69 files, +10 new family-booking tests) · app build ✓ · migration 0053 applied to local D1.

**Notes / decisions:**
- Passport optional at booking ("names later" norm) — staff completes via manifest.
- `roomConfig` is advisory (hotel confirms final rooming) — pricing is per person, not per room, so the "full-occupancy" pricing rule doesn't apply.
- Infants count toward capacity (conservative; they still need visa processing).
- Child prices unset → adult rate (owner should set real values per package).
