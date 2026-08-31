# Opus OS — 10/10 North Star

## Problem Statement
**How might we make Opus OS the only OS a Hyderabad consultancy needs to run 5 divisions (Study Abroad, Visa, Tours/Umrah, Attestation, Manpower) from one D1 database — where a lead becomes a student, visa case, attested doc, deployed worker, and pilgrim without ever leaving Opus, and where clients/partners see the same truth as staff, instantly?**

Today Opus is 9.3/10: functionally complete (99 tables, 730 tests, 3 workspaces, 5 divisions, RBAC 87 points, hash-chain audit), shippable to enterprise. The 0.7 gap is not CRUD — it is **AI autopilot (90% typing eliminated), network effects (employers × agencies × candidates × universities on one graph), and trust as a feature (audit + per-customer encryption that wins DDQs).**

## Recommended Direction

**One narrative, 3 unlocks:**

1. **Staff-Level AI Autopilot (not client self-service)** — The agent processes the student's application. Client uploads are minimal (photo, signature); **OCR, MRZ, and validation run at staff level on the docs the agent uploads/ingests**. This respects your operating model: *we are the processors*. AI handles 90% of typing (passport MRZ → D1 fields, bank statement → financial proof, rejection guard → 50+ checks), the counselor handles judgment. Result: 4-6hr case → 90min, 3× capacity without headcount (Wincora benchmark).

2. **Governed Knowledge + Supervised Automation** — Visa requirements are versioned, AI-researched + specialist-approved, per-case snapshot with replayable trace (Intelligence Engine). Embassy portals with no API are filed by a supervised browser bot (Automation Engine) with live view + human handoff. Manpower gets 6 country workflows (Qatar QVC, UAE MOHRE, KSA Wakala/Wafid, etc.) with per-customer KMS and blind-bridge privacy.

3. **Trust as a Product** — Append-only audit, per-customer encryption, SLA that enterprises can put in a contract, QR blockchain proof for attestation, and GEO (llms.txt/sitemap/prerender) so AI answers cite Opus.

**Why this wins:** Ticlick/EduCtrl, Wincora, HireStream/Mahad all converge on the same insight — *the moat is not another pipeline column, it is governed knowledge + automation + privacy that competitors cannot copy in a sprint*.

## Key Assumptions to Validate
- [ ] **Staff OCR is 10× more accurate than client OCR** — because agents control scan quality (lighting, crop, DPI). Test: 100 passports scanned client-side vs staff-side; measure field accuracy and embassy rejection rate. Owner already mandates staff-level.
- [ ] **Versioned visa rules reduce rejections by 40%** — assume most rejections are stale rules, not staff error. Test: snapshot rules at case creation vs re-validate on submit; track reject delta.
- [ ] **Blind-bridge privacy unlocks employer demand** — employers will post more MPRs if their rate is not leaked to agencies. Test: 10 employers, A/B with/without blind flag; measure MPR volume.
- [ ] **Wallet + instant partner payout (Stripe Connect) 2× partner retention** — assume payout speed is top churn driver. Test: Net Promoter survey on payout.

## MVP Scope (Next 30 Days — 5 Bets, <5 effort each)

**In scope (RICE >200):**
- **OCR Staff Workbench** — passport MRZ (190+ formats), auto-crop/face check, 3-layer entropy, Tesseract MRZ, multilingual keyword match; staff sees “2/4 signals pass → manual review” (no client sees this)
- **Rejection Safeguard (50 checks)** — passport 6-month, funds, insurance, photo spec before submit
- **Blind-Bridge Privacy** — Opus routes MPR/candidate without revealing employer rate to agency or agency bank to employer
- **Per-Customer KMS + Wallet** — per-customer encryption key for vault; prepaid wallet (top-up once, spend on AI credits/per-app fees)
- **5-Factor AI Scoring + Revenue Dash** — skills/similarity/exp/language/certs → A/B/C on candidate card; time-to-deployment + by-stage conversion

**Out of MVP:** Embassy browser bot (needs Playwright farm), conversational applications, dynamic Umrah packaging, QR blockchain — next 60 days.

## Not Doing (and Why)
- **Client-side OCR / self-serve document AI** — Violates staffing model; clients would upload cat photos and get auto-approval, staff would still re-check. Staff-level is correct for Hyderabad consultancy.
- **Live university admissions API (Adventus-style marketplace)** — Partner tools already hold realtime; Opus snapshot model is correct. Don’t rebuild; just add RAG over existing `universityJson`.
- **Phone/SMS OTP as primary** — NIST restricted; keep TOTP/WebAuthn as AAL2, email OTP as AAL1 alternate only.
- **Monolithic vendor chunk** — Already fixed (vendor isolation, cache-hit 89%); don’t re-monolith.

## Open Questions
- Which 3 destination countries for first country-workflow template (suggest: UAE, Saudi, Qatar — 70% of manpower volume)?
- Wallet: Stripe Connect vs RazorpayX — which payout rail does finance want?
- Should OCR run on-device (WASM) or Workers AI (embeddings) for 190 MRZ formats?

---
*Source: product-manager RICE/Kano, idea-refine divergent lenses, web research Ticlick/HEIapply, Wincora/Visavior/Propellus, HireStream/Mahad/OnboardOS — 2026-08-30. Owner constraint: OCR staff-level only.*
