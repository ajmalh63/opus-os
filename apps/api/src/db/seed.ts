import { getDb } from './client.js';
import {
  pipelineStages, clauseLibrary, permissions, roles, businessProfile, campaigns, campaignTouches, visaProducts,
  universities, jobPostings, attestationChains, groupDepartures, attestationRateCards, attestationRateMatrix
} from './schema.js';
import { eq } from 'drizzle-orm';
import { PERMISSION_SEED, ROLES_SEED } from '../routes/rbac.js';

export type DbClient = ReturnType<typeof getDb>;

// Fresh-D1 bootstrap (B-2). A new database must not boot empty: without default
// kanban columns, clause library, roles/permissions or business profile, the app
// is unusable on day one. This idempotently seeds each table only when empty.
const DEFAULT_STAGES: { key: string; name: string; sequence: number; wipLimit?: number }[] = [
  { key: 'lead', name: 'Lead', sequence: 0 },
  { key: 'qualified', name: 'Qualified', sequence: 1 },
  { key: 'documents', name: 'Documents', sequence: 2, wipLimit: 40 },
  { key: 'processing', name: 'Processing', sequence: 3 },
  { key: 'complete', name: 'Complete', sequence: 4 },
];

const DEFAULT_CLAUSES: { clauseId: string; title: string; body: string; division: string; mandatory: boolean }[] = [
  { clauseId: 'dpdp-consent', title: 'DPDP Data Processing Consent', body: 'The client consents to Opus Overseas processing personal and identity documents solely for the purposes of the service engaged, under the Digital Personal Data Protection Act 2023.', division: 'all', mandatory: true },
  { clauseId: 'scope-of-service', title: 'Scope of Service', body: 'Opus Overseas will provide consultation, documentation, processing and related services for the chosen division as outlined at time of engagement.', division: 'all', mandatory: true },
  { clauseId: 'service-fee', title: 'Service Fees and Payment', body: 'Fees are payable as quoted and recorded in the ledger. All amounts are payable in INR; taxes (GST) are shown separately.', division: 'all', mandatory: true },
  { clauseId: 'cancellation-refund', title: 'Cancellation and Refunds', body: 'Refunds are governed by Opus Overseas cancellation policy as applicable to the service; third-party fees once paid are generally non-refundable.', division: 'all', mandatory: false },
  { clauseId: 'doc-authentication', title: 'Document Authentication', body: 'Client certifies documents provided are genuine. Attestation/legalization services are subject to the validating authority’s decision.', division: 'attestation', mandatory: true },
  { clauseId: 'data-share-consent', title: 'Employer Data Sharing Consent', body: 'For manpower services, client consents to sharing of profile data with verified overseas employers for recruitment purposes.', division: 'manpower', mandatory: true },
];

export async function seedDatabase(db: DbClient): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Pipeline stages — skip if any exist already
  const stages = await db.select().from(pipelineStages).all();
  if (stages.length === 0) {
    for (const s of DEFAULT_STAGES) {
      await db.insert(pipelineStages).values({ id: crypto.randomUUID(), key: s.key, name: s.name, sequence: s.sequence, wipLimit: s.wipLimit ?? null, createdAt: now });
    }
  }
  await seedDatabaseRest(db);
}

// Self-healing bootstrap used by hot paths (leads intake, kanban) when a fresh
// DB has not gone through the seed step. Insert-or-ignore — safe to call often.
export async function ensurePipelineStages(db: DbClient): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const s of DEFAULT_STAGES) {
    try {
      await db.insert(pipelineStages).values({
        id: crypto.randomUUID(),
        key: s.key,
        name: s.name,
        sequence: s.sequence,
        wipLimit: s.wipLimit ?? null,
        createdAt: now,
      }).onConflictDoNothing();
    } catch { /* concurrent insert safe */ }
  }
}

// ============ remainder of full seedDatabase body ============
export async function seedDatabaseRest(db: DbClient): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  // Clause library
  const clauses = await db.select().from(clauseLibrary).all();
  if (clauses.length === 0) {
    for (const cl of DEFAULT_CLAUSES) {
      await db.insert(clauseLibrary).values({ id: crypto.randomUUID(), clauseId: cl.clauseId, title: cl.title, body: cl.body, division: cl.division, mandatory: cl.mandatory, version: 'v1.0', createdAt: now });
    }
  }

  // Permissions + default roles (mirror rbac /seed; single seed source)
  const perms = await db.select().from(permissions).all();
  if (perms.length === 0) {
    for (const p of PERMISSION_SEED) {
      await db.insert(permissions).values({ code: p.code, family: p.family, label: p.label, ownerOnly: !!p.ownerOnly, seeded: true });
    }
  }
  const roleRows = await db.select().from(roles).all();
  if (roleRows.length === 0) {
    for (const r of ROLES_SEED) {
      await db.insert(roles).values({ id: r.id, name: r.name, code: r.code, description: r.desc, permissionsJson: JSON.stringify(r.perms), system: true, editable: false, color: 'brand-gold', createdAt: now, updatedAt: now });
    }
  }

// Business profile (single 'main' row)
  const profile = await db.select().from(businessProfile).all();
  if (profile.length === 0) {
    await db.insert(businessProfile).values({
      id: 'main',
      legalName: 'Opus Overseas',
      gstin: 'PENDING_GSTIN',
      stateCode: '36',
      stateName: 'Telangana',
      address: 'Nizamabad GPO complex block, Hyderabad Road, Nizamabad, Telangana, India.',
      hsnJson: JSON.stringify({ 'study-abroad': '9983', 'visa': '9983', 'umrah': '9983', 'attestation': '9983', 'manpower': '9983' }),
      gstRateJson: '{}',
      updatedAt: now,
    });
  }

  // 29.1 Seed campaigns (Wave 2) — one pilot per division; idempotent by key.
  await seedCampaigns(db);

  // 29.2 Seed master visa products inventory (idempotently)
  const existingVisas = await db.select().from(visaProducts).all();
  if (existingVisas.length === 0) {
    const defaultVisas = [
  {
    "id": "v1",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 30 Days Single Entry (Without Insurance)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 720000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v2",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 30 Days Express Single Entry (Without Insurance)",
    "entryType": "Single Entry",
    "processingTime": "1 Day",
    "feePaise": 820000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v3",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 30 Days Multiple Entry (Without Insurance)",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1300000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v4",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 60 Days Single Entry (Without Insurance)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1100000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v5",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 60 Days Multiple Entry (Without Insurance)",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1800000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v6",
    "country": "Thailand 🇹🇭",
    "visaType": "Thailand 15 Days Visa on Arrival (E-VOA)",
    "entryType": "Single Entry",
    "processingTime": "1-2 Days",
    "feePaise": 550000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Confirmed hotel booking\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v7",
    "country": "Thailand 🇹🇭",
    "visaType": "Thailand 30 Days Single Entry Tourist",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Confirmed flight ticket\"]",
    "status": "active"
  },
  {
    "id": "v8",
    "country": "Thailand 🇹🇭",
    "visaType": "Thailand 60 Days Single Entry Tourist",
    "entryType": "Single Entry",
    "processingTime": "3-5 Days",
    "feePaise": 950000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank statement\", \"Flight booking\"]",
    "status": "active"
  },
  {
    "id": "v9",
    "country": "Thailand 🇹🇭",
    "visaType": "Thailand Multiple Entry Tourist (METV)",
    "entryType": "Multiple Entry",
    "processingTime": "5-7 Days",
    "feePaise": 1800000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank statement 6 months\", \"Employment proof\"]",
    "status": "active"
  },
  {
    "id": "v10",
    "country": "Malaysia 🇲🇾",
    "visaType": "Malaysia 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "2-3 Days",
    "feePaise": 380000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Flight booking\", \"Hotel voucher\"]",
    "status": "active"
  },
  {
    "id": "v11",
    "country": "Malaysia 🇲🇾",
    "visaType": "Malaysia 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3 Days",
    "feePaise": 650000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Flight ticket\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v12",
    "country": "Malaysia 🇲🇾",
    "visaType": "Malaysia 30 Days Single Entry Business",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 800000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Invitation letter\", \"Company proof\"]",
    "status": "active"
  },
  {
    "id": "v13",
    "country": "Vietnam 🇻🇳",
    "visaType": "Vietnam 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 420000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Entry/Exit port info\"]",
    "status": "active"
  },
  {
    "id": "v14",
    "country": "Vietnam 🇻🇳",
    "visaType": "Vietnam 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Entry/Exit port info\"]",
    "status": "active"
  },
  {
    "id": "v15",
    "country": "Vietnam 🇻🇳",
    "visaType": "Vietnam 90 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v16",
    "country": "Vietnam 🇻🇳",
    "visaType": "Vietnam 90 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1100000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v17",
    "country": "Sri Lanka 🇱🇰",
    "visaType": "Sri Lanka 30 Days Tourist ETA (Double Entry)",
    "entryType": "Double Entry",
    "processingTime": "1-2 Days",
    "feePaise": 450000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v18",
    "country": "Sri Lanka 🇱🇰",
    "visaType": "Sri Lanka 30 Days Business ETA (Multiple Entry)",
    "entryType": "Multiple Entry",
    "processingTime": "2 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Company invitation\"]",
    "status": "active"
  },
  {
    "id": "v19",
    "country": "Sri Lanka 🇱🇰",
    "visaType": "Sri Lanka 2 Year Tourist Visa (Multiple Entry)",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1850000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank balance proof\"]",
    "status": "active"
  },
  {
    "id": "v20",
    "country": "Azerbaijan 🇦🇿",
    "visaType": "Azerbaijan 30 Days Single Entry ASAN E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v21",
    "country": "Azerbaijan 🇦🇿",
    "visaType": "Azerbaijan 30 Days Urgent ASAN E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Hours",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v22",
    "country": "Bahrain 🇧🇭",
    "visaType": "Bahrain 14 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3-5 Days",
    "feePaise": 450000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v23",
    "country": "Bahrain 🇧🇭",
    "visaType": "Bahrain 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "4 Days",
    "feePaise": 780000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v24",
    "country": "Bahrain 🇧🇭",
    "visaType": "Bahrain 1 Year Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "4-5 Days",
    "feePaise": 1650000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank statement 3 months\"]",
    "status": "active"
  },
  {
    "id": "v25",
    "country": "Cambodia 🇰🇭",
    "visaType": "Cambodia 30 Days Single Entry E-Visa (Tourist)",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 380000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v26",
    "country": "Cambodia 🇰🇭",
    "visaType": "Cambodia 30 Days Single Entry E-Visa (Business)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 550000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Business invitation\"]",
    "status": "active"
  },
  {
    "id": "v27",
    "country": "Egypt 🇪🇬",
    "visaType": "Egypt 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "5 Days",
    "feePaise": 320000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v28",
    "country": "Egypt 🇪🇬",
    "visaType": "Egypt 90 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "5-7 Days",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v29",
    "country": "Ethiopia 🇪🇹",
    "visaType": "Ethiopia 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v30",
    "country": "Ethiopia 🇪🇹",
    "visaType": "Ethiopia 90 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "4 Days",
    "feePaise": 1250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v31",
    "country": "Georgia 🇬🇪",
    "visaType": "Georgia 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "5 Days",
    "feePaise": 280000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Travel insurance\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v32",
    "country": "Georgia 🇬🇪",
    "visaType": "Georgia 90 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "5-7 Days",
    "feePaise": 550000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Travel insurance\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v33",
    "country": "Hong Kong 🇭🇰",
    "visaType": "Hong Kong 14 Days Pre-Arrival Registration (PAR)",
    "entryType": "Multiple Entry",
    "processingTime": "1 Day",
    "feePaise": 120000,
    "requiredDocsJson": "[\"Passport details\"]",
    "status": "active"
  },
  {
    "id": "v34",
    "country": "Hong Kong 🇭🇰",
    "visaType": "Hong Kong 30 Days Visit Visa (Tourist)",
    "entryType": "Single Entry",
    "processingTime": "4 Weeks",
    "feePaise": 380000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Financial status proof\", \"Sponsor letter\"]",
    "status": "active"
  },
  {
    "id": "v35",
    "country": "Indonesia 🇮🇩",
    "visaType": "Indonesia 30 Days Visa on Arrival (E-VOA)",
    "entryType": "Single Entry",
    "processingTime": "1 Day",
    "feePaise": 350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return flight\"]",
    "status": "active"
  },
  {
    "id": "v36",
    "country": "Indonesia 🇮🇩",
    "visaType": "Indonesia 60 Days Single Entry Tourist Visa (B211A)",
    "entryType": "Single Entry",
    "processingTime": "5-7 Days",
    "feePaise": 1250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank statement min $2000\", \"Sponsor details\"]",
    "status": "active"
  },
  {
    "id": "v37",
    "country": "Kenya 🇰🇪",
    "visaType": "Kenya 90 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 580000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v38",
    "country": "Kenya 🇰🇪",
    "visaType": "Kenya 90 Days Transit E-Visa",
    "entryType": "Single Entry",
    "processingTime": "2 Days",
    "feePaise": 250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Connecting flight ticket\"]",
    "status": "active"
  },
  {
    "id": "v39",
    "country": "Morocco 🇲🇦",
    "visaType": "Morocco 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel voucher\"]",
    "status": "active"
  },
  {
    "id": "v40",
    "country": "Morocco 🇲🇦",
    "visaType": "Morocco 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "4 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel voucher\"]",
    "status": "active"
  },
  {
    "id": "v41",
    "country": "Myanmar 🇲🇲",
    "visaType": "Myanmar 28 Days Single Entry E-Visa (Tourist)",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 480000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel voucher\"]",
    "status": "active"
  },
  {
    "id": "v42",
    "country": "Myanmar 🇲🇲",
    "visaType": "Myanmar 70 Days Single Entry E-Visa (Business)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Invitation letter\", \"Company registration copy\"]",
    "status": "active"
  },
  {
    "id": "v43",
    "country": "Oman 🇴🇲",
    "visaType": "Oman 10 Days Single Entry E-Visa (26A)",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v44",
    "country": "Oman 🇴🇲",
    "visaType": "Oman 30 Days Single Entry E-Visa (26B)",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 550000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v45",
    "country": "Oman 🇴🇲",
    "visaType": "Oman 1 Year Multiple Entry E-Visa (36B)",
    "entryType": "Multiple Entry",
    "processingTime": "4 Days",
    "feePaise": 1350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Valid GCC visa/Entry status copy\"]",
    "status": "active"
  },
  {
    "id": "v46",
    "country": "Qatar 🇶🇦",
    "visaType": "Qatar 30 Days Visa on Arrival (Hayya)",
    "entryType": "Single Entry",
    "processingTime": "1 Day",
    "feePaise": 250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking via Discover Qatar\"]",
    "status": "active"
  },
  {
    "id": "v47",
    "country": "Qatar 🇶🇦",
    "visaType": "Qatar 30 Days E-Visa (Tourist)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 380000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Flight booking\"]",
    "status": "active"
  },
  {
    "id": "v48",
    "country": "Russia 🇷🇺",
    "visaType": "Russia 16 Days Unified E-Visa",
    "entryType": "Single Entry",
    "processingTime": "4 Days",
    "feePaise": 480000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Medical insurance\"]",
    "status": "active"
  },
  {
    "id": "v49",
    "country": "Russia 🇷🇺",
    "visaType": "Russia 30 Days Single Entry Tourist Visa",
    "entryType": "Single Entry",
    "processingTime": "7-10 Days",
    "feePaise": 950000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Tourist invitation voucher\"]",
    "status": "active"
  },
  {
    "id": "v50",
    "country": "Turkey 🇹🇷",
    "visaType": "Turkey 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "2 Days",
    "feePaise": 420000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Valid US/UK/Schengen visa copy\"]",
    "status": "active"
  },
  {
    "id": "v51",
    "country": "Turkey 🇹🇷",
    "visaType": "Turkey 90 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 950000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Travel insurance\"]",
    "status": "active"
  },
  {
    "id": "v52",
    "country": "Uzbekistan 🇺🇿",
    "visaType": "Uzbekistan 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 280000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v53",
    "country": "Uzbekistan 🇺🇿",
    "visaType": "Uzbekistan 30 Days Double Entry E-Visa",
    "entryType": "Double Entry",
    "processingTime": "3 Days",
    "feePaise": 450000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v54",
    "country": "Uzbekistan 🇺🇿",
    "visaType": "Uzbekistan 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v55",
    "country": "Zambia 🇿🇲",
    "visaType": "Zambia 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v56",
    "country": "Zambia 🇿🇲",
    "visaType": "Zambia 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "4 Days",
    "feePaise": 650000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  }
]
    for (const v of defaultVisas) {
      await db.insert(visaProducts).values({ ...v, createdAt: now, updatedAt: now });
    }
  }

  // 62. Master university catalog (Study Abroad eligibility matcher + public
  // checklist artifact). Idempotent by key — insert only when the table is empty.
  const uniRows = await db.select().from(universities).all();
  if (uniRows.length === 0) {
    const defaultUnis = [
      { id: 'u-birmingham', name: 'University of Birmingham', country: 'UK', minGpa: 7.0, ieltsMin: 6.0, budgetLpaMin: 22, intake: 'Fall 2026' },
      { id: 'u-manchester', name: 'University of Manchester', country: 'UK', minGpa: 7.5, ieltsMin: 6.5, budgetLpaMin: 26, intake: 'Fall 2026' },
      { id: 'u-leeds', name: 'University of Leeds', country: 'UK', minGpa: 6.5, ieltsMin: 6.0, budgetLpaMin: 20, intake: 'Spring 2027' },
      { id: 'u-texas', name: 'University of Texas at Dallas', country: 'USA', minGpa: 7.5, ieltsMin: 6.5, budgetLpaMin: 30, intake: 'Fall 2026' },
      { id: 'u-sunysb', name: 'Stony Brook University', country: 'USA', minGpa: 7.0, ieltsMin: 6.5, budgetLpaMin: 28, intake: 'Spring 2027' },
      { id: 'u-toronto', name: 'University of Toronto', country: 'Canada', minGpa: 8.0, ieltsMin: 6.5, budgetLpaMin: 34, intake: 'Fall 2026' },
      { id: 'u-concordia', name: 'Concordia University', country: 'Canada', minGpa: 6.5, ieltsMin: 6.5, budgetLpaMin: 22, intake: 'Fall 2026' },
      { id: 'u-sydney', name: 'University of Sydney', country: 'Australia', minGpa: 7.5, ieltsMin: 6.5, budgetLpaMin: 32, intake: 'Fall 2026' },
      { id: 'u-deakin', name: 'Deakin University', country: 'Australia', minGpa: 6.0, ieltsMin: 6.0, budgetLpaMin: 20, intake: 'Spring 2027' },
      { id: 'u-tum', name: 'TU Munich', country: 'Germany', minGpa: 8.0, ieltsMin: 6.5, budgetLpaMin: 12, intake: 'Fall 2026' },
      { id: 'u-bonn', name: 'University of Bonn', country: 'Germany', minGpa: 7.5, ieltsMin: 6.0, budgetLpaMin: 11, intake: 'Spring 2027' },
      { id: 'u-heriot', name: 'Heriot-Watt University (Dubai)', country: 'UAE', minGpa: 6.0, ieltsMin: 6.0, budgetLpaMin: 18, intake: 'Fall 2026' },
    ];
    for (const u of defaultUnis) {
      await db.insert(universities).values({ ...u, createdAt: now });
    }
  }

  // 63. Job postings (Manpower board: public/secret + collar + careers ticker).
  // Segmented so the OS board can show secret roles while the public page only
  // ever sees tier='public' rows (public.ts filters by tier).
  const jobRows = await db.select().from(jobPostings).all();
  if (jobRows.length === 0) {
    const defaultJobs = [
      { id: 'job-welder', title: 'Structural Welder', country: 'Qatar', sector: 'Construction', salaryText: 'QR 2,500 (~₹57,000)', collar: 'blue_collar' as const, tier: 'public' as const },
      { id: 'job-coordinator', title: 'Project Coordinator', country: 'UAE', sector: 'Infrastructure', salaryText: 'AED 8,500 (~₹1,92,000)', collar: 'white_collar' as const, tier: 'public' as const },
      { id: 'job-electrician', title: 'Industrial Electrician', country: 'Oman', sector: 'Energy', salaryText: 'OMR 350 (~₹75,000)', collar: 'blue_collar' as const, tier: 'secret' as const },
      { id: 'job-supervisor', title: 'Construction Supervisor', country: 'Saudi Arabia', sector: 'Construction', salaryText: 'SAR 4,500 (~₹1,00,000)', collar: 'blue_collar' as const, tier: 'public' as const },
      { id: 'job-hvac', title: 'HVAC Technician', country: 'Qatar', sector: 'Facilities', salaryText: 'QR 2,200 (~₹50,000)', collar: 'blue_collar' as const, tier: 'public' as const },
      { id: 'job-accountant', title: 'Accounts Officer', country: 'UAE', sector: 'Finance', salaryText: 'AED 6,000 (~₹1,35,000)', collar: 'white_collar' as const, tier: 'secret' as const },
      { id: 'job-nurse', title: 'Staff Nurse', country: 'Saudi Arabia', sector: 'Healthcare', salaryText: 'SAR 3,800 (~₹85,000)', collar: 'white_collar' as const, tier: 'public' as const },
      { id: 'job-driver', title: 'Heavy Vehicle Driver', country: 'Qatar', sector: 'Logistics', salaryText: 'QR 1,900 (~₹43,000)', collar: 'blue_collar' as const, tier: 'public' as const },
    ];
    for (const j of defaultJobs) {
      await db.insert(jobPostings).values({ ...j, status: 'open', createdAt: now });
    }
  }

  // 64. Attestation chains (legalization workflows per destination country).
  // stepsJson shape: [{ step, feePaise, timelineDays }] — used by the public
  // chain-builder artifact + the Attestation portal rate cards.
  const chainRows = await db.select().from(attestationChains).all();
  if (chainRows.length === 0) {
    const defaultChains = [
      { id: 'chain-uae', country: 'UAE 🇦🇪', stepsJson: JSON.stringify([
        { step: 'State HRD Authentication', feePaise: 800, timelineDays: 2 },
        { step: 'MEA Legalization', feePaise: 700, timelineDays: 3 },
        { step: 'UAE Embassy Attestation', feePaise: 1800, timelineDays: 5 },
        { step: 'Ministry of Foreign Affairs (UAE)', feePaise: 1200, timelineDays: 2 }
      ]) },
      { id: 'chain-saudi', country: 'Saudi Arabia 🇸🇦', stepsJson: JSON.stringify([
        { step: 'State HRD Authentication', feePaise: 800, timelineDays: 2 },
        { step: 'MEA Legalization', feePaise: 700, timelineDays: 3 },
        { step: 'Saudi Embassy Attestation', feePaise: 2000, timelineDays: 6 }
      ]) },
      { id: 'chain-uk-apostille', country: 'United Kingdom (Apostille) 🇬🇧', stepsJson: JSON.stringify([
        { step: 'State HRD / SDM', feePaise: 900, timelineDays: 3 },
        { step: 'MEA Apostille', feePaise: 900, timelineDays: 4 }
      ]) },
      { id: 'chain-us-apostille', country: 'United States (Apostille) 🇺🇸', stepsJson: JSON.stringify([
        { step: 'Notary', feePaise: 500, timelineDays: 1 },
        { step: 'State Secretary Authentication', feePaise: 600, timelineDays: 3 },
        { step: 'US Apostille (Federal)', feePaise: 700, timelineDays: 4 }
      ]) },
    ];
    for (const ch of defaultChains) {
      await db.insert(attestationChains).values({ ...ch, createdAt: now });
    }
  }

  // 65. Umrah group departures (idempotent by id) — real seat inventory for
  // the Umrah portal + public departure artifact.
  const depRows = await db.select().from(groupDepartures).all();
  if (depRows.length === 0) {
    const now31 = now + 18 * 86400;  // Aug 2026
    const now61 = now + 66 * 86400;  // Oct 2026
    await db.insert(groupDepartures).values([
      { id: 'dep-aug-2026', packageTier: 'standard', departureDate: now31, capacity: 30, bookedSeats: 12, price: 12500000, bookingFee: 1000000, status: 'open', createdAt: now },
      { id: 'dep-oct-2026', packageTier: 'premium', departureDate: now61, capacity: 30, bookedSeats: 8, price: 15000000, bookingFee: 1200000, status: 'open', createdAt: now },
      { id: 'dep-nov-2026', packageTier: 'economy', departureDate: now61 + 28 * 86400, capacity: 30, bookedSeats: 5, price: 8000000, bookingFee: 500000, status: 'open', createdAt: now },
    ]);
  }
}

// Pilot campaign catalog — the default-set study-abroad deadline campaign and
// a manpower job-match hint. Idempotent (onConflictDoNothing on key).
export async function seedCampaigns(db: DbClient): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  const CSAW_ID = 'camp-study-abroad-deadline';
  await db.insert(campaigns).values({
    id: CSAW_ID,
    key: 'study-abroad-country-deadline',
    name: 'Country & Intake Deadline Campaign',
    description: 'Division-wide study-abroad nurture with country-aware deadline copy and a free screening call each.',
    division: 'study-abroad',
    eligibilityJson: JSON.stringify({ targetCountry: ['US', 'UK', 'Canada', 'Australia', 'Germany'] }),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await db.insert(campaignTouches).values([
    { id: crypto.randomUUID(), campaignId: CSAW_ID, seq: 1, day: 0, stage: 'value',
      body: `Hi {{name}}! Curious how {{targetCountry}} deadlines work for your profile? No pressure at all.`,
      createdAt: now },
    { id: crypto.randomUUID(), campaignId: CSAW_ID, seq: 2, day: 3, stage: 'case_study',
      body: `{{name}}, a {{targetCountry}} admit from last intake came to us with a 2.9 GPA and still made it. Ask us how.`,
      createdAt: now },
    { id: crypto.randomUUID(), campaignId: CSAW_ID, seq: 3, day: 5, stage: 'offer',
      body: `Free 20-min eligibility check for {{targetCountry}} — find your realistic university list. Reply YES and we send the link.`,
      createdAt: now },
    { id: crypto.randomUUID(), campaignId: CSAW_ID, seq: 4, day: 12, stage: 'final',
      body: `{{name}}, we would love to onboard you before {{targetCountry}} deadlines crunch. Last note unless you write back.`,
      createdAt: now },
  ]).onConflictDoNothing();

  const CMP = 'manpower-job-match';
  await db.insert(campaigns).values({
    id: CMP,
    key: 'manpower-job-match',
    name: 'Manpower job match alert',
    description: 'Active job postings for manpower candidates by sector.',
    division: 'manpower',
    eligibilityJson: '{}',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await db.insert(campaignTouches).values([
    { id: crypto.randomUUID(), campaignId: CMP, seq: 1, day: 0, stage: 'value',
      body: `{{name}}, a matching {{sector}} role opened in the Manpower bucket today. Should we preview it?`,
      createdAt: now },
    { id: crypto.randomUUID(), campaignId: CMP, seq: 2, day: 3, stage: 'case_study',
      body: `A technician from your sector just got placed in 3 weeks through us. Could you be next?`,
      createdAt: now },
  ]).onConflictDoNothing().catch(() => {});
}

// Bootstrap the owner/super-admin first-run account.
// No-ops if the email already exists; password comes from env (ADMIN_EMAIL /
// ADMIN_PASSWORD) or the caller's dev default.
export async function seedSuperAdmin(db: DbClient, adminEmail: string, adminPassword: string): Promise<{ created: boolean; email: string }> {
  const { users } = await import('../db/schema.js');
  const existing = await db.select().from(users).all();
  const found = existing.find((u: any) => (u.email || '').toLowerCase() === adminEmail.toLowerCase());
  if (found) return { created: false, email: adminEmail };

  const { hashPassword } = await import('better-auth/crypto');
  const pwHash = await hashPassword(adminPassword);
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    name: 'Owner',
    email: adminEmail,
    emailVerified: true,
    passwordHash: pwHash,
    twoFactorEnabled: false,
    role: 'super_admin',
    userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  return { created: true, email: adminEmail };
}
// ── Attestation rate cards (Phase 4) — market ranges, NO supplier names (B2C).
// Prices are indicative; the client page shows "not guaranteed, subject to change".
const ATTESTATION_RATE_CARDS: { country: string; category: 'educational' | 'personal' | 'commercial'; route: 'apostille' | 'embassy'; pricePaise: number; timelineDays: number; steps: string[] }[] = [
  // ── Apostille route (Hague Convention — 125+ countries) ──
  { country: 'USA', category: 'educational', route: 'apostille', pricePaise: 250000, timelineDays: 8, steps: ['State HRD / GAD', 'MEA Apostille'] },
  { country: 'USA', category: 'personal', route: 'apostille', pricePaise: 220000, timelineDays: 7, steps: ['Notary', 'SDM / Home Dept', 'MEA Apostille'] },
  { country: 'USA', category: 'commercial', route: 'apostille', pricePaise: 450000, timelineDays: 10, steps: ['Chamber of Commerce', 'MEA Apostille'] },
  { country: 'UK', category: 'educational', route: 'apostille', pricePaise: 250000, timelineDays: 8, steps: ['State HRD / GAD', 'MEA Apostille'] },
  { country: 'UK', category: 'personal', route: 'apostille', pricePaise: 220000, timelineDays: 7, steps: ['Notary', 'SDM / Home Dept', 'MEA Apostille'] },
  { country: 'UK', category: 'commercial', route: 'apostille', pricePaise: 450000, timelineDays: 10, steps: ['Chamber of Commerce', 'MEA Apostille'] },
  { country: 'Canada', category: 'educational', route: 'apostille', pricePaise: 250000, timelineDays: 8, steps: ['State HRD / GAD', 'MEA Apostille'] },
  { country: 'Canada', category: 'personal', route: 'apostille', pricePaise: 220000, timelineDays: 7, steps: ['Notary', 'SDM / Home Dept', 'MEA Apostille'] },
  { country: 'Canada', category: 'commercial', route: 'apostille', pricePaise: 450000, timelineDays: 10, steps: ['Chamber of Commerce', 'MEA Apostille'] },
  { country: 'Australia', category: 'educational', route: 'apostille', pricePaise: 250000, timelineDays: 8, steps: ['State HRD / GAD', 'MEA Apostille'] },
  { country: 'Australia', category: 'personal', route: 'apostille', pricePaise: 220000, timelineDays: 7, steps: ['Notary', 'SDM / Home Dept', 'MEA Apostille'] },
  { country: 'Australia', category: 'commercial', route: 'apostille', pricePaise: 450000, timelineDays: 10, steps: ['Chamber of Commerce', 'MEA Apostille'] },
  { country: 'Germany', category: 'educational', route: 'apostille', pricePaise: 250000, timelineDays: 8, steps: ['State HRD / GAD', 'MEA Apostille'] },
  { country: 'Germany', category: 'personal', route: 'apostille', pricePaise: 220000, timelineDays: 7, steps: ['Notary', 'SDM / Home Dept', 'MEA Apostille'] },
  { country: 'Germany', category: 'commercial', route: 'apostille', pricePaise: 450000, timelineDays: 10, steps: ['Chamber of Commerce', 'MEA Apostille'] },
  { country: 'Saudi Arabia', category: 'educational', route: 'apostille', pricePaise: 300000, timelineDays: 10, steps: ['State HRD / GAD', 'MEA Apostille'] },
  { country: 'Saudi Arabia', category: 'personal', route: 'apostille', pricePaise: 280000, timelineDays: 9, steps: ['Notary', 'SDM / Home Dept', 'MEA Apostille'] },
  { country: 'Saudi Arabia', category: 'commercial', route: 'apostille', pricePaise: 500000, timelineDays: 12, steps: ['Chamber of Commerce', 'MEA Apostille'] },
  { country: 'China', category: 'educational', route: 'apostille', pricePaise: 300000, timelineDays: 10, steps: ['State HRD / GAD', 'MEA Apostille'] },
  { country: 'China', category: 'personal', route: 'apostille', pricePaise: 280000, timelineDays: 9, steps: ['Notary', 'SDM / Home Dept', 'MEA Apostille'] },
  { country: 'China', category: 'commercial', route: 'apostille', pricePaise: 500000, timelineDays: 12, steps: ['Chamber of Commerce', 'MEA Apostille'] },
  // ── Embassy route (non-Hague — GCC + others) ──
  { country: 'UAE', category: 'educational', route: 'embassy', pricePaise: 600000, timelineDays: 18, steps: ['State HRD / GAD', 'MEA', 'UAE Embassy', 'UAE MOFA (in destination)'] },
  { country: 'UAE', category: 'personal', route: 'embassy', pricePaise: 550000, timelineDays: 16, steps: ['Notary', 'SDM / Home Dept', 'MEA', 'UAE Embassy', 'UAE MOFA (in destination)'] },
  { country: 'UAE', category: 'commercial', route: 'embassy', pricePaise: 900000, timelineDays: 20, steps: ['Chamber of Commerce', 'MEA', 'UAE Embassy', 'UAE MOFA (in destination)'] },
  { country: 'Qatar', category: 'educational', route: 'embassy', pricePaise: 650000, timelineDays: 20, steps: ['State HRD / GAD', 'MEA', 'Qatar Embassy', 'Qatar MOFA (in destination)'] },
  { country: 'Qatar', category: 'personal', route: 'embassy', pricePaise: 600000, timelineDays: 18, steps: ['Notary', 'SDM / Home Dept', 'MEA', 'Qatar Embassy', 'Qatar MOFA (in destination)'] },
  { country: 'Qatar', category: 'commercial', route: 'embassy', pricePaise: 950000, timelineDays: 22, steps: ['Chamber of Commerce', 'MEA', 'Qatar Embassy', 'Qatar MOFA (in destination)'] },
  { country: 'Kuwait', category: 'educational', route: 'embassy', pricePaise: 650000, timelineDays: 20, steps: ['State HRD / GAD', 'MEA', 'Kuwait Embassy', 'Kuwait MOFA (in destination)'] },
  { country: 'Kuwait', category: 'personal', route: 'embassy', pricePaise: 600000, timelineDays: 18, steps: ['Notary', 'SDM / Home Dept', 'MEA', 'Kuwait Embassy', 'Kuwait MOFA (in destination)'] },
  { country: 'Kuwait', category: 'commercial', route: 'embassy', pricePaise: 950000, timelineDays: 22, steps: ['Chamber of Commerce', 'MEA', 'Kuwait Embassy', 'Kuwait MOFA (in destination)'] },
  { country: 'Oman', category: 'educational', route: 'embassy', pricePaise: 650000, timelineDays: 20, steps: ['State HRD / GAD', 'MEA', 'Oman Embassy', 'Oman MOFA (in destination)'] },
  { country: 'Oman', category: 'personal', route: 'embassy', pricePaise: 600000, timelineDays: 18, steps: ['Notary', 'SDM / Home Dept', 'MEA', 'Oman Embassy', 'Oman MOFA (in destination)'] },
  { country: 'Oman', category: 'commercial', route: 'embassy', pricePaise: 950000, timelineDays: 22, steps: ['Chamber of Commerce', 'MEA', 'Oman Embassy', 'Oman MOFA (in destination)'] },
  { country: 'Bahrain', category: 'educational', route: 'embassy', pricePaise: 650000, timelineDays: 20, steps: ['State HRD / GAD', 'MEA', 'Bahrain Embassy', 'Bahrain MOFA (in destination)'] },
  { country: 'Bahrain', category: 'personal', route: 'embassy', pricePaise: 600000, timelineDays: 18, steps: ['Notary', 'SDM / Home Dept', 'MEA', 'Bahrain Embassy', 'Bahrain MOFA (in destination)'] },
  { country: 'Bahrain', category: 'commercial', route: 'embassy', pricePaise: 950000, timelineDays: 22, steps: ['Chamber of Commerce', 'MEA', 'Bahrain Embassy', 'Bahrain MOFA (in destination)'] },
  { country: 'Malaysia', category: 'educational', route: 'embassy', pricePaise: 550000, timelineDays: 15, steps: ['State HRD / GAD', 'MEA', 'Malaysia Embassy'] },
  { country: 'Malaysia', category: 'personal', route: 'embassy', pricePaise: 500000, timelineDays: 14, steps: ['Notary', 'SDM / Home Dept', 'MEA', 'Malaysia Embassy'] },
  { country: 'Malaysia', category: 'commercial', route: 'embassy', pricePaise: 850000, timelineDays: 18, steps: ['Chamber of Commerce', 'MEA', 'Malaysia Embassy'] },
];

export async function seedAttestationRateMatrix(db: DbClient): Promise<void> {
  const existing = await db.select().from(attestationRateMatrix).all();
  if (existing.length > 0) return; // idempotent
  const now = Math.floor(Date.now() / 1000);
  for (const rc of ATTESTATION_RATE_CARDS) {
    await db.insert(attestationRateMatrix).values({
      id: crypto.randomUUID(),
      country: rc.country,
      category: rc.category,
      route: rc.route,
      pricePaise: rc.pricePaise,
      timelineDays: rc.timelineDays,
      stepsJson: JSON.stringify(rc.steps),
      active: true,
      createdAt: now,
      updatedAt: now
    });
  }
}

export async function seedAttestationRateCards(db: DbClient): Promise<void> {
  const existing = await db.select().from(attestationRateCards).all();
  if (existing.length > 0) return; // idempotent
  const now = Math.floor(Date.now() / 1000);
  for (const rc of ATTESTATION_RATE_CARDS) {
    await db.insert(attestationRateCards).values({
      id: crypto.randomUUID(),
      country: rc.country,
      category: rc.category,
      route: rc.route,
      pricePaise: rc.pricePaise,
      timelineDays: rc.timelineDays,
      stepsJson: JSON.stringify(rc.steps),
      active: true,
      createdAt: now,
      updatedAt: now
    });
  }
}
