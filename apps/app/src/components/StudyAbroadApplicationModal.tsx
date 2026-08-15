import { useState } from 'react';

// Study Abroad — New Application modal (snapshot model).
// The agent fills everything needed to apply; Match/Reach/Safe is computed
// LIVE against the student's profile (no catalog, no storage of market data).

export interface StudentProfile {
  cgpa?: number | null;
  englishScore?: number | null;
  englishTest?: string | null;
  tuitionBudget?: number | null;
  targetCountry?: string | null;
  preferredCourse?: string | null;
}

export interface MatchResult {
  tier: 'match' | 'reach' | 'safe';
  score: number;
  reasons: string[];
  misses: string[];
}

export interface ApplicationSnapshot {
  name: string;
  country: string;
  city?: string;
  website?: string;
  portalUrl?: string;
  portalUsername?: string;
  program: string;
  degreeLevel: string;
  intake: string;
  deadline?: number;
  applicationFeePaise?: number;
  minGpa?: number;
  minEnglishScore?: number;
  englishTest?: string;
  greRequired?: boolean;
  tuitionLpaMin?: number;
  tuitionLpaMax?: number;
  scholarshipsJson?: string;
  notes?: string;
}

const DEGREE_LEVELS = ['masters', 'bachelors', 'phd', 'diploma', 'foundation'];
const INTAKES = ['Fall 2027', 'Spring 2027', 'Summer 2027', 'Fall 2028', 'Spring 2028'];

const TIER_STYLE: Record<string, string> = {
  match: 'bg-emerald-500/15 text-emerald-700 border-emerald-200',
  reach: 'bg-amber-500/15 text-amber-700 border-amber-200',
  safe: 'bg-blue-500/15 text-blue-700 border-blue-200',
};
const TIER_LABEL: Record<string, string> = { match: '✓ Match', reach: '⚠ Reach', safe: '★ Safe' };

/** Client-side mirror of lib/studyAbroadMatch.ts (pure, same rules). */
function normalizeEnglish(score: number | null | undefined, test?: string | null): number | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  if (test === 'TOEFL') return Math.round(((score - 31) / 10) * 2) / 2; // TOEFL 100 ≈ IELTS 7.0
  if (test === 'PTE') return Math.round(((score - 50) / 17 + 6) * 2) / 2; // PTE 50≈6.0 · 65≈7.0 · 84≈8.0
  return Number(score);
}

export function computeMatch(profile: StudentProfile, uni: Partial<ApplicationSnapshot>): MatchResult {
  const reasons: string[] = [];
  const misses: string[] = [];
  const cgpa = profile.cgpa ?? null;
  const english = profile.englishScore ?? null;
  const budget = profile.tuitionBudget ?? null;
  // Normalize the university's requirement to the student's test scale (mirror of the backend).
  const minEnglish = normalizeEnglish(uni.minEnglishScore, uni.englishTest);

  let cgpaOk = true;
  if (uni.minGpa != null && cgpa != null) {
    cgpaOk = cgpa >= uni.minGpa;
    reasons.push(cgpaOk ? `CGPA ${cgpa} ≥ ${uni.minGpa}` : `CGPA ${cgpa} < required ${uni.minGpa}`);
    if (!cgpaOk) misses.push('CGPA');
  }
  let englishOk = true;
  if (minEnglish != null && english != null) {
    englishOk = english >= minEnglish;
    reasons.push(englishOk ? `English ${english} ≥ ${minEnglish} (${uni.englishTest || 'IELTS'})` : `English ${english} < required ${minEnglish} (${uni.englishTest || 'IELTS'})`);
    if (!englishOk) misses.push('English');
  }
  let budgetOk = true;
  const budgetNeed = uni.tuitionLpaMax ?? uni.tuitionLpaMin ?? null;
  if (budgetNeed != null && budget != null) {
    budgetOk = budget >= budgetNeed;
    reasons.push(budgetOk ? `Budget ₹${budget}L ≥ ₹${budgetNeed}L` : `Budget ₹${budget}L < ₹${budgetNeed}L needed`);
    if (!budgetOk) misses.push('Budget');
  }
  let countryOk = true;
  if (uni.country && profile.targetCountry) {
    countryOk = uni.country.toLowerCase() === profile.targetCountry.toLowerCase();
    reasons.push(countryOk ? `Country ${profile.targetCountry} matches` : `Target country ${profile.targetCountry} ≠ ${uni.country}`);
    if (!countryOk) misses.push('Country');
  }

  let score = 0;
  if (uni.minGpa != null && cgpa != null) {
    const h = Math.min(1, Math.max(0, (cgpa - uni.minGpa) / Math.max(0.5, uni.minGpa)));
    score += 40 * (0.5 + 0.5 * h);
  } else if (uni.minGpa != null) score += 20; else score += 40;
  if (minEnglish != null && english != null) {
    const h = Math.min(1, Math.max(0, (english - minEnglish) / Math.max(0.5, minEnglish)));
    score += 30 * (0.5 + 0.5 * h);
  } else if (minEnglish != null) score += 15; else score += 30;
  if (budgetNeed != null && budget != null) {
    const h = Math.min(1, Math.max(0, (budget - budgetNeed) / Math.max(1, budgetNeed)));
    score += 30 * (0.5 + 0.5 * h);
  } else if (budgetNeed != null) score += 15; else score += 30;
  score = Math.round(score);

  const hardMisses = misses.filter(m => m !== 'Country');
  const tier: MatchResult['tier'] = hardMisses.length === 0 && countryOk ? (score >= 85 ? 'safe' : 'match') : 'reach';
  return { tier, score, reasons, misses };
}

interface Props {
  profile: StudentProfile;
  onClose: () => void;
  onCreate: (snapshot: ApplicationSnapshot) => void;
  creating: boolean;
}

export default function StudyAbroadApplicationModal({ profile, onClose, onCreate, creating }: Props) {
  const [form, setForm] = useState<ApplicationSnapshot>({
    name: '', country: '', city: '', website: '', portalUrl: '', portalUsername: '',
    program: '', degreeLevel: 'masters', intake: 'Fall 2027', deadline: undefined,
    applicationFeePaise: undefined, minGpa: undefined, minEnglishScore: undefined,
    englishTest: 'IELTS', greRequired: false, tuitionLpaMin: undefined, tuitionLpaMax: undefined,
    scholarshipsJson: '[]', notes: ''
  });
  const set = (k: keyof ApplicationSnapshot, v: any) => setForm(f => ({ ...f, [k]: v }));

  const match = computeMatch(profile, form);
  const valid = form.name.trim().length >= 2 && form.country.trim().length >= 2 && form.program.trim().length >= 2 && form.intake.trim().length >= 1;

  const inputCls = 'w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[11px] text-brand-navy outline-none focus:border-brand-gold';
  const labelCls = 'font-semibold text-brand-navy/40 text-[10px]';

  return (
    <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-full max-w-2xl shadow-lg space-y-4 text-xs my-8">
        <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
          <h3 className="font-display font-extrabold text-brand-navy text-sm">🎓 New University Application</h3>
          <button onClick={onClose} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
        </div>

        {/* Live compatibility badge */}
        <div className={`rounded-xl border p-3 flex items-center justify-between ${TIER_STYLE[match.tier]}`}>
          <div>
            <div className="font-bold text-[11px]">{TIER_LABEL[match.tier]} — {match.score}/100</div>
            <div className="text-[9px] opacity-80 mt-0.5">
              {match.reasons.length ? match.reasons.join(' · ') : 'Fill requirements to see compatibility'}
            </div>
          </div>
          <div className="text-right text-[9px] opacity-80 shrink-0">
            {profile.cgpa ? `CGPA ${profile.cgpa}` : 'No CGPA'} · {profile.englishScore ? `${profile.englishTest || ''} ${profile.englishScore}` : 'No English'} · ₹{profile.tuitionBudget ?? '?'}L
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* University */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">🏛️ University</h4>
            <div><label className={labelCls}>Name *</label><input className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. University of Toronto" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Country *</label><input className={inputCls} value={form.country} onChange={e => set('country', e.target.value)} placeholder="Canada" /></div>
              <div><label className={labelCls}>City</label><input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Toronto" /></div>
            </div>
            <div><label className={labelCls}>Website</label><input className={inputCls} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://…" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Portal URL</label><input className={inputCls} value={form.portalUrl} onChange={e => set('portalUrl', e.target.value)} placeholder="https://apply.…" /></div>
              <div><label className={labelCls}>Portal username</label><input className={inputCls} value={form.portalUsername} onChange={e => set('portalUsername', e.target.value)} placeholder="agent-ops" /></div>
            </div>
            <div className="text-[9px] text-brand-navy/40">🔒 Portal passwords stay in your partner tools — never stored here.</div>
          </div>

          {/* Program */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">📚 Program</h4>
            <div><label className={labelCls}>Program title *</label><input className={inputCls} value={form.program} onChange={e => set('program', e.target.value)} placeholder="MSc Computer Science" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Degree level</label>
                <select className={inputCls} value={form.degreeLevel} onChange={e => set('degreeLevel', e.target.value)}>
                  {DEGREE_LEVELS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Intake *</label>
                <select className={inputCls} value={form.intake} onChange={e => set('intake', e.target.value)}>
                  {INTAKES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Deadline (days from now)</label><input type="number" min={1} className={inputCls} value={form.deadline ? Math.round((form.deadline - Date.now() / 1000) / 86400) : ''} onChange={e => set('deadline', e.target.value ? Math.floor(Date.now() / 1000) + Number(e.target.value) * 86400 : undefined)} placeholder="60" /></div>
              <div><label className={labelCls}>Application fee (₹)</label><input type="number" min={0} className={inputCls} value={form.applicationFeePaise ? form.applicationFeePaise / 100 : ''} onChange={e => set('applicationFeePaise', e.target.value ? Math.round(Number(e.target.value) * 100) : undefined)} placeholder="12500" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Tuition min (₹L/yr)</label><input type="number" min={0} className={inputCls} value={form.tuitionLpaMin ?? ''} onChange={e => set('tuitionLpaMin', e.target.value ? Number(e.target.value) : undefined)} placeholder="18" /></div>
              <div><label className={labelCls}>Tuition max (₹L/yr)</label><input type="number" min={0} className={inputCls} value={form.tuitionLpaMax ?? ''} onChange={e => set('tuitionLpaMax', e.target.value ? Number(e.target.value) : undefined)} placeholder="24" /></div>
            </div>
          </div>

          {/* Requirements */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">📏 Requirements (from partner research)</h4>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Min CGPA (10 scale)</label><input type="number" min={0} max={10} step={0.1} className={inputCls} value={form.minGpa ?? ''} onChange={e => set('minGpa', e.target.value ? Number(e.target.value) : undefined)} placeholder="7.5" /></div>
              <div>
                <label className={labelCls}>English test</label>
                <select className={inputCls} value={form.englishTest} onChange={e => set('englishTest', e.target.value)}>
                  {['IELTS', 'TOEFL', 'PTE'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className={labelCls}>Min score</label><input type="number" min={0} max={9} step={0.5} className={inputCls} value={form.minEnglishScore ?? ''} onChange={e => set('minEnglishScore', e.target.value ? Number(e.target.value) : undefined)} placeholder="6.5" /></div>
              <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={!!form.greRequired} onChange={e => set('greRequired', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> GRE required</label></div>
            </div>
            <div><label className={labelCls}>Scholarships (JSON)</label><input className={inputCls} value={form.scholarshipsJson} onChange={e => set('scholarshipsJson', e.target.value)} placeholder='["Entrance Scholarship"]' /></div>
            <div><label className={labelCls}>Notes</label><textarea rows={2} className={inputCls} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Apply via portal, fee waiver code…" /></div>
          </div>

          {/* Docs checklist */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">📄 Typical document set</h4>
            <div className="rounded-lg border border-brand-navy/10 p-3 text-[10px] text-brand-navy/60 space-y-1">
              {['Transcripts', 'SOP', 'LORs (2–3)', 'Resume/CV', 'IELTS/TOEFL/PTE', 'Passport copy', 'Financial proof', 'Portfolio (if arts)'].map(d => (
                <div key={d} className="flex items-center gap-1.5"><span className="text-emerald-600">✓</span>{d}</div>
              ))}
            </div>
            <div className="text-[9px] text-brand-navy/40">Checklist is tracked per application after creation (Documents tab).</div>
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-brand-navy/10">
          <button onClick={onClose} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
          <button
            onClick={() => onCreate(form)}
            disabled={!valid || creating}
            className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
          >
            {creating ? 'Creating…' : `Create Application (${match.tier})`}
          </button>
        </div>
      </div>
    </div>
  );
}