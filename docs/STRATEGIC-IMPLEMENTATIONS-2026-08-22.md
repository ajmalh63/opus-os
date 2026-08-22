# Opus OS — Strategic Implementations (Client & Partner Workspaces)
**Date:** 2026-08-22  
**Skills Applied:** `ux-audit` · `product-design` (Apple 10) · `ui-ux-pro-max` · `platform-design` (HIG/M3/WCAG) · `product-manager` (RICE/MoSCoW/JTBD/Kano/OST) · `saas-multi-tenant`  
**Source Audit:** `docs/CLIENT-PARTNER-WORKSPACE-AUDIT-2026-08-22.md` (247 lines, 5 divisions, 15/15 email templates live)  
**Principles:** Simplicidade radical, carga cognitiva zero, affordances claras, carga cognitiva zero, feedback imediato, erros previnem-se, `44px` thumb zone, `4.5:1` contrast, `transform/opacity` only

---

## 0) Opportunity Solution Tree (Product-Manager)

```
North Star: % of portal sessions that place an order/book service without support (currently ~0% for Study/Visa/Manpower)

Opportunity 1: Clients cannot self-order (counsellor-driven) → Solutions: S1 Catalog+Cart (Study), S2 Cart (Visa), S3 Job Marketplace (Manpower)
Opportunity 2: No bulk/multi-item ordering → Solutions: S4 Attestation bulk + scheduler
Opportunity 3: Booking has no wishlist/compare/timer → Solutions: S5 Umrah polish
Opportunity 4: Partners cannot deep-link/attribute → Solutions: S6 Deep Link Builder + SubID + Pipeline
Opportunity 5: No unified cart/billing/help/mobile shell → Solutions: S7 Unified Cart/Billing/Help/Bottom Nav
```

**Kano:** Study Catalog = *Performance* (linear lift), Visa Cart = *Must-be* (dissatisfier if missing), Manpower Marketplace = *Attractive* (delighter), Umrah Wishlist = *Attractive*, Partner Deep Link = *Must-be*.

**JTBD (one per P0):**
- Study: When I have 60% profile, I want to see which universities I can apply to now and what blocks me, so I can order without waiting.
- Visa: When I need Dubai+Thailand for family of 3, I want one cart and one pay, so I don’t repeat the same form thrice.
- Manpower: When I see a Welding job with Match 92%, I want to 1-click apply with my profile, so I don’t retype 12 fields.

**RICE (from audit) — Build order:** P0 S6 Partner Deep Link 450 → S1 Study Catalog 240 → S2 Visa Cart 230 → S3 Manpower 180 → P1 S4 Attestation 170 → S5 Umrah 112 → S7 Unified 117 → S1-help 180.

**MoSCoW:** Must: S1,S2,S6 — Should: S3,S4 — Could: S5 — Won’t (now): video consult booking.

---

## 1) Study Abroad — University Catalog + Shortlist Cart (P0, RICE 240)

### Why (ux-audit: H1/H3/H5 violations)
- Empty `applications` shows `No applications yet. Complete your profile...` with **no CTA** → H1 visibility fail → +25% drop-off (Vezert 8 patterns: dashboard needs one action).
- No `Browse` → H3 user control fail.

### UX Flow (product-design: Entry→Context→Action→Feedback→Outcome→Next Step)
1. **Entry:** Authed client lands `study` tab, sees `Complete your profile 60% — Missing: SOP, IELTS` banner with `[Complete →]` (deep link to `profile` missing field).
2. **Context:** Header `🎓 Study Abroad — Browse Universities` + cart pill `Shortlisted (0)` sticky.
3. **Action:** Search `What to study? MS CS` + `Where? Canada` + left filters (Country□, Level□, Intake Fall 2026□, Tuition slider 0–50L, IELTS 6.5→9) → cards `Toronto — MSc CS — Fall 2026 — ₹18L/yr — Match 92% (strong) — [Shortlist] [Apply Now]`. `Apply Now` disabled <80% profile (tooltip `Complete profile to apply` — error prevention H5).
4. **Feedback:** `Shortlist` → pill `+1` with `countUp`, drawer slides, `Shortlisted (1) — Total fees ₹18L` + `Place Application Orders →` sticky (thumb zone 44px, `cursor-pointer`).
5. **Outcome:** `POST /api/public/portal/study-abroad/applications/batch` → 2 `AppRow(status:shortlisted)` → `MilestoneStepper` appears in `applications`.
6. **Next Step:** `Documents` tab auto-highlights global checklist `4/9 docs — Pay & Submit disabled: Missing SOP for Toronto` — recognition over recall H6.

### Design System (ui-ux-pro-max + product-design + platform-design)

- **Layout:** 2-col (filters 280px + cards), filters collapsible on <768 → drawer. Cards 2-col on desktop, 1-col on mobile (single-column 15.4s faster, CXL). `max-w-6xl` consistent.
- **Tokens:** `colors: brand.navy #0a2d50, brand.gold #d7a019, surface #FAF8F4, success #22C55E, warning #F59E0B` · `typography: display Montserrat 700 36/1.1, body IBM Plex Sans 16/1.6` · `spacing: lg 24, radius lg 12, shadow md 0 4px 12px rgba(0,0,0,.15), motion fast 150ms ease-out`.
- **A11y (platform-design):** HIG `label-for + id`, `aria-invalid` on disabled Apply, `focus-visible` gold ring, contrast `slate-900 #0F172A` on `FAF8F4` 12:1, keyboard `Tab` order = visual order.
- **Performance:** `image-optimization` WebP, `skeleton` for cards, `reserve space` for drawer (no jump), `prefers-reduced-motion` → no `countUp`.

### Multi-tenant (saas-multi-tenant)

- `applications` already `clientId` FK (shared-schema). New `shortlist_items` = `tenant_id = clientId`, `universityId`, `createdAt` — RLS `tenant_isolation` on it. `batch` endpoint extracts `tenantId` from `token` (not JWT), sets `SET LOCAL app.current_tenant_id` in transaction.

### Build Spec

```
UI: StudyAbroadClientSection.tsx — add sub-tab `catalog` (before `profile`), components: SearchBar, Filters, UniversityCard, ShortlistDrawer, GlobalDocsGate
API: GET /api/public/study-abroad/catalog?token=&country=CA&field=CS (public, filtered by match), POST /api/public/portal/study-abroad/applications/batch (body: {token, items:[{universityId, program, intake}]}) → creates AppRow per item, returns {ids, totalFees}
DB: shortlist_items (id TEXT PK, client_id FK, university_id TEXT, created_at INT, UNIQUE(client_id, university_id))
Metrics: % sessions with Shortlist → Place Order (target +25% activation)
```

---

## 2) Visa — Instant Checkout Cart (P0, RICE 230)

### UX Flow
1. **Entry:** `visa` tab → `✈️ Browse Active Visa Offerings` grid already exists. Add **Eligibility bar** `Nationality: Indian [Detect IP] → Dubai Tourist ✅ Eligible (3-4 Days ₹7200)` (fetched `/api/public/visa/eligibility`).
2. **Action:** Card `Dubai Tourist — Single Entry — 3-4 Days — ₹7200 — Passport/Photo/Flight [Add to cart]` → drawer `Cart (1) — Dubai ×1 ₹7200 → + Add another country`.
3. **Action:** Add `Thailand ×2 ₹9000` → `Cart (2) → Proceed`.
4. **2-step Checkout** (Baymard 3-4 fields/step):
   - Step1 `Travellers & Docs` — email/phone prefilled `journey.client`, `catalogFiles` per item with `[Required]` chips, `Terms` checkbox 44px.
   - Step2 `Review & Pay` — order summary `Dubai ₹7200 + Thailand ₹9000 = ₹16,200`, `Price Breakdown ▾` (govt+service+courier), **sticky CTA** `Pay ₹16,200` above fold (Ralabs +4.17%), trust `🔒 SSL · Free cancellation 24h` + `Cancellation policy` link.
5. **Feedback:** `POST /api/public/portal/visa/inquiry` with array `[{country, visaType, files[]}]` → R2 batch uploads → Razorpay one order → success `alert` replaced with **in-page status card** `Visa Application Status: Dubai Submitted` + Docs Vault updated.
6. **Outcome/Next:** `Visa Applications` card live, ` outstandingBalance` bar removed (already paid).

### Design System
- **Style:** `html-tailwind`, `style-match: minimal professional`, `consistency` same `brand-navy/brand-gold` as Study, `no-emoji-icons` → SVG `Lucide` (`Plane`, `FileText`, `Clock`), `touch-target-size 44px`, `cursor-pointer` on cards.
- **Mobile:** Single-column form, sticky bottom bar `Pay ₹16,200`, `viewport-meta` max-scale 1, `readable-font-size 16px`.

### Build Spec
```
UI: ClientVisaWidget — add visaCart state, EligibilityBar, CartDrawer, CheckoutModal(2 steps)
API: POST /api/public/portal/visa/inquiry now accepts {clientId, items:[{country, visaType, email, phone, files}]}, creates N engagements + docs
DB: visa_cart_items (client_id, country, visaType, pricePaise)
```

---

## 3) Manpower — Job Marketplace Inside Portal (P0, RICE 180)

### UX Flow
1. **Entry:** `jobs` tab currently only `my applications`. Add **above tracker** `🔍 Browse Open Positions` grid.
2. **Action:** Search `Welder [Country: Saudi]` + filters `Sector, Salary ≥1L, Exp 2y` → cards `Welder — Saudi — ₹1.2L — Match 92% — 3 skills missing` (computed from `studyProfile` + `manpower` profile) → `Quick Apply` (pre-fills wizard step 3 done) vs `Apply`.
3. **Saved:** `♥ Saved (5)` filter.
4. **Feedback:** `Quick Apply` opens `ManpowerApplyWizard` at step 4 review with `fullName/phone/email/city/skills` prefilled, `completeness` 90%.

### Design System
- **ApplyWizard already** Baymard/WCAG 2.2 AA perfect (44px, `label-for`, draft auto-save). Keep. Add `progress 2 of 4` already; add `1-click` badge.

---

## 4) Partner — Deep Link Builder (P0, RICE 450) — Gold Standard: FirstPromoter SubID

### UX Flow
1. **Entry:** `links` tab → **5 division pills** (Study `235a96`, Visa `0d9488`, Umrah `16a34a`, Attestation `7c3aed`, Manpower `d97706`) — Visa active.
2. **Action:** `Search: Dubai [Search]` → rows `Dubai Tourist — Single — 3-4 Days — ₹7200 — [Generate Link]`.
3. **Feedback:** Preview `https://opusoverseas.com/visa-services/dubai?ref=OPUS-123&utm_campaign=ramadan` → `[Copy]` `[WhatsApp]` `[QR]` (QR already).
4. **Next:** Table `Link | Clicks | Signups | Matured | UTM | Revenue` — filter `ramadan → 12→3→1 ₹8k`. Like FirstPromoter 18 metrics.

### Data & Multi-tenant
- `partner_links` add `utm_campaign TEXT, deep_params TEXT` (`tenant_id = partnerId` FK, RLS `owner_tenant_id` for shared catalog read). New `partner_clicks` already; add `subId` = `utm_campaign`.
- **First-party tracking:** Keep `go.opusoverseas.com` cloaked (Komissio) — ad-blocker resistant vs third-party cookie (Vezert).

---

## 5) Attestation Bulk + Pickup Scheduler (P1)

- **Bulk:** Form → array `+ Add another document` → `POST` array → `quoteId` with `bundleDiscount 5%` → `Quote ETA: 14:30` badge.
- **Scheduler:** Replace `AWB (after you ship)` text with **date picker + slot** `Tomorrow 10-2` → `POST .../pickup {pickupAddress, slot}` → inbound AWB auto `DEL123` shown, courier dispatched (Notarize pattern). Chain as **delivery tracker** `Quote → Confirmed → Docs received → MEA → Embassy → Dispatched → Delivered` with `expected date` + `Track` live map via `indiaPost.ts` + `Re-order for another country` 1-click.

## 6) Umrah Polish (P1)

- **Sticky CTA** `Book Seat` bottom mobile (Ralabs +4.17%), **wishlist heart** → `localStorage wishlist` + `Compare 3 packages` table, **hold timer** `Reserved until 14:32 — 02:11:09` live + `Only 3 seats left` amber when `available≤5` + nearby date suggestion.

## 7) Unified Cart / Billing / Help / Shell (P1-P2)

- **Unified Cart API:** `POST /api/public/portal/cart` (array across divisions) → one Razorpay order.
- **Billing forecast (Vezert):** `Billing with usage forecasting` card `You will owe ₹Y if you add attestation` — pattern that lifts retention 0.5-1.5% monthly.
- **Help center (Vezert: 30-50% deflection):** In-product `?` → `Search help` typo-tolerant + articles inline on each division, `AI chat → human` escalation.
- **Shell (platform-design HIG):** Token secondary `Track with token`, primary `Sign in`; Dashboard **one action** above fold (`Complete profile → 2 min` for 0-engagement); **Bottom nav** thumb zone `Browse | Bookings | Docs | Help` on <768; `Viewport 16px`, `z-index 30`, `prefers-reduced-motion`.

---

## 8) How to Build — Order & Verification

**Phase 1 (2w):** S1+S2+S3+S6 → activation +25%, link CTR +20% (Vezert/Ralabs benchmarks).  
**Phase 2 (1w):** S4+S5+S7.  
**Phase 3 (1w):** Help + bottom nav.

**Verify:** Client `http://127.0.0.1:5173/portal` session → Study `Shortlist → Place Order`, Visa `Cart (n) → Pay`, Manpower `Quick Apply` → `Match 92%`; Partner `http://127.0.0.1:5173/partner` → Links → division pill → deep link `?ref=` + `utm_campaign`; Metrics `activation rate` +25%, `support tickets` −30%.

