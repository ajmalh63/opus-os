# Manpower — White-Collar First + Employer Hire Hub — Design (v1)

**Date:** 2026-08-27  
**Scope:** `/manpower` Candidate Hub (white-collar rebalance) → **new** `/manpower/hire` Employer Hub (hire-talent)  
**Skills loaded:** `hr-pro` + `product-manager` + `frontend-design` + `design-system` + `api-design-principles` + `backend-architect` + `CRO`  
**Research:** CodeDrips/Rudo/Passionate/Shazamme/Boostie/Wave + TestGorilla/Discovered.ai white vs blue (2024)

---

## 1. Research — Gold Standard

**Dual-audience fork (Rudo, CodeDrips):** Homepage must split `Find Jobs` vs `Hire Talent` above the fold with two CTAs. Each hub then speaks only to its audience. `Contact` is *not* an employer funnel — it’s lowest intent.

**Employer form that converts (formformform, ATZ, Covenant HR, US Tech Automations 2026):**

| Field | Why | Required? |
|---|---|---|
| Company, Contact, Work Email, Phone | Routing + trust | Yes |
| Industry (Healthcare/IT/Engineering/Oil&Gas/Finance/Hospitality) | Routes to vertical recruiter | Yes |
| Position Type (IT/Healthcare/Engineering/Finance/Multiple) | Immediate needs assessment | Yes |
| Number of Positions | Scope | Yes |
| Urgency (Immediate / 2-4w / 1-3m / 3m+) | Prioritization | Yes |
| Engagement Type (Direct Hire / Contract / Temp-to-Hire) | Delivery model | Yes |
| Pay/Salary Range (select, not free text) | Qualifies budget before call, prevents wasted sourcing | Yes (select) |
| Job Description (free text) + JD upload | Context in employer's language | Yes (free text) |
| Decision-maker + Feedback SLA | Who approves offers, how fast feedback | Optional but flagged if missing |

**White vs Blue (TestGorilla 2024):** White-collar = online, LinkedIn, intensive 2-3 interviews, 42-day cycle, brand + growth + soft skills. Blue-collar = local boards, referral, 25-day cycle. Skills-based hiring reduces mis-hires 50%. Implication: `Manpower Services` board must be **60% white / 40% blue on first paint** (IT/Finance/Healthcare/Engineering first), blue below fold, with white-collar perks (`Family Visa + Hybrid + Career Growth`) not `Food Allowance`.

---

## 2. Current Audit — `/manpower`

- `SECTORS 5` → IT buried in `Manufacturing & Tech`
- `FALLBACK_JOBS 5` → 3 white /2 blue, but **perceived blue** (CNC + Chef are most tactile)
- API seed (30 jobs) → 80% blue (Welder, Electrician, Plumber) → homepage `Live Board` bleeds blue
- No dedicated employer hub — `Contact → manpower` is fallback

---

## 3. Target Design

### A. Candidate Hub (`/manpower` — white-collar-first premium board)

**Sectors (7 + All, alias `Manufacturing & Tech` kept):**
`All | IT & Software | Healthcare | Engineering & Construction | Oil & Gas / Energy | Manufacturing & Tech | Finance & Business | Hospitality & Aviation`

**Fallback 8 (6 white / 2 blue, first paint white):**
1. Full Stack Developer (React/Node) — Dubai — IT & Software — BE/B.Tech, React/Node, 3y — `Family Visa + Hybrid + Career Growth`
2. Cloud DevOps Engineer (AWS) — Germany EU FastTrack — B.Tech AWS/Docker — `Blue Card + Pension + PR Path`
3. ICU Nurse — Saudi — Healthcare — B.Sc + Prometric — `Housing + Paid Leave + Licensing`
4. Senior Structural Engineer — UAE — Engineering — B.Tech Civil, 5y — `Family Accommodation + Return Tickets`
5. Finance & Accounts Manager (CA) — Qatar — Finance & Business — CA/MBA, GCC VAT — `Family Status + Bonus`
6. Data Analyst Power BI — Saudi — Finance & Business — B.Com/BBA SQL — `Hybrid + Family Insurance`
7. HVAC Supervisor — Qatar — Oil & Gas — Diploma Mechanical — `Transport + Bonus`
8. CNC Programmer — Germany — Manufacturing & Tech — G-code — `EU Permit + Pension`

**Visual:** Hero stays `Verified Overseas Contracts` but add `Featured Roles` 6 cards **above fold** (white first), salary stays `Available in Candidate Desk` (🔒 policy), sector pills `All` pre-selected.

### B. Employer Hub (`/manpower/hire` — new, canonical for SEO `hire indian talent`, `manpower agency for employers`)

**IA (gold standard fork):**
- Homepage Hero: dual CTA `Browse Verified Openings` (candidate) vs `Hire Talent — 21 Days` (employer, primary for B2B)
- `/manpower` top: sticky segmented control `For Candidates | For Employers` → `For Employers` pushes to `/manpower/hire`
- Nav: `Manpower ▾` → `Find Jobs` + `Hire Talent`
- `/contact` keeps `Manpower Demand` option as safety net only

**Employer Hub content (Shazamme checklist):**
- Hero `Hire Verified Indian Talent in 21 Days — POE/GAMCA Compliant, Zero Advance from Candidates`
- 3 proof cards `Time-to-shortlist 7 days | Retention 12mo | 40+ GCC clients`
- Sector pages filtered live jobs (IT/Healthcare/Eng)
- Consultant profile + `How we work: Trade Test → Interview → POE`
- Form (see fields above) → `POST /api/public/employer-demands`
- Trust: `MEA Licensed | POE clearance | GAMCA`

**Data model (`employer_demands`):**
`id, companyName, contactName, workEmail, phone, industry, positionType, numberOfPositions, urgency, engagementType, payRange, jobDescription, jdFileKey, decisionMaker, status(draft/qualified/active/closed), createdAt`

---

## 4. Alternatives Considered

| Option | Description | Trade-off |
|---|---|---|
| **A. Separate Hub `/manpower/hire`** (recommended) | Standalone employer page with own SEO, form, case studies | **Pros:** Ranks for `hire` intent, dedicated funnel, clean analytics. **Cons:** One new route. |
| **B. Integrated toggle inside `/manpower`** | Tabs `Find Jobs | Hire Talent` on same page | **Pros:** No new route. **Cons:** Dilutes candidate SEO, employer scrolls past jobs. |
| **C. Modal in `/manpower`** | `For Employers` button opens modal form | **Pros:** Minimal code. **Cons:** No SEO, no shareable URL for LinkedIn Ads. |

**Decision:** **A for production, with B as bridge** — ship `A` now, keep `B`'s sticky control on `/manpower` that deep-links to `/manpower/hire` (both benefit).

---

## 5. API & Sync

- `POST /api/public/employer-demands` (public, Turnstile + rateLimit 60/min, `X-Portal-Token` optional) — Zod validates 8 required fields, `payRange` enum, `urgency` enum.
- `GET /api/employer-demands` (staff: `manager+`) — Kanban lane `Employer Demand`
- `PATCH /api/employer-demands/:id/status` — `qualified → active → closed`
- `waOutbox` alert to staff on create (`staff:global:manpower`)
- `SyncHub` `staff:global:manpower:employer` + `departure:*:inventory` already used

---

## 6. Rollout

- **P0 (this PR):** Update `/manpower` sectors + 8 fallback, add sticky `For Candidates | For Employers` toggle, keep `/manpower/hire` as 302 to `/contact` until built.
- **P1 (next PR):** Ship `EmployerHirePage.tsx` + `employerDemands` table/migration + API + Kanban lane + `waOutbox`.
- **P2:** Seed white-collar jobs in `seed.ts` to rebalance API 50/50, then LinkedIn Ads `hire indian nurses/developers` → `/manpower/hire`.

**Metrics:** `white vs blue application ratio` (target 60/40), `Employer form → qualified` (target 70%), `Time-to-shortlist` (target 7d).

---

**Ready for build?** If yes, I’ll ship **P0** now (sectors + 8 jobs + toggle) and queue **P1** `Hire Hub` as next PR.
