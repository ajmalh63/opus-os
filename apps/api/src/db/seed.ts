import { getDb } from './client.js';
import {
  pipelineStages, clauseLibrary, permissions, roles, businessProfile
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
}