import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ==========================================
// 1. USERS & STAFF accounts (RBAC system)
// ==========================================
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  passwordHash: text('password_hash'),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  role: text('role', { enum: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'] }).notNull().default('counselor'),
  userDivisions: text('user_divisions').notNull().default('[]'), // JSON array of division keys
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
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
  gstin: text('gstin'), // for B2B classification (GSTR-1)
  state: text('state'), // place of supply state code
  // Funnel enrichment (Section 26) — captured at intake for qualification
  leadSource: text('lead_source'), // website, whatsapp, walk-in, partner, referral
  intakeContext: text('intake_context'), // JSON: targetCountry/intake/budget/visaCategory/etc from lead form
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
  clientId: text('client_id').references(() => clients.id), // nullable: webhook/inbox rows may precede a client record
  senderId: text('sender_id').references(() => users.id), // Null implies client sent it
  channel: text('channel', { enum: ['whatsapp', 'email', 'system', 'note'] }).notNull(),
  direction: text('direction', { enum: ['incoming', 'outgoing', 'internal'] }).notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 48. UNIFIED MESSAGING (PENDING-CONFIGS #1/#3)
// Provider-agnostic conversations for WhatsApp (OpenWA or Meta Cloud API) and
// web chat — the Chatwoot-replacement inbox. Webhook events land here; the
// staff inbox UI (workspace) reads these rows.
// ==========================================
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  channel: text('channel', { enum: ['whatsapp', 'webchat', 'email'] }).notNull(),
  remoteId: text('remote_id'), // provider conversation id (WA chat id, etc.)
  contactKey: text('contact_key').notNull(), // phone/e-mail/webchat key
  contactName: text('contact_name'),
  lastMessage: text('last_message'),
  lastMessageAt: integer('last_message_at'),
  unread: integer('unread').notNull().default(0),
  status: text('status', { enum: ['open', 'pending', 'resolved'] }).notNull().default('open'),
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
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
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
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
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
// 24.1.1 PUBLIC ARTIFACTS — homepage hero live widgets data (Section 24)
// Real, D1-backed data for the hero carousel artifacts: job ticker (Manpower),
// attestation chain builder, and university match (eligibility checker).
// ==========================================
export const jobPostings = sqliteTable('job_postings', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  country: text('country').notNull(),
  sector: text('sector').notNull(),
  salaryText: text('salary_text').notNull(),
  status: text('status', { enum: ['open', 'filled'] }).notNull().default('open'),
  createdAt: integer('created_at').notNull()
});

export const attestationChains = sqliteTable('attestation_chains', {
  id: text('id').primaryKey(),
  country: text('country').notNull(),
  stepsJson: text('steps_json').notNull(), // [{"step":"Notary","feePaise":2000,"timelineDays":2}, ...]
  createdAt: integer('created_at').notNull()
});

export const universities = sqliteTable('universities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  minGpa: real('min_gpa').notNull().default(0),
  ieltsMin: real('ielts_min').notNull().default(0),
  budgetLpaMin: real('budget_lpa_min').notNull().default(0), // in lakh INR per year
  intake: text('intake').notNull().default('Fall 2027'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 49. ERPNEXT SYNC LOG (back-office books integration)
// One-way queue: OpusOS front office → ERPNext official books. Each syncable
// business event (payments/invoices) gets a row; a worker/endpoint pushes rows
// with status='pending' and records Frappe's response + any retry attempts.
// ==========================================
export const erpnextSyncLog = sqliteTable('erpnext_sync_log', {
  id: text('id').primaryKey(),
  entityName: text('entity_name').notNull(), // e.g. 'payments'
  entityId: text('entity_id').notNull(),     // local id (payment id)
  doctype: text('doctype').notNull().default('Sales Invoice'), // ERPNext doctype target
  payloadJson: text('payload_json').notNull(), // the invoice payload sent to Frappe
  status: text('status', { enum: ['pending', 'synced', 'failed', 'skipped'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  erpDocName: text('erp_doc_name'), // Frappe doc name after success
  error: text('error'), // last error message
  createdAt: integer('created_at').notNull(),
  syncedAt: integer('synced_at')
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
  referralCode: text('referral_code').unique(), // OPUS-affiliate short code for ?ref= tracking
  apiToken: text('api_token'), // partner-scoped bearer token for referrals/commissions (A-3)
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

// ==========================================
// 21. RBAC SUITE (Section 33 - role-builder)
// ==========================================
export const permissions = sqliteTable('permissions', {
  code: text('code').primaryKey(), // e.g. 'clients:read'
  family: text('family').notNull(), // client/payment/agreement/finance/compliance/admin...
  label: text('label').notNull(),
  ownerOnly: integer('owner_only', { mode: 'boolean' }).notNull().default(false),
  seeded: integer('seeded', { mode: 'boolean' }).notNull().default(true)
});

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  code: text('code').notNull().unique(), // e.g. 'counselor'
  description: text('description'),
  permissionsJson: text('permissions_json').notNull().default('[]'), // JSON array of permission codes
  parentId: text('parent_id').references((): any => roles.id), // optional inheritance
  system: integer('system', { mode: 'boolean' }).notNull().default(false), // seeded/system roles not deletable
  editable: integer('editable', { mode: 'boolean' }).notNull().default(true),
  color: text('color').notNull().default('brand-gold'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

export const userRoles = sqliteTable('user_roles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  roleId: text('role_id').notNull().references(() => roles.id),
  divisionScopeJson: text('division_scope').notNull().default('[]'), // JSON array of division keys; [] = all
  activeFrom: integer('active_from').notNull().default(0),
  activeTo: integer('active_to'), // null = indefinite
  revokedAt: integer('revoked_at'),
  revokedBy: text('revoked_by'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 23. BUSINESS PROFILE & COMPLIANCE (Section 14.5 - GST workbench)
// ==========================================
export const businessProfile = sqliteTable('business_profile', {
  id: text('id').primaryKey().default('main'),
  legalName: text('legal_name'),
  gstin: text('gstin'),
  pan: text('pan'),
  tan: text('tan'),
  stateCode: text('state_code'), // e.g. 36 for Telangana
  stateName: text('state_name'),
  address: text('address'),
  hsnJson: text('hsn_json').notNull().default('{}'), // { "study-abroad": "9983", ... } division->SAC
  gstRateJson: text('gst_rate_json').notNull().default('{}'), // { "study-abroad": 18 }
  updatedAt: integer('updated_at').notNull().default(0)
});

// Purchase invoices (expenses) - feed ITC, GSTR-2B reconciliation, MSME 43B(h). Section 14.5.5
export const purchaseInvoices = sqliteTable('purchase_invoices', {
  id: text('id').primaryKey(),
  vendorName: text('vendor_name').notNull(),
  vendorGstin: text('vendor_gstin'), // null => vendor not GST-registered
  invoiceNumber: text('invoice_number').notNull(),
  invoiceDate: integer('invoice_date').notNull(), // epoch
  amount: integer('amount').notNull(), // total in paise
  taxableAmount: integer('taxable_amount').notNull().default(0),
  cgst: integer('cgst').notNull().default(0),
  sgst: integer('sgst').notNull().default(0),
  igst: integer('igst').notNull().default(0),
  isInterstate: integer('is_interstate', { mode: 'boolean' }).notNull().default(false),
  itcClaimable: integer('itc_claimable').notNull().default(1), // bool
  vendorMsme: integer('vendor_msme').notNull().default(0), // Udyam registered => 43B(h) clock
  createdAt: integer('created_at').notNull(),
  paidAt: integer('paid_at'), // for 43B(h) 45-15day clock
  updatedAt: integer('updated_at').notNull().default(0)
});

// TDS records (Section 14.5.2 - new Income-tax Act codes 1026/1027/1028)
export const tdsRecords = sqliteTable('tds_records', {
  id: text('id').primaryKey(),
  vendorName: text('vendor_name').notNull(),
  payeePan: text('payee_pan'),
  section: text('section').notNull(), // 194J | 194C | 194H
  code: text('code'), // 1026 | 1027 | 1028
  invoiceNumber: text('invoice_number'),
  paymentDate: integer('payment_date').notNull(),
  grossAmount: integer('gross_amount').notNull(), // paise
  tdsAmount: integer('tds_amount').notNull(), // paise
  challanRef: text('challan_ref'),
  period: text('period'), // YYYY-MM
  createdAt: integer('created_at').notNull()
});

// TCS records (Section 14.5.3 - overseas packages / 206C(1H))
export const tcsRecords = sqliteTable('tcs_records', {
  id: text('id').primaryKey(),
  clientId: text('client_id').references(() => clients.id),
  clientName: text('client_name'),
  pan: text('pan'),
  taxableAmount: integer('taxable_amount').notNull(),
  tcsAmount: integer('tcs_amount').notNull(),
  fyAmount: integer('fy_amount').notNull().default(0), // cumulative FY for threshold
  section: text('section').notNull().default('206C(1H)'),
  period: text('period'),
  createdAt: integer('created_at').notNull(),
  depositedAt: integer('deposited_at'),
  tanRef: text('tan_ref')
});

// ==========================================
// 24. RATE LIMITING (Section 18.2.1 / 38.3) - in-app sliding-window counters
// ==========================================
export const rateLimit = sqliteTable('rate_limit', {
  key: text('key').primaryKey(), // hash(bucket|windowStart|identity)
  bucket: text('bucket').notNull(),
  windowStart: integer('window_start').notNull(),
  identity: text('identity').notNull(),
  count: integer('count').notNull().default(1)
});

// ==========================================
// 22. SATE (Section 26 - marketing interaction scoring)
// ==========================================
export const interactionPoints = sqliteTable('interaction_points', {
  code: text('code').primaryKey(), // e.g. 'website_lead_form'
  points: integer('points').notNull(),
  description: text('description')
});

export const scoringEvents = sqliteTable('scoring_events', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  interactionCode: text('interaction_code').notNull(),
  points: integer('points').notNull(),
  source: text('source').notNull().default('api'),
  createdAt: integer('created_at').notNull()
});

export const segments = sqliteTable('segments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rulesJson: text('rules_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 26. INCENTIVE ENGINE (Section 29/31)
// ==========================================
export const incentiveRules = sqliteTable('incentive_rules', {
  id: text('id').primaryKey(),
  division: text('division').notNull(),
  serviceId: text('service_id'),
  trigger: text('trigger').notNull(), // agreement_signed | milestone_paid | visa_granted | placement_confirmed
  amount: integer('amount').notNull(), // paise fixed amount OR percent-basis flag
  isPercent: integer('is_percent', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull()
});

export const incentiveEntries = sqliteTable('incentive_entries', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => users.id),
  ruleId: text('rule_id').references(() => incentiveRules.id),
  engagementId: text('engagement_id'),
  triggerRef: text('trigger_ref'),
  amount: integer('amount').notNull(), // paise
  status: text('status', { enum: ['accrued', 'clawed_back', 'paid'] }).notNull().default('accrued'),
  period: text('period'), // '2026-08'
  createdAt: integer('created_at').notNull()
});

export const payoutStatements = sqliteTable('payout_statements', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => users.id),
  period: text('period').notNull(),
  gross: integer('gross').notNull().default(0), // paise
  tds: integer('tds').notNull().default(0),
  net: integer('net').notNull().default(0),
  status: text('status', { enum: ['draft', 'approved', 'paid'] }).notNull().default('draft'),
  approvedBy: text('approved_by'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 29. NURTURE TOUCHES (WhatsApp re-nurture, Section 26.4)
// Provider-agnostic sequence engine: rows are staged outbound touches due at
// day offsets. A future Listmonk/OpenWA consumer picks up `due` rows and marks
// them `sent`. DPDP-safe: only created when the client granted whatsapp-updates.
// ==========================================
export const nurtureTouches = sqliteTable('nurture_touches', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  engagementId: text('engagement_id').references(() => engagements.id),
  channel: text('channel', { enum: ['whatsapp', 'email'] }).notNull().default('whatsapp'),
  stage: text('stage', { enum: ['value', 'case_study', 'offer', 'final'] }).notNull(),
  body: text('body').notNull(), // message template (personalized at send time by consumer)
  dueAt: integer('due_at').notNull(), // epoch seconds
  status: text('status', { enum: ['scheduled', 'sent', 'skipped'] }).notNull().default('scheduled'),
  sentAt: integer('sent_at'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 30. A/B EXPERIMENTS (Section 26.5 — ab-test-setup skill gates)
// The hypothesis + primary metric + baseline + MDE are REQUIRED fields, forcing
// the "commit before launch" discipline before an experiment can go active.
// ==========================================
export const experiments = sqliteTable('experiments', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // e.g. 'lead-form-cta'
  name: text('name').notNull(),
  hypothesis: text('hypothesis').notNull(),
  primaryMetric: text('primary_metric').notNull(), // e.g. 'lead_to_customer'
  baselineRate: real('baseline_rate').notNull(), // decimal 0-1
  mde: real('mde').notNull(), // minimum detectable effect, decimal
  variantA: text('variant_a').notNull(),
  variantB: text('variant_b').notNull(),
  status: text('status', { enum: ['draft', 'active', 'concluded'] }).notNull().default('draft'),
  startedAt: integer('started_at'),
  createdAt: integer('created_at').notNull()
});

export const experimentAssignments = sqliteTable('experiment_assignments', {
  id: text('id').primaryKey(),
  experimentKey: text('experiment_key').notNull().references(() => experiments.key),
  clientId: text('client_id').notNull().references(() => clients.id),
  variant: text('variant', { enum: ['A', 'B'] }).notNull(),
  createdAt: integer('created_at').notNull()
});





