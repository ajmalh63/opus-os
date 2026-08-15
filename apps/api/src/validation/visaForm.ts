import { z } from 'zod';

// Client visa application form — server-side validation contract (Visa Phase-1,
// spec section 2). `form_json` on visa_applications is validated with this.
// PUT accepts PARTIAL payloads (section-level replace); submit requires the
// full schema to pass.

export const visaApplicantSection = z.object({
  fullName: z.string().min(1),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(['male', 'female', 'other']),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']),
  nationality: z.string().default('Indian'),
  placeOfBirth: z.string().optional(),
});

export const visaPassportSection = z.object({
  number: z.string().min(4).regex(/^[A-Z0-9]+$/),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  placeOfIssue: z.string(),
  countryOfIssue: z.string().default('India'),
  hasPreviousPassport: z.boolean(),
  previousPassportNumber: z.string().optional(),
});

export const visaContactSection = z.object({
  address: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  phone: z.string().optional(),
  alternatePhone: z.string().optional(),
  emergencyContact: z.string(),
  emergencyPhone: z.string(),
});

export const visaEmploymentSection = z.object({
  status: z.enum(['salaried', 'self_employed', 'student', 'retired', 'unemployed', 'homemaker']),
  occupation: z.string().optional(),
  employerName: z.string().optional(),
  designation: z.string().optional(),
  employerAddress: z.string().optional(),
  employerPhone: z.string().optional(),
  yearsEmployed: z.number().min(0).optional(),
  monthlyIncome: z.number().min(0).optional(),
});

export const visaTravelSection = z.object({
  purpose: z.enum(['tourism', 'business', 'medical', 'visiting_family', 'other']),
  intendedArrival: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  intendedDeparture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accommodation: z.enum(['hotel', 'family', 'friend', 'other']),
  accommodationName: z.string().optional(),
  returnTicketBooked: z.boolean(),
  hasCompanions: z.boolean(),
  companions: z.number().min(0).default(0),
});

export const visaFinancialSection = z.object({
  fundingSource: z.enum(['salary', 'savings', 'sponsor', 'family']),
  bankBalanceInr: z.number().min(0).optional(),
  sponsorName: z.string().optional(),
  sponsorRelation: z.string().optional(),
  sponsorContact: z.string().optional(),
  employmentLetterAvailable: z.boolean(),
  itrFiled: z.boolean(),
});

export const visaHistorySection = z.object({
  hasUsUkSchengen: z.boolean(),
  previousCountries: z.array(z.string()).default([]),
  everRejected: z.boolean(),
  rejectionCountry: z.string().optional(),
  everOverstayed: z.boolean(),
});

export const VISA_FORM_SECTIONS = ['applicant', 'passport', 'contact', 'employment', 'travel', 'financial', 'visaHistory'] as const;

export const visaFormSchema = z.object({
  applicant: visaApplicantSection,
  passport: visaPassportSection,
  contact: visaContactSection,
  employment: visaEmploymentSection,
  travel: visaTravelSection,
  financial: visaFinancialSection,
  visaHistory: visaHistorySection,
});

export type VisaForm = z.infer<typeof visaFormSchema>;

// Returns the top-level section names that are missing or invalid in the given
// form payload, in canonical section order. Empty array = form is complete.
export function missingVisaSections(form: unknown): string[] {
  const result = visaFormSchema.safeParse(form);
  if (result.success) return [];
  const missing = new Set<string>();
  for (const issue of result.error.issues) {
    const section = issue.path[0];
    if (typeof section === 'string') missing.add(section);
  }
  return VISA_FORM_SECTIONS.filter((s) => missing.has(s));
}
