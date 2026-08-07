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
  isInterstate: z.boolean().optional()
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;
export type SignAgreementInput = z.infer<typeof signAgreementSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// 7. Umrah Group Departure Schema
export const createDepartureSchema = z.object({
  packageTier: z.enum(['economy', 'standard', 'premium']),
  departureDate: z.number().int(),
  price: z.number().int(),
  bookingFee: z.number().int()
});

// 8. Book Seat Schema
export const bookSeatSchema = z.object({
  clientId: z.string().min(1, { message: "Client ID is required" })
});

export type CreateDepartureInput = z.infer<typeof createDepartureSchema>;
export type BookSeatInput = z.infer<typeof bookSeatSchema>;

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
  userDivisions: z.array(z.string())
});

export type RegisterStaffInput = z.infer<typeof registerStaffSchema>;

