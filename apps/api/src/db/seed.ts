import { getDb } from './client.js';
import {
  pipelineStages, clauseLibrary, agreementTemplates, permissions, roles, businessProfile, campaigns, campaignTouches, visaProducts,
  universities, jobPostings, attestationChains, groupDepartures, attestationRateCards, partnerCreatives
} from './schema.js';
import { eq } from 'drizzle-orm';
import { PERMISSION_SEED, ROLES_SEED } from '../routes/rbac.js';
import { MASTER_VISA_PRODUCTS } from '../data/visaProducts.js';

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
    for (const v of MASTER_VISA_PRODUCTS) {
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

  // 63. Job postings (Manpower board: public/secret + collar + manpower ticker).
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

// 65. Partner creative library (Phase B, §4 design doc) — 4 default text
// creatives partners can copy from the portal. Idempotent: skips when ANY row
// exists (owner manages the library after bootstrap; never re-seed over it).
const DEFAULT_PARTNER_CREATIVES: { title: string; url: string }[] = [
  { title: 'Study Abroad — Free Counselling', url: '/study-abroad' },
  { title: 'Visa Services — Expert Guidance', url: '/visa-services' },
  { title: 'Umrah Packages — Group Departures', url: '/umrah-travel' },
  { title: 'Manpower Recruitment — Global Jobs', url: '/recruitment' },
];

export async function seedPartnerCreatives(db: DbClient): Promise<void> {
  const existing = await db.select().from(partnerCreatives).all();
  if (existing.length > 0) return; // idempotent
  const now = Math.floor(Date.now() / 1000);
  for (const c of DEFAULT_PARTNER_CREATIVES) {
    await db.insert(partnerCreatives).values({
      id: crypto.randomUUID(),
      title: c.title,
      type: 'text',
      size: null,
      url: c.url,
      imageKey: null,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ============================================================
// AGREEMENT TEMPLATE LIBRARY (design doc: agreement-templates-esign.md §2)
// Clause library (~30 clauses: 8 general + per-division) + 10 templates
// (2 per division). Every template bundles the 8 general clauseIds with its
// division's clauseIds. Bodies are professional plain-language contract text
// (Indian context, ₹/paise, GST 18%, DPDP 2023) — no placeholders.
// Idempotent: clause pass skips when ANY clause exists; template pass skips
// when ANY template exists (owner curates after bootstrap).
// ============================================================

interface AgreementClauseSeed {
  clauseId: string;
  title: string;
  body: string;
  division: string;
  mandatory: boolean;
}

const AGREEMENT_GENERAL_CLAUSES: AgreementClauseSeed[] = [
  {
    clauseId: 'G1', title: 'Electronic Execution & Consent', division: 'general', mandatory: true,
    body: 'The Client agrees to execute this service agreement electronically and consents to conduct business with Opus Overseas through electronic records under the Information Technology Act, 2000 and the Digital Personal Data Protection Act, 2023. An electronic signature applied by the Client — whether by typing their name, drawing a signature, or confirming a one-time password — carries the same legal effect as a wet-ink signature. The Client confirms they have read the full text of this agreement before signing.',
  },
  {
    clauseId: 'G2', title: 'Payment Terms & GST', division: 'general', mandatory: false,
    body: 'Service fees shall be payable as quoted at the time of engagement, in Indian Rupees, and are recorded in the Opus Overseas ledger. Goods and Services Tax at the applicable rate (18% for most services) will be shown separately on invoices issued with a valid GSTIN. All payments are due by the milestone dates specified in the payment plan.',
  },
  {
    clauseId: 'G3', title: 'Refund & Cancellation', division: 'general', mandatory: false,
    body: 'Refunds, if any, are governed by the specific refund policy applicable to the service division of this agreement. Amounts already paid to government authorities, universities, embassies, or other third parties are non-refundable once disbursed. Service fees already earned by Opus Overseas for completed work are not refundable.',
  },
  {
    clauseId: 'G4', title: 'Force Majeure', division: 'general', mandatory: false,
    body: 'Neither party shall be liable for failure or delay in performance caused by events beyond reasonable control, including natural calamities, government action, epidemics, or civil unrest. The affected party shall notify the other as soon as reasonably practicable, and performances shall resume once the event ceases.',
  },
  {
    clauseId: 'G5', title: 'Confidentiality & DPDP', division: 'general', mandatory: false,
    body: 'Both parties shall keep confidential all non-public information exchanged under this agreement. Opus Overseas shall process the Client\'s personal data only for the purposes of the services engaged, subject to the Digital Personal Data Protection Act, 2023, and in accordance with the Client\'s recorded consents.',
  },
  {
    clauseId: 'G6', title: 'Dispute Resolution & Jurisdiction', division: 'general', mandatory: false,
    body: 'This agreement shall be governed by the laws of India. Any dispute arising out of or in connection with this agreement shall first be referred to mutual good-faith negotiation and, failing that, shall be subject to the exclusive jurisdiction of the courts at Nizamabad, Telangana.',
  },
  {
    clauseId: 'G7', title: 'Limitation of Liability', division: 'general', mandatory: false,
    body: 'Opus Overseas shall not be liable for indirect, incidental, or consequential losses, including loss of opportunity, reputation, or anticipated profits. Total liability under this agreement shall not exceed the service fees actually paid by the Client to Opus Overseas.',
  },
  {
    clauseId: 'G8', title: 'Entire Agreement & Amendments', division: 'general', mandatory: false,
    body: 'This agreement, together with the documents referred to in it, constitutes the entire agreement between the parties and supersedes all prior discussions and written agreements. Amendments shall be valid only when made in writing and executed by an authorised representative of Opus Overseas and the Client.',
  },
];

const AGREEMENT_DIVISION_CLAUSES: Record<string, AgreementClauseSeed[]> = {
  'study-abroad': [
    {
      clauseId: 'SA1', title: 'Counselling & Application Processing', division: 'study-abroad', mandatory: false,
      body: 'Opus Overseas shall provide counselling and end-to-end application processing for the study programmes selected by the Client. The scope includes profile review, course research, documentation guidance, and application submission support as per the engagement plan.',
    },
    {
      clauseId: 'SA2', title: 'University Selection & Shortlisting', division: 'study-abroad', mandatory: false,
      body: 'Opus Overseas shall shortlist universities matching the Client\'s profile, budget, and preferences, and present the shortlist for the Client\'s approval. Final selection shall be at the Client\'s discretion, and engagement with a university rests with the Client.',
    },
    {
      clauseId: 'SA3', title: 'SOP & Document Preparation', division: 'study-abroad', mandatory: false,
      body: 'Opus Overseas shall assist in preparing the Statement of Purpose and supporting documents based on information provided by the Client. The Client warrants that all information furnished is truthful, complete, and accurate.',
    },
    {
      clauseId: 'SA4', title: 'Application Submission & Deadlines', division: 'study-abroad', mandatory: false,
      body: 'Opus Overseas shall track application deadlines for the universities in scope and submit applications in a timely manner. Deadlines missed due to the Client\'s delay in providing required information or documents shall be at the Client\'s risk.',
    },
    {
      clauseId: 'SA5', title: 'Offer Acceptance & Deposit Handling', division: 'study-abroad', mandatory: false,
      body: 'Upon receiving an offer of admission, Opus Overseas shall assist the Client in reviewing its conditions and handling the deposit as instructed by the university. Deposits paid to the university are governed by the university\'s own policies and are non-refundable under this agreement once paid.',
    },
    {
      clauseId: 'SA6', title: 'Study Visa Assistance', division: 'study-abroad', mandatory: false,
      body: 'Opus Overseas shall assist the Client in preparing and submitting their study visa application, including documentation support and interview guidance. Issuance of the visa remains at the sole discretion of the relevant embassy or consulate.',
    },
    {
      clauseId: 'SA7', title: 'Refund Policy (Study Abroad)', division: 'study-abroad', mandatory: false,
      body: 'The study-abroad refund policy applies strictly as per the payment plan in the engagement letter. Fees paid to universities, courier charges, and third-party service charges are non-refundable once incurred. Refunds for unstarted Opus Overseas services may be claimed within seven days of payment, subject to a handling charge.',
    },
  ],
  visa: [
    {
      clauseId: 'V1', title: 'Visa Processing Services', division: 'visa', mandatory: false,
      body: 'Opus Overseas shall process the Client\'s visa application for the destination and visa category specified at engagement, including form filing and documentation preparation. Service timelines are indicative and depend on the processing times of the destination authority.',
    },
    {
      clauseId: 'V2', title: 'Document Verification & Submission', division: 'visa', mandatory: false,
      body: 'Opus Overseas shall verify the Client\'s documents against the requirements of the destination authority before submission. The Client warrants that all documents submitted are genuine; submission of forged documents will terminate this agreement immediately without refund.',
    },
    {
      clauseId: 'V3', title: 'Appointment & Slot Booking', division: 'visa', mandatory: false,
      body: 'Opus Overseas shall assist in booking the visa appointment or slot as available with the relevant authority. Appointment availability and dates are determined solely by the authority and cannot be guaranteed.',
    },
    {
      clauseId: 'V4', title: 'Fee & Payment Terms', division: 'visa', mandatory: false,
      body: 'Visa service fees payable to Opus Overseas are separate from government and consular fees, which are non-refundable once paid to the authority. Payments shall be made in Indian Rupees, with GST at the applicable rate (18% for most services) charged on the service component.',
    },
    {
      clauseId: 'V5', title: 'Refund Policy (Visa)', division: 'visa', mandatory: false,
      body: 'The visa refund policy applies only to Opus Overseas service charges for services not yet started. Government visa fees and consular charges are non-refundable, and no refund shall arise from a visa refusal, as outcomes rest with the authority.',
    },
  ],
  umrah: [
    {
      clauseId: 'U1', title: 'Package Booking Terms', division: 'umrah', mandatory: false,
      body: 'The Client books the Umrah package under the terms set out in this agreement and the package itinerary confirmed at booking. Prices are per person in Indian Rupees and include the components listed in the package inclusions; excluded items are payable separately.',
    },
    {
      clauseId: 'U2', title: 'Advance & Balance Payment Schedule', division: 'umrah', mandatory: false,
      body: 'A non-refundable advance (₹500 per person for standard bookings) is payable at the time of booking to reserve seats. The balance of the package price is payable in full not later than thirty days before the departure date, or as otherwise communicated at booking.',
    },
    {
      clauseId: 'U3', title: 'Cancellation & Refund (Umrah)', division: 'umrah', mandatory: false,
      body: 'Cancellation requests must be made in writing. Refunds, where applicable, are computed from the date of cancellation as per the package terms notified at booking; third-party costs (airfare, hotels, insurance) already incurred are non-refundable.',
    },
    {
      clauseId: 'U4', title: 'Travel & Insurance Disclaimer', division: 'umrah', mandatory: false,
      body: 'Travel arrangements, airline schedules, and hotel placements are subject to change by the respective providers. The Client is advised to obtain travel insurance; Opus Overseas acts as an organiser and is not liable for events of force majeure, flight disruptions, or acts of the travel providers.',
    },
  ],
  attestation: [
    {
      clauseId: 'A1', title: 'Attestation Service Terms', division: 'attestation', mandatory: false,
      body: 'Opus Overseas shall undertake the attestation or apostille of the Client\'s documents as per the destination requirements confirmed at engagement. Services follow the standard chain (State HRD, MEA, and the destination\'s Embassy or Apostille office) applicable to the document category.',
    },
    {
      clauseId: 'A2', title: 'Document Handling & Courier Terms', division: 'attestation', mandatory: false,
      body: 'Documents shall be handled with due care and couriered to the Client using a tracked courier service. The Client shall retain copies of originals submitted; Opus Overseas is not responsible for delays or loss caused by the courier or government authorities once dispatched.',
    },
    {
      clauseId: 'A3', title: 'Fee & Timeline Disclaimer', division: 'attestation', mandatory: false,
      body: 'Attestation pricing is indicative and is finalised when the complete document set and destination chain are confirmed. Processing timelines are estimates and depend on the State HRD, MEA, and Embassy or consular offices; neither pricing nor timelines are a guarantee.',
    },
    {
      clauseId: 'A4', title: 'Refund Policy (Attestation)', division: 'attestation', mandatory: false,
      body: 'Government, MEA, and embassy fees once paid are non-refundable. Opus Overseas service charges may be refunded, less a handling charge, only if the attestation service was not started; no refund arises if documents are withdrawn after processing has begun.',
    },
  ],
  manpower: [
    {
      clauseId: 'M1', title: 'Recruitment & Placement Services', division: 'manpower', mandatory: false,
      body: 'Opus Overseas shall provide recruitment and placement services, matching the Client\'s profile to verified overseas employer vacancies. Placement success depends on employer selection criteria, and no placement is guaranteed unless expressly recorded in writing.',
    },
    {
      clauseId: 'M2', title: 'Medical & Visa Processing', division: 'manpower', mandatory: false,
      body: 'The Client shall undergo medical and visa processing as required by the destination country, with Opus Overseas facilitating documentation and scheduling. Medical fitness and visa approval rest with the relevant authorities and are outside Opus Overseas\'s control.',
    },
    {
      clauseId: 'M3', title: 'Deployment & Employment Terms', division: 'manpower', mandatory: false,
      body: 'Employment terms, including salary, contract duration, and accommodation, are governed by the employer\'s offer letter and the destination country\'s labour laws. The Client shall report for deployment as per the schedule and shall comply with the employer\'s code of conduct.',
    },
    {
      clauseId: 'M4', title: 'Fee & Refund Policy (Manpower)', division: 'manpower', mandatory: false,
      body: 'Manpower service fees are payable as per the fee schedule at engagement. Fees once incurred for medical tests, police clearance, and visa processing are non-refundable; refund of service charges, if any, shall follow the policy communicated at booking, with no refund after deployment processing has commenced.',
    },
  ],
};

const AGREEMENT_TEMPLATES: { name: string; division: string }[] = [
  { name: 'Study Abroad — Full Service Agreement', division: 'study-abroad' },
  { name: 'Study Abroad — Application Processing Only', division: 'study-abroad' },
  { name: 'Visa — Visa Processing Service Agreement', division: 'visa' },
  { name: 'Visa — Document Assistance Agreement', division: 'visa' },
  { name: 'Umrah — Package Booking Agreement', division: 'umrah' },
  { name: 'Umrah — Group Departure Terms', division: 'umrah' },
  { name: 'Attestation — Service Agreement', division: 'attestation' },
  { name: 'Attestation — Document Handling Agreement', division: 'attestation' },
  { name: 'Manpower — Recruitment Service Agreement', division: 'manpower' },
  { name: 'Manpower — Deployment Processing Agreement', division: 'manpower' },
];

export async function seedAgreementLibrary(db: DbClient): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Clause library — skip entirely if ANY clause exists (owner curates after bootstrap)
  const existingClauses = await db.select().from(clauseLibrary).all();
  if (existingClauses.length === 0) {
    const all: AgreementClauseSeed[] = [
      ...AGREEMENT_GENERAL_CLAUSES,
      ...Object.values(AGREEMENT_DIVISION_CLAUSES).flat(),
    ];
    for (const cl of all) {
      await db.insert(clauseLibrary).values({
        id: crypto.randomUUID(),
        clauseId: cl.clauseId,
        title: cl.title,
        body: cl.body,
        division: cl.division,
        mandatory: cl.mandatory,
        version: 'v1.0',
        createdAt: now,
      });
    }
  }

  // Templates — skip if ANY template exists (owner curates after bootstrap)
  const existingTemplates = await db.select().from(agreementTemplates).all();
  if (existingTemplates.length === 0) {
    const generalIds = AGREEMENT_GENERAL_CLAUSES.map((c) => c.clauseId);
    for (const t of AGREEMENT_TEMPLATES) {
      const divisionIds = (AGREEMENT_DIVISION_CLAUSES[t.division] || []).map((c) => c.clauseId);
      await db.insert(agreementTemplates).values({
        id: crypto.randomUUID(),
        name: t.name,
        division: t.division,
        clausesJson: JSON.stringify([...generalIds, ...divisionIds]),
        version: 'v1.0',
        createdAt: now,
      });
    }
  }
}
