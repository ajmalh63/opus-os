// Intent resolution (Wave 4) — "which division does this person care about?"
// Deterministic, transparent, testable. No ML needed for v1: declared intent
// wins, then context heuristics, then nothing (never a wrong-division guess).

export const DIVISIONS = ['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'] as const;
export type Division = (typeof DIVISIONS)[number];

export interface IntentClient {
  primaryDivision?: string | null;
  intentDivisions?: string | null;
  intakeContext?: string | null;
  highestQualification?: string | null;
}

// Row accessors that accept both camelCase (drizzle) and snake_case (raw/seed)
// keys — keeps the lib robust in production and in tests.
function get(client: IntentClient, camel: keyof IntentClient, snake: string): string | null | undefined {
  const v = (client as any)[camel] ?? (client as any)[snake];
  return v == null ? null : String(v);
}

export interface IntentContext {
  targetCountry?: string;
  visaCategory?: string;
  umrahDeparture?: string;
  attestationCategory?: string;
  manpowerSector?: string;
  ielts?: string;
  umrah?: string;
  hajj?: string;
  course?: string;
  [key: string]: unknown;
}

// Keyword heuristics — two passes, deterministic, one-match-wins.
// STRONG (explicit per-division fields / whitelisted countries) is evaluated
// for every division BEFORE WEAK (loose keyword scans). Never guess otherwise.
const STUDY_COUNTRIES = ['USA', 'US', 'UK', 'CANADA', 'AUSTRALIA', 'GERMANY', 'IRELAND', 'NEW ZEALAND'];
const STRONG: Record<Division, (ctx: IntentContext, q: string) => boolean> = {
  'study-abroad': (c) => STUDY_COUNTRIES.includes(String(c.targetCountry || '').toUpperCase()) || !!(c.ielts || c.course),
  visa: (c) => !!c.visaCategory,
  umrah: (c) => !!(c.umrahDeparture || c.umrah || c.hajj),
  attestation: (c) => !!c.attestationCategory,
  manpower: (c) => !!c.manpowerSector,
};

const WEAK: Record<Division, (ctx: IntentContext, q: string) => boolean> = {
  umrah: (c, q) => /umrah|hajj|ramadan|ziyarat/i.test(q),
  attestation: (c, q) => /attestation|apostille|mofa/i.test(q),
  manpower: (c, q) => /job|career|recruit|employment|gulf|placement/i.test(q),
  visa: (c, q) => /visa|stamping/i.test(q),
  'study-abroad': (c, q) => /ielts|toefl|university|admission|degree|postgrad/i.test(q),
};

const QUALIFICATION_HINT: Record<string, Division> = {
  postgraduate: 'study-abroad',
  undergrad: 'study-abroad',
  diploma: 'study-abroad',
  jobseeker: 'manpower',
  professional: 'manpower',
};

function safeParseContext(client: IntentClient): IntentContext {
  try {
    const v = get(client, 'intakeContext', 'intake_context') ? JSON.parse(get(client, 'intakeContext', 'intake_context') as string) : {};
    return (v && typeof v === 'object' ? v : {}) as IntentContext;
  } catch {
    return {};
  }
}

// Best-effort, deterministic division inference from intake context +
// qualification. Returns undefined when no signal matches (caller decides).
export function inferDivisionFromContext(client: IntentClient): Division | undefined {
  const ctx = safeParseContext(client);
  const q = (get(client, 'highestQualification', 'highest_qualification') || '').toLowerCase().trim() + ' ' + String(Object.values(ctx).join(' '));
  const hint = (Object.keys(QUALIFICATION_HINT) as Array<keyof typeof QUALIFICATION_HINT>)
    .find((k) => q.includes(k));
  const hintDiv = hint ? QUALIFICATION_HINT[hint] : undefined;

  for (const div of DIVISIONS) {
    if (STRONG[div](ctx, q)) return div;
  }
  for (const div of DIVISIONS) {
    if (WEAK[div](ctx, q)) return div;
  }
  return hintDiv;
}

// Primary-interest resolution, in priority order:
//   1. Active engagement division (operational truth)
//   2. Declared primaryDivision at intake (the lead form)
//   3. Deterministic context/qualification inference
//   4. undefined â†’ caller must NOT guess a division (no cross-division spam)
export function resolvePrimaryDivision(
  client: IntentClient,
  activeEngagementDivision?: string | null
): Division | undefined {
  if (activeEngagementDivision && DIVISIONS.includes(activeEngagementDivision as Division)) {
    return activeEngagementDivision as Division;
  }
  const declared = (get(client, 'primaryDivision', 'primary_division') || '').trim();
  if (declared && DIVISIONS.includes(declared as Division)) return declared as Division;
  return inferDivisionFromContext(client);
}

export function declaredDivisions(client: IntentClient): string[] {
  try {
    const raw = get(client, 'intentDivisions', 'intent_divisions') ? JSON.parse(get(client, 'intentDivisions', 'intent_divisions') as string) : [];
    return Array.isArray(raw) ? raw.filter((d) => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

