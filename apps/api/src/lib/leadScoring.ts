// Lead Command Center — Gold Standard Scoring (RevOps fit + engagement)
// Explicit (fit): country intent +15, budget tier +15, intake urgency +20
// Implicit (engagement): visits 2+ +10, pricing page +15, WA opt-in +10
// Negative: personal email −10, competitor domain −30
// Threshold 50 = MQL → task + WA template, recalibrate quarterly

export type LeadInput = {
  email: string;
  phone: string;
  leadSource?: string;
  intakeContext?: any; // JSON: targetCountry, intake, budget, visaCategory, visits, pricingView, whatsappOptIn
  notes?: string;
};

const COMPETITORS = ['competitor.com', 'leverage', 'yocket'];
const PERSONAL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'protonmail'];

export function scoreLead(input: LeadInput): { score: number; breakdown: Record<string, number>; isMql: boolean; reasons: string[] } {
  let score = 0;
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];
  const ctx = input.intakeContext || {};

  // Explicit fit
  if (ctx.targetCountry) { score += 15; breakdown.countryIntent = 15; reasons.push('country intent'); }
  if (ctx.budget) { score += 15; breakdown.budgetTier = 15; }
  if (ctx.intake) {
    // intake urgency: if intake within 90 days → +20
    try {
      const intakeDate = new Date(ctx.intake);
      const diff = (intakeDate.getTime() - Date.now()) / (1000*60*60*24);
      if (diff > 0 && diff < 90) { score += 20; breakdown.intakeUrgency = 20; reasons.push('intake <90d'); }
      else if (diff >= 90 && diff < 180) { score += 10; breakdown.intakeUrgency = 10; }
    } catch {}
  }

  // Implicit engagement
  if (ctx.visits && Number(ctx.visits) >= 2) { score += 10; breakdown.visits2plus = 10; }
  if (ctx.pricingView) { score += 15; breakdown.pricingView = 15; }
  if (ctx.whatsappOptIn || ctx.whatsappUpdates) { score += 10; breakdown.waOptIn = 10; }

  // Negative
  const domain = (input.email.split('@')[1] || '').toLowerCase();
  if (PERSONAL_DOMAINS.includes(domain)) { score -= 10; breakdown.personalEmail = -10; }
  if (COMPETITORS.some(c => input.email.toLowerCase().includes(c) || (input.notes||'').toLowerCase().includes(c))) {
    score -= 30; breakdown.competitor = -30;
  }

  // Clamp 0-100
  score = Math.max(0, Math.min(100, score));
  const isMql = score >= 50;
  return { score, breakdown, isMql, reasons };
}

export function nextSlaDueAt(): number {
  // 4hr SLA for MQL contact
  return Math.floor(Date.now()/1000) + 4*3600;
}
