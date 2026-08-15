// Study Abroad compatibility matching (pure function — no catalog, no storage).
// Compares the student's profile (clients.intakeContext canonical keys) against
// the requirements an agent enters in the application modal. Rendered live in
// the modal as a Match / Reach / Safe badge + 0–100 score.
//
// Tier rules (industry "reach-match-safe" strategy):
//   match  — every threshold passes
//   reach  — within 10% of a threshold, or exactly one soft miss (country only)
//   safe   — ≥15% above ALL thresholds
// Score weights: CGPA 40 · English 30 · Budget 30.

export type MatchTier = 'match' | 'reach' | 'safe';

export interface StudentProfile {
  cgpa?: number | null;
  englishScore?: number | null; // IELTS band (or TOEFL/PTE — normalized by caller)
  tuitionBudget?: number | null; // lakh INR per year
  targetCountry?: string | null;
  preferredCourse?: string | null;
}

export interface UniRequirements {
  minGpa?: number | null;
  minEnglishScore?: number | null;
  tuitionLpaMin?: number | null;
  tuitionLpaMax?: number | null;
  country?: string | null;
  program?: string | null;
}

export interface MatchResult {
  tier: MatchTier;
  score: number; // 0–100
  reasons: string[]; // human-readable pass/miss lines
  misses: string[]; // only the failing checks
}

/** Parse the canonical intakeContext JSON into a typed profile (safe). */
export function profileFromIntakeContext(raw?: string | null): StudentProfile {
  if (!raw) return {};
  try {
    const ctx = JSON.parse(raw);
    const num = (v: any) => (v === undefined || v === null || v === '' ? null : Number(v));
    return {
      cgpa: num(ctx.cgpa ?? ctx.gpa),
      englishScore: num(ctx.englishScore ?? ctx.ielts),
      tuitionBudget: num(ctx.tuitionBudget ?? ctx.budgetLpa),
      targetCountry: ctx.targetCountry ? String(ctx.targetCountry) : null,
      preferredCourse: ctx.preferredCourse ? String(ctx.preferredCourse) : null,
    };
  } catch {
    return {};
  }
}

// ─── Profile completeness (drives the intake wizard + agent chase list) ───
// Required for a "workable" profile: academic history, English (score or
// planned), preferences. Optional extras add depth but don't block.
export interface Completeness {
  pct: number; // 0–100
  missing: string[]; // human-readable gaps
  done: string[];
}

const REQUIRED_CHECKS: { key: string; label: string; test: (ctx: any) => boolean }[] = [
  { key: 'academic', label: 'Academic history (10th/12th or degree)', test: (c) => (c.pct10th && c.pct12th) || c.degreeName },
  { key: 'cgpa', label: 'CGPA', test: (c) => c.cgpa !== undefined && c.cgpa !== null && c.cgpa !== '' },
  { key: 'english', label: 'English score or planned test', test: (c) => (c.englishScore !== undefined && c.englishScore !== null && c.englishScore !== '') || c.testPlanned === true },
  { key: 'country', label: 'Target country', test: (c) => !!c.targetCountry },
  { key: 'intake', label: 'Target intake', test: (c) => !!c.targetIntake },
  { key: 'course', label: 'Preferred course', test: (c) => !!c.preferredCourse },
  { key: 'budget', label: 'Tuition budget', test: (c) => c.tuitionBudget !== undefined && c.tuitionBudget !== null && c.tuitionBudget !== '' },
  { key: 'consent', label: 'University-sharing consent (DPDP)', test: (c) => c.universitySharingConsent === true },
];

export function computeProfileCompleteness(raw?: string | null): Completeness {
  let ctx: any = {};
  if (raw) {
    try { ctx = JSON.parse(raw); } catch { /* tolerate */ }
  }
  const done: string[] = [];
  const missing: string[] = [];
  for (const check of REQUIRED_CHECKS) {
    if (check.test(ctx)) done.push(check.label);
    else missing.push(check.label);
  }
  const pct = Math.round((done.length / REQUIRED_CHECKS.length) * 100);
  return { pct, missing, done };
}

/** Normalize a TOEFL/PTE score to an approximate IELTS band for comparison. */
export function normalizeEnglish(score: number | null | undefined, test?: string | null): number | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  if (test === 'TOEFL') return Math.round(((score - 31) / 10) * 2) / 2; // TOEFL 100 ≈ IELTS 7.0
  if (test === 'PTE') return Math.round(((score - 50) / 17 + 6) * 2) / 2; // PTE 50≈6.0 · 65≈7.0 · 84≈8.0
  if (test === 'Duolingo') return Math.round(((score - 85) / 20 + 5) * 2) / 2; // DET 85≈5.0 · 120≈7.0 · 145≈8.0
  if (test === 'Cambridge') return Math.round(((score - 160) / 20 + 5.5) * 2) / 2; // CAE 180≈6.5 · CPE 200≈7.5
  return Number(score);
}

export function matchApplication(profile: StudentProfile, uni: UniRequirements): MatchResult {
  const reasons: string[] = [];
  const misses: string[] = [];

  const cgpa = profile.cgpa ?? null;
  const english = profile.englishScore ?? null;
  const budget = profile.tuitionBudget ?? null;

  // CGPA check
  let cgpaOk = true;
  if (uni.minGpa != null && cgpa != null) {
    cgpaOk = cgpa >= uni.minGpa;
    reasons.push(cgpaOk ? `CGPA ${cgpa} ≥ ${uni.minGpa}` : `CGPA ${cgpa} < required ${uni.minGpa}`);
    if (!cgpaOk) misses.push('CGPA');
  } else if (uni.minGpa != null) {
    reasons.push('CGPA not on profile');
    misses.push('CGPA');
  }

  // English check
  let englishOk = true;
  if (uni.minEnglishScore != null && english != null) {
    englishOk = english >= uni.minEnglishScore;
    reasons.push(englishOk ? `English ${english} ≥ ${uni.minEnglishScore}` : `English ${english} < required ${uni.minEnglishScore}`);
    if (!englishOk) misses.push('English');
  } else if (uni.minEnglishScore != null) {
    reasons.push('English score not on profile');
    misses.push('English');
  }

  // Budget check (against the max end of the range when provided)
  let budgetOk = true;
  const budgetNeed = uni.tuitionLpaMax ?? uni.tuitionLpaMin ?? null;
  if (budgetNeed != null && budget != null) {
    budgetOk = budget >= budgetNeed;
    reasons.push(budgetOk ? `Budget ₹${budget}L ≥ ₹${budgetNeed}L` : `Budget ₹${budget}L < ₹${budgetNeed}L needed`);
    if (!budgetOk) misses.push('Budget');
  } else if (budgetNeed != null) {
    reasons.push('Budget not on profile');
    misses.push('Budget');
  }

  // Country check (soft — a miss here alone = reach, not fail)
  let countryOk = true;
  if (uni.country && profile.targetCountry) {
    countryOk = uni.country.toLowerCase() === profile.targetCountry.toLowerCase();
    reasons.push(countryOk ? `Country ${profile.targetCountry} matches` : `Target country ${profile.targetCountry} ≠ ${uni.country}`);
    if (!countryOk) misses.push('Country');
  }

  // Course check (informational only)
  if (uni.program && profile.preferredCourse) {
    const courseOk = uni.program.toLowerCase().includes(profile.preferredCourse.toLowerCase()) ||
      profile.preferredCourse.toLowerCase().includes(uni.program.toLowerCase());
    reasons.push(courseOk ? `Course "${uni.program}" aligns with preference` : `Course "${uni.program}" differs from preference "${profile.preferredCourse}"`);
    if (!courseOk) misses.push('Course');
  }

  // Score: CGPA 40 · English 30 · Budget 30 (proportional to headroom)
  let score = 0;
  if (uni.minGpa != null && cgpa != null) {
    const headroom = Math.min(1, Math.max(0, (cgpa - uni.minGpa) / Math.max(0.5, uni.minGpa)));
    score += 40 * (0.5 + 0.5 * headroom);
  } else if (uni.minGpa != null) {
    score += 20; // unknown profile → half credit
  } else {
    score += 40;
  }
  if (uni.minEnglishScore != null && english != null) {
    const headroom = Math.min(1, Math.max(0, (english - uni.minEnglishScore) / Math.max(0.5, uni.minEnglishScore)));
    score += 30 * (0.5 + 0.5 * headroom);
  } else if (uni.minEnglishScore != null) {
    score += 15;
  } else {
    score += 30;
  }
  if (budgetNeed != null && budget != null) {
    const headroom = Math.min(1, Math.max(0, (budget - budgetNeed) / Math.max(1, budgetNeed)));
    score += 30 * (0.5 + 0.5 * headroom);
  } else if (budgetNeed != null) {
    score += 15;
  } else {
    score += 30;
  }
  score = Math.round(score);

  // Tier (industry reach-match-safe):
  //   safe   — comfortably above everything (score ≥ 85, zero misses)
  //   match  — every threshold passes
  //   reach  — one soft miss (country/course) or any hard miss (risky)
  const hardMisses = misses.filter(m => m !== 'Country' && m !== 'Course');
  let tier: MatchTier;
  if (hardMisses.length === 0 && countryOk) {
    tier = score >= 85 ? 'safe' : 'match';
  } else {
    tier = 'reach';
  }

  return { tier, score, reasons, misses };
}