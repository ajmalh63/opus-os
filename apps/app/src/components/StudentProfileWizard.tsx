import { useState } from 'react';

// Student Profile Wizard — 4 steps (Academic → Tests → Preferences → Review & Consent).
// Student-owned data written to intakeContext (canonical keys the match engine reads).
// Reused in the client portal (self-serve) and the staff desk (agent-assisted walk-in).

export interface StudentProfile {
  // Personal — universal
  fullName?: string | null;
  dob?: string | null;
  gender?: string | null;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  languages?: string | null;
  // Academic — universal
  cgpa?: number | null;
  degreeName?: string | null;
  universityName?: string | null;
  graduationYear?: number | null;
  pct10th?: number | null;
  pct12th?: number | null;
  board12th?: string | null;
  backlogs?: number | null;
  gapYears?: number | null;
  gapReason?: string | null;
  workExperienceYears?: number | null;
  workCompany?: string | null;
  workRole?: string | null;
  englishTest?: string | null;
  englishScore?: number | null;
  greScore?: number | null;
  gmatScore?: number | null;
  satScore?: number | null;
  actScore?: number | null;
  testPlanned?: boolean;
  testDate?: number | null;
  englishWaiver?: boolean;
  targetCountry?: string | null;
  targetIntake?: string | null;
  preferredCourse?: string | null;
  tuitionBudget?: number | null;
  livingBudget?: number | null;
  fundingSource?: string | null;
  sponsorName?: string | null;
  sponsorRelation?: string | null;
  scholarshipNeeded?: boolean;
  passportNumber?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentOccupation?: string | null;
  annualFamilyIncome?: string | null;
  fundingBank?: string | null;
  universitySharingConsent?: boolean;
}

const STEPS = ['Personal', 'Academic', 'Tests', 'Preferences', 'Financial & Family', 'Review & Consent'];
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

// Mirror of lib/studyAbroadMatch.ts computeProfileCompleteness (client-side) — universal
export function profileCompleteness(p: StudentProfile): { pct: number; missing: string[]; done: string[] } {
  const checks: [string, string, boolean][] = [
    ['personal', 'Personal details (name, DOB, nationality)', !!(p.fullName && p.dob && p.nationality)],
    ['contact', 'Contact (phone, email, address)', !!(p.phone && p.email && p.city)],
    ['academic', 'Academic history (10th/12th or degree)', !!(p.pct10th && p.pct12th) || !!p.degreeName],
    ['cgpa', 'CGPA / percentage', p.cgpa !== undefined && p.cgpa !== null && p.cgpa !== 0],
    ['english', 'English score or planned test', (p.englishScore !== undefined && p.englishScore !== null && p.englishScore !== 0) || p.testPlanned === true || !!p.englishWaiver],
    ['country', 'Target country (any destination)', !!p.targetCountry],
    ['intake', 'Target intake', !!p.targetIntake],
    ['course', 'Preferred course', !!p.preferredCourse],
    ['budget', 'Tuition & living budget', (p.tuitionBudget !== undefined && p.tuitionBudget !== null && p.tuitionBudget !== 0) || (p.livingBudget !== undefined && p.livingBudget !== null && p.livingBudget !== 0)],
    ['funding', 'Funding source', !!p.fundingSource],
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

      {/* Step content — Universal, any country */}
      <div className="min-h-[320px]">
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Who you are — works for any destination. <b>All fields optional</b> — fill what you have, we guide the rest.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className={labelCls}>Full name *</label><input className={inputCls} value={form.fullName ?? ''} onChange={e => set('fullName', e.target.value)} placeholder="As on passport" /></div>
              <div><label className={labelCls}>Date of birth</label><input type="date" className={inputCls} value={form.dob ?? ''} onChange={e => set('dob', e.target.value)} /></div>
              <div><label className={labelCls}>Gender</label><select className={inputCls} value={form.gender ?? ''} onChange={e => set('gender', e.target.value)}><option value="">-- Select --</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_say">Prefer not to say</option></select></div>
              <div><label className={labelCls}>Nationality</label><input className={inputCls} value={form.nationality ?? ''} onChange={e => set('nationality', e.target.value)} placeholder="Indian" /></div>
              <div><label className={labelCls}>Phone / WhatsApp *</label><input className={inputCls} value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="+91 ..." /></div>
              <div><label className={labelCls}>Email *</label><input type="email" className={inputCls} value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="you@email.com" /></div>
              <div className="col-span-2"><label className={labelCls}>Address</label><input className={inputCls} value={form.address ?? ''} onChange={e => set('address', e.target.value)} placeholder="Street, area" /></div>
              <div><label className={labelCls}>City</label><input className={inputCls} value={form.city ?? ''} onChange={e => set('city', e.target.value)} placeholder="Hyderabad" /></div>
              <div><label className={labelCls}>State</label><input className={inputCls} value={form.state ?? ''} onChange={e => set('state', e.target.value)} placeholder="Telangana" /></div>
              <div><label className={labelCls}>Pincode</label><input className={inputCls} value={form.pincode ?? ''} onChange={e => set('pincode', e.target.value)} placeholder="" /></div>
              <div><label className={labelCls}>Passport number (if any)</label><input className={inputCls} value={form.passportNumber ?? ''} onChange={e => set('passportNumber', e.target.value)} placeholder="N1234567" /></div>
              <div><label className={labelCls}>Languages you speak</label><input className={inputCls} value={form.languages ?? ''} onChange={e => set('languages', e.target.value)} placeholder="English, Hindi, Telugu" /></div>
              <div><label className={labelCls}>Emergency contact name</label><input className={inputCls} value={form.emergencyContact ?? ''} onChange={e => set('emergencyContact', e.target.value)} placeholder="Parent / guardian" /></div>
              <div><label className={labelCls}>Emergency phone</label><input className={inputCls} value={form.emergencyPhone ?? ''} onChange={e => set('emergencyPhone', e.target.value)} placeholder="+91 ..." /></div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Academic history — any board, any degree, any country. Be honest.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Highest qualification</label><div className="rounded-lg border border-brand-navy/10 bg-brand-navy/[0.03] px-3 py-2.5 text-xs text-brand-navy/60 uppercase">{highestQualification || '—'}</div></div>
              <div><label className={labelCls}>University / College name</label><input className={inputCls} value={form.universityName ?? ''} onChange={e => set('universityName', e.target.value)} placeholder="Osmania University" /></div>
              <div><label className={labelCls}>CGPA (10 scale)</label><input type="number" min={0} max={10} step={0.1} className={inputCls} value={form.cgpa ?? ''} onChange={e => set('cgpa', num(e.target.value))} placeholder="7.5" /></div>
              <div><label className={labelCls}>10th %</label><input type="number" min={0} max={100} className={inputCls} value={form.pct10th ?? ''} onChange={e => set('pct10th', num(e.target.value))} placeholder="88" /></div>
              <div><label className={labelCls}>12th %</label><input type="number" min={0} max={100} className={inputCls} value={form.pct12th ?? ''} onChange={e => set('pct12th', num(e.target.value))} placeholder="92" /></div>
              <div><label className={labelCls}>12th Board</label><input className={inputCls} value={form.board12th ?? ''} onChange={e => set('board12th', e.target.value)} placeholder="CBSE / State" /></div>
              <div><label className={labelCls}>Degree name</label><input className={inputCls} value={form.degreeName ?? ''} onChange={e => set('degreeName', e.target.value)} placeholder="B.Tech CSE" /></div>
              <div><label className={labelCls}>Graduation year</label><input type="number" min={1990} max={2100} className={inputCls} value={form.graduationYear ?? ''} onChange={e => set('graduationYear', num(e.target.value))} placeholder="2026" /></div>
              <div><label className={labelCls}>Backlogs</label><input type="number" min={0} className={inputCls} value={form.backlogs ?? ''} onChange={e => set('backlogs', num(e.target.value))} placeholder="0" /></div>
              <div><label className={labelCls}>Gap years</label><input type="number" min={0} step={0.5} className={inputCls} value={form.gapYears ?? ''} onChange={e => set('gapYears', num(e.target.value))} placeholder="0" /></div>
              <div className="col-span-2"><label className={labelCls}>Gap reason (if any)</label><input className={inputCls} value={form.gapReason ?? ''} onChange={e => set('gapReason', e.target.value)} placeholder="Preparation / work / personal" /></div>
              <div><label className={labelCls}>Work exp (years)</label><input type="number" min={0} step={0.5} className={inputCls} value={form.workExperienceYears ?? ''} onChange={e => set('workExperienceYears', num(e.target.value))} placeholder="0" /></div>
              <div><label className={labelCls}>Company</label><input className={inputCls} value={form.workCompany ?? ''} onChange={e => set('workCompany', e.target.value)} placeholder="Infosys" /></div>
              <div className="col-span-2"><label className={labelCls}>Role</label><input className={inputCls} value={form.workRole ?? ''} onChange={e => set('workRole', e.target.value)} placeholder="Software Engineer" /></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Tests — any country, any test. Enter what you have or plan.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>English test</label>
                <select className={inputCls} value={form.englishTest || 'IELTS'} onChange={e => set('englishTest', e.target.value)}>
                  {['IELTS', 'TOEFL', 'PTE', 'Duolingo', 'Cambridge', 'SAT', 'ACT', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Score</label><input type="number" min={0} max={160} step={0.5} className={inputCls} value={form.englishScore ?? ''} onChange={e => set('englishScore', num(e.target.value))} placeholder="6.5 / 100 / 120" /></div>
              <div><label className={labelCls}>GRE (260–340)</label><input type="number" min={260} max={340} className={inputCls} value={form.greScore ?? ''} onChange={e => set('greScore', num(e.target.value))} placeholder="315" /></div>
              <div><label className={labelCls}>GMAT (200–800)</label><input type="number" min={200} max={800} className={inputCls} value={form.gmatScore ?? ''} onChange={e => set('gmatScore', num(e.target.value))} placeholder="650" /></div>
              <div><label className={labelCls}>SAT (400–1600)</label><input type="number" min={400} max={1600} className={inputCls} value={form.satScore ?? ''} onChange={e => set('satScore', num(e.target.value))} placeholder="1200" /></div>
              <div><label className={labelCls}>ACT (1–36)</label><input type="number" min={1} max={36} className={inputCls} value={form.actScore ?? ''} onChange={e => set('actScore', num(e.target.value))} placeholder="24" /></div>
            </div>
            <div className="rounded-lg border border-brand-navy/10 p-3 space-y-2">
              <label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer">
                <input type="checkbox" checked={!!form.testPlanned} onChange={e => set('testPlanned', e.target.checked)} className="h-4 w-4 accent-brand-gold" />
                <span className="text-xs font-semibold">Test planned — not yet taken</span>
              </label>
              <label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer">
                <input type="checkbox" checked={!!form.englishWaiver} onChange={e => set('englishWaiver', e.target.checked)} className="h-4 w-4 accent-brand-gold" />
                <span className="text-xs font-semibold">English-medium waiver (some countries accept MOI)</span>
              </label>
              {form.testPlanned && (
                <div><label className={labelCls}>Planned test date</label><input type="date" className={inputCls} value={form.testDate ? new Date(form.testDate * 1000).toISOString().slice(0, 10) : ''} onChange={e => set('testDate', e.target.value ? Math.floor(new Date(e.target.value).getTime() / 1000) : undefined)} /></div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Where & what — any destination, any intake.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Target country (any)</label>
                <input list="study-countries" className={inputCls} value={form.targetCountry ?? ''} onChange={e => set('targetCountry', e.target.value)} placeholder="Canada, Germany, Japan…" />
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
              <div className="col-span-2"><label className={labelCls}>Preferred course</label><input className={inputCls} value={form.preferredCourse ?? ''} onChange={e => set('preferredCourse', e.target.value)} placeholder="MSc CS / MBA / Nursing…" /></div>
              <div><label className={labelCls}>Tuition budget (₹ lakh/yr)</label><input type="number" min={0} max={100} className={inputCls} value={form.tuitionBudget ?? ''} onChange={e => set('tuitionBudget', num(e.target.value))} placeholder="20" /></div>
              <div><label className={labelCls}>Living budget (₹ lakh/yr)</label><input type="number" min={0} max={100} className={inputCls} value={form.livingBudget ?? ''} onChange={e => set('livingBudget', num(e.target.value))} placeholder="10" /></div>
              <div>
                <label className={labelCls}>Funding source</label>
                <select className={inputCls} value={form.fundingSource ?? ''} onChange={e => set('fundingSource', e.target.value)}>
                  <option value="">-- Select --</option>
                  <option value="self">Self</option><option value="parents">Parents</option><option value="sponsor">Sponsor</option><option value="loan">Education Loan</option><option value="scholarship">Scholarship</option><option value="other">Other</option>
                </select>
              </div>
              <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer"><input type="checkbox" checked={!!form.scholarshipNeeded} onChange={e => set('scholarshipNeeded', e.target.checked)} className="h-4 w-4 accent-brand-gold" /> Need scholarship help</label></div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Family & financial — for sponsors, loans, and emergency contact (universal).</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={labelCls}>Parent / guardian name</label><input className={inputCls} value={form.parentName ?? ''} onChange={e => set('parentName', e.target.value)} placeholder="For family updates" /></div>
              <div><label className={labelCls}>Parent phone</label><input className={inputCls} value={form.parentPhone ?? ''} onChange={e => set('parentPhone', e.target.value)} placeholder="+91 …" /></div>
              <div><label className={labelCls}>Parent occupation</label><input className={inputCls} value={form.parentOccupation ?? ''} onChange={e => set('parentOccupation', e.target.value)} placeholder="Business / Service" /></div>
              <div><label className={labelCls}>Annual family income</label><input className={inputCls} value={form.annualFamilyIncome ?? ''} onChange={e => set('annualFamilyIncome', e.target.value)} placeholder="₹ 8L / $ 10k" /></div>
              <div><label className={labelCls}>Sponsor name (if any)</label><input className={inputCls} value={form.sponsorName ?? ''} onChange={e => set('sponsorName', e.target.value)} placeholder="Uncle / Self" /></div>
              <div><label className={labelCls}>Sponsor relation</label><input className={inputCls} value={form.sponsorRelation ?? ''} onChange={e => set('sponsorRelation', e.target.value)} placeholder="Father / Self" /></div>
              <div><label className={labelCls}>Funding bank (if loan)</label><input className={inputCls} value={form.fundingBank ?? ''} onChange={e => set('fundingBank', e.target.value)} placeholder="SBI / HDFC" /></div>
              <div><label className={labelCls}>Passport number (if any)</label><input className={inputCls} value={form.passportNumber ?? ''} onChange={e => set('passportNumber', e.target.value)} placeholder="N1234567" /></div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <p className="text-[10px] text-brand-navy/50">Review — check everything, then save. Works for any country.</p>
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