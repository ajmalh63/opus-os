export type ManpowerProfile = {
  totalYears?: number | null;
  skills?: string | null;
  currentRole?: string | null;
  highestQualification?: string | null;
  institution?: string | null;
  hasPassport?: boolean;
  passportNumber?: string | null;
  selfDeclaredFit?: boolean;
  hasChronicCondition?: boolean;
  tradeCertifications?: string | null;
  willingToTravel?: boolean;
  fieldOfStudy?: string | null;
};

export function computeManpowerMatchFrontend(profile: any, job: any): { score: number; tier: 'top_match' | 'standard' | 'cold_pool'; reasons: string[] } {
  if (!profile || Object.keys(profile).length === 0) return { score: 35, tier: 'cold_pool', reasons: ['Complete profile to see real Match%'] };
  let total = 0;
  const exp = Number(profile.totalYears || 0);
  const req = Number(job.experienceYearsMin || 0);
  if (req === 0) total += 35; else if (exp >= req) total += 35; else if (exp > 0) total += Math.round(Math.min(1, exp / req) * 35);
  const skillsRaw = profile.skills || '';
  const candSkills = skillsRaw.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  const reqs: string[] = Array.isArray(job.requirements) ? job.requirements.map((r: string) => r.toLowerCase()) : [];
  const keywords = [...(job.title || '').toLowerCase().split(/\s+/), ...(job.sector || '').toLowerCase().split(/\s+/), ...(job.tradeCategory || '').toLowerCase().split(/\s+/)].filter(w => w.length > 2);
  const allTargets = [...new Set([...reqs, ...keywords])];
  if (allTargets.length === 0) total += 35; else {
    let matched = 0;
    for (const kw of allTargets) if (candSkills.some((cs: string) => cs.includes(kw) || kw.includes(cs))) matched++;
    const ratio = matched / allTargets.length;
    total += Math.round(Math.min(35, ratio * 35 + (candSkills.length ? 10 : 0)));
  }
  const collar = job.collar;
  const edu = (profile.highestQualification || '').toLowerCase();
  if (collar === 'white_collar') {
    if (['undergrad','postgrad','bachelors','masters','degree','diploma'].some(e => edu.includes(e))) total += 15; else if (edu) total += 10;
  } else {
    if (profile.tradeCertifications || profile.currentRole) total += 15; else total += 8;
  }
  if (profile.hasPassport && profile.passportNumber) total += 8;
  if (profile.selfDeclaredFit !== false) total += 7;
  const final = Math.min(100, Math.max(10, total));
  let tier: 'top_match' | 'standard' | 'cold_pool' = 'cold_pool';
  if (final >= 75) tier = 'top_match'; else if (final >= 50) tier = 'standard';
  return { score: final, tier, reasons: [] };
}
