# Mobile Optimization — Opus OS (2026-08-19)

**Scope:** client portal, partner portal, public pages, shared components, global
infrastructure. **Method:** 4 parallel agents (ClientPortal / PartnerDashboard /
Public+Shared / Global infra) after researching 2026 gold-standard practices
(WCAG 2.2 touch targets, Apple 44pt, Material 48dp, thumb-zone CTAs, bottom-nav
patterns, fluid grids, iOS zoom prevention). **Constraint honored:** UI-only,
additive classes — zero data/API/state changes; desktop pixel-identical via
`sm:`/`md:` resets. **Verified:** typecheck (3 workspaces) + build + 605 tests green.

---

## 1. Client portal (`ClientPortal.tsx`) — 43 touch targets fixed
- Root `overflow-hidden` → `overflow-x-hidden` (vertical scroll preserved)
- **43 buttons/links** raised to ≥44px (`min-h-[44px]`): portal tabs, uploads,
  pay CTAs, visa wizard, agreement sign, OTP, gender/option pills, nav pills
- **Form inputs** ≥44px: claim token/phone, lookup, checkout, inquiry, manpower
  wizard, typed-name + OTP
- Header `px-8` → `px-4 sm:px-8` + `flex-wrap` (no clipping at 360px)
- 10 manpower form grids + wizard grids → `grid-cols-1 sm:grid-cols-2/3`
- Tables verified already inside `overflow-x-auto` wrappers ✓

## 2. Partner portal (`PartnerDashboard.tsx`) — 19 touch targets fixed
- Hero padding `pt-28` → `pt-24 md:pt-28` (fixed pill-nav overlap on mobile)
- Shared `baseInput`/`goldBtn`/`navyBtn` constants → `min-h-[44px]` (covers all
  KYC/login/search/payout inputs + primary buttons)
- Copy-link / WhatsApp / QR / catalog CTAs → ≥44px
- Referral card: `min-w-0` + `truncate` + `break-all` (UUID overflow fix)
- Tables already `overflow-x-auto`; all 16 grids have mobile bases ✓

## 3. Public + shared surfaces — 60+ touch targets, 3 structural fixes
- **Nav**: hamburger 40→44px (drawer items already 52px)
- **Footer**: explicit `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` + 44px links
- **StickyCallBar**: chat circle 32→44px; mobile CTA (Free Eligibility Check →
  funnel modal) confirmed always visible
- **BookingModal**: close 44×44, slot chips + inputs 44px, submit 48px
- **FunnelModal**: `m-auto` (fixes top-clipping on small screens), tabs/selects
  44px, **action row stacks full-width on mobile** (thumb-zone CTAs)
- **TurnstileWidget**: `size: 'flexible'` (no 300px overflow at 320px)
- **PublicLeadForm** (conversion surface): card padding `p-5 md:p-8`, all inputs
  44px, submit 48px full-width, quick-profile grid stacks, toast capped
- **Login/Signup**: inputs already 48px ✓; show/hide + method tabs + track-token
  44px; banner/remember/badges `flex-wrap`
- **Division pages**: hero CTAs verified 44px; matcher/search/apply CTAs +44px;
  visa tracking form `min-w-0` (flex overflow fix)

## 4. Global infrastructure
- **index.css safety net** (additive): `-webkit-text-size-adjust`, images/video/
  svg `max-width:100%`, table `max-width`, **16px form controls (kills iOS
  zoom-on-focus)**, touch scrolling under 767px
- **index.html**: `viewport-fit=cover` added
- **82 grid fixes across 37 files** — every `grid-cols-N` without a mobile base
  now has `grid-cols-1` first (desktop identical via preserved breakpoints)
- **6 tables** wrapped in `overflow-x-auto` (GrowthTab, RolesTab, SecurityLogs,
  ClientsList, AdminConsole, UmrahPortal)
- Fixed-width modals/inputs verified safe (capped or inside scroll containers)

## 5. Desktop safety verification
- All changes additive (`sm:`/`md:` variants lock desktop ≥640px)
- Zero changes to fetch/API/state/props/routing (grep-verified against the diff)
- Typecheck (3 workspaces) + `vite build` + **605 API tests** all green