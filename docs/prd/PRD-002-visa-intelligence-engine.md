# PRD-002 — Visa Intelligence Engine (Versioned, Specialist-Approved)

**Status:** Ready (RICE 120)  
**Depends on:** PRD-001 (staff OCR supplies structured docs for checks)

## 1) Problem
56 products × 250 countries × embassy portals with no API — rules change weekly. Today rules live in code/JSON with no versioning, no audit, and per-case snapshot is absent. Rejections from stale rules are the top cost.

## 2) Solution (Wincora gold)
- **Intelligence DB:** `visa_requirements` table with `country, visaType, version, effectiveFrom, sourcePdfUrl, specialistId, status(draft|published|archived)` — every change is AI-researched + specialist-approved, diffed, and versioned.
- **Per-Case Snapshot:** At `engagements` create, snapshot the versioned rule (`ruleSnapshotJson`) onto the case — replayable decision trace (“why this checklist”).
- **Staff Engine:** counselors see “Rule v3.2 (published 2026-08-28 by specialist@) — 5 docs required → current case has 3 → 2 missing” with diff view.

## 3) Scope
- Staff-only write (manager+), staff-only read diff, client sees only checklist (no version).
- 3 tables: `visa_requirements`, `visa_requirement_versions`, `visa_rule_snapshots` (or JSON on `engagements`).

## 4) API
- `POST /api/staff/visa/requirements` (draft) → `POST /publish` (specialist) → `GET /api/visa/requirements?country=UAE&visaType=tourist` (public checklist)
- Case create auto-snapshots; `GET /api/clients/:id` returns checklist + `ruleVersion` for staff.

## 5) Not Doing
- No browser automation yet (PRD-003); no client-side rule editing.
