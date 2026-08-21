import { describe, it, expect } from 'vitest';
import { computeManpowerMatch, calculateProfileCompleteness, verifyTurnstileToken } from '../src/lib/manpowerMatch.js';
import { MANPOWER_VAS_CATALOG } from '../src/routes/portalManpower.js';

describe('Manpower Match Engine & Profile Auditor', () => {
  const sampleJob = {
    id: 'job_test_01',
    title: 'Senior Civil Engineer',
    country: 'United Arab Emirates',
    sector: 'Construction',
    collar: 'white_collar' as const,
    experienceYearsMin: 5,
    tradeCategory: 'Engineering',
    requirements: ['AutoCAD', 'Civil', 'Site Management', 'Project Management'],
    benefits: ['Visa', 'Housing', 'Medical Insurance'],
    medicalRequired: true,
    visaProvided: true
  };

  it('calculates a high match score (≥75%) for an experienced qualified candidate', () => {
    const candidateForm = {
      personal: { fullName: 'Ahmed Khan', dob: '1990-05-15', gender: 'male', nationality: 'Indian', currentCity: 'Mumbai' },
      passport: { hasPassport: true, passportNumber: 'Z1234567' },
      experience: {
        totalYears: 7,
        currentRole: 'Civil Site Engineer',
        skills: 'AutoCAD, Civil Engineering, Site Management, Project Planning',
        willingToTravel: true
      },
      education: { highestQualification: 'Bachelor of Engineering in Civil' },
      medical: { selfDeclaredFit: true, hasChronicCondition: false }
    };

    const match = computeManpowerMatch(candidateForm, sampleJob);
    expect(match.score).toBeGreaterThanOrEqual(75);
    expect(match.tier).toBe('top_match');
    expect(match.strengths.length).toBeGreaterThanOrEqual(2);
    expect(match.gaps.length).toBe(0);
  });

  it('calculates a cold pool match score (<50%) for an unqualified candidate', () => {
    const candidateForm = {
      personal: { fullName: 'John Doe', dob: '2000-01-01', gender: 'male', nationality: 'Indian', currentCity: 'Delhi' },
      passport: { hasPassport: false },
      experience: {
        totalYears: 1,
        currentRole: 'Retail Assistant',
        skills: 'Cashier, Inventory',
        willingToTravel: true
      },
      education: { highestQualification: 'High School' },
      medical: { selfDeclaredFit: false, hasChronicCondition: true }
    };

    const match = computeManpowerMatch(candidateForm, sampleJob);
    expect(match.score).toBeLessThan(50);
    expect(match.tier).toBe('cold_pool');
    expect(match.gaps.length).toBeGreaterThanOrEqual(2);
  });

  it('calculates profile completeness percentage accurately across 8 sections', () => {
    const fullForm = {
      personal: { fullName: 'Ravi Kumar', dob: '1992-04-10', currentCity: 'Hyderabad', languages: ['English', 'Hindi'] },
      contact: { phone: '9876543210', email: 'ravi@example.com' },
      passport: { hasPassport: true, passportNumber: 'P9876543' },
      experience: { totalYears: 4, skills: ['Welding', 'Fabrication'] },
      education: { highestQualification: 'ITI Diploma' },
      salary: { expectedSalaryPaise: 4500000 },
      medical: { selfDeclaredFit: true },
      additional: { tradeCertifications: ['ISO Welder'] }
    };

    const fullResult = calculateProfileCompleteness(fullForm);
    expect(fullResult.percentage).toBe(100);
    expect(fullResult.missingSections).toHaveLength(0);

    const partialForm = {
      personal: { fullName: 'Ravi Kumar', currentCity: 'Hyderabad' }
    };
    const partialResult = calculateProfileCompleteness(partialForm);
    expect(partialResult.percentage).toBeLessThan(50);
    expect(partialResult.missingSections.length).toBeGreaterThan(3);
  });
});

describe('Cloudflare Turnstile Token Verification', () => {
  it('allows simulated / dev tokens in non-production environments', async () => {
    const result = await verifyTurnstileToken('cf_ts_simulated_token_12345', '127.0.0.1');
    expect(result.success).toBe(true);
  });

  it('fails safely when token is completely blank or missing in production mode', async () => {
    const result = await verifyTurnstileToken('', '127.0.0.1', 'secret_test_key');
    expect(result.success).toBe(false);
  });
});

describe('Manpower Value-Added Services (VAS) Catalog', () => {
  it('exposes compliant non-contingent VAS plans with integer paise pricing', () => {
    expect(MANPOWER_VAS_CATALOG.length).toBeGreaterThanOrEqual(3);
    for (const plan of MANPOWER_VAS_CATALOG) {
      expect(typeof plan.key).toBe('string');
      expect(typeof plan.pricePaise).toBe('number');
      expect(plan.pricePaise % 100).toBe(0); // integer rupees in paise
      expect(plan.pricePaise).toBeGreaterThan(0);
      expect(typeof plan.deliverable).toBe('string');
    }

    const resumePlan = MANPOWER_VAS_CATALOG.find(p => p.key === 'ats_resume_revamp');
    expect(resumePlan).toBeDefined();
    expect(resumePlan?.pricePaise).toBe(99900); // ₹999
  });
});
