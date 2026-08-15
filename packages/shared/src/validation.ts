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
    resumeFileKey: z.string().optional()
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
export const signAgreementSchema = z.object({
  esignMethod: z.enum(['aadhaar', 'otp', 'wet_ink'])
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

