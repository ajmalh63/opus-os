import { z } from 'zod';

// Helper Regex for Indian Phone format: +91 XXXXX XXXXX (or similar basic validator)
export const phoneRegex = /^\+91\s[6-9]\d{4}\s\d{5}$/;

// 1. Lead Intake Schema
export const leadIntakeSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  phone: z.string().regex(phoneRegex, { message: "Phone must match +91 XXXXX XXXXX" }),
  email: z.string().email({ message: "Invalid email address" }),
  highestQualification: z.enum(['highschool', 'undergrad', 'postgrad']),
  division: z.enum(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
  leadSource: z.enum(['website', 'whatsapp', 'walk-in', 'partner', 'referral', 'other']).optional(),
  refCode: z.string().max(40).optional(), // partner affiliate code (?ref=OPUS-XX)
  
  // DPDP-2023 Compliance Consents
  consents: z.object({
    coreProcessing: z.literal(true, {
      errorMap: () => ({ message: "Core Processing Consent is mandatory" })
    }),
    whatsappUpdates: z.boolean().default(true),
    marketingCampaigns: z.boolean().default(false),
    manpowerRetain: z.boolean().optional()
  }),

  // Dynamic context depending on division
  dynamicContext: z.object({
    targetCountry: z.string().optional(),
    intakeSeason: z.string().optional(),
    visaCategory: z.string().optional(),
    packageTier: z.string().optional(),
    budget: z.string().optional(), // e.g. "15-25L" — drives budget_given scoring
    expectedDeparture: z.string().optional(),
    documentCategory: z.string().optional(),
    requiredAuthentication: z.string().optional(),
    jobSector: z.string().optional(),
    resumeFileKey: z.string().optional(),
    // Study Abroad pre-qualification (lands in intakeContext → match engine + completeness)
    cgpa: z.string().optional(),
    englishScore: z.string().optional(),
    tuitionBudget: z.string().optional()
  }).optional()
});

// 2. Move Card Schema
export const moveCardSchema = z.object({
  cardId: z.string().min(1, { message: "Card ID is required" }),
  sourceStage: z.string().min(1, { message: "Source stage is required" }),
  targetStage: z.string().min(1, { message: "Target stage is required" })
});

// Type definitions
export type LeadIntakeInput = z.infer<typeof leadIntakeSchema>;
export type MoveCardInput = z.infer<typeof moveCardSchema>;

// 3. Agreement Template Schema
export const createTemplateSchema = z.object({
  name: z.string().min(3, { message: "Name must be at least 3 characters" }),
  division: z.string().min(1, { message: "Division is required" }),
  clausesJson: z.string().min(2, { message: "Clauses list JSON is required" })
});

// 4. Create Agreement Schema
export const createAgreementSchema = z.object({
  clientId: z.string().min(1, { message: "Client ID is required" }),
  templateId: z.string().min(1, { message: "Template ID is required" })
});

// 5. Sign Agreement Schema
// esignMethod — free, legally valid methods only (design doc §1): typed name,
// drawn signature (wet_ink) or OTP-verified click. Aadhaar eSign removed
// (paid ₹5-15/sign + not working). OTP flows send signatureData?/otp?.
export const signAgreementSchema = z.object({
  esignMethod: z.enum(['typed', 'otp', 'wet_ink']),
  signatureData: z.string().optional(),
  otp: z.string().optional()
});

// 6. Create Payment Ledger Schema
export const createPaymentSchema = z.object({
  clientId: z.string().min(1, { message: "Client ID is required" }),
  engagementId: z.string().min(1, { message: "Engagement ID is required" }),
  amount: z.number().int({ message: "Amount must be an integer (paise)" }),
  type: z.enum(['invoice', 'receipt', 'charge', 'refund']),
  milestoneName: z.string().min(1, { message: "Milestone name is required" }),
  method: z.enum(['upi', 'bank_transfer', 'cash']).optional(),
  referenceNumber: z.string().optional(),
  isInterstate: z.boolean().optional(),
  invoiceDate: z.number().int().optional(),
  dueDate: z.number().int().optional(),
  gstRate: z.number().int().min(0).max(100).optional(),
  customerGstin: z.string().regex(/^[0-9A-Z]{15}$/).optional()
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;
export type SignAgreementInput = z.infer<typeof signAgreementSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// 7. Umrah Group Departure Schema (staff announces a date; capacity 30 default)
export const createDepartureSchema = z.object({
  packageTier: z.enum(['economy', 'standard', 'premium', 'luxury']),
  departureDate: z.number().int(), // trip start
  endDate: z.number().int().optional(), // trip end (null/absent = single-day)
  price: z.number().int(),
  bookingFee: z.number().int(),
  packageId: z.string().optional(),
  departureCity: z.string().optional(),
  capacity: z.number().int().min(1).max(200).optional()
});

// 7b. Umrah Package Inventory Schema (Phase 3) — rich catalog answering 98%
// of client doubts. All money integer paise. JSON lists are stringified.
export const createUmrahPackageSchema = z.object({
  name: z.string().min(2, 'Package name is required'),
  tier: z.enum(['economy', 'standard', 'premium', 'luxury']).default('standard'),
  // Duration
  totalDays: z.number().int().min(1).default(7),
  makkahNights: z.number().int().min(0).default(0),
  madinahNights: z.number().int().min(0).default(0),
  // Flight
  flightType: z.enum(['direct', 'one_stop', 'two_stop', 'varies']).default('varies'),
  airline: z.string().optional(),
  departureCity: z.string().optional(),
  arrivalAirport: z.string().optional(),
  baggageAllowance: z.string().optional(),
  flightClass: z.enum(['economy', 'business']).default('economy'),
  zamzamIncluded: z.boolean().default(true),
  // Makkah hotel
  makkahHotel: z.string().optional(),
  makkahHotelStars: z.number().int().min(1).max(7).optional(),
  makkahDistanceMeters: z.number().int().min(0).optional(),
  makkahWalkMinutes: z.number().int().min(0).optional(),
  makkahHaramView: z.enum(['none', 'partial', 'full']).default('none'),
  // Madinah hotel
  madinahHotel: z.string().optional(),
  madinahHotelStars: z.number().int().min(1).max(7).optional(),
  madinahDistanceMeters: z.number().int().min(0).optional(),
  madinahWalkMinutes: z.number().int().min(0).optional(),
  madinahHaramView: z.enum(['none', 'partial', 'full']).default('none'),
  // Room & meals
  roomSharing: z.enum(['quad', 'triple', 'double', 'single']).default('quad'),
  soloAvailable: z.boolean().default(false),
  soloSupplementPaise: z.number().int().min(0).default(0),
  mealsPlan: z.enum(['none', 'breakfast', 'half_board', 'full_board']).default('breakfast'),
  shuttleService: z.boolean().default(false),
  // Transport & tours
  airportTransfer: z.boolean().default(true),
  intercityTransport: z.enum(['group_bus', 'private_car', 'luxury_car', 'none']).default('group_bus'),
  ziyaratTours: z.boolean().default(true),
  groupLeader: z.boolean().default(false),
  guideLanguage: z.string().optional(),
  // Visa
  visaIncluded: z.boolean().default(true),
  ksaInsurance: z.boolean().default(true),
  visaLeadDays: z.number().int().min(0).default(21),
  // Pricing (paise)
  wholesalePricePaise: z.number().int().min(0).default(0),
  retailPricePaise: z.number().int().min(0).default(0),
  advanceFeePaise: z.number().int().min(0).default(50000), // ₹500 non-refundable
  reserveHoldHours: z.number().int().min(1).default(72), // 3-day hold
  balanceDueDaysBefore: z.number().int().min(0).default(30),
  installmentAvailable: z.boolean().default(false),
  groupDiscountPct: z.number().int().min(0).max(50).optional(),
  groupDiscountMinPax: z.number().int().min(2).optional(),
  // Family / child pricing (per person paise; null = fall back to adult retail)
  childWithBedPricePaise: z.number().int().min(0).nullable().optional(),
  childNoBedPricePaise: z.number().int().min(0).nullable().optional(),
  infantPricePaise: z.number().int().min(0).nullable().optional(),
  // Content
  description: z.string().optional(),
  inclusionsJson: z.string().default('[]'),
  exclusionsJson: z.string().default('[]'),
  documentsJson: z.string().default('[]'),
  itineraryJson: z.string().default('[]'),
  termsJson: z.string().default('[]'),
  specialNeeds: z.string().optional(),
  supplierRef: z.string().optional(),
  coverImageKey: z.string().optional(),
  featured: z.boolean().default(false),
  status: z.enum(['draft', 'open', 'paused', 'closed', 'archived']).default('draft')
});

// 7c. Partial update — every field optional, same shapes as create.
export const updateUmrahPackageSchema = createUmrahPackageSchema.partial();

// 7d. Client books a slot on an announced departure (token-auth identifies client).
// Party booking: one booking = N passengers (family / group). Gold-standard
// passenger categories: adult (18+), child_with_bed (2–11), child_no_bed (2–4),
// infant (0–2). At least one adult per party; max 30 (capacity ceiling).
export const umrahPassengerSchema = z.object({
  name: z.string().min(2, 'Passenger name must be at least 2 characters'),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD').optional(),
  passportNumber: z.string().min(4, 'Passport number too short').max(20).optional(),
  category: z.enum(['adult', 'child_with_bed', 'child_no_bed', 'infant']).default('adult'),
  specialNeeds: z.string().max(200).optional()
});

export const bookUmrahSlotSchema = z.object({
  departureId: z.string().min(1, 'departureId is required'),
  occupancy: z.enum(['shared', 'solo']).default('shared'),
  roomConfig: z.enum(['single', 'double', 'triple', 'quad']).optional(),
  // Default: the token client themselves as a single adult (backwards compatible).
  passengers: z.array(umrahPassengerSchema).min(1, 'At least one passenger is required').max(30, 'Maximum 30 passengers per party')
    .refine((list) => list.some((p) => p.category === 'adult'), { message: 'Every party needs at least one adult (18+)' })
    .optional()
});

// 7e. Advance payment verification (₹500 non-refundable → 3-day hold).
export const verifyUmrahAdvanceSchema = z.object({
  bookingId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1)
});

// 7f. Balance payment (rest of retail price — online or office).
export const payUmrahBalanceSchema = z.object({
  bookingId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1)
});

// 7g. Staff marks balance settled at office (offline payment).
export const confirmUmrahOfficeSchema = z.object({
  bookingId: z.string().min(1),
  amountPaise: z.number().int().min(0),
  method: z.enum(['cash', 'bank_transfer', 'upi']).default('cash'),
  referenceNumber: z.string().optional()
});

// 8. Book Seat Schema (legacy staff-path book)
export const bookSeatSchema = z.object({
  clientId: z.string().min(1, { message: "Client ID is required" })
});

export type CreateDepartureInput = z.infer<typeof createDepartureSchema>;
export type BookSeatInput = z.infer<typeof bookSeatSchema>;
export type CreateUmrahPackageInput = z.infer<typeof createUmrahPackageSchema>;
export type UpdateUmrahPackageInput = z.infer<typeof updateUmrahPackageSchema>;
export type BookUmrahSlotInput = z.infer<typeof bookUmrahSlotSchema>;
export type VerifyUmrahAdvanceInput = z.infer<typeof verifyUmrahAdvanceSchema>;
export type PayUmrahBalanceInput = z.infer<typeof payUmrahBalanceSchema>;
export type ConfirmUmrahOfficeInput = z.infer<typeof confirmUmrahOfficeSchema>;

// 8. Study Abroad Applications (snapshot model — Phase 4)
// The application modal captures everything an agent needs to apply; the
// university object is stored as universityJson on the application row.
export const studyAbroadUniversitySchema = z.object({
  name: z.string().min(2, 'University name is required'),
  country: z.string().min(2, 'Country is required'),
  city: z.string().optional(),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  portalUrl: z.string().optional(),
  portalUsername: z.string().optional(),
  program: z.string().min(2, 'Program title is required'),
  degreeLevel: z.enum(['masters', 'bachelors', 'phd', 'diploma', 'foundation']).default('masters'),
  intake: z.string().min(1, 'Intake is required'), // e.g. "Fall 2027"
  deadline: z.number().int().optional(), // UNIX ts
  applicationFeePaise: z.number().int().min(0).optional(),
  minGpa: z.number().min(0).max(10).optional(),
  minEnglishScore: z.number().min(0).max(9).optional(),
  englishTest: z.enum(['IELTS', 'TOEFL', 'PTE', 'Duolingo', 'Cambridge']).optional(),
  greRequired: z.boolean().default(false),
  tuitionLpaMin: z.number().min(0).optional(),
  tuitionLpaMax: z.number().min(0).optional(),
  scholarshipsJson: z.string().default('[]'),
  notes: z.string().max(2000).optional()
});

export const createStudyAbroadApplicationSchema = z.object({
  clientId: z.string().min(1, 'clientId is required'),
  university: studyAbroadUniversitySchema,
  status: z.enum(['shortlisted', 'docs_ready', 'submitted', 'under_review', 'offer_letter', 'deposit_paid', 'enrolled', 'rejected', 'withdrawn']).default('shortlisted'),
  notes: z.string().max(2000).optional()
});

export const updateStudyAbroadApplicationSchema = z.object({
  university: studyAbroadUniversitySchema.partial().optional(),
  notes: z.string().max(2000).optional()
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['shortlisted', 'docs_ready', 'submitted', 'under_review', 'offer_letter', 'deposit_paid', 'enrolled', 'rejected', 'withdrawn']),
  rejectionReason: z.string().max(500).optional()
});

export const updateApplicationOfferSchema = z.object({
  offerLetterKey: z.string().min(1).optional(),
  offerType: z.enum(['conditional', 'unconditional']).optional(),
  offerConditions: z.array(z.string()).optional(),
  acceptanceDeadline: z.number().int().optional(),
  depositAmountPaise: z.number().int().min(0).optional(),
  depositDeadline: z.number().int().optional(),
  offerDecision: z.enum(['pending', 'accepted', 'declined']).optional()
});

export const updateApplicationDocsSchema = z.object({
  docs: z.record(z.enum(['missing', 'received', 'verified']))
});

export type CreateStudyAbroadApplicationInput = z.infer<typeof createStudyAbroadApplicationSchema>;
export type UpdateStudyAbroadApplicationInput = z.infer<typeof updateStudyAbroadApplicationSchema>;
export type UpdateApplicationStatusInput = z.infer<typeof updateApplicationStatusSchema>;
export type UpdateApplicationOfferInput = z.infer<typeof updateApplicationOfferSchema>;
export type UpdateApplicationDocsInput = z.infer<typeof updateApplicationDocsSchema>;

// 8b. Student profile (portal wizard — student-owned data, canonical intakeContext keys).
// The match engine reads these keys; the wizard writes them. Passport masked at API.
export const studentProfileSchema = z.object({
  // Academic history
  cgpa: z.number().min(0).max(10).optional(),
  degreeName: z.string().max(120).optional(),
  graduationYear: z.number().int().min(1990).max(2100).optional(),
  pct10th: z.number().min(0).max(100).optional(),
  pct12th: z.number().min(0).max(100).optional(),
  backlogs: z.number().int().min(0).max(50).optional(),
  gapYears: z.number().min(0).max(20).optional(),
  workExperienceYears: z.number().min(0).max(40).optional(),
  // Test scores (actual or planned)
  englishTest: z.enum(['IELTS', 'TOEFL', 'PTE', 'Duolingo', 'Cambridge']).optional(),
  englishScore: z.number().min(0).max(9).optional(),
  greScore: z.number().min(260).max(340).optional(),
  gmatScore: z.number().min(200).max(800).optional(),
  testPlanned: z.boolean().default(false),
  testDate: z.number().int().optional(),
  englishWaiver: z.boolean().default(false), // English-medium education waiver (MOI)
  // Preferences
  targetCountry: z.string().max(60).optional(),
  targetIntake: z.string().max(30).optional(),
  preferredCourse: z.string().max(120).optional(),
  tuitionBudget: z.number().min(0).max(100).optional(),
  scholarshipNeeded: z.boolean().default(false),
  // Personal / family (Indian market: parents are decision-makers)
  passportNumber: z.string().min(4).max(20).optional(),
  parentName: z.string().max(120).optional(),
  parentPhone: z.string().max(20).optional(),
  // DPDP: explicit consent to share profile with universities
  universitySharingConsent: z.boolean().optional()
});

export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

// 9. Create Transit Shipment Schema
export const createShipmentSchema = z.object({
  clientId: z.string().min(1, { message: "Client ID is required" }),
  courierPartner: z.enum(['blue-dart', 'dtdc']),
  trackingNumber: z.string().min(3, { message: "Tracking number is required" }),
  shippingAddress: z.string().min(5, { message: "Shipping address is required" })
});

export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

// 10. Register Staff Schema
export const registerStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator']),
  userDivisions: z.array(z.string()),
  password: z.string().min(8).optional() // if absent, a temporary password is generated & returned once
});

export type RegisterStaffInput = z.infer<typeof registerStaffSchema>;

// 11. Attestation (Phase 4 — gold standard)
export const attestationDocumentSchema = z.object({
  holderName: z.string().min(2, 'Holder name is required'),
  documentName: z.string().min(2, 'Document name is required'),
  issuingState: z.string().min(2, 'Issuing state is required'),
  issuingYear: z.number().int().min(1950).max(2100).optional(),
  documentNumber: z.string().max(40).optional(),
  purpose: z.string().max(200).optional()
});

export const createAttestationApplicationSchema = z.object({
  clientId: z.string().min(1),
  document: attestationDocumentSchema,
  category: z.enum(['educational', 'personal', 'commercial']),
  route: z.enum(['apostille', 'embassy']),
  destinationCountry: z.string().min(2, 'Destination country is required'),
  translationNeeded: z.boolean().default(false),
  deadline: z.number().int().optional(), // UNIX ts — needed by date
  urgency: z.enum(['normal', 'urgent']).default('normal'),
  notes: z.string().max(2000).optional()
});

export const updateAttestationStageSchema = z.object({
  stage: z.enum(['quote_requested', 'quote_confirmed', 'docs_awaiting', 'in_process', 'completed', 'dispatched', 'delivered', 'rejected'])
});

export const updateAttestationChainSchema = z.object({
  stepKey: z.string().min(1),
  status: z.enum(['pending', 'done', 'failed']),
  note: z.string().max(500).optional()
});

export const updateAttestationPickupSchema = z.object({
  pickupStatus: z.enum(['awaiting_docs', 'docs_received', 'dispatched_to_supplier', 'returned', 'delivered']).optional(),
  pickupAddress: z.string().max(500).optional(),
  courierInbound: z.string().max(100).optional(),
  courierOutbound: z.string().max(100).optional(),
  courierReturn: z.string().max(100).optional()
});

export const createAttestationRateCardSchema = z.object({
  country: z.string().min(2),
  category: z.enum(['educational', 'personal', 'commercial']),
  route: z.enum(['apostille', 'embassy']),
  title: z.string().min(2).optional(),
  description: z.string().max(1000).optional(),
  documentTypes: z.array(z.string()).optional(),
  pricePaise: z.number().int().min(0),
  govtFeePaise: z.number().int().min(0).optional(),
  courierFeePaise: z.number().int().min(0).optional(),
  translationFeePaise: z.number().int().min(0).optional(),
  timelineDays: z.number().int().min(1).optional(),
  steps: z.array(z.string()).optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional()
});

export const updateAttestationRateCardSchema = z.object({
  country: z.string().min(2).optional(),
  category: z.enum(['educational', 'personal', 'commercial']).optional(),
  route: z.enum(['apostille', 'embassy']).optional(),
  title: z.string().min(2).optional(),
  description: z.string().max(1000).optional(),
  documentTypes: z.array(z.string()).optional(),
  pricePaise: z.number().int().min(0).optional(),
  govtFeePaise: z.number().int().min(0).optional(),
  courierFeePaise: z.number().int().min(0).optional(),
  translationFeePaise: z.number().int().min(0).optional(),
  timelineDays: z.number().int().min(1).optional(),
  steps: z.array(z.string()).optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional()
});

export type CreateAttestationApplicationInput = z.infer<typeof createAttestationApplicationSchema>;
export type UpdateAttestationStageInput = z.infer<typeof updateAttestationStageSchema>;
export type UpdateAttestationChainInput = z.infer<typeof updateAttestationChainSchema>;
export type UpdateAttestationPickupInput = z.infer<typeof updateAttestationPickupSchema>;
export type CreateAttestationRateCardInput = z.infer<typeof createAttestationRateCardSchema>;
