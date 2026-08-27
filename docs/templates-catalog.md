# Opus OS — Complete Templates Catalog (All Divisions)

> **Gold Standard:** Every template is **personalized, actionable, and traceable** — one clear CTA, scalar variables only (no HTML interpolation), brand Navy/Gold, mobile-first, DPDP-compliant.

## How to Use
- **Email (Listmonk `type:tx`):** `sendNotification(env,db,{channel:'email', to, subject, body: html, templateId, data: {ScalarMap}})` — scalar map is rendered server-side via Go `html/template`.
- **WhatsApp (Meta Cloud v21):** `sendWhatsApp(env, to, templateName, vars)` — outside 24h window only via approved `Utility/Marketing` template; inside window via `text` free.
- **In-App (PortalMessages):** `POST /api/public/portal/messages` → `waOutbox` + `staff:global:messages` realtime.

---

## 1. Study Abroad (12 templates)

| # | Channel | Template ID | Trigger | Subject / Title | Variables | CTA |
|---|---|---|---|---|---|---|
| SA-01 | Email | `studyAbroadInquiry` | Lead form `primaryDivision=study-abroad` | `Your Study Abroad inquiry is received` | `ClientName, TargetCountry, Intake, CounselorName, PortalUrl` | `View Shortlist →` |
| SA-02 | WhatsApp Utility | `study_inquiry_ack` | Same | `Hi {{1}}, your {{2}} inquiry for {{3}} is received. Counselor {{4}} will call in 2h.` | `Name, Country, Intake, Counselor` | — |
| SA-03 | Email | `studyAbroadMilestone` | `studyAbroadApplications.status` change | `Study Abroad Update: {{university}} — {{stageTitle}}` | `ClientName, UniversityName, CourseName, StageTitle, Details, PortalUrl` | `Track in Portal →` |
| SA-04 | Email | `offerLetterReceived` | `offer_letter` stage | `🎉 Offer Letter: {{university}}` | `ClientName, UniversityName, CourseName, OfferDeadline, PortalUrl` | `Accept Offer →` |
| SA-05 | WhatsApp Utility | `offer_received` | Same | `Congrats {{1}}! Offer from {{2}} — accept by {{3}}.` | `Name, University, Deadline` | — |
| SA-06 | Email | `sopReview` | SOP `pending` | `SOP Review — Action Required` | `ClientName, DueAt, PortalUrl` | `Upload SOP →` |
| SA-07 | WhatsApp Utility | `sop_due` | Same | `Hi {{1}}, SOP due {{2}}. Upload now.` | `Name, Due` | — |
| SA-08 | Email | `visaGuidance` | `deposit_paid → visa` | `Next: Visa for {{country}}` | `ClientName, Country, Checklist, PortalUrl` | `Start Visa →` |
| SA-09 | Email | `enrollmentComplete` | `enrolled` | `Enrolled — Welcome to {{university}}` | `ClientName, UniversityName, PortalUrl` | `Go to Dashboard →` |
| SA-10 | WhatsApp Marketing | `study_nurture` | `nurtureTouch` `study-abroad` | `Hi {{1}}, still planning {{2}}?` | `Name, Country` | — |
| SA-11 | Email | `ieltsReminder` | `visaDeadlines` `medical` overdue | `IELTS/Medical due` | `ClientName, Type, DueAt, PortalUrl` | `Upload →` |
| SA-12 | In-App | — | `Health <40` Red | `Health 42 — Upload IELTS` | `healthScore, nextAction` | `Do it now →` |

## 2. Visa Services (10)

| # | Channel | Template ID | Trigger | Subject | Variables |
|---|---|---|---|---|---|
| V-01 | Email | `visaApplicationReceived` | `visaApplications` create | `Visa application for {{country}} received` | `ClientName, Country, VisaType, PortalUrl` |
| V-02 | WhatsApp Utility | `visa_docs_needed` | `requirements outstanding` | `Hi {{1}}, {{2}} needs {{3}} docs.` | `Name, Country, Count` |
| V-03 | Email | `visaBiometrics` | `visaDeadlines type=biometrics` | `Biometrics on {{dueAt}}` | `ClientName, DueAt, Location, PortalUrl` |
| V-04 | WhatsApp Utility | `visa_biometrics_reminder` | Same `due <3d` | `Reminder: Biometrics {{1}} at {{2}}` | `Name, Date` |
| V-05 | Email | `visaSubmitted` | `stageKey=submitted` | `Visa submitted to {{embassy}}` | `ClientName, Embassy, PortalUrl` |
| V-06 | Email | `visaApproved` | `stageKey=approved` | `Visa Approved — {{country}}` | `ClientName, Country, PortalUrl` |
| V-07 | Email | `visaRejected` | `stageKey=rejected` | `Visa update — action required` | `ClientName, Country, Reason, PortalUrl` |
| V-08 | WhatsApp Utility | `visa_approved` | Same | `Congrats {{1}}! Visa {{2}} approved.` | `Name, Country` |
| V-09 | Email | `visaInterview` | `visaMockInterviews` schedule | `Mock interview {{date}}` | `ClientName, Date, Link, PortalUrl` |
| V-10 | In-App | — | `VISA_DEADLINE_MOVED` | `Deadline moved` | `type, delta` |

## 3. Attestation (8)

| # | Channel | Template ID | Trigger | Subject |
|---|---|---|---|---|
| A-01 | Email | `attestationReceived` | `attestationApplications` create | `Attestation for {{docType}} — {{destination}} received` |
| A-02 | WhatsApp Utility | `attestation_received` | Same | `Hi {{1}}, {{2}} for {{3}} received.` |
| A-03 | Email | `attestationProgress` | `stage HRD→MEA→Embassy` | `Attestation Update: {{documentType}} — {{currentStage}}` |
| A-04 | WhatsApp Utility | `attestation_stage` | Same | `{{1}} now at {{2}}` |
| A-05 | Email | `attestationReady` | `stage=ready_for_collection` | `Document ready for collection` |
| A-06 | WhatsApp Utility | `attestation_ready` | Same | `Hi {{1}}, {{2}} ready.` |
| A-07 | Email | `attestationDispatched` | `AWB` set | `Dispatched — AWB {{awb}}` |
| A-08 | WhatsApp Utility | `attestation_dispatched` | Same | `Dispatched AWB {{1}}` |

## 4. Umrah Travel (9)

| # | Channel | Template ID | Trigger |
|---|---|---|---|
| U-01 | Email | `umrahBookingConfirmed` | `bookings` `held` + `₹500 advance` |
| U-02 | WhatsApp Utility | `umrah_booking_held` | Same |
| U-03 | Email | `umrahBalanceDue` | `paymentSchedules` `Balance due T-7d` |
| U-04 | WhatsApp Utility | `umrah_balance_due` | Same |
| U-05 | Email | `umrahVisaProcessing` | `visa stage` |
| U-06 | WhatsApp Utility | `umrah_visa_update` | Same |
| U-07 | Email | `umrahFlightHotel` | `flight/hotel confirmed` |
| U-08 | WhatsApp Utility | `umrah_departure_reminder` | `departure in 3d` |
| U-09 | Email | `umrahFeedback` | `return +7d` |

## 5. Manpower / Overseas Manpower (8)

| # | Channel | Template ID | Trigger |
|---|---|---|---|
| M-01 | Email | `manpowerApplicationReceived` | `portalManpower apply` |
| M-02 | WhatsApp Utility | `manpower_apply_ack` | Same |
| M-03 | Email | `manpowerMatch` | `match% ≥75` `top_match` |
| M-04 | WhatsApp Utility | `manpower_match` | Same |
| M-05 | Email | `manpowerInterview` | `interview scheduled` |
| M-06 | Email | `manpowerOffer` | `offer` |
| M-07 | Email | `manpowerDeployment` | `emigration clearance` |
| M-08 | WhatsApp Utility | `manpower_deployment` | Same |

## 6. General / Cross-Division (8)

| # | Channel | Template ID | Trigger |
|---|---|---|---|
| G-01 | Email | `verify` | `BetterAuth` `sendVerificationEmail` |
| G-02 | Email | `otp` | `2FA` OTP |
| G-03 | Email | `passwordReset` | `reset` |
| G-04 | Email | `paymentReceipt` | `payments verify` `type:receipt` |
| G-05 | Email | `nurtureTouch` | `nurtureTouches` `scheduled` → `sent` |
| G-06 | WhatsApp Utility | `nurture_followup` | Same |
| G-07 | Email | `agreementInvite` | `agreements` `pending` |
| G-08 | Email | `agreementExecuted` | `agreements` `executed` |

## 7. Partner (5)

| # | Channel | Template ID | Trigger |
|---|---|---|---|
| P-01 | Email | `partnerReferralReceived` | `referrals` create |
| P-02 | Email | `partnerCommissionMatured` | `COMMISSION_MATURED` |
| P-03 | Email | `payoutRequestReceived` | `payouts` `requested` |
| P-04 | Email | `payoutApproved` | `payouts` `approved` |
| P-05 | Email | `payoutPaid` | `payouts` `paid` |

**Total: 60 templates** — every `publishSyncEvent` channel has a matching template. All are **Utility** except `study_nurture` Marketing (opt-in required, `STOP` handling in `waOutbox` `canReceiveUpdates`).

---

## Implementation Notes (for dev)

- **Listmonk `type:tx`:** scalar `data: {Name, VerifyUrl, Amount, ...}` — no HTML interpolation into raw tags.
- **WhatsApp Cloud API:** `POST https://graph.facebook.com/v21.0/{PHONE_ID}/messages` `Authorization: Bearer TOKEN` + `messaging_product: whatsapp`. Outside 24h window use `type: template` `template.name` `language.code` + `components` `parameters` `text`. Inside window use `type: text`.
- **Realtime:** every email/WhatsApp `sendNotification`/`sendWhatsApp` also `insert waOutbox` + `publishSyncEvent public:messages + staff:global:messages + client:{id}:messages` + `auditEvent`.
- **Files:** `apps/api/src/infra/emailTemplates.ts` (already 15), `apps/api/src/infra/listmonk.ts` (scalar), `apps/api/src/infra/messaging.ts` (dual provider), `apps/api/src/routes/portal.ts` (messages), `apps/api/src/routes/blog.ts` (blog), `apps/api/src/routes/visaGold.ts` etc.
- **Next:** run `scripts/seed-templates.mjs` to insert `appSettings` `templateId` mappings + submit WhatsApp templates via `POST /v21.0/{WABA_ID}/message_templates` (see `references/template-management.md`).

