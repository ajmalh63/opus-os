import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ==========================================
// 1. USERS & STAFF accounts (RBAC system)
// ==========================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role', { enum: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'] }).notNull().default('counselor'),
  userDivisions: text('user_divisions').notNull().default('[]'), // JSON array of division keys
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

// Better Auth support tables for Drizzle adapter mapping
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  password: text('password'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  expiresAt: integer('expires_at'),
  scope: text('scope'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at')
});

// ==========================================
// 9. CLAUSE LIBRARY
// ==========================================
export const clauseLibrary = sqliteTable('clause_library', {
  id: text('id').primaryKey(),
  clauseId: text('clause_id').notNull().unique(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  division: text('division').notNull(),
  mandatory: integer('mandatory', { mode: 'boolean' }).notNull().default(false),
  version: text('version').notNull().default('v1.0'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 10. AGREEMENT TEMPLATES
// ==========================================
export const agreementTemplates = sqliteTable('agreement_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  division: text('division').notNull(),
  clausesJson: text('clauses_json').notNull(),
  version: text('version').notNull().default('v1.0'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 11. CLIENT SERVICE AGREEMENTS
// ==========================================
export const agreements = sqliteTable('agreements', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  templateId: text('template_id').notNull().references(() => agreementTemplates.id),
  status: text('status', { enum: ['draft', 'sent', 'signed', 'active', 'terminated'] }).notNull().default('draft'),
  content: text('content').notNull(),
  esignMethod: text('esign_method', { enum: ['aadhaar', 'otp', 'wet_ink'] }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  sha256Hash: text('sha256_hash'),
  signedAt: integer('signed_at'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 12. PAYMENTS & LEDGER BILLING
// ==========================================
export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  amount: integer('amount').notNull(),
  type: text('type', { enum: ['invoice', 'receipt', 'charge', 'refund'] }).notNull(),
  milestoneName: text('milestone_name').notNull(),
  method: text('method', { enum: ['upi', 'bank_transfer', 'cash'] }),
  referenceNumber: text('reference_number'),
  taxableAmount: integer('taxable_amount'),
  cgst: integer('cgst'),
  sgst: integer('sgst'),
  igst: integer('igst'),
  isInterstate: integer('is_interstate', { mode: 'boolean' }),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 13. MILESTONES (Payment Escalation Tracking)
// ==========================================
export const milestones = sqliteTable('milestones', {
  id: text('id').primaryKey(),
  agreementId: text('agreement_id').notNull().references(() => agreements.id),
  number: integer('number').notNull(),
  label: text('label').notNull(),
  amount: integer('amount').notNull(),
  dueDate: integer('due_date').notNull(),
  status: text('status', { enum: ['pending', 'paid', 'void'] }).notNull().default('pending'),
  overdueLevel: text('overdue_level', { enum: ['none', 'yellow', 'orange', 'red', 'hold'] }).notNull().default('none'),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 14. UMRAH GROUP DEPARTURES
// ==========================================
export const groupDepartures = sqliteTable('group_departures', {
  id: text('id').primaryKey(),
  packageTier: text('package_tier', { enum: ['economy', 'standard', 'premium'] }).notNull().default('standard'),
  departureDate: integer('departure_date').notNull(), // UNIX timestamp
  capacity: integer('capacity').notNull().default(30),
  bookedSeats: integer('booked_seats').notNull().default(0),
  price: integer('price').notNull(), // In paise
  bookingFee: integer('booking_fee').notNull(), // In paise
  status: text('status', { enum: ['draft', 'open', 'confirmed', 'cancelled'] }).notNull().default('open'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 15. SEAT BOOKINGS
// ==========================================
export const seatBookings = sqliteTable('seat_bookings', {
  id: text('id').primaryKey(),
  departureId: text('departure_id').notNull().references(() => groupDepartures.id),
  clientId: text('client_id').notNull().references(() => clients.id),
  status: text('status', { enum: ['held', 'confirmed', 'waitlist'] }).notNull().default('held'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 16. TRANSIT SHIPMENTS (Attestation Courier tracking)
// ==========================================
export const transitShipments = sqliteTable('transit_shipments', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  courierPartner: text('courier_partner', { enum: ['blue-dart', 'dtdc'] }).notNull(),
  trackingNumber: text('tracking_number').notNull(),
  status: text('status', { enum: ['pickup', 'in_transit', 'out_for_delivery', 'delivered', 'exception'] }).notNull().default('pickup'),
  shippingAddress: text('shipping_address').notNull(),
  estimatedDelivery: integer('estimated_delivery'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 17. PARTNER PROGRAM & KYC
// ==========================================
export const partners = sqliteTable('partners', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  panNumber: text('pan_number').notNull(),
  bankAccount: text('bank_account').notNull(),
  ifscCode: text('ifsc_code').notNull(),
  status: text('status', { enum: ['active', 'blocked'] }).notNull().default('active'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 18. REFERRALS
// ==========================================
export const referrals = sqliteTable('referrals', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').notNull().references(() => partners.id),
  clientId: text('client_id').notNull().references(() => clients.id),
  commissionRate: integer('commission_rate').notNull().default(5),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 19. COMMISSION LEDGER
// ==========================================
export const commissionLedger = sqliteTable('commission_ledger', {
  id: text('id').primaryKey(),
  referralId: text('referral_id').notNull().references(() => referrals.id),
  amount: integer('amount').notNull(),
  status: text('status', { enum: ['unmatured', 'matured', 'paid', 'held'] }).notNull().default('unmatured'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 20. STAFF TASKS (Section 8.2 - tasks & calendar)
// ==========================================
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  clientId: text('client_id').references(() => clients.id), // optional - task may be client-bound
  engagementId: text('engagement_id').references(() => engagements.id), // optional linked engagement
  assigneeId: text('assignee_id').references(() => users.id), // null = unassigned pool
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }).notNull().default('medium'),
  status: text('status', { enum: ['open', 'in_progress', 'done', 'cancelled'] }).notNull().default('open'),
  dueDate: integer('due_date'), // epoch seconds; null = no deadline
  recurrence: text('recurrence', { enum: ['none', 'daily', 'weekly', 'monthly'] }).notNull().default('none'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  completedAt: integer('completed_at')
});





