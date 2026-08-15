import { z } from 'zod';

// Candidate application form for a Manpower job (client self-service, portal).
// Mirrors the visaForm pattern: sections, partial save, full validation at submit.
export const manpowerFormSchema = z.object({
  personal: z.object({
    fullName: z.string().min(1),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    gender: z.enum(['male', 'female', 'other']),
    nationality: z.string().default('Indian'),
    maritalStatus: z.enum(['single', 'married']),
    currentCity: z.string().optional(),
    currentState: z.string().optional(),
    languages: z.array(z.string()).default([]),
  }),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().optional(),
    alternatePhone: z.string().optional(),
    emergencyContact: z.string().optional(),
    emergencyPhone: z.string().optional(),
  }),
  passport: z.object({
    hasPassport: z.boolean(),
    passportNumber: z.string().optional(),
    issueDate: z.string().optional(),
    expiryDate: z.string().optional(),
  }),
  experience: z.object({
    totalYears: z.number().min(0).default(0),
    currentRole: z.string().optional(),
    currentEmployer: z.string().optional(),
    skills: z.array(z.string()).default([]),
    willingToTravel: z.boolean().default(true),
    availableFrom: z.string().optional(),
  }),
  education: z.object({
    highestQualification: z.string().optional(),
    institution: z.string().optional(),
    fieldOfStudy: z.string().optional(),
  }),
  salary: z.object({
    currentSalaryPaise: z.number().min(0).optional(),
    expectedSalaryPaise: z.number().min(0).optional(),
    noticePeriodDays: z.number().min(0).default(0),
  }),
  medical: z.object({
    selfDeclaredFit: z.boolean().default(true),
    hasChronicCondition: z.boolean().default(false),
  }),
  additional: z.object({
    tradeCertifications: z.array(z.string()).default([]),
    drivingLicense: z.string().optional(),
    references: z.string().optional(),
  }),
});

export function missingManpowerSections(form: unknown): string[] {
  const missing: string[] = [];
  const parsed = manpowerFormSchema.safeParse(form || {});
  if (!parsed.success) {
    // report which top-level sections failed
    const errs = parsed.error.errors as { path: (string | number)[] }[];
    const sections = new Set<string>();
    for (const e of errs) {
      if (e.path.length > 0) sections.add(String(e.path[0]));
    }
    const all = ['personal', 'contact', 'passport', 'experience', 'education', 'salary', 'medical', 'additional'];
    for (const s of all) if (sections.has(s)) missing.push(s);
  }
  return missing;
}
