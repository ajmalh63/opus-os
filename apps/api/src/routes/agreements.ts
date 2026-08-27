import { auditBounded } from '../middleware/audit.js';
import { resolveClientByToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createTemplateSchema, createAgreementSchema, signAgreementSchema, dispatchAgreementSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { agreements, agreementTemplates, clauseLibrary, clients, consents, referrals, commissionLedger, payments, engagements, verifications } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { pickCounselorForDivision, createAssignmentTask } from '../services/leadAssignment.js';
import { auditEvent } from '../middleware/audit.js';
import { publishSyncEvent } from './sync.js';
import { sendNotification } from '../infra/notify.js';
import { getListmonkTemplateId } from '../infra/listmonk.js';
import { agreementSignedTemplate, otpEmailTemplate } from '../infra/emailTemplates.js';
import { accrueIncentives } from '../services/incentiveAccrual.js';
import { accruePartnerPoints } from '../services/partnerLoyalty.js';

export const agreementsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function ensureClauseLibraryAndTemplates(db: any) {
  try {
    const existingTemplates = await db.select().from(agreementTemplates).all();
    if (existingTemplates.length > 0) return;

    const now = Math.floor(Date.now() / 1000);

    // 1. Seed standard professional clauses
    const standardClauses = [
      {
        id: 'c-refund-sa',
        clauseId: 'refund-policy',
        title: 'Article 1: Retainer Retainer, Service Fees & Refund Schedule',
        body: '1.1 Initial Retainer: The Client acknowledges that upon execution of this Agreement, the initial registration deposit is designated as an administrative retainer covering profile evaluation, credential assessment, and dedicated counselor allocation, and is strictly non-refundable.\n1.2 Subsequent Milestone Payments: Milestone fees payable upon university offer issuance, visa filing, or departure orientation are non-refundable once the associated milestone deliverable has been transmitted or submitted.\n1.3 Discretionary Consideration: In the extraordinary event of university course cancellation prior to commencement without fault of the Client, Opus Overseas shall provide free transfer of application services to an alternative equivalent institution.',
        division: 'study-abroad',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-fee-sa',
        clauseId: 'fee-schedule',
        title: 'Article 2: Fee Payment Terms, Invoicing & Statutory GST',
        body: '2.1 Payment Timelines: Invoices raised by Opus Overseas for agreed milestone professional services must be settled in full within seven (7) business days from date of electronic issuance.\n2.2 Statutory Taxation: All professional fees are subject to statutory Goods and Services Tax (GST) at eighteen percent (18% — comprising 9% CGST + 9% SGST for intra-state Telangana clients, or 18% IGST for inter-state clients) in compliance with the Central Goods and Services Tax Act, 2017. Opus Overseas shall issue standard Tax Invoices reflecting GSTIN 36ALPPH3337R1ZE.\n2.3 Currency: All payments shall be remitted in Indian Rupees (INR) via authorized digital payment gateways or designated scheduled bank escrow accounts.',
        division: 'study-abroad',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-univ-sa',
        clauseId: 'university-terms',
        title: 'Article 3: University Admissions Advisory Scope & Client Obligations',
        body: '3.1 Advisory Scope: Opus Overseas agrees to provide professional evaluation of academic transcripts, suggest optimal university and course shortlists, guide Statement of Purpose (SOP) formulation, and coordinate institutional submissions.\n3.2 Academic Integrity & Documentation: The Client warrants that all transcripts, recommendation letters, test scores (IELTS/TOEFL/GRE/GMAT), and financial statements furnished are authentic and accurate. Opus Overseas disclaims any liability for application rejections resulting from inaccurate or forged documentation provided by the Client.\n3.3 Admission Discretion: The Client expressly understands that admissions decisions, scholarship awards, and conditional offer criteria remain at the sovereign and independent discretion of the receiving educational institution.',
        division: 'study-abroad',
        mandatory: false,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-visa-disc',
        clauseId: 'visa-disclaimer',
        title: 'Article 1: Consular Sovereign Prerogative & Visa Advisory Scope',
        body: '1.1 Sovereign Authority: The Client expressly agrees and acknowledges that the authority to grant, condition, delay, or refuse any visa, entry permit, or study clearance rests solely and exclusively with the respective foreign government, embassy, high commission, or consular division.\n1.2 Limitation of Advisory: Opus Overseas acts solely in an advisory, document-scrutiny, and mock-interview preparation capacity. No staff member or representative of Opus Overseas is authorized to provide a guarantee of visa issuance.',
        division: 'visa',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-visa-sla',
        clauseId: 'visa-sla',
        title: 'Article 2: Turnaround Timelines, Financial Proofs & Biometric SLAs',
        body: '2.1 Document Submission Timeline: The Client shall deliver all verified financial proofs, affidavit of support, tax returns, and civil records to Opus Overseas no later than fourteen (14) calendar days prior to the targeted consular appointment or priority intake window.\n2.2 Biometrics & Medicals: The Client agrees to appear in person for mandatory biometric enrollment, medical examinations, and consular interviews at the scheduled times and centers.',
        division: 'visa',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-umrah-adv',
        clauseId: 'umrah-advance',
        title: 'Article 1: Pilgrimage Manifest Seat Advance & Cancellation Terms',
        body: '1.1 Manifest Seat Hold: An initial non-refundable advance of INR 500 per pilgrim passenger holds dedicated seats on the designated group departure manifest for a maximum of 72 hours.\n1.2 Confirmation & Balance: The package reservation is confirmed upon receipt of the initial booking deposit within the 72-hour window. Full balance payment must be cleared twenty-one (21) days prior to the group departure date.\n1.3 Cancellation Sliding Scale: Cancellations requested >30 days prior to departure forfeit 25% of the total package value; cancellations requested between 15-30 days forfeit 50%; cancellations within 14 days of departure forfeit 100% of flight and hotel reservation costs in line with Saudi Ministry of Hajj and Umrah regulations.',
        division: 'umrah',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-umrah-itin',
        clauseId: 'umrah-itinerary',
        title: 'Article 2: Accommodation Standards, Ground Logistics & Visa Compliance',
        body: '2.1 Lodging & Distance Guarantee: Opus Overseas guarantees the hotel classification, room occupancy type, and walking distance to the Haram boundary in Makkah and Madinah as set out in the agreed departure package schedule.\n2.2 Transport & Ziyarat: Ground transfers between Jeddah, Makkah, and Madinah, alongside organized Ziyarat excursions, shall be conducted in air-conditioned authorized tourist coaches.\n2.3 Saudi Regulatory Mandates: All pilgrims must abide by local Saudi civil laws, visa expiration deadlines, and health and safety advisories issued by the General Authority of Civil Aviation (GACA).',
        division: 'umrah',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-attest-cust',
        clauseId: 'attestation-custody',
        title: 'Article 1: Chain of Custody, Insured Logistics & Sovereign Attestation',
        body: '1.1 Chain of Custody: Opus Overseas maintains strict tamper-evident physical tracking and secure insured transit protocols for original educational, personal, and commercial certificates undergoing legalization.\n1.2 Multi-Tier Verification Chain: Legalization flows sequentially through State HRD/Home Department, Sub-Divisional Magistrate (SDM), Ministry of External Affairs (MEA) Government of India, and the targeted foreign Embassy / Consulate or Apostille registry.\n1.3 Processing Dependencies: Estimated turnaround schedules are indicative and subject to verification turnaround by issuing universities, state secretariats, and consular processing queues.',
        division: 'attestation',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-manpower-rec',
        clauseId: 'manpower-terms',
        title: 'Article 1: Ethical Overseas Recruitment & Employer Sponsorship Terms',
        body: '1.1 Statutory Compliance: Opus Overseas operates strictly as an authorized overseas manpower facilitator in full compliance with the Emigration Act, 1983 and MEA Oversea Employment guidelines.\n1.2 Fair Recruitment Mandate: Opus Overseas upholds fair and ethical recruitment standards with zero unlawful extraction fees charged to job seekers. All employment terms, salary bands, and working hours reflect verified employer demand letters.',
        division: 'manpower',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-dpdp-gen',
        clauseId: 'dpdp-privacy',
        title: 'Article 4: Digital Personal Data Protection (DPDP) Act 2023 Compliance',
        body: '4.1 Purpose-Bound Processing: The Client grants explicit, informed, and unambiguous consent under the Digital Personal Data Protection Act, 2023 (DPDP Act) for Opus Overseas to collect, store, verify, and transmit personal data (including passport bio-pages, Aadhaar/National ID, academic transcripts, and financial records).\n4.2 Cross-Border Transmission: Personal data shall be transferred across borders strictly to accredited foreign universities, embassy visa portals, and authorized apostille authorities solely for fulfilling the contracted services.\n4.3 Data Security & Redaction: Opus Overseas employs industry-standard encryption and role-based access control, preventing unauthorized dissemination.',
        division: 'general',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 'c-juris-gen',
        clauseId: 'dispute-jurisdiction',
        title: 'Article 5: Dispute Resolution, Governing Law & Sole Jurisdiction',
        body: '5.1 Governing Law: This Agreement shall be construed, interpreted, and governed in all respects in accordance with the substantive laws of the Republic of India.\n5.2 Arbitration: Any dispute, claim, or controversy arising out of or relating to this Agreement shall be referred to and resolved by binding arbitration under the Arbitration and Conciliation Act, 1996 by a sole arbitrator mutually appointed by the parties.\n5.3 Exclusive Jurisdiction: The seat and legal venue of arbitration and all court proceedings shall be exclusively located in Hyderabad, Telangana, India.',
        division: 'general',
        mandatory: true,
        version: 'v1.0',
        createdAt: now,
      },
    ];

    for (const c of standardClauses) {
      await db.insert(clauseLibrary).values(c).onConflictDoNothing();
    }

    // 2. Seed standard templates across all divisions
    const standardTemplates = [
      {
        id: 't-study-abroad-std',
        name: 'Master Study Abroad & Academic Advisory Agreement',
        division: 'study-abroad',
        clausesJson: JSON.stringify(['refund-policy', 'fee-schedule', 'university-terms', 'dpdp-privacy', 'dispute-jurisdiction']),
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 't-visa-prep-std',
        name: 'Master Visa Filing & Advisory Service Agreement',
        division: 'visa',
        clausesJson: JSON.stringify(['visa-disclaimer', 'visa-sla', 'dpdp-privacy', 'dispute-jurisdiction']),
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 't-umrah-std',
        name: 'Master Umrah Pilgrim Travel & Booking Agreement',
        division: 'umrah',
        clausesJson: JSON.stringify(['umrah-advance', 'umrah-itinerary', 'dpdp-privacy', 'dispute-jurisdiction']),
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 't-attestation-std',
        name: 'Master Document Attestation & Apostille Service Agreement',
        division: 'attestation',
        clausesJson: JSON.stringify(['attestation-custody', 'dpdp-privacy', 'dispute-jurisdiction']),
        version: 'v1.0',
        createdAt: now,
      },
      {
        id: 't-manpower-std',
        name: 'Master Overseas Manpower Placement & Recruitment Agreement',
        division: 'manpower',
        clausesJson: JSON.stringify(['manpower-terms', 'dpdp-privacy', 'dispute-jurisdiction']),
        version: 'v1.0',
        createdAt: now,
      },
    ];

    for (const t of standardTemplates) {
      await db.insert(agreementTemplates).values(t).onConflictDoNothing();
    }
  } catch (err) {
    console.error('Failed to ensure agreement templates and clauses:', err);
  }
}

// GET /api/agreements/templates
agreementsRouter.get('/templates', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  await ensureClauseLibraryAndTemplates(db);

  try {
    const list = await db.select().from(agreementTemplates).all();
    return c.json({ templates: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch templates" }, 500);
  }
});

// GET /api/agreements/clauses
agreementsRouter.get('/clauses', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  await ensureClauseLibraryAndTemplates(db);

  try {
    const list = await db.select().from(clauseLibrary).all();
    return c.json({ clauses: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch clauses" }, 500);
  }
});

// POST /api/agreements/templates
agreementsRouter.post('/templates', zValidator('json', createTemplateSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const id = crypto.randomUUID();
    await db.insert(agreementTemplates).values({
      id,
      name: data.name,
      division: data.division,
      clausesJson: data.clausesJson,
      version: 'v1.0',
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({ success: true, id, message: "Agreement template created successfully." });
  } catch (error: any) {
    return c.json({ error: "Template creation failed" }, 500);
  }
});

// GET /api/agreements
agreementsRouter.get('/', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  await ensureClauseLibraryAndTemplates(db);

  try {
    const list = await db.select().from(agreements).all();
    return c.json({ agreements: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch agreements" }, 500);
  }
});

// POST /api/agreements (Create Draft from Template)
agreementsRouter.post('/', zValidator('json', createAgreementSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // 1. Fetch Client & Template
    const clientRecord = await db.select().from(clients).where(eq(clients.id, data.clientId)).get();
    if (!clientRecord) {
      return c.json({ error: "Client not found" }, 404);
    }

    const template = await db.select().from(agreementTemplates).where(eq(agreementTemplates.id, data.templateId)).get();
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }

    // 2. Parse Clause IDs and Fetch Clause text
    const clauseIds: string[] = JSON.parse(template.clausesJson);
    if (!Array.isArray(clauseIds) || clauseIds.length === 0) {
      return c.json({ error: "Template contains no clauses" }, 400);
    }

    const matchedClauses = await db
      .select()
      .from(clauseLibrary)
      .where(inArray(clauseLibrary.clauseId, clauseIds))
      .all();

    // 3. Check for mandatory clauses matching division
    const mandatoryClauses = await db
      .select()
      .from(clauseLibrary)
      .where(eq(clauseLibrary.mandatory, true))
      .all();

    const missingMandatory = mandatoryClauses.filter(mc => {
      if (mc.division !== 'general' && mc.division !== template.division) return false;
      return !clauseIds.includes(mc.clauseId);
    });

    if (missingMandatory.length > 0) {
      return c.json({ 
        error: "Mandatory clauses missing", 
        details: missingMandatory.map(m => m.clauseId) 
      }, 400);
    }

    // Sort matched clauses in original order specified in template
    matchedClauses.sort((a, b) => clauseIds.indexOf(a.clauseId) - clauseIds.indexOf(b.clauseId));

    const dateStr = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // 4. Assemble Executive Legal Contract
    let content = `================================================================================
OPUS OVERSEAS EDUCATIONAL & IMMIGRATION SERVICES PVT. LTD.
Corporate Office: Hyderabad, Telangana, India | GSTIN: 36ALPPH3337R1ZE
================================================================================

MASTER CLIENT SERVICE AGREEMENT
Contract Reference: OPUS-AGR-${Date.now().toString(36).toUpperCase()}
Effective Date: ${dateStr}

This Service Agreement ("Agreement") is made and entered into on this ${dateStr}, by and between:

FIRST PARTY (SERVICE PROVIDER):
M/s Opus Overseas Educational & Immigration Services Pvt. Ltd., an enterprise duly incorporated under the laws of India, having its corporate registered office in Hyderabad, Telangana (hereinafter referred to as "Opus Overseas" or "Service Provider", which expression shall unless repugnant to the context include its successors and permitted assigns).

AND

SECOND PARTY (CLIENT / APPLICANT):
Name: ${clientRecord.name}
Client UID: ${clientRecord.id}
Contact Phone: ${clientRecord.phone || 'N/A'}
Contact Email: ${clientRecord.email || 'N/A'}
Passport Number: ${clientRecord.passportNumber || 'N/A'}
(hereinafter referred to as the "Client", which expression shall include their heirs, legal representatives, and permitted assigns).

WHEREAS:
A. Opus Overseas is engaged in professional advisory, university admissions counseling, visa documentation assistance, apostille/attestation verification, overseas employment facilitation, and pilgrim tour logistics.
B. The Client has engaged Opus Overseas to render specialized services in accordance with the terms, covenants, and conditions set forth hereunder.

NOW, THEREFORE, IT IS MUTUALLY AGREED AS FOLLOWS:

`;

    matchedClauses.forEach((c) => {
      content += `${c.title}\n--------------------------------------------------------------------------------\n${c.body}\n\n`;
    });

    content += `================================================================================
EXECUTION & DIGITAL SIGNATURE ACCEPTANCE
================================================================================
By affixing digital signature, Aadhaar OTP authentication, or written execution below, the Parties confirm that they have read, understood, and voluntarily agreed to be bound by all terms, schedules, and conditions of this Agreement.

FOR FIRST PARTY (OPUS OVERSEAS):
Authorized Signatory: __________________________
Designation: Managing Director / Operations Head
Date: ${dateStr}

FOR SECOND PARTY (CLIENT / APPLICANT):
Name: ${clientRecord.name}
Signature / E-Sign: [PENDING VERIFICATION]
Date: ${dateStr}
`;

    // 5. Save agreement draft
    const agreementId = crypto.randomUUID();
    await db.insert(agreements).values({
      id: agreementId,
      clientId: data.clientId,
      templateId: data.templateId,
      status: 'draft',
      content,
      createdAt: Math.floor(Date.now() / 1000)
    });

    // Dispatch instant WhatsApp e-Sign link via Chatwoot & OpenWA (Async / Fail-open)
    try {
      if (clientRecord.phone) {
        const { dispatchUnifiedWhatsApp } = await import('../infra/chatwootBridge.js');
        dispatchUnifiedWhatsApp(c.env as any, {
          phone: clientRecord.phone,
          name: clientRecord.name,
          email: clientRecord.email || undefined,
          templateKey: 'AGREEMENT_SIGN_LINK',
          variables: {
            name: clientRecord.name,
            division: template.division || 'Opus Overseas Advisory',
            signUrl: `https://opusoverseas.com/sign/${agreementId}`,
            expiresInHours: '48',
          },
          division: template.division || 'general',
          tags: ['agreement-sent', 'esign-pending'],
        }).catch(() => {});
      }
    } catch { /* fail-open */ }

    return c.json({ 
      success: true, 
      id: agreementId, 
      content, 
      message: "Agreement draft generated successfully." 
    });

  } catch (error: any) {
    return c.json({ error: "Failed to generate agreement draft" }, 500);
  }
});

// POST /api/agreements/:id/dispatch (Send agreement to client via WhatsApp / Chatwoot / Email)
agreementsRouter.post('/:id/dispatch', zValidator('json', dispatchAgreementSchema), async (c) => {
  const agreementId = c.req.param('id');
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) {
      return c.json({ error: "Agreement not found" }, 404);
    }

    const client = await db.select().from(clients).where(eq(clients.id, agreement.clientId)).get();
    if (!client) {
      return c.json({ error: "Client record not found" }, 404);
    }

    const template = await db.select().from(agreementTemplates).where(eq(agreementTemplates.id, agreement.templateId)).get();

    // Mark status as 'sent' if draft
    if (agreement.status === 'draft') {
      await db.update(agreements).set({ status: 'sent' }).where(eq(agreements.id, agreementId));
    }

    const frontendBase = (c.env as any).FRONTEND_URL || 'http://127.0.0.1:5173';
    const signUrl = `${frontendBase}/sign/${agreement.id}`;
    const channelsDispatched: string[] = [];

    // 1. WhatsApp & Chatwoot (Unified dispatch)
    if (data.channel === 'whatsapp' || data.channel === 'chatwoot' || data.channel === 'all') {
      try {
        if (client.phone) {
          const { dispatchUnifiedWhatsApp } = await import('../infra/chatwootBridge.js');
          await dispatchUnifiedWhatsApp(c.env as any, {
            phone: client.phone,
            name: client.name,
            email: client.email || undefined,
            templateKey: 'AGREEMENT_SIGN_LINK',
            variables: {
              name: client.name,
              division: template?.name || 'Opus Overseas Service Agreement',
              signUrl,
              expiresInHours: '48',
            },
            customText: data.note ? `*Action Required: Service Agreement for ${client.name}* ✍️\n\n${data.note}\n\n👉 *Review & Sign Contract:* ${signUrl}` : undefined,
            division: template?.division || 'general',
            tags: ['agreement-sent', 'esign-pending'],
          });
          channelsDispatched.push('whatsapp', 'chatwoot');
        }
      } catch (err: any) {
        console.error('WhatsApp dispatch failed:', err);
      }
    }

    // 2. Email dispatch
    if (data.channel === 'email' || data.channel === 'all') {
      try {
        if (client.email) {
          const { subject, html } = agreementSignedTemplate({
            clientName: client.name,
            agreementTitle: template?.name || 'Service Agreement',
            downloadUrl: signUrl,
          });
          await sendNotification(c.env as any, db as any, {
            channel: 'email',
            to: client.email,
            subject: `Action Required: Please e-Sign your ${template?.name || 'Service Agreement'}`,
            body: html,
            templateId: getListmonkTemplateId(c.env as any, 'agreementExecuted'),
            data: {
              ClientName: client.name,
              AgreementTitle: template?.name || 'Service Agreement',
              SignedDate: 'Action Required',
              StatusText: 'Ready for e-Sign',
              DownloadUrl: signUrl,
              Subject: `Action Required: Please e-Sign your ${template?.name || 'Service Agreement'}`
            },
            clientId: client.id,
          });
          channelsDispatched.push('email');
        }
      } catch (err: any) {
        console.error('Email dispatch failed:', err);
      }
    }

    await auditEvent(c, {
      action: 'AGREEMENT_DISPATCHED',
      entityName: 'agreements',
      entityId: agreement.id,
      afterState: {
        clientId: agreement.clientId,
        channels: channelsDispatched,
        status: 'sent',
      }
    });

    return c.json({
      success: true,
      signUrl,
      channels: channelsDispatched,
      message: `Agreement dispatched to ${client.name} via ${channelsDispatched.join(', ') || 'link'}.`
    });
  } catch (error: any) {
    return c.json({ error: "Failed to dispatch agreement" }, 500);
  }
});

// POST /api/agreements/:id/sign (eSign capture & DPDP hash logging)
agreementsRouter.post('/:id/sign', zValidator('json', signAgreementSchema), async (c) => {
  const agreementId = c.req.param('id');
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) {
      return c.json({ error: "Agreement not found" }, 404);
    }

    if (agreement.status === 'signed') {
      return c.json({ error: "Agreement already signed" }, 400);
    }

    const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown device';

    // SHA-256 Hashing Helper for DPDP evidentiary audit trail
    const msgBuffer = new TextEncoder().encode(agreement.content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 1. Update agreement state to signed
    await db
      .update(agreements)
      .set({
        status: 'signed',
        esignMethod: data.esignMethod,
        ipAddress,
        userAgent,
        sha256Hash,
        signedAt: Math.floor(Date.now() / 1000)
      })
      .where(eq(agreements.id, agreementId));

    // 2. Insert plain English legal consent link in consents table
    const consentNotice = `OpusOS Consent Notice v1.0: Consent to terms and legal bounds of signed Service Agreement ID ${agreementId} with hash checksum ${sha256Hash}.`;
    
    // Hash notice
    const noticeBuffer = new TextEncoder().encode(consentNotice);
    const noticeHashBuffer = await crypto.subtle.digest('SHA-256', noticeBuffer);
    const noticeHashArray = Array.from(new Uint8Array(noticeHashBuffer));
    const noticeHash = noticeHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await db.insert(consents).values({
      id: crypto.randomUUID(),
      clientId: agreement.clientId,
      consentType: 'core-processing',
      status: 'granted',
      ipAddress,
      sha256Hash: noticeHash,
      grantedAt: Math.floor(Date.now() / 1000)
    });
    await auditEvent(c, {
      action: 'CONSENT_GRANTED', entityName: 'consents', entityId: agreement.clientId,
      afterState: { clientId: agreement.clientId, consentType: 'core-processing', via: 'agreement-sign', status: 'granted' },
    });

    // 3. Partner affiliate interlock (Section 39): if this client came via a partner
    // referral, mature the commission now that they are a signed customer.
    // Commission = referral.commissionRate % of total realized payments (paise, int math).
    try {
      const referral = await db.select().from(referrals).where(eq(referrals.clientId, agreement.clientId)).get();
      if (referral) {
        const paidRows = await db.select().from(payments).where(eq(payments.clientId, agreement.clientId)).all();
        // Realized money = receipts (confirmed/synced/paid) minus refunds — never
        // sum invoices/charges (owed, not received) or refunds (money out).
        const realizedPaise = paidRows.reduce((a: number, p: any) => {
          if (p.type !== 'receipt' && p.type !== 'refund') return a;
          if (!['confirmed', 'synced', 'paid'].includes(p.status)) return a;
          const amt = Number(p.amount || 0);
          return p.type === 'refund' ? a - Math.abs(amt) : a + amt;
        }, 0);
        const commissionPaise = Math.max(0, Math.floor((realizedPaise * (referral.commissionRate || 5)) / 100));
        const ledgerRow = await db.select().from(commissionLedger).where(eq(commissionLedger.referralId, referral.id)).get();
        // Never regress an already-paid commission; only mature pending rows.
        if (ledgerRow && ledgerRow.status !== 'paid') {
          await db.update(commissionLedger)
            .set({ amount: commissionPaise, status: 'matured' })
            .where(eq(commissionLedger.referralId, referral.id));
          try { await publishSyncEvent(c.env as any, { channel: `partner:${referral.partnerId}:commissions`, type: 'COMMISSION_MATURED', payload: { referralId: referral.id, amount: commissionPaise, status:'matured' } }, (c as any).executionCtx); } catch {}
          try { await publishSyncEvent(c.env as any, { channel: `client:${agreement.clientId}:bookings`, type: 'AGREEMENT_SIGNED', payload: { agreementId: agreement.id } }, (c as any).executionCtx); await publishSyncEvent(c.env as any, { channel: `staff:global:alerts`, type: 'AGREEMENT_SIGNED', payload: { agreementId: agreement.id, clientId: agreement.clientId } }, (c as any).executionCtx); } catch {}
        }
        // Thrive: client_signed loyalty points for the referring partner
        await accruePartnerPoints({ env: c.env as any, partnerId: referral.partnerId, reason: 'client_signed', referenceKey: agreement.id }).catch(() => {});
      }
    } catch (refErr: any) {
      // Commission maturation must never block agreement signing.
      console.error('referral commission maturation failed', refErr?.message);
    }

    // Interlock: incentive accrual on agreement_signed (plan §29.4) — the
    // assigned counselor earns when the customer boundary is reached. Idempotent.
    try {
      const engRow = await db.select().from(engagements).where(eq(engagements.clientId, agreement.clientId)).get();
      const result = await accrueIncentives({
        env: c.env as any,
        clientId: agreement.clientId,
        engagementId: engRow?.id || null,
        triggerRef: agreement.id,
        trigger: 'agreement_signed',
      });
      if (result.accrued > 0) console.log(`incentives accrued: ${result.accrued} (agreement ${agreement.id})`);
    } catch (incErr: any) {
      console.error('incentive accrual failed', incErr?.message);
    }

    // Interlock: agreement signed → handover task for the ops team (funnel loop
    // close: customer boundary reached; kick off delivery stage). Fail-open.
    try {
      const eng = await db.select().from(engagements).where(eq(engagements.clientId, agreement.clientId)).get();
      const assignee = await pickCounselorForDivision(db, eng?.division || 'study-abroad');
      const handoverId = crypto.randomUUID();
      await createAssignmentTask(db, {
        taskId: handoverId,
        clientId: agreement.clientId,
        engagementId: eng?.id || null,
        assigneeId: assignee,
        title: `Handover: ${agreement.clientId} signed agreement`,
        description: `Agreement ${agreement.id} signed (${data.esignMethod}). Begin delivery: collect outstanding balance, assign case owner, open vault stage.`,
        priority: 'high',
        dueInSeconds: 2 * 86400,
        now: Math.floor(Date.now() / 1000),
      });
    } catch (handErr: any) {
      console.error('agreement handover task failed', handErr?.message);
    }

    // Audit trail (DPDP): agreement execution is a legal evidence event.
    await auditEvent(c, {
      action: 'AGREEMENT_SIGNED',
      entityName: 'agreements',
      entityId: agreement.id,
      afterState: {
        clientId: agreement.clientId, esignMethod: data.esignMethod,
        signedAt: Math.floor(Date.now() / 1000),
      },
    });

    // §7.6 Transactional email — signed-agreement summary to the client
    try {
      const client = await db.select().from(clients).where(eq(clients.id, agreement.clientId)).get();
      if (client?.email) {
        const { subject, html } = agreementSignedTemplate({
          clientName: client.name || 'Valued Client',
          agreementTitle: `Service Agreement (${agreement.id})`,
          downloadUrl: `https://opusoverseas.com/login`,
        });
        const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        await sendNotification(c.env as any, db as any, {
          channel: 'email',
          to: client.email,
          subject, body: html,
          templateId: getListmonkTemplateId(c.env as any, 'agreementExecuted'),
          data: { ClientName: client.name || 'Valued Client', AgreementTitle: `Service Agreement (${agreement.id})`, SignedDate: dateStr, StatusText: 'Legally Executed & Archived ✓', DownloadUrl: 'https://opusoverseas.com/login', Subject: subject },
          clientId: client.id,
        });
      }
    } catch (emailErr: any) {
      console.error('agreement email failed', emailErr?.message);
    }

    // Conversion Goal Exit Engine: Immediately suppress prospecting drips and promote in Mautic + Chatwoot
    try {
      const eng = await db.select().from(engagements).where(eq(engagements.clientId, agreement.clientId)).get();
      const { handleLeadConversionGoal } = await import('../services/conversionGoals.js');
      handleLeadConversionGoal(c.env, {
        clientId: agreement.clientId,
        division: eng?.division || 'study-abroad',
        goalType: 'AGREEMENT_SIGNED',
        details: { agreementId: agreement.id },
      }, c).catch(() => {});
    } catch { /* fail-open */ }

    return c.json({
      success: true,
      sha256Hash,
      message: "Agreement executed and logged with DPDP evidence trail."
    });

  } catch (error: any) {
    return c.json({ error: "Failed to sign agreement",  }, 500);
  }
});

// ===================================================================
// CLIENT SELF-SERVICE e-SIGN (design doc §3) — token-based, no session.
// Mounted at /api/public/portal/agreements by index.ts. Legal methods:
// typed name, drawn signature (wet_ink), or email OTP. Aadhaar removed.
// ===================================================================
export const portalAgreementsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const OTP_IDENTIFIER_PREFIX = 'agreement-otp:';
const OTP_TTL_SECONDS = 600; // 10-minute expiry

// GET /api/public/portal/agreements?token=OP-2026-XXXX
// This client's agreements (status draft|sent|signed) with full content.
portalAgreementsRouter.get('/', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Token query parameter is required.' }, 400);
  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found matching token.' }, 404);

    const rows = await db.select().from(agreements).where(eq(agreements.clientId, token)).all();
    const visible = rows.filter((a) => ['draft', 'sent', 'signed'].includes(a.status));
    return c.json({
      agreements: visible.map((a) => ({
        id: a.id,
        templateId: a.templateId,
        status: a.status,
        esignMethod: a.esignMethod,
        signedAt: a.signedAt,
        createdAt: a.createdAt,
        content: a.content,
      })),
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch agreements',  }, 500);
  }
});

// POST /api/public/portal/agreements/:id/request-otp   body: { token }
// Ownership check → 6-digit code in verifications (10-min expiry) → email.
portalAgreementsRouter.post('/:id/request-otp', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: string };
  const token = body.token || c.req.query('token');
  if (!token) return c.json({ error: 'Token is required' }, 400);
  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const agreementId = c.req.param('id');
    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) return c.json({ error: 'Agreement not found' }, 404);
    if (agreement.clientId !== token) return c.json({ error: 'Agreement not found' }, 404);
    if (agreement.status !== 'draft' && agreement.status !== 'sent') {
      return c.json({ error: 'Agreement already signed' }, 409);
    }

    // CSPRNG 6-digit code (Math.random is predictable — brute-forceable).
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    // Store only the SHA-256 hash of the code (never the plaintext OTP at rest),
    // and invalidate any previous code for this agreement (one live code at a time).
    const codeHash = await sha256Hex(code);
    const now = new Date();
    await db.delete(verifications).where(eq(verifications.identifier, `${OTP_IDENTIFIER_PREFIX}${agreementId}`)).catch(() => {});
    await db.insert(verifications).values({
      id: crypto.randomUUID(),
      identifier: `${OTP_IDENTIFIER_PREFIX}${agreementId}`,
      value: codeHash,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      createdAt: now,
      updatedAt: now,
    });

    // Fail-open: an email failure must never block the OTP flow.
    try {
      const { subject, html } = otpEmailTemplate({
        name: client.name,
        otpCode: code,
        expiresInMinutes: 10,
      });
      await sendNotification(c.env as any, db as any, {
        channel: 'email',
        to: client.email,
        subject: 'Opus Overseas — sign your agreement',
        body: html,
        templateId: getListmonkTemplateId(c.env as any, 'otp'),
        data: { OtpCode: code, BannerText: 'This code is valid for 10 minutes. For your security, never share this code with anyone. Use it to sign your agreement.', Subject: 'Opus Overseas — sign your agreement' },
        clientId: client.id,
      });
    } catch (emailErr: any) {
      console.error('OTP email failed', emailErr?.message);
    }

    return c.json({ success: true, message: 'OTP sent to your registered email.' });
  } catch (error: any) {
    return c.json({ error: 'Failed to send OTP',  }, 500);
  }
});

// POST /api/public/portal/agreements/:id/sign
// body: { token, esignMethod: typed|otp|wet_ink, signatureData?, otp? }
const portalSignSchema = signAgreementSchema.extend({ token: z.string().min(1) });

portalAgreementsRouter.post('/:id/sign', zValidator('json', portalSignSchema), async (c) => {
  const agreementId = c.req.param('id');
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    // 1. Ownership — token resolves to the client record.
    const client = await resolveClientByToken(db, data.token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) return c.json({ error: 'Agreement not found' }, 404);
    if (agreement.clientId !== client.id) return c.json({ error: 'Agreement not found' }, 404);

    // 2. Status gate — only draft|sent may be signed (409 once executed).
    if (agreement.status !== 'draft' && agreement.status !== 'sent') {
      return c.json({ error: 'Agreement already signed' }, 409);
    }

    const now = Math.floor(Date.now() / 1000);

    // 3. Per-method verification — OTP is REQUIRED for every sign method
    // (token alone proves nothing: OP-XXXX ids were brute-forceable; the OTP
    // proves possession of the client's email). Attempts are capped per
    // agreement — identity-independent, so IP rotation can't defeat it.
    if (!data.otp) return c.json({ error: 'OTP is required to sign (sent to your registered email)' }, 400);
    if (data.esignMethod === 'typed' && (!data.signatureData || data.signatureData.trim().length === 0)) {
      return c.json({ error: 'Typed signature (your full name) is required' }, 400);
    }
    if (data.esignMethod === 'wet_ink' && (!data.signatureData || data.signatureData.trim().length === 0)) {
      return c.json({ error: 'Drawn signature is required' }, 400);
    }
    const identifier = `${OTP_IDENTIFIER_PREFIX}${agreementId}`;
    const verification = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, identifier))
      .get();
    const expRaw = (verification as any)?.expiresAt;
    const expiresMs = expRaw instanceof Date ? expRaw.getTime() : Number(expRaw) * 1000;
    const expired = !verification || !expiresMs || expiresMs <= Date.now();
    const otpAttempts = Number((verification as any)?.attempts || 0);
    if (expired || otpAttempts >= 5) {
      await auditBounded(c, {
        action: 'SIGN_OTP_LOCKED', entityName: 'agreements', entityId: agreementId,
        result: 'denied', category: 'access', actorType: 'public', authMethod: 'secret',
        afterState: { reason: expired ? 'expired' : 'attempts_exhausted' },
      }, 'webhook');
      return c.json({ error: 'Verification code expired or too many attempts — request a new code' }, 429);
    }
    const providedHash = await sha256Hex(String(data.otp || ''));
    if (verification.value !== providedHash) {
      // Constant-time-ish compare + count the failed attempt.
      await db.update(verifications)
        .set({ attempts: otpAttempts + 1, updatedAt: new Date() })
        .where(eq(verifications.identifier, identifier)).catch(() => {});
      return c.json({ error: 'Invalid or expired OTP' }, 400);
    }
    // One-time use — consume the verification row.
    await db.delete(verifications).where(eq(verifications.identifier, identifier));

    // 4. Capture evidence: IP, user-agent, SHA-256 of the signed content.
    const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown device';
    const hash = await sha256Hex(agreement.content);

    // 5. Execute.
    await db
      .update(agreements)
      .set({
        status: 'signed',
        esignMethod: data.esignMethod,
        ipAddress,
        userAgent,
        sha256Hash: hash,
        signedAt: now,
      })
      .where(eq(agreements.id, agreementId));

    // 6. DPDP audit trail (category compliance).
    await auditEvent(c, {
      action: 'AGREEMENT_SIGNED',
      entityName: 'agreements',
      entityId: agreement.id,
      category: 'compliance',
      afterState: { clientId: agreement.clientId, method: data.esignMethod, hash },
    });
    try { await publishSyncEvent(c.env as any, { channel: `client:${agreement.clientId}:bookings`, type: 'AGREEMENT_SIGNED', payload: { agreementId: agreement.id, method: data.esignMethod } }, (c as any).executionCtx); } catch {}

    return c.json({ success: true, signedAt: now, hash });
  } catch (error: any) {
    return c.json({ error: 'Failed to sign agreement' }, 500);
  }
});

// GET /api/public/portal/agreements/:id/specimen
// Public endpoint for the client-facing e-Sign modal / page
portalAgreementsRouter.get('/:id/specimen', async (c) => {
  const agreementId = c.req.param('id');
  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) return c.json({ error: 'Agreement not found' }, 404);

    const client = await db.select().from(clients).where(eq(clients.id, agreement.clientId)).get();
    const template = await db.select().from(agreementTemplates).where(eq(agreementTemplates.id, agreement.templateId)).get();

    return c.json({
      agreement: {
        id: agreement.id,
        clientId: agreement.clientId,
        clientName: client?.name || 'Valued Client',
        clientPhone: client?.phone || '',
        clientEmail: client?.email || '',
        templateName: template?.name || 'Service Agreement',
        division: template?.division || 'general',
        content: agreement.content,
        status: agreement.status,
        esignMethod: agreement.esignMethod,
        signedAt: agreement.signedAt,
        sha256Hash: agreement.sha256Hash,
        createdAt: agreement.createdAt,
      }
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to load agreement details' }, 500);
  }
});

// POST /api/public/portal/agreements/:id/direct-sign
// Public e-Sign endpoint (Drawn / Typed Name / OTP)
portalAgreementsRouter.post('/:id/direct-sign', zValidator('json', signAgreementSchema), async (c) => {
  const agreementId = c.req.param('id');
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) return c.json({ error: 'Agreement not found' }, 404);

    if (agreement.status === 'signed') {
      return c.json({ error: 'Agreement already signed' }, 409);
    }

    const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown browser';
    const now = Math.floor(Date.now() / 1000);

    // SHA-256 Hashing for DPDP evidentiary audit trail
    const msgBuffer = new TextEncoder().encode(agreement.content + (data.signatureData || ''));
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await db.update(agreements).set({
      status: 'signed',
      esignMethod: data.esignMethod,
      ipAddress,
      userAgent,
      sha256Hash,
      signedAt: now
    }).where(eq(agreements.id, agreementId));

    // Consent notice insertion
    const consentNotice = `OpusOS E-Sign Consent: Client executed Agreement ID ${agreementId} via ${data.esignMethod} with SHA-256 hash ${sha256Hash}.`;
    const noticeHash = await sha256Hex(consentNotice);

    await db.insert(consents).values({
      id: crypto.randomUUID(),
      clientId: agreement.clientId,
      consentType: 'core-processing',
      status: 'granted',
      ipAddress,
      sha256Hash: noticeHash,
      grantedAt: now
    });

    await auditEvent(c, {
      action: 'AGREEMENT_SIGNED',
      entityName: 'agreements',
      entityId: agreement.id,
      category: 'compliance',
      afterState: {
        clientId: agreement.clientId,
        esignMethod: data.esignMethod,
        signedAt: now,
        sha256Hash
      }
    });

    // Partner referral maturation (fail-open)
    try {
      const referral = await db.select().from(referrals).where(eq(referrals.clientId, agreement.clientId)).get();
      if (referral) {
        const paidRows = await db.select().from(payments).where(eq(payments.clientId, agreement.clientId)).all();
        const realizedPaise = paidRows.reduce((a: number, p: any) => {
          if (p.type !== 'receipt' && p.type !== 'refund') return a;
          if (!['confirmed', 'synced', 'paid'].includes(p.status)) return a;
          const amt = Number(p.amount || 0);
          return p.type === 'refund' ? a - Math.abs(amt) : a + amt;
        }, 0);
        const commissionPaise = Math.max(0, Math.floor((realizedPaise * (referral.commissionRate || 5)) / 100));
        const ledgerRow = await db.select().from(commissionLedger).where(eq(commissionLedger.referralId, referral.id)).get();
        if (ledgerRow && ledgerRow.status !== 'paid') {
          await db.update(commissionLedger)
            .set({ amount: commissionPaise, status: 'matured' })
            .where(eq(commissionLedger.referralId, referral.id));
        }
      }
    } catch {}

    // Confirmation email
    try {
      const client = await db.select().from(clients).where(eq(clients.id, agreement.clientId)).get();
      if (client?.email) {
        const { subject, html } = agreementSignedTemplate({
          clientName: client.name || 'Valued Client',
          agreementTitle: `Service Agreement (${agreement.id})`,
          downloadUrl: `https://opusoverseas.com/login`,
        });
        await sendNotification(c.env as any, db as any, {
          channel: 'email',
          to: client.email,
          subject, body: html,
          clientId: client.id,
        });
      }
    } catch {}

    return c.json({
      success: true,
      sha256Hash,
      signedAt: now,
      message: 'Agreement successfully signed and legally executed.'
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to sign agreement' }, 500);
  }
});
