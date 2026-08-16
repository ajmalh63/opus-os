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
  // Funnel enrichment (Section 26) Ò
  leadSource: text('lead_source'), // website, whatsapp, walk-in, partner, referral
  intakeContext: text('intake_context'), // JSON: targetCountry/intake/budget/visaCategory/etc from lead form
  notes: text('notes'), // internal agent notes (staff-only, never shown to the student)
  // Declared interest (Wave 4): division(s) the lead selected at intake  the
  // PRIMARY interest signal for nurture targeting; engagement division is the
  // operational truth once created, but intent survives even if it isn't.
intentDivisions: text('intent_divisions'), // JSON array of division keys (multi-interest)
  primaryDivision: text('primary_division'), // first/most-important division key
  // Paid exclusive community (Manpower): membership grants access to secret jobs.
  exclusiveMember: integer('exclusive_member', { mode: 'boolean' }).notNull().default(false),
  exclusiveExpiresAt: integer('exclusive_expires_at'),
  exclusivePlan: text('exclusive_plan'),
  exclusiveSince: integer('exclusive_since'),
  instagramHandle: text('instagram_handle'),
  status: text('status', { enum: ['active', 'blocked'] }).notNull().default('active'),
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
  status: text('status').notNull().default('active'),
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
  verifiedAt: integer('verified_at'),
  sizeBytes: integer('size_bytes'),
  mimeType: text('mime_type'),
  sha256: text('sha256'),
  uploadedBy: text('uploaded_by'),
  // Custom "Other" documents: student-provided label (e.g. "Gap year certificate")
  docLabel: text('doc_label'),
  // Prompt-injection / content scan (gold standard: documents are UNTRUSTED data —
  // AI features must never ingest flagged content; see lib/docScan.ts)
  scanStatus: text('scan_status', { enum: ['pending', 'clean', 'flagged'] }).notNull().default('pending'),
  scanNote: text('scan_note')
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
// web chat Ò
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
  method: text('method', { enum: ['upi', 'bank_transfer', 'cash', 'online'] }),
  referenceNumber: text('reference_number'),
  taxableAmount: integer('taxable_amount'),
  cgst: integer('cgst'),
  sgst: integer('sgst'),
  igst: integer('igst'),
  isInterstate: integer('is_interstate', { mode: 'boolean' }),
  invoiceDate: integer('invoice_date'),
  dueDate: integer('due_date'),
  gstRate: integer('gst_rate').notNull().default(18),
  customerGstin: text('customer_gstin'),
  razorpayLinkId: text('razorpay_link_id'),
  razorpayShortUrl: text('razorpay_short_url'),
  linkStatus: text('link_status', { enum: ['none', 'created', 'paid', 'cancelled', 'expired'] }).notNull().default('none'),
  razorpayPaymentId: text('razorpay_payment_id'),
  status: text('status', { enum: ['draft', 'confirmed', 'synced', 'paid', 'void'] }).notNull().default('draft'),
  enteredBy: text('entered_by'),
  confirmedBy: text('confirmed_by'),
  confirmedAt: integer('confirmed_at'),
  erpDocName: text('erp_doc_name'),
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
// 14a. UMRAH PACKAGES (Phase 3 inventory) — rich catalog answering 98% of
// client doubts: flight route/stops, hotel proximity (the #1 value driver),
// meals, visa, transport, pricing (wholesale vs retail), terms.
// All money is integer paise. Status gates visibility:
//   staff inventory = all; client portal = open; partner catalog = open.
// `umrah_inventory_enabled` (app_settings) master-switches the client/partner
// surfaces (Coming Soon) until the owner flips it.
// ==========================================
export const umrahPackages = sqliteTable('umrah_packages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // e.g. "Economy 7-Night Umrah — Hyderabad"
  tier: text('tier', { enum: ['economy', 'standard', 'premium', 'luxury'] }).notNull().default('standard'),
  // ---- Duration ----
  totalDays: integer('total_days').notNull().default(7),
  makkahNights: integer('makkah_nights').notNull().default(0),
  madinahNights: integer('madinah_nights').notNull().default(0),
  // ---- Flight (per package) ----
  flightType: text('flight_type', { enum: ['direct', 'one_stop', 'two_stop', 'varies'] }).notNull().default('varies'),
  airline: text('airline'), // e.g. "Saudia / IndiGo"
  departureCity: text('departure_city'), // default for departures of this package
  arrivalAirport: text('arrival_airport'), // e.g. "Jeddah (JED)"
  baggageAllowance: text('baggage_allowance'), // e.g. "30 kg check-in + 7 kg hand carry"
  flightClass: text('flight_class', { enum: ['economy', 'business'] }).notNull().default('economy'),
  zamzamIncluded: integer('zamzam_included', { mode: 'boolean' }).notNull().default(true),
  // ---- Makkah hotel ----
  makkahHotel: text('makkah_hotel'),
  makkahHotelStars: integer('makkah_hotel_stars'), // 3/4/5
  makkahDistanceMeters: integer('makkah_distance_meters'),
  makkahWalkMinutes: integer('makkah_walk_minutes'),
  makkahHaramView: text('makkah_haram_view', { enum: ['none', 'partial', 'full'] }).notNull().default('none'),
  // ---- Madinah hotel ----
  madinahHotel: text('madinah_hotel'),
  madinahHotelStars: integer('madinah_hotel_stars'),
  madinahDistanceMeters: integer('madinah_distance_meters'),
  madinahWalkMinutes: integer('madinah_walk_minutes'),
  madinahHaramView: text('madinah_haram_view', { enum: ['none', 'partial', 'full'] }).notNull().default('none'),
  // ---- Room & meals ----
  roomSharing: text('room_sharing', { enum: ['quad', 'triple', 'double', 'single'] }).notNull().default('quad'),
  // Solo travel: client travels alone (private room) — single-occupancy supplement.
  soloAvailable: integer('solo_available', { mode: 'boolean' }).notNull().default(false),
  soloSupplementPaise: integer('solo_supplement_paise').notNull().default(0), // added to retail for solo occupancy
  mealsPlan: text('meals_plan', { enum: ['none', 'breakfast', 'half_board', 'full_board'] }).notNull().default('breakfast'),
  shuttleService: integer('shuttle_service', { mode: 'boolean' }).notNull().default(false),
  // ---- Transport & tours ----
  airportTransfer: integer('airport_transfer', { mode: 'boolean' }).notNull().default(true),
  intercityTransport: text('intercity_transport', { enum: ['group_bus', 'private_car', 'luxury_car', 'none'] }).notNull().default('group_bus'),
  ziyaratTours: integer('ziyarat_tours', { mode: 'boolean' }).notNull().default(true),
  groupLeader: integer('group_leader', { mode: 'boolean' }).notNull().default(false),
  guideLanguage: text('guide_language'), // e.g. "Telugu / Urdu / Hindi / English"
  // ---- Visa ----
  visaIncluded: integer('visa_included', { mode: 'boolean' }).notNull().default(true),
  ksaInsurance: integer('ksa_insurance', { mode: 'boolean' }).notNull().default(true),
  visaLeadDays: integer('visa_lead_days').notNull().default(21),
  // ---- Pricing (integer paise) ----
  wholesalePricePaise: integer('wholesale_price_paise').notNull().default(0), // supplier cost (owner-only view)
  retailPricePaise: integer('retail_price_paise').notNull().default(0), // per person (adult)
  advanceFeePaise: integer('advance_fee_paise').notNull().default(50000), // ₹500 non-refundable advance to reserve
  reserveHoldHours: integer('reserve_hold_hours').notNull().default(72), // slot held for 3 days after advance paid
  balanceDueDaysBefore: integer('balance_due_days_before').notNull().default(30),
  installmentAvailable: integer('installment_available', { mode: 'boolean' }).notNull().default(false),
  groupDiscountPct: integer('group_discount_pct'), // e.g. 5 (20+ pax)
  groupDiscountMinPax: integer('group_discount_min_pax'),
  // ---- Family / child pricing (per person, paise; NULL = fall back to adult retail) ----
  childWithBedPricePaise: integer('child_with_bed_price_paise'), // child 2–11 with own bed
  childNoBedPricePaise: integer('child_no_bed_price_paise'), // child 2–4 sharing without bed
  infantPricePaise: integer('infant_price_paise'), // infant 0–2 (airfare-only component)
  // ---- Content & trust ----
  description: text('description'),
  inclusionsJson: text('inclusions_json').notNull().default('[]'),
  exclusionsJson: text('exclusions_json').notNull().default('[]'),
  documentsJson: text('documents_json').notNull().default('[]'), // required docs checklist
  itineraryJson: text('itinerary_json').notNull().default('[]'), // day-by-day plan
  termsJson: text('terms_json').notNull().default('[]'), // cancellation/refund T&C
  specialNeeds: text('special_needs'), // wheelchair, elderly-friendly, family rooms
  supplierRef: text('supplier_ref'), // wholesale supplier reference
  coverImageKey: text('cover_image_key'), // R2 key
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['draft', 'open', 'paused', 'closed', 'archived'] }).notNull().default('draft'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 14. GROUP DEPARTURES — announced dates, capacity 30 per group.
// ==========================================
export const groupDepartures = sqliteTable('group_departures', {
  id: text('id').primaryKey(),
  packageId: text('package_id').references(() => umrahPackages.id), // inventory package this departure belongs to
  packageTier: text('package_tier', { enum: ['economy', 'standard', 'premium', 'luxury'] }).notNull().default('standard'),
  departureDate: integer('departure_date').notNull(), // UNIX timestamp — trip start
  endDate: integer('end_date'), // UNIX timestamp — trip end (null = single-day departure)
  departureCity: text('departure_city'), // e.g. Hyderabad — per-departure override
  capacity: integer('capacity').notNull().default(30),
  bookedSeats: integer('booked_seats').notNull().default(0),
  price: integer('price').notNull(), // In paise — seasonal override; falls back to package retail when packageId set
  bookingFee: integer('booking_fee').notNull(), // In paise — advance fee (₹500 default); falls back to package advanceFeePaise
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
  status: text('status', { enum: ['held', 'reserved', 'confirmed', 'waitlist', 'cancelled'] }).notNull().default('held'),
  // Phase 3 advance model: ₹500 non-refundable advance → reserved for 3 days.
  advancePaid: integer('advance_paid', { mode: 'boolean' }).notNull().default(false),
  reservedUntil: integer('reserved_until'), // UNIX ts — slot held until (now + reserveHoldHours)
  balancePaid: integer('balance_paid', { mode: 'boolean' }).notNull().default(false), // full balance settled (online or office)
  occupancy: text('occupancy', { enum: ['shared', 'solo'] }).notNull().default('shared'), // solo = private room (+ supplement)
  // Party booking: one booking = one party (N passengers). Capacity & advance scale by pax.
  paxCount: integer('pax_count').notNull().default(1),
  roomConfig: text('room_config', { enum: ['single', 'double', 'triple', 'quad'] }), // preferred rooming (advisory, full party)
  advancePaymentId: text('advance_payment_id'), // Razorpay payment id for the advance
  balancePaymentId: text('balance_payment_id'), // Razorpay payment id for the balance
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 15.1 BOOKING PASSENGERS — one row per traveller in a party booking.
// Passenger categories (industry gold standard, IKHLAS / BookMyUmrahTrip):
// adult (18+), child_with_bed (2–11), child_no_bed (2–4), infant (0–2).
// At least one adult per party. Passport stored plaintext in D1 but ALWAYS
// masked at the API boundary (see lib/umrahParty.ts maskPassport).
// ==========================================
export const bookingPassengers = sqliteTable('booking_passengers', {
  id: text('id').primaryKey(),
  bookingId: text('booking_id').notNull().references(() => seatBookings.id),
  name: text('name').notNull(),
  dob: text('dob'), // YYYY-MM-DD (used for category verification)
  passportNumber: text('passport_number'),
  category: text('category', { enum: ['adult', 'child_with_bed', 'child_no_bed', 'infant'] }).notNull().default('adult'),
  specialNeeds: text('special_needs'), // wheelchair, elderly, dietary…
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 24.1.1 PUBLIC ARTIFACTS Ò
// Real, D1-backed data for the hero carousel artifacts: job ticker (Manpower),
// attestation chain builder, and university match (eligibility checker).
// ==========================================
export const jobPostings = sqliteTable('job_postings', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  country: text('country').notNull(),
  sector: text('sector').notNull(),
  salaryText: text('salary_text').notNull(),
  collar: text('collar', { enum: ['blue_collar', 'white_collar'] }).notNull().default('blue_collar'),
  tier: text('tier', { enum: ['public', 'secret'] }).notNull().default('public'),
  status: text('status', { enum: ['draft', 'open', 'paused', 'filled', 'closed', 'archived'] }).notNull().default('open'),
  description: text('description'),
  employer: text('employer'),
  employerReference: text('employer_reference'),
  salaryMinPaise: integer('salary_min_paise'),
  salaryMaxPaise: integer('salary_max_paise'),
  currency: text('currency').notNull().default('AED'),
  vacancies: integer('vacancies').notNull().default(1),
  benefitsJson: text('benefits_json').notNull().default('[]'),
  requirementsJson: text('requirements_json').notNull().default('[]'),
  experienceYearsMin: integer('experience_years_min').notNull().default(0),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  tradeCategory: text('trade_category'),
  visaProvided: integer('visa_provided', { mode: 'boolean' }).notNull().default(true),
  medicalRequired: integer('medical_required', { mode: 'boolean' }).notNull().default(true),
  deadline: integer('deadline'),
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
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
// One-way queue: OpusOS front office Ò
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
  email: text('email').unique(), // Non-null for partners who registered with an account (portal login)
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
    completedAt: integer('completed_at'),
    // Kanban system (migration 0030, gold-standard flow): class of service,
    // blocker flag, and TRUE cycle time (first move into in_progress).
    cos: text('cos', { enum: ['standard', 'expedite', 'fixed_date'] }).notNull().default('standard'),
    blockedReason: text('blocked_reason'),
    inProgressAt: integer('in_progress_at')
  });

  // Board system settings (WIP limits, policies)  one row per key.
  export const boardPrefs = sqliteTable('board_prefs', {
    key: text('key').primaryKey(),
    value: text('value').notNull(), // JSON
updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 2b. PAID EXCLUSIVE COMMUNITY — ADMIN-MANAGED MEMBERSHIP PLANS (Manpower)
// Superadmin controls prices, durations, tiers, perks, and active state.
// Client-facing paywall reads only `active` plans, ordered by sortOrder.
// ==========================================
export const membershipPlans = sqliteTable('membership_plans', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // e.g. exclusive-30
  name: text('name').notNull(),
  description: text('description'),
  pricePaise: integer('price_paise').notNull(),
  durationDays: integer('duration_days').notNull(),
  tier: text('tier').notNull().default('basic'), // basic | pro | premium
  perksJson: text('perks_json').notNull().default('[]'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 2c. APP SETTINGS (key-value) — owner-controlled feature switches
// e.g. exclusive_community_enabled = 'true' | 'false'
// ==========================================
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 2d. STAFF ALERTS — live feed of client sales/inquiries for the desk
// Every product purchase / application / inquiry across divisions creates one
// row; staff dashboards poll and pop them up. Superadmin controls per-role
// visibility via app_settings key `staff_alert_visibility` (JSON role->types).
// ==========================================
export const staffAlerts = sqliteTable('staff_alerts', {
  id: text('id').primaryKey(),
  division: text('division').notNull(), // study-abroad | visa | umrah | attestation | manpower
  type: text('type').notNull(), // visa_inquiry | visa_application | visa_sale | manpower_application | membership_sale | document_upload | resume_upload
  title: text('title').notNull(),
  body: text('body'),
  payloadJson: text('payload_json'),
  clientId: text('client_id'),
  status: text('status', { enum: ['new', 'seen'] }).notNull().default('new'),
  severity: text('severity', { enum: ['info', 'warning', 'urgent'] }).notNull().default('info'),
  link: text('link'), // where the notification navigates when clicked
  createdAt: integer('created_at').notNull()
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
  autoConfirmEnabled: integer('auto_confirm_enabled', { mode: 'boolean' }).notNull().default(false),
  autoConfirmThresholdPaise: integer('auto_confirm_threshold_paise').notNull().default(0),
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
  campaignId: text('campaign_id').references(() => campaigns.id), // null = legacy default sequence
  dueAt: integer('due_at').notNull(), // epoch seconds
  status: text('status', { enum: ['scheduled', 'sent', 'skipped'] }).notNull().default('scheduled'),
  sentAt: integer('sent_at'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 29.1 CAMPAIGNS (division+context targeted nurture, Wave 2 brainstorm)
// A campaign is the unit of targeting: it binds a division (and optionally
// intake-context predicates) to a custom touch plan. The marketing layer picks
// the best campaign per lead (by division+context) instead of the legacy
// default SEQUENCE in nurture.ts. UI: manager+ via /api/marketing/campaigns.
// ==========================================
export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // e.g. 'study-abroad-country-deadline'
  name: text('name').notNull(),
  description: text('description'),
  division: text('division', { enum: ['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'] }).notNull(),
  // Eligibility: JSON predicate on the lead's dynamicContext, e.g.
  // {"targetCountry": {"$in": ["USA", "UK"]}} Ò
  eligibilityJson: text('eligibility_json').notNull().default('{}'),
  status: text('status', { enum: ['draft', 'active', 'paused'] }).notNull().default('draft'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

export const campaignTouches = sqliteTable('campaign_touches', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id),
  seq: integer('seq').notNull(), // 1..N within campaign
  day: integer('day').notNull(), // day offset from plan start
  stage: text('stage', { enum: ['value', 'case_study', 'offer', 'final'] }).notNull(),
  // Channel per journey node (Zoho MA pattern): email / whatsapp. The nurture
  // lane (send) respects it; consent + suppression gates apply per channel.
  channel: text('channel', { enum: ['whatsapp', 'email'] }).notNull().default('whatsapp'),
  body: text('body').notNull(), // {{name}}/{{division}} personalization at send time
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 30. A/B EXPERIMENTS (Section 26.5 Ò
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






// ==========================================
// 49. NOTIFICATIONS LOG (Ò
// message across channels (whatsapp/email/sms). Written by infra/notify.ts.
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  channel: text('channel', { enum: ['whatsapp', 'email', 'sms', 'task', 'telegram'] }).notNull(),
  to: text('to').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  status: text('status', { enum: ['queued', 'sent', 'failed'] }).notNull().default('queued'),
  provider: text('provider'),
  remoteId: text('remote_id'),
  error: text('error'),
clientId: text('client_id').references(() => clients.id),
  createdAt: integer('created_at').notNull(),
  sentAt: integer('sent_at')
});

// ==========================================
// 50.5 WEBHOOK DELIVERY LOG (A-3: every gateway event is durable + reconcilable)
// ==========================================
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),          // Razorpay event id (evt_&)  dedupe/replay key
  event: text('event').notNull(),       // payment_link.paid / refund.processed / &
  entityId: text('entity_id'),          // payment_link | payment | refund | order entity id
  signature: text('signature'),
  receivedAt: integer('received_at').notNull(),
  processed: integer('processed', { mode: 'boolean' }).notNull().default(false),
  detail: text('detail')                // outcome or error  reconciliation reads this
});

// ==========================================
// 50.6 LISTMONK SUPPRESSIONS (DPDP-aligned email hygiene, Wave 3)
// One row per subscriber email. `suppressed=true` stops nurture/email sends;
// soft bounces accumulate to 3 before suppressing; subscribe/re-confirm clears.
// ==========================================
export const listmonkSuppressions = sqliteTable('listmonk_suppressions', {
  email: text('email').primaryKey(),          // normalized lowercase
  suppressed: integer('suppressed', { mode: 'boolean' }).notNull().default(false),
  reason: text('reason'),                     // hard_bounce | soft_bounce_3x | unsubscribed | complaint
  softCount: integer('soft_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});
// ==========================================
// 50. EMPLOYER COMPLIANCE REGISTERS (Ò
export const statutoryRegisters = sqliteTable('statutory_registers', {
  id: text('id').primaryKey(),
  month: text('month').notNull(), // YYYY-MM
  type: text('type', { enum: ['pt', 'lwf', 'pf', 'esi'] }).notNull(),
  employeeName: text('employee_name').notNull(),
  employeeId: text('employee_id'),
  wageAmount: integer('wage_amount').notNull(), // paise
  deductionPaise: integer('deduction_paise').notNull(), // paise
  employerShare: integer('employer_share').notNull().default(0), // paise (PF/ESI employer side)
  dueDate: text('due_date'), // YYYY-MM-DD
  paidAt: integer('paid_at'),
  status: text('status', { enum: ['pending', 'paid', 'overdue'] }).notNull().default('pending'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});
// ==========================================
// 51. MANPOWER CANDIDATE PROFILES (Ò
// DPDP-gated: only written when manpower-retain consent was granted; the raw
// resume stays in R2 (resumes/), the profile is the searchable skill snapshot.
export const candidateProfiles = sqliteTable('candidate_profiles', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  skillsJson: text('skills_json').notNull().default('[]'),
  experienceJson: text('experience_json').notNull().default('[]'),
  education: text('education'),
  resumeKey: text('resume_key'),
  source: text('source', { enum: ['ai', 'mock'] }).notNull().default('ai'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});
// ==========================================
// 52. PARTNER TIERS + AFFILIATE LINKS (Ò
// Tiers: loyalty points = lifetime matured+paid commissions (paise). Base
// tier (0 points) + progressive tiers with commission boost + perks.
export const partnerTiers = sqliteTable('partner_tiers', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),           // bronze|silver|gold|platinum
  name: text('name').notNull(),
  minPoints: integer('min_points').notNull().default(0), // paise threshold
  commissionBoostPct: integer('commission_boost_pct').notNull().default(0), // extra % on matured
  perksJson: text('perks_json').notNull().default('[]'),
  color: text('color').notNull().default('brand-gold'),
  order: integer('order').notNull().default(0),
  createdAt: integer('created_at').notNull()
});

// Partner share-links: one row per (partner, catalog item) Ò
// redirect through /go/:ref/:type/:id and count clicks (Thrive tracking-link
// pattern).
export const partnerLinks = sqliteTable('partner_links', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').notNull().references(() => partners.id),
  catalogType: text('catalog_type', { enum: ['university', 'departure', 'job', 'visa', 'umrah_package'] }).notNull(),
  catalogItemId: text('catalog_item_id').notNull(),
  title: text('title').notNull(),            // snapshot for the partner UI
  pricePaise: integer('price_paise').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  lastClickedAt: integer('last_clicked_at')
});

// Loyalty points ledger (Thrive-style activity tracking).
export const partnerPoints = sqliteTable('partner_points', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').notNull().references(() => partners.id),
  points: integer('points').notNull(),           // paise-equivalent accrued
  reason: text('reason').notNull(),              // referral_linked|client_signed|milestone_paid|share
  referenceKey: text('reference_key').notNull(), // idempotency key
  createdAt: integer('created_at').notNull()
});
// ==========================================
// 53. PARTNER COMMISSION PLANS (Thrive-equivalent owner control)
// Owner sets default rate per catalog type + optional per-item overrides and
// per-partner rates. Order: partner override > item override > type default.
export const commissionPlans = sqliteTable('commission_plans', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').references(() => partners.id),   // null = global default
  catalogType: text('catalog_type', { enum: ['university', 'departure', 'job', 'visa', 'umrah_package', '*'] }).notNull().default('*'),
  catalogItemId: text('catalog_item_id'),                        // null = type-wide
  ratePct: integer('rate_pct').notNull(),                        // 0-100
  updatedBy: text('updated_by'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});
// ==========================================
// 54. PARTNER PAYOUT REQUESTS (self-service payout, Thrive pattern)
// Partner requests payment of their matured balance; owner approves Ò
// flips to paid. Linked rows keep the audit trail.
export const payoutRequests = sqliteTable('payout_requests', {
  id: text('id').primaryKey(),
  partnerId: text('partner_id').notNull().references(() => partners.id),
  amountPaise: integer('amount_paise').notNull(),
  status: text('status', { enum: ['requested', 'approved', 'paid', 'rejected'] }).notNull().default('requested'),
  note: text('note'),
  requestedAt: integer('requested_at').notNull(),
  resolvedAt: integer('resolved_at'),
  updatedBy: text('updated_by')
});

// ==========================================
// 55. STUDY ABROAD SHORTLISTS (Internal Counseling Workflow)
// ==========================================
export const studyAbroadShortlists = sqliteTable('study_abroad_shortlists', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  universityId: text('university_id').notNull().references(() => universities.id),
  status: text('status', { enum: ['shortlisted', 'docs_uploaded', 'submitted', 'offer_letter', 'enrolled', 'rejected', 'cancelled'] }).notNull().default('shortlisted'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 55.1 STUDY ABROAD APPLICATIONS (snapshot model — Phase 4)
// No university catalog: the application modal captures everything an agent
// needs to apply (universityJson snapshot). Match/Reach/Safe compatibility is
// computed live vs the student's intakeContext — never stored.
// ==========================================
export const studyAbroadApplications = sqliteTable('study_abroad_applications', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  // Snapshot of the application modal (name, country, city, website, portalUrl,
  // portalUsername, program, degreeLevel, intake, deadline, applicationFeePaise,
  // minGpa, minEnglishScore, englishTest, greRequired, tuitionLpaMin/Max,
  // scholarshipsJson, notes) — stringified JSON.
  universityJson: text('university_json').notNull(),
  status: text('status', { enum: ['shortlisted', 'docs_ready', 'submitted', 'under_review', 'offer_letter', 'deposit_paid', 'enrolled', 'rejected', 'withdrawn'] }).notNull().default('shortlisted'),
  // Per-application document checklist: {transcript, cv, sop, lor1, lor2, ielts,
  // passport, finance, portfolio} → 'missing' | 'received' | 'verified'.
  docsChecklistJson: text('docs_checklist_json').notNull().default('{}'),
  // Offer letter management (gold standard: conditional vs unconditional,
  // conditions, acceptance deadline 2–4 weeks, deposit amount + deadline).
  offerLetterKey: text('offer_letter_key'), // R2 key
  offerType: text('offer_type', { enum: ['conditional', 'unconditional'] }),
  offerConditionsJson: text('offer_conditions_json').notNull().default('[]'),
  offerDecision: text('offer_decision', { enum: ['pending', 'accepted', 'declined'] }).notNull().default('pending'),
  acceptanceDeadline: integer('acceptance_deadline'),
  depositAmountPaise: integer('deposit_amount_paise'),
  depositDeadline: integer('deposit_deadline'),
  depositPaid: integer('deposit_paid', { mode: 'boolean' }).notNull().default(false),
  rejectionReason: text('rejection_reason'),
  decisionDate: integer('decision_date'),
  submittedAt: integer('submitted_at'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 56. VISA APPLICATIONS (Internal Counselor Workflow)
// ==========================================
export const visaApplications = sqliteTable('visa_applications', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  country: text('country').notNull(),
  visaType: text('visa_type').notNull(),
  appointmentDate: integer('appointment_date'),
  appointmentLocation: text('appointment_location'),
  status: text('status', { enum: ['draft', 'submitted', 'document_prep', 'slot_booked', 'granted', 'rejected', 'delivered', 'cancelled'] }).notNull().default('document_prep'),
  notes: text('notes'),
  email: text('email'),
  agencyName: text('agency_name'),
  registeredMobile: text('registered_mobile'),
  agreedToTerms: integer('agreed_to_terms', { mode: 'boolean' }).notNull().default(false),
  formJson: text('form_json'),
  submittedAt: integer('submitted_at'),
  decisionAt: integer('decision_at'),
  rejectionReason: text('rejection_reason'),
  deliveredAt: integer('delivered_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 57. VISA MOCK INTERVIEWS (Counseling Preparation Loop)
// ==========================================
export const visaMockInterviews = sqliteTable('visa_mock_interviews', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  interviewerId: text('interviewer_id').references(() => users.id),
  scheduledAt: integer('scheduled_at').notNull(),
  status: text('status', { enum: ['scheduled', 'completed', 'cancelled'] }).notNull().default('scheduled'),
  score: integer('score'),
  feedback: text('feedback'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 58. UMRAH CHECKLISTS (Document Verification Register)
// ==========================================
export const umrahChecklists = sqliteTable('umrah_checklists', {
  id: text('id').primaryKey(),
  bookingId: text('booking_id').notNull().references(() => seatBookings.id),
  passportScanned: integer('passport_scanned', { mode: 'boolean' }).notNull().default(false),
  visaIssued: integer('visa_issued', { mode: 'boolean' }).notNull().default(false),
  vaccineCertificate: integer('vaccine_certificate', { mode: 'boolean' }).notNull().default(false),
  ticketIssued: integer('ticket_issued', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 59. ATTESTATION APPLICATIONS (Embassy & MEA Workflows)
// ==========================================
export const attestationApplications = sqliteTable('attestation_applications', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  documentType: text('document_type', { enum: ['degree', 'diploma', 'birth_certificate', 'marriage_certificate', 'pcc'] }).notNull().default('degree'),
  destinationCountry: text('destination_country').notNull(),
  currentStep: text('current_step', { enum: ['hrd', 'mea', 'embassy', 'apostille'] }).notNull().default('hrd'),
  status: text('status', { enum: ['pending', 'in_transit', 'in_progress', 'completed', 'rejected'] }).notNull().default('pending'),
  // ── Phase 4 gold-standard additions ──
  // Snapshot of the document being attested (holder, document, issuing state…)
  documentJson: text('document_json').notNull().default('{}'),
  category: text('category', { enum: ['educational', 'personal', 'commercial'] }).notNull().default('personal'),
  route: text('route', { enum: ['apostille', 'embassy'] }).notNull().default('apostille'),
  // Chain timeline: [{key, label, status: pending|done|failed, date, note}]
  chainJson: text('chain_json').notNull().default('[]'),
  // Fees (integer paise): govt + service + courier + translation
  govtFeePaise: integer('govt_fee_paise').notNull().default(0),
  serviceFeePaise: integer('service_fee_paise').notNull().default(0),
  courierFeePaise: integer('courier_fee_paise').notNull().default(0),
  translationFeePaise: integer('translation_fee_paise').notNull().default(0),
  totalQuotePaise: integer('total_quote_paise').notNull().default(0),
  translationNeeded: integer('translation_needed', { mode: 'boolean' }).notNull().default(false),
  // Pickup flow: client sends docs to US → we dispatch to supplier → return → deliver
  pickupStatus: text('pickup_status', { enum: ['awaiting_docs', 'docs_received', 'dispatched_to_supplier', 'returned', 'delivered'] }).notNull().default('awaiting_docs'),
  pickupAddress: text('pickup_address'),
  courierInbound: text('courier_inbound'), // client → us tracking (AWB)
  courierOutbound: text('courier_outbound'), // us → supplier (AWB)
  courierReturn: text('courier_return'), // supplier → us → client (AWB)
  // New status machine (no-jump): quote → docs_awaiting → in_process → completed → dispatched → delivered / rejected
  stage: text('stage', { enum: ['quote_requested', 'quote_confirmed', 'docs_awaiting', 'in_process', 'completed', 'dispatched', 'delivered', 'rejected'] }).notNull().default('quote_requested'),
  // Original document scan (R2) + verification status
  documentKey: text('document_key'),
  documentStatus: text('document_status', { enum: ['missing', 'received', 'verified', 'rejected'] }).notNull().default('missing'),
  // Payment tracking
  paymentStatus: text('payment_status', { enum: ['unpaid', 'partial', 'paid'] }).notNull().default('unpaid'),
  paidAmountPaise: integer('paid_amount_paise').notNull().default(0),
  // Supplier-check intake (Siza-style): deadline + urgency
  deadline: integer('deadline'), // UNIX ts — needed by date
  urgency: text('urgency', { enum: ['normal', 'urgent'] }).notNull().default('normal'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 59.2 ATTESTATION RATE CARDS — FEATURED products (optional showcase for the client portal).
// Hand-crafted with title/description/document types. The matrix powers quotes.
// ==========================================
export const attestationRateCards = sqliteTable('attestation_rate_cards', {
  id: text('id').primaryKey(),
  country: text('country').notNull(),
  category: text('category', { enum: ['educational', 'personal', 'commercial'] }).notNull(),
  route: text('route', { enum: ['apostille', 'embassy'] }).notNull(),
  // Product inventory (owner-controlled, shown to clients in their portal)
  title: text('title'), // service name, e.g. "Degree Attestation — UAE"
  description: text('description'), // what's included
  documentTypesJson: text('document_types_json').notNull().default('[]'), // covered docs
  pricePaise: integer('price_paise').notNull(), // indicative quote (service + govt, excl. courier/translation)
  govtFeePaise: integer('govt_fee_paise').notNull().default(0),
  courierFeePaise: integer('courier_fee_paise').notNull().default(0),
  translationFeePaise: integer('translation_fee_paise').notNull().default(0),
  timelineDays: integer('timeline_days').notNull().default(10),
  stepsJson: text('steps_json').notNull().default('[]'), // chain step labels
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 60. MANPOWER DEPLOYMENTS (Recruitment & Sourcing Workflow)
// ==========================================
export const manpowerDeployments = sqliteTable('manpower_deployments', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id),
  jobId: text('job_id').notNull().references(() => jobPostings.id),
  selectionStatus: text('selection_status', { enum: ['applied', 'shortlisted', 'selected', 'rejected'] }).notNull().default('applied'),
  medicalStatus: text('medical_status', { enum: ['pending', 'fit', 'unfit', 'restricted'] }).notNull().default('pending'),
  visaStatus: text('visa_status', { enum: ['pending', 'submitted', 'stamped', 'rejected'] }).notNull().default('pending'),
  flightStatus: text('flight_status', { enum: ['pending', 'booked', 'deployed'] }).notNull().default('pending'),
  formJson: text('form_json'),
  resumeKey: text('resume_key'),
  appliedAt: integer('applied_at'),
  rejectionReason: text('rejection_reason'),
  notes: text('notes'),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 61. VISA PRODUCTS INVENTORY
// ==========================================
export const visaProducts = sqliteTable('visa_products', {
  id: text('id').primaryKey(),
  country: text('country').notNull(),
  visaType: text('visa_type').notNull(),
  entryType: text('entry_type').notNull(),
  processingTime: text('processing_time').notNull(),
  feePaise: integer('fee_paise').notNull(),
  requiredDocsJson: text('required_docs_json').notNull().default('[]'),
  category: text('category').notNull().default('Tourist'),
  tier: text('tier').notNull().default('Standard'),
  validityDays: integer('validity_days'),
  maxStayDays: integer('max_stay_days'),
  insuranceIncluded: integer('insurance_included', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 62. VISIBILITY HUB — SEO / AEO / GBP / GA / Attribution
// ==========================================
export const seoPages = sqliteTable('seo_pages', {
  route: text('route').primaryKey(), // e.g. /study-abroad
  title: text('title'),
  metaDescription: text('meta_description'),
  ogTitle: text('og_title'),
  ogImage: text('og_image'),
  schemaJson: text('schema_json'), // JSON-LD (LocalBusiness/Service/FAQPage)
  updatedAt: integer('updated_at').notNull()
});

export const seoKeywords = sqliteTable('seo_keywords', {
  id: text('id').primaryKey(),
  keyword: text('keyword').notNull(),
  targetUrl: text('target_url'),
  volume: integer('volume'), // manual estimate
  position: integer('position'), // manual/latest known
  impressions: integer('impressions'),
  clicks: integer('clicks'),
  updatedAt: integer('updated_at').notNull()
});

export const gbpProfile = sqliteTable('gbp_profile', {
  id: text('id').primaryKey().default('main'),
  name: text('name'),
  category: text('category'),
  address: text('address'),
  phone: text('phone'),
  website: text('website'),
  hoursJson: text('hours_json'),
  attributesJson: text('attributes_json'),
  updatedAt: integer('updated_at').notNull()
});

export const gbpReviews = sqliteTable('gbp_reviews', {
  id: text('id').primaryKey(),
  source: text('source', { enum: ['google', 'trustpilot', 'justdial', 'other'] }).notNull().default('google'),
  rating: integer('rating').notNull(),
  author: text('author'),
  text: text('text'),
  sentiment: text('sentiment', { enum: ['positive', 'neutral', 'negative'] }),
  responded: integer('responded', { mode: 'boolean' }).notNull().default(false),
  responseDraft: text('response_draft'),
  createdAt: integer('created_at').notNull()
});

export const gbpPosts = sqliteTable('gbp_posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  scheduledAt: integer('scheduled_at'),
  status: text('status', { enum: ['draft', 'scheduled', 'published'] }).notNull().default('draft'),
  publishedAt: integer('published_at'),
  createdAt: integer('created_at').notNull()
});

export const aeoChecks = sqliteTable('aeo_checks', {
  id: text('id').primaryKey(),
  engine: text('engine').notNull(), // chatgpt / perplexity / ai_overviews / gemini / claude / grok
  query: text('query').notNull(),
  mentioned: integer('mentioned', { mode: 'boolean' }).notNull().default(false),
  snippet: text('snippet'),
  checkedAt: integer('checked_at').notNull()
});

export const aeoPassages = sqliteTable('aeo_passages', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  targetQuery: text('target_query').notNull(),
  passage: text('passage').notNull(), // 200-400 word quotable block
  stats: text('stats'), // named statistics included
  updatedAt: integer('updated_at').notNull()
});

export const utmEvents = sqliteTable('utm_events', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  source: text('source'),
  medium: text('medium'),
  campaign: text('campaign'),
  landedAt: integer('landed_at').notNull(),
  convertedAt: integer('converted_at')
});

export const gaEvents = sqliteTable('ga_events', {
  id: text('id').primaryKey(),
  eventName: text('event_name').notNull(),
  page: text('page'),
  source: text('source'),
  medium: text('medium'),
  createdAt: integer('created_at').notNull()
});

export const reportSchedules = sqliteTable('report_schedules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  reportType: text('report_type', { enum: ['revenue', 'growth', 'funnels', 'compliance', 'visibility'] }).notNull(),
  period: text('period').notNull().default('monthly'),
  recipients: text('recipients'), // comma-separated emails
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at'),
  createdAt: integer('created_at').notNull()
});

// ==========================================
// 63. CAL.COM BOOKINGS (consultation scheduling)
// ==========================================
export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  calUid: text('cal_uid').notNull().unique(), // cal.com booking uid (dedupes webhook replays)
  eventTypeId: text('event_type_id').notNull(),
  division: text('division').notNull(), // study-abroad | visa | manpower
  title: text('title').notNull(),
  startTime: integer('start_time').notNull(),
  endTime: integer('end_time').notNull(),
  attendeeName: text('attendee_name'),
  attendeeEmail: text('attendee_email'),
  attendeePhone: text('attendee_phone'),
  status: text('status', { enum: ['pending', 'scheduled', 'cancelled', 'rescheduled', 'completed', 'no_show', 'rejected'] }).notNull().default('scheduled'),
  riskScore: integer('risk_score').notNull().default(0),
  riskFlags: text('risk_flags'), // JSON array of suspicion flags
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  clientId: text('client_id'),
  taskId: text('task_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// ==========================================
// 64. RUNTIME LOGS (in-OS log viewer)
// ==========================================
export const runtimeLogs = sqliteTable('runtime_logs', {
  id: text('id').primaryKey(),
  level: text('level', { enum: ['info', 'warn', 'error'] }).notNull().default('info'),
  source: text('source').notNull(), // e.g. webhook.cal, error.handler, ai.aeo
  message: text('message').notNull(),
  detail: text('detail'),
  createdAt: integer('created_at').notNull()
});
