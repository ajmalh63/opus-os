# OpusOS — Agreement Templates Library + Client Self-Service e-Sign

> **Status:** IMPLEMENTED (2026-08-17) — Phases A/B complete · 553 tests green
> **Basis:** Indian IT Act 2000 §3A/§5 + Evidence Act §65B (electronic signatures legally valid for service agreements) · Dropbox Sign India legality guide · OpenSign/Documenso/Docuseal (open-source e-sign patterns) · ContractClaw 5-requirement signing ceremony

## 1. Research summary — free, legally valid e-sign

| Requirement (IT Act §3A + §65B) | Implementation |
|---|---|
| **Intent to sign** | Client views the FULL agreement content, then an explicit "Sign" action — no auto-signing |
| **Consent to do business electronically** | Mandatory consent checkbox + a clause in every template (G1) |
| **Identity verification** | Client portal token + optional **email OTP** (free; no Aadhaar needed) |
| **Audit trail** | who (name/email) · when (timestamp) · where (IP) · how (method) · document hash (SHA-256) — schema already has all fields |
| **Tamper-evidence** | SHA-256 of content at signing + immutable audit_log row (AGREEMENT_SIGNED) |

**Free methods (all legal):** typed name · drawn signature (canvas) · OTP-verified click. **Aadhaar eSign removed** (paid ₹5-15/sign + not working). Excluded documents (wills/POA/property) don't apply — these are service agreements.

## 2. Agreement stances — template library (seeded, idempotent)

**Clause library (~30 clauses)** — general (8) + per division (4-7 each):

| Division | Templates (2 each) | Key clauses |
|---|---|---|
| **General** | (clauses only, used by all) | G1 Electronic Execution & Consent (mandatory) · G2 Payment Terms & GST · G3 Refund & Cancellation · G4 Force Majeure · G5 Confidentiality & DPDP · G6 Dispute Resolution (Nizamabad jurisdiction) · G7 Limitation of Liability · G8 Entire Agreement |
| **Study Abroad** | Full Service Agreement · Application Processing Only | counselling & application processing · university selection · SOP/document prep · deadlines · offer/deposit handling · study-visa assistance · SA refund policy |
| **Visa** | Visa Processing Service Agreement · Document Assistance Agreement | processing services · document verification · slot booking · fee terms (non-refundable govt fees) · visa refund policy |
| **Umrah** | Package Booking Agreement · Group Departure Terms | package booking terms · advance/balance schedule · cancellation & refund · travel/insurance disclaimer |
| **Attestation** | Service Agreement · Document Handling Agreement | attestation services · document handling & courier · fee/timeline disclaimer (indicative pricing) · refund policy |
| **Manpower** | Recruitment Service Agreement · Deployment Processing Agreement | recruitment & placement · medical/visa processing · deployment terms · fee & refund policy |

## 3. Client signing mechanism (self-service, free)

**Client portal → new "Agreements" section:**
1. `GET /api/public/portal/agreements?token=` — this client's agreements (draft/sent)
2. View full content → consent checkbox → choose method:
   - **Type name** (typed) — full-name input
   - **Draw signature** (wet_ink) — canvas capture
   - **Email OTP** (otp) — `POST /request-otp` sends code (notify.ts), stored in `verifications` (identifier = agreementId, 10-min expiry)
3. `POST /api/public/portal/agreements/:id/sign` `{ method, signatureData?, otp? }` → ownership check → OTP verify (if otp) → capture IP/UA → SHA-256 of content → status `signed` + esignMethod + signedAt → audit `AGREEMENT_SIGNED`

**Staff side (AgreementsTab):** remove Aadhaar option, add Typed; templates section now shows the seeded library.

## 4. Schema change

`agreements.esignMethod` enum: `['aadhaar','otp','wet_ink']` → `['typed','otp','wet_ink']` (migration via drizzle-kit). Shared zod `signAgreementSchema` updated.

## 5. Subagent split

| Agent | Files | Deliverable |
|---|---|---|
| A — backend | `db/seed.ts` (seedAgreementLibrary), `routes/agreements.ts` (portal GET/request-otp/sign), `db/schema.ts` + migration (aadhaar→typed), `packages/shared/src/validation.ts`, `index.ts` (health seed), `tests/agreementSigning.test.ts` | seed + client sign flow + aadhaar removal + tests |
| B — frontend | `AgreementsTab.tsx`, `ClientPortal.tsx` (Agreements section + signing ceremony) | staff tab updates + client self-service signing UI |

## 6. Verification

TDD tests → targeted vitest → `pnpm -r typecheck` → `pnpm --filter app build` → full suite. Orchestrator runs final gate.

## 7. Implementation log (2026-08-17)

- **Phase A — backend** (9 new tests + 13 regression): `seedAgreementLibrary` — **32 clauses** (G1–G8 general incl. mandatory Electronic Execution & Consent, Nizamabad jurisdiction, DPDP 2023, GST 18%) + **10 templates** (2 per division), idempotent, wired into `/api/health`. Client self-service signing: `GET /api/public/portal/agreements?token=`, `POST /:id/request-otp` (6-digit code in `verifications`, 600s expiry, email via notify), `POST /:id/sign` (typed/wet_ink/otp; OTP consumed after use; captures IP + user-agent + SHA-256 of content; audit `AGREEMENT_SIGNED`). `aadhaar` removed from the enum (schema + shared zod; no SQL migration needed — D1 stores TEXT, enforcement is zod/TS). Staff sign test updated aadhaar→typed.
- **Phase B — frontend**: `AgreementsTab.tsx` — Aadhaar option removed, **Typed** added; template cards show clause counts. `ClientPortal.tsx` — new **📄 Agreements** section with the full signing ceremony: view content (intent) → consent checkbox → method picker (Type name / Draw on canvas with touch support / Email OTP with resend) → sign → green confirmation with verification hash + refetch.
- **Gate**: 553/553 tests (85 files) · typecheck clean · app build clean · audit-chain self-test + mojibake gates green.