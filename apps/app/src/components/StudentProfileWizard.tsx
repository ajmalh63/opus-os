import { useState } from 'react';

// Student Profile Wizard — 4 steps (Academic → Tests → Preferences → Review & Consent).
// Student-owned data written to intakeContext (canonical keys the match engine reads).
// Reused in the client portal (self-serve) and the staff desk (agent-assisted walk-in).

export interface StudentProfile {
  cgpa?: number | null;
  degreeName?: string | null;
  graduationYear?: number | null;
  pct10th?: number | null;
  pct12th?: number | null;
  backlogs?: number | null;
  gapYears?: number | null;
  workExperienceYears?: number | null;
  englishTest?: string | null;
  englishScore?: number | null;
  greScore?: number | null;
  gmatScore?: number | null;
  testPlanned?: boolean;
  testDate?: number | null;
  targetCountry?: string | null;
  targetIntake?: string | null;
  preferredCourse?: string | null;
  tuitionBudget?: number | null;
  scholarshipNeeded?: boolean;
  passportNumber?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  universitySharingConsent?: boolean;
}

const STEPS = ['Academic', 'Tests', 'Preferences', 'Review & Consent'];
const INTAKES = ['Fall 2027', 'Spring 2027', 'Summer 2027', 'Fall 2028', 'Spring 2028'];
// 35+ destination countries (Adventus.io benchmark: 35+ destinations, 1,500+ institutions).
// Free-text allowed — this list is suggestions only, never a limit.
const COUNTRIES = [
  'USA', 'UK', 'Canada', 'Australia', 'New Zealand', 'Ireland',
  'Germany', 'France', 'Netherlands', 'Sweden', 'Denmark', 'Finland', 'Norway', 'Switzerland', 'Austria', 'Belgium', 'Spain', 'Italy', 'Portugal', 'Poland', 'Czech Republic', 'Hungary', 'Greece',
  'Singapore', 'Malaysia', 'Dubai (UAE)', 'China', 'Japan', 'South Korea', 'Hong Kong', 'Taiwan', 'Thailand', 'Vietnam', 'Philippines', 'Indonesia',
  'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Turkey', 'Russia', 'Ukraine',
  'South Africa', 'Egypt', 'Morocco', 'Brazil', 'Mexico', 'Argentina', 'Chile', 'Colombia', 'Other'
];

// Mirror of lib/studyAbroadMatch.ts computeProfileCompleteness (client-side).
export function profileCompleteness(p: StudentProfile): { pct: number; missing: string[]; done: string[] } {
  const checks: [string, string, boolean][] = [
    ['academic', 'Academic history (10th/12th or degree)', !!(p.pct10th && p.pct12th) || !!p.degreeName],
    ['cgpa', 'CGPA', p.cgpa !== undefined && p.cgpa !== null && p.cgpa !== 0],
    ['english', 'English score or planned test', (p.englishScore !== undefined && p.englishScore !== null && p.englishScore !== 0) || p.testPlanned === true],
    ['country', 'Target country', !!p.targetCountry],
    ['intake', 'Target intake', !!p.targetIntake],
    ['course', 'Preferred course', !!p.preferredCourse],
    ['budget', 'Tuition budget', p.tuitionBudget !== undefined && p.tuitionBudget !== null && p.tuitionBudget !== 0],
    ['consent', 'University-sharing consent (DPDP)', p.universitySharingConsent === true],
  ];
  const done = checks.filter(c => c[2]).map(c => c[1]);
  const missing = checks.filter(c => !c[2]).map(c => c[1]);
  return { pct: Math.round((done.length / checks.length) * 100), missing, done };
}

interface Props {
  initial: StudentProfile;
  highestQualification?: string | null;
  onSave: (profile: StudentProfile) => void;
  saving?: boolean;
  onClose?: () => void;
  title?: string;
}

export default function StudentProfileWizard({ initial, highestQualification, onSave, saving, onClose, title }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<StudentProfile>(initial);
  const set = (k: keyof StudentProfile, v: any) => setForm(f => ({ ...f, [k]: v }));
  const completeness = profileCompleteness(form);

  const inputCls = 'w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2.5 text-xs text-brand-navy outline-none focus:border-brand-gold min-h-[44px]';
  const labelCls = 'font-semibold text-brand-navy/40 text-[10px] mb-1 block';
  const num = (v: string) => (v === '' ? undefined : Number(v));

  const stepValid = () => {
    if (step === 0) return true;
    if (step === 1) return true;
    if (step === 2) return true;
    return true; // review step — consent is encouraged but not blocking
  };

  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-brand-navy text-sm">{title || '🎓 Complete Your Profile'}</h3>
        {onClose && <button onClick={onClose} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>}
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => i < step && setStep(i)}
                className={`px-2.5 py-1 rounded-full text-[9px] font-bold cursor-pointer transition-all ${i === step ? 'bg-brand-gold text-brand-navy' : i < step ? 'bg-emerald-500/15 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}
              >
                {i < step ? '✓ ' : ''}{s}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-bold text-brand-navy/50">{completeness.pct}% complete</span>
        </div>
        <div className="h-2 rounded-full bg-brand-navy/[0.08] overflow-hidden">
          <div className="h-full bg-brand-gold transition-all duration-500" style={{ width: `${Math.max(20, completeness.pct)}%` }} />
        </div>
      </div>

      {/* Step content */}
      <div className="min-h-[260px]">
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Your academic history helps us match you with the right universities. <b>Be honest</b> — backlogs and gap years are normal and we plan around them.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Highest qualification</label><div className="rounded-lg border border-brand-navy/10 bg-brand-navy/[0.03] px-3 py-2.5 text-xs text-brand-navy/60 uppercase">{highestQualification || '—'}</div></div>
              <div><label className={labelCls}>CGPA (10 scale)</label><input type="number" min={0} max={10} step={0.1} className={inputCls} value={form.cgpa ?? ''} onChange={e => set('cgpa', num(e.target.value))} placeholder="7.5" /></div>
              <div><label className={labelCls}>10th percentage</label><input type="number" min={0} max={100} className={inputCls} value={form.pct10th ?? ''} onChange={e => set('pct10th', num(e.target.value))} placeholder="88" /></div>
              <div><label className={labelCls}>12th percentage</label><input type="number" min={0} max={100} className={inputCls} value={form.pct12th ?? ''} onChange={e => set('pct12th', num(e.target.value))} placeholder="92" /></div>
              <div><label className={labelCls}>Degree name (if graduated)</label><input className={inputCls} value={form.degreeName ?? ''} onChange={e => set('degreeName', e.target.value)} placeholder="B.Tech Computer Science" /></div>
              <div><label className={labelCls}>Graduation year</label><input type="number" min={1990} max={2100} className={inputCls} value={form.graduationYear ?? ''} onChange={e => set('graduationYear', num(e.target.value))} placeholder="2026" /></div>
              <div><label className={labelCls}>Backlogs (active)</label><input type="number" min={0} className={inputCls} value={form.backlogs ?? ''} onChange={e => set('backlogs', num(e.target.value))} placeholder="0" /></div>
              <div><label className={labelCls}>Gap years</label><input type="number" min={0} step={0.5} className={inputCls} value={form.gapYears ?? ''} onChange={e => set('gapYears', num(e.target.value))} placeholder="0" /></div>
              <div><label className={labelCls}>Work experience (years)</label><input type="number" min={0} step={0.5} className={inputCls} value={form.workExperienceYears ?? ''} onChange={e => set('workExperienceYears', num(e.target.value))} placeholder="0" /></div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Enter your test scores — or tell us what you're <b>planning</b> so we can guide your timeline.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>English test</label>
                <select className={inputCls} value={form.englishTest || 'IELTS'} onChange={e => set('englishTest', e.target.value)}>
                  {['IELTS', 'TOEFL', 'PTE'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Score (IELTS 0–9)</label><input type="number" min={0} max={9} step={0.5} className={inputCls} value={form.englishScore ?? ''} onChange={e => set('englishScore', num(e.target.value))} placeholder="6.5" /></div>
              <div><label className={labelCls}>GRE (260–340)</label><input type="number" min={260} max={340} className={inputCls} value={form.greScore ?? ''} onChange={e => set('greScore', num(e.target.value))} placeholder="315" /></div>
              <div><label className={labelCls}>GMAT (200–800)</label><input type="number" min={200} max={800} className={inputCls} value={form.gmatScore ?? ''} onChange={e => set('gmatScore', num(e.target.value))} placeholder="650" /></div>
            </div>
            <div className="rounded-lg border border-brand-navy/10 p-3 space-y-2">
              <label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer">
                <input type="checkbox" checked={!!form.testPlanned} onChange={e => set('testPlanned', e.target.checked)} className="h-4 w-4 accent-brand-gold" />
                <span className="text-xs font-semibold">I haven't taken the test yet — it's planned</span>
              </label>
              {form.testPlanned && (
                <div><label className={labelCls}>Planned test date</label><input type="date" className={inputCls} value={form.testDate ? new Date(form.testDate * 1000).toISOString().slice(0, 10) : ''} onChange={e => set('testDate', e.target.value ? Math.floor(new Date(e.target.value).getTime() / 1000) : undefined)} /></div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Where and what would you like to study? This drives your university shortlist.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Target country (any destination)</label>
                <input list="study-countries" className={inputCls} value={form.targetCountry ?? ''} onChange={e => set('targetCountry', e.target.value)} placeholder="Type or pick — e.g. Canada, Germany, Japan…" />
                <datalist id="study-countries">
                  {COUNTRIES.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Target intake</label>
                <select className={inputCls} value={form.targetIntake || ''} onChange={e => set('targetIntake', e.target.value)}>
                  <option value="">-- Select --</option>
                  {INTAKES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className={labelCls}>Preferred course</label><input className={inputCls} value={form.preferredCourse ?? ''} onChange={e => set('preferredCourse', e.target.value)} placeholder="MSc Computer Science / MBA / Nursing…" /></div>
              <div><label className={labelCls}>Tuition budget (₹ lakh/yr)</label><input type="number" min={0} max={100} className={inputCls} value={form.tuitionBudget ?? ''} onChange={e => set('tuitionBudget', num(e.target.value))} placeholder="20" /></div>
              <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer"><input type="checkbox" checked={!!form.scholarshipNeeded} onChange={e => set('scholarshipNeeded', e.target.checked)} className="h-4 w-4 accent-brand-gold" /> Need scholarship help</label></div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Almost done — a few final details, then review.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Passport number (optional)</label><input className={inputCls} value={form.passportNumber ?? ''} onChange={e => set('passportNumber', e.target.value)} placeholder="N1234567" /></div>
              <div><label className={labelCls}>Parent / guardian name</label><input className={inputCls} value={form.parentName ?? ''} onChange={e => set('parentName', e.target.value)} placeholder="For family updates" /></div>
              <div><label className={labelCls}>Parent phone</label><input className={inputCls} value={form.parentPhone ?? ''} onChange={e => set('parentPhone', e.target.value)} placeholder="+91 …" /></div>
            </div>
            <div className="rounded-lg border border-brand-navy/10 p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.universitySharingConsent} onChange={e => set('universitySharingConsent', e.target.checked)} className="h-4 w-4 accent-brand-gold mt-0.5" />
                <span className="text-[10px] text-brand-navy/60 leading-relaxed">
                  <b>Consent (DPDP 2023):</b> I agree that my academic profile and documents may be shared with universities I apply to through Opus Overseas. This consent is recorded with a secure hash and can be withdrawn anytime.
                </span>
              </label>
            </div>
            <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
              <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40 mb-1.5">Profile summary</div>
              <div className="flex flex-wrap gap-1.5">
                {completeness.done.map(d => <span key={d} className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 text-[9px] font-bold">✓ {d}</span>)}
                {completeness.missing.map(m => <span key={m} className="px-2 py-0.5 rounded bg-brand-navy/[0.06] text-brand-navy/40 text-[9px] font-bold">○ {m}</span>)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="flex gap-3 pt-2 border-t border-brand-navy/10">
        {step > 0 ? (
          <button onClick={() => setStep(s => s - 1)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2.5 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">← Back</button>
        ) : (
          <div className="flex-1" />
        )}
        {step < STEPS.length - 1 ? (
          <button onClick={() => stepValid() && setStep(s => s + 1)} className="flex-1 bg-brand-navy text-white py-2.5 rounded-lg font-bold cursor-pointer transition-all hover:bg-brand-navy/90">Continue →</button>
        ) : (
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2.5 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
          >
            {saving ? 'Saving…' : completeness.pct === 100 ? '✓ Save Profile' : 'Save Profile'}
          </button>
        )}
      </div>
    </div>
  );
}