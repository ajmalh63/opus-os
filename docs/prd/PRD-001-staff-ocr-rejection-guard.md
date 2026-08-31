# PRD-001 — Staff-Level OCR & Rejection Safeguard

**Owner:** Opus Overseas (agent-operated)  
**Status:** Ready for build (RICE 324+46)  
**Constraint (non-negotiable):** OCR at **staff level only** — clients do **not** get OCR. Agents process student applications; clients upload raw photo/scan, staff runs the workbench. This doc enforces that boundary.

---

## 1) Summary
Build a **Staff Workbench → OCR + Rejection Guard** inside the CRM (not the portal). When a counselor opens a client’s Study Abroad / Visa / Manpower case and attaches a passport, bank statement, or certificate, Opus extracts fields via OCR/MRZ, flags 3-layer tamper signals, cross-checks embassy rules (50+ checks), and writes structured data to D1. Client portal only sees **status + missing-doc nudge**, never the raw scan or the AI trace.

## 2) Goals / Non-Goals

**Goals:**
- 90% less typing for agents (MRZ → name/DOB/passport/MRZ checksum, photo auto-crop to 35×45 mm, bank amount → proof)
- Zero “cat photo” passports (2/4 signals must pass or → manual review)
- Rejection prevention before submission (6-month passport, funds, insurance, photo spec)

**Non-Goals:**
- No client-facing OCR UI, no client-side camera enforcement, no auto-approval without staff confirm. HITL is mandatory per `docs/audit-logging-gold-standard.md` and `OPUSAI-INTEGRATION-PLAN.md` §guardrails.

## 3) Users & Permissions

| Actor | Sees | Can Do |
|---|---|---|
| **Counselor/Coordinator/Manager** | Workbench tab in Client 360 & Kanban drawer; raw scan, extracted JSON, signal badges, guard checklist | Run OCR, confirm/edit fields, mark verified, trigger “request re-upload” |
| **Client (portal)** | “Passport: Verification pending” + checklist; blur/thumbnail only | Upload photo/scan, re-upload if flagged |
| **Partner** | Nothing for docs (403, DPDP isolation) | — |
| **Admin** | Audit of all OCR runs (who, when, before/after, model version) | Re-train thresholds |

RBAC: `@rbacMiddleware(['super_admin','manager','counselor','coordinator'])` on `/api/staff/ocr/*`; partner/client role = 403.

## 4) User Stories

- As a **visa counselor**, when I attach a passport to a visa case, I want MRZ fields auto-filled with checksum validation and a face-crop preview, so I don’t retype and don’t submit a blurry photo.
- As a **study-abroad counselor**, when I attach a bank statement, I want the closing balance extracted and the “funds ≥ 28× monthly living” check auto-run, so I catch shortfall before CAS.
- As a **compliance manager**, I want every OCR run hash-chained in `audit_log` with `beforeState/afterState` diff, so the embassy can trust provenance.

## 5) Functional Requirements

**F1 OCR Workbench (staff-only):**
- Triggers: Staff attaches file in Client 360 → “Run OCR” button (not auto — HITL).
- Inputs: `fileId (R2 key), division, docType (passport|bank|certificate|photo)`
- MRZ: Tesseract + MRZ parser for 190+ ICAO formats, checksum per ICAO 9303, photo extraction + face detection (Dlib/Cloudflare Vision), aspect-ratio guard (reject 16:9 screenshots)
- Tamper: 3-layer — client entropy (color), server entropy, Tesseract confidence; 2/4 must pass or status = `manual_review` + urgent task
- Output: `{mrz: {...}, extracted: {...}, signals: [{name, pass}], confidence: 0.97, rawHash: sha256}` stored in `documents` row (new columns, see §7) + audit `OCR_RAN`

**F2 Rejection Guard (50 checks, division-aware):**
- Checks run **after** OCR confirm, before `status: submitted`. Examples: passport validity ≥6m, photo 35×45, bank funds `≥ tuition*1.28`, insurance for Schengen, gap-year affidavit if >6m gap. Each check returns `pass|fail|na | action`
- Fails → block submit with checklist + “Request re-upload” WhatsApp template (staff confirms send)

**F3 Client-Portal Surface (minimal):**
- Client sees `status: pending|verified|re_upload_requested` + CTA “Re-upload clearer photo”. No raw MRZ, no guard trace, no confidence score.

## 6) UX — Boundaries Enforced

- **Staff Client 360 → Documents → Workbench** (new tab, counselor-only):
  - Left: scan preview + badges `MRZ ✓, Entropy ✓, Face ✓, Keywords ✓`
  - Right: extracted form (editable, paise-safe) + “Confirm & Save” → writes to `clients`/`engagements` + creates `DOCUMENT_VERIFIED` task
- **Client /portal → Documents**:
  - Before: “Passport — pending review” (no OCR button)
  - After fail: “We need a clearer passport — please re-upload (see sample)”

## 7) Data & API

**D1 additions (2 columns + 1 table, no drops):**
```sql
ALTER TABLE documents ADD COLUMN ocr_json TEXT DEFAULT NULL; -- staff-only extracted payload
ALTER TABLE documents ADD COLUMN ocr_signals TEXT DEFAULT NULL; -- JSON 4 signals
CREATE TABLE ocr_runs (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  model_version TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  extracted_json TEXT NOT NULL,
  raw_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

**APIs (all staff-only, rateLimited 30/min, audited):**
- `POST /api/staff/ocr/run` `{documentId}` → `{ocrJson, signals, confidence, warnings}` — staff HITL trigger
- `POST /api/staff/ocr/confirm` `{documentId, patchedFields}` → validates guard, writes D1, audit `OCR_CONFIRMED`, enqueues `DOCUMENT_VERIFIED` task, invalidates `staff:client:{id}:documents` via SyncHub

**No client OCR endpoint exists** — intentional. If a client POSTs to `/staff/ocr/*` they hit 403 via `rbacMiddleware`.

## 8) Security & Compliance

- **HITL:** tool gating per `AGENTS.md` §guardrails — document-derived text never auto-writes to D1; staff confirms.
- **Prompt boundaries:** ocrJson wrapped as `<untrusted_data>` if ever fed to AI, never concatenated raw.
- **Audit:** every run is `record_hash = SHA256(prev_hash + canonical(ocrJson))` + `redactPayload` (no raw base64 in log).
- **Upload guard:** still `uploadGuard.ts` allowlist + magic-byte + 10 MB; OCR re-validates mime vs ext.

## 9) Metrics & Rollout

- Success: staff typing time -70% (pilot 100 passports), guard catch rate >85% of previously rejected cases, 0 client OCR bypass attempts (blocked by RBAC logs).
- Rollout: pilot 1 division (Visa) → expand to Study Abroad + Manpower; feature flag `ocr_workbench_enabled` per division in `app_settings`.

## 10) Open Questions

- WASM Tesseract vs Workers AI Vision for 190 MRZ? (pilot both, pick <2s p95)
- Store raw image hash for chain of custody or just extracted JSON hash? (recommend both)

---
*PRD-001 enforces owner constraint: staff-level only. Client workspaces remain thin; agents remain the processors.*
