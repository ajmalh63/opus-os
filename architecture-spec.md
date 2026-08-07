# Architecture Specification: OpusOS Monorepo Scaffolding, D1 Schema & API Contract

This document provides the foundational engineering specification for the monorepo structure, Drizzle ORM database schema, Hono API routes, and wrangler configurations for **OpusOS**. This architecture strictly enforces:
1. **10ms CPU limits** per request on Cloudflare Workers by offloading heavy background execution.
2. **Integer paise representation** (1 INR = 100 paise) for all monetary and billing transactions to eliminate float precision bugs.
3. **Strict Zod validation** shared between the frontend React application and Hono API.
4. **DPDP Act (2023) Compliance** for customer consent tracking and logging.

---

## 1. Monorepo Directory Layout

OpusOS is organized as a `pnpm` monorepo workspace to keep the frontend SPA, backend Worker API, and shared models cleanly separated yet type-safe.

```
/ (monorepo root)
├── apps/
│   ├── api/                     # Cloudflare Worker API (Hono)
│   │   ├── src/
│   │   │   ├── index.ts        # Hono entrypoint with handlers
│   │   │   ├── db.ts           # Drizzle DB instantiation
│   │   │   ├── routes/         # Router groups (leads, clients, kanban)
│   │   │   └── middleware/     # Auth, Audit logs, and Scoping filters
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.toml       # Local dev persistence config
│   │
│   └── app/                     # React 19 SPA (Vite + Tailwind CSS v4)
│       ├── src/
│       │   ├── components/     # UI widgets (Timeline, Vault, Card)
│       │   ├── pages/          # PublicLeadForm, Client360, KanbanBoard
│       │   ├── main.tsx        # React entrypoint
│       │   └── index.css       # Tailwind stylesheet
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── packages/
│   └── shared/                  # Common TypeScript schemas and types
│       ├── src/
│       │   ├── index.ts        # Main package exports
│       │   ├── validation.ts   # Zod validators for payload shapes
│       │   └── types.ts        # Inferred schema types
│       ├── package.json
│       └── tsconfig.json
│
├── pnpm-workspace.yaml          # Monorepo workspaces definition
├── pnpm-lock.yaml               # Pinned package locking
└── architecture-spec.md         # This specification
```

### `pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

---

## 2. D1 Database Schema (`schema.ts`)

The schema defined below utilizes Drizzle ORM for Cloudflare D1. Primary keys are text GUIDs, and datetime records are stored as integer epoch timestamps. Financial values are strictly stored as integers in **paise**.

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ==========================================
// 1. USERS & STAFF accounts (RBAC system)
// ==========================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'] }).notNull().default('counselor'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 2. CLIENT RECORDS
// ==========================================
export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(), // Format: OP-2026-XXXX (Token-based)
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  dob: text('dob'),
  city: text('city'),
  highestQualification: text('highest_qualification'),
  passportNumber: text('passport_number'),
  passportExpiry: text('passport_expiry'), // ISO date string: YYYY-MM-DD
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 3. PIPELINE STAGES
// ==========================================
export const pipelineStages = sqliteTable('pipeline_stages', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // e.g. lead, qualified, documents, processing, complete
  name: text('name').notNull(), // User-friendly label
  sequence: integer('sequence').notNull(), // Visual column ordering
  wipLimit: integer('wip_limit'), // WIP ceiling, null for unlimited
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 4. ACTIVE DIVISION ENGAGEMENTS
// ==========================================
export const engagements = sqliteTable('engagements', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  division: text('division', { enum: ['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'] }).notNull(),
  title: text('title').notNull(), // e.g. "US Masters Fall 2027 Application"
  stageKey: text('stage_key').notNull().references(() => pipelineStages.key),
  counselorId: text('counselor_id').references(() => users.id),
  outstandingBalance: integer('outstanding_balance').notNull().default(0), // STRICT paise representation
  status: text('status', { enum: ['active', 'closed', 'deferred'] }).notNull().default('active'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 5. DOCUMENT VAULT (R2 Metadata)
// ==========================================
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  fileName: text('file_name').notNull(),
  r2Key: text('r2_key').notNull().unique(), // Unique UUID mapped in R2 bucket
  version: text('version').notNull().default('v1.0'),
  status: text('status', { enum: ['pending', 'verified', 'rejected'] }).notNull().default('pending'),
  courierName: text('courier_name'), // e.g. Blue Dart, DTDC (for originals tracking)
  courierTrackingNumber: text('courier_tracking_number'),
  courierStatus: text('courier_status', { enum: ['not_applicable', 'dispatched', 'delivered'] }).notNull().default('not_applicable'),
  uploadedAt: integer('uploaded_at').notNull(),
  verifiedAt: integer('verified_at')
});

// ==========================================
// 6. DPDP-2023 COMPLIANCE CONSENTS
// ==========================================
export const consents = sqliteTable('consents', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  consentType: text('consent_type', { enum: ['core-processing', 'university-sharing', 'whatsapp-updates', 'marketing-campaigns', 'manpower-retain'] }).notNull(),
  status: text('status', { enum: ['granted', 'withdrawn'] }).notNull().default('granted'),
  ipAddress: text('ip_address').notNull(),
  sha256Hash: text('sha256_hash').notNull(), // Legal evidence proof hash
  grantedAt: integer('granted_at').notNull(),
  withdrawnAt: integer('withdrawn_at')
});

// ==========================================
// 7. UNIFIED COMMUNICATIONS (Timeline Feed)
// ==========================================
export const communications = sqliteTable('communications', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  senderId: text('sender_id').references(() => users.id), // Null implies client sent it
  channel: text('channel', { enum: ['whatsapp', 'email', 'system', 'note'] }).notNull(),
  direction: text('direction', { enum: ['incoming', 'outgoing', 'internal'] }).notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 8. AUDIT LOG (Immutable)
// ==========================================
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => users.id), // Null for guest actions
  action: text('action').notNull(), // e.g. STAGE_CHANGE, DOC_UPLOAD, CONSENT_UPDATE
  entityName: text('entity_name').notNull(), // e.g. "clients", "documents"
  entityId: text('entity_id').notNull(),
  beforeState: text('before_state'), // Stringified JSON state
  afterState: text('after_state'),  // Stringified JSON state
  ipAddress: text('ip_address'),
  createdAt: integer('created_at').notNull()
});
```

---

## 3. API Contract Specifications & Shared Validation

All requests and responses use strict Zod validation. The schemas reside in `packages/shared/src/validation.ts` to be importable by both Hono and React code bases.

### 3.1 Zod Shared Validation Schemas (`packages/shared/src/validation.ts`)

```typescript
import { z } from 'zod';

// Helper Regex
const phoneRegex = /^\+91\s[6-9]\d{4}\s\d{5}$/; // Indian format: +91 XXXXX XXXXX

// 1. Lead Intake request validator
export const leadIntakeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().regex(phoneRegex, "Phone must match +91 XXXXX XXXXX"),
  email: z.string().email("Invalid email address"),
  highestQualification: z.enum(['highschool', 'undergrad', 'postgrad']),
  division: z.enum(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
  
  // DPDP Consents checklist (must be accepted where mandatory)
  consents: z.object({
    coreProcessing: z.literal(true, {
      errorMap: () => ({ message: "Core Processing Consent is mandatory" })
    }),
    whatsappUpdates: z.boolean().default(true),
    marketingCampaigns: z.boolean().default(false),
    manpowerRetain: z.boolean().optional() // Only relevant for Manpower division
  }),

  // Dynamic context fields depending on selected division
  dynamicContext: z.object({
    targetCountry: z.string().optional(),
    intakeSeason: z.string().optional(),
    visaCategory: z.string().optional(),
    packageTier: z.string().optional(),
    expectedDeparture: z.string().optional(),
    documentCategory: z.string().optional(),
    requiredAuthentication: z.string().optional(),
    jobSector: z.string().optional(),
    resumeFileKey: z.string().optional()
  }).optional()
});

// 2. Client Profile Response Validator
export const clientProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: z.string(),
  dob: z.string().nullable(),
  city: z.string().nullable(),
  highestQualification: z.string().nullable(),
  passportNumber: z.string().nullable(),
  passportExpiry: z.string().nullable(),
  engagements: z.array(z.object({
    id: z.string(),
    division: z.string(),
    title: z.string(),
    stageKey: z.string(),
    counselorName: z.string().nullable(),
    outstandingBalance: z.number(), // Returned in Rupees as decimal at boundary formatting
    status: z.string()
  })),
  consents: z.array(z.object({
    consentType: z.string(),
    status: z.string(),
    grantedAt: z.number()
  })),
  documents: z.array(z.object({
    id: z.string(),
    fileName: z.string(),
    version: z.string(),
    status: z.string(),
    courierName: z.string().nullable(),
    courierTrackingNumber: z.string().nullable(),
    courierStatus: z.string(),
    uploadedAt: z.number()
  })),
  timeline: z.array(z.object({
    id: z.string(),
    channel: z.string(),
    direction: z.string(),
    subject: z.string().nullable(),
    body: z.string(),
    senderName: z.string().nullable(),
    createdAt: z.number()
  }))
});

// 3. Move Card Kanban Request Validator
export const moveCardSchema = z.object({
  cardId: z.string(),
  sourceStage: z.string(),
  targetStage: z.string()
});
```

---

### 3.2 Hono Router Scaffolding (`apps/api/src/routes/...`)

#### Route 1: Lead Submission
* **Endpoint:** `POST /api/public/leads`
* **Access:** Public (Turnstile Protected)
* **Zod Middleware:** Validation using `leadIntakeSchema`.
* **Flow:**
  1. Hono accepts parsed body.
  2. Creates entry in `clients` with sequential format prefix (`OP-2026-${random}`).
  3. Registers corresponding `consents` with client's header IP and signature hash.
  4. Creates record in `engagements` mapped to the initial pipeline stage.
  5. Schedules welcome WhatsApp notification via **OpenWA Queue** (keeping CPU thread <10ms).
* **Response:**
  ```json
  {
    "success": true,
    "token": "OP-2026-9812",
    "message": "Lead captured and tracking token provisioned."
  }
  ```

#### Route 2: Client 360 Information Profile
* **Endpoint:** `GET /api/clients/:id`
* **Access:** Scoped Staff Cookie (Middlewares verify division scope mapping)
* **Flow:**
  1. Performs parameterized JOIN queries matching `clientId` across engagements, consents, documents, and communications.
  2. Converts financial balances from **paise integer** to decimal Rupees only at response serialisation boundary (e.g., `₹X.YY`).
* **Response:** Matching `clientProfileSchema` Zod validation shape.

#### Route 3: Kanban Pipeline Movements
* **Endpoint:** `POST /api/kanban/board/move`
* **Access:** Counselor/Manager RBAC scopes
* **Zod Middleware:** Validation using `moveCardSchema`.
* **Flow:**
  1. Retrieves target column WIP configuration from D1 (`pipelineStages`).
  2. Queries active cards count currently in target stage.
  3. If current count $\ge$ `wipLimit`, responds with a warning header/body payload but permits operation (soft WIP control configuration).
  4. Executes transaction update on the card's `stageKey` in Drizzle.
  5. Records change audit trace in `auditLog`.
* **Response:**
  ```json
  {
    "success": true,
    "wipLimitBreached": true,
    "currentCount": 3,
    "limit": 2,
    "message": "Card moved. WIP limit warning triggered."
  }
  ```

---

## 4. Local Wrangler Persistence Config (`wrangler.toml`)

Wrangler uses local storage bindings. All sqlite relational tables are persisted locally inside `.wrangler/state/v3/d1` during development.

```toml
name = "opusos-api"
main = "src/index.ts"
compatibility_date = "2026-08-06"

# Run settings
workers_dev = true

[vars]
ENVIRONMENT = "development"
TURNSTILE_SECRET_KEY = "1x0000000000000000000000000000000AA" # Local mock test key

# Cloudflare D1 Relational DB Binding
[[d1_databases]]
binding = "DB"
database_name = "opusos-db"
database_id = "07f9c2d1-local-dev-db-id"
migrations_dir = "migrations"

# Cloudflare R2 Document Vault Storage Binding
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "opusos-vault"
preview_bucket_name = "opusos-vault-preview"

# Async Job Queue Binding
[[queues.producers]]
queue = "opusos-jobs-queue"
binding = "JOBS_QUEUE"
```

---
**End of Specification.**
*This spec is ready for review. Please confirm approval so we can begin the next scaffolding task.*
