# PRD-003 — Manpower Country Workflows (6 GCC) + Blind-Bridge

**RICE 400 (blind) + 60 (workflows) | Constraint: staff-level OCR supplies readiness**

## 1) Problem
One workflow for 6 GCC countries → visa/medical/deploy steps bleed across, agencies see employer rates, employers see agency banks — no privacy, no per-country compliance.

## 2) Solution (Mahad + HireStream gold)
- **Country Workflow Engine:** `manpower_workflows` table: `country (IN→GCC 6), stage[], requiredDocs[], medicalLab (GAMCA/Wafid), expiryWatch`. Selecting destination swaps checklist and guards (e.g., Saudi → Wakala+Tafweed+Wafid polling).
- **Blind-Bridge:** MPR routes via Opus: agency sees `demandId` not employer name/bank; employer sees candidate bank masked not agency PII. Opus is the encrypted router.
- **5-Factor Scoring:** On demand match, score candidate A/B/C (skills/similarity/exp/language/certs) on card; filter “ready >80%”.

## 3) Scope
- Staff: manage workflows (manager+), blind toggle per MPR.
- Client (candidate): portal shows “Medical: Wafid pending — GAMCA center 12” (no agency name).

## 4) Not Doing
- No client OCR (per owner), no direct employer↔agency chat (routed via Opus).

## 5) API
- `POST /api/staff/manpower/workflows` + `GET /api/manpower/jobs?country=UAE` → returns workflow + readiness score.
