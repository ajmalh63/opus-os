import { useState } from 'react';

export interface ManpowerProfile {
  // Personal
  fullName?: string | null;
  dob?: string | null;
  gender?: string | null;
  nationality?: string | null;
  currentCity?: string | null;
  languages?: string | null;
  // Contact
  phone?: string | null;
  email?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  // Passport
  hasPassport?: boolean;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  // Experience & Skills
  totalYears?: number | null;
  currentRole?: string | null;
  currentEmployer?: string | null;
  skills?: string | null; // comma-separated
  tradeCertifications?: string | null;
  drivingLicense?: string | null;
  willingToTravel?: boolean;
  // Education
  highestQualification?: string | null;
  institution?: string | null;
  fieldOfStudy?: string | null;
  // Salary & Medical
  currentSalaryPaise?: number | null;
  expectedSalaryPaise?: number | null;
  noticePeriodDays?: number | null;
  selfDeclaredFit?: boolean;
  hasChronicCondition?: boolean;
  // Consent
  manpowerConsent?: boolean;
  resumeKey?: string | null;
  resumeName?: string | null;
}

export function manpowerCompleteness(p: ManpowerProfile): { pct: number; missing: string[]; done: string[] } {
  const checks: [string, string, boolean][] = [
    ['personal', 'Personal (name, DOB, nationality)', !!(p.fullName && p.dob && p.nationality)],
    ['contact', 'Contact (phone, email, city)', !!(p.phone && p.email && p.currentCity)],
    ['passport', 'Passport (number + expiry)', !!(p.hasPassport && p.passportNumber && p.passportExpiry)],
    ['experience', 'Experience & skills (years + skills)', !!(p.totalYears !== null && p.totalYears !== undefined && p.skills)],
    ['education', 'Education', !!p.highestQualification],
    ['salary', 'Salary & availability', !!(p.expectedSalaryPaise || p.currentSalaryPaise)],
    ['medical', 'Medical fitness declaration', p.selfDeclaredFit !== undefined],
    ['consent', 'Consent to share profile (DPDP)', p.manpowerConsent === true],
  ];
  const done = checks.filter(c => c[2]).map(c => c[1]);
  const missing = checks.filter(c => !c[2]).map(c => c[1]);
  return { pct: Math.round((done.length / checks.length) * 100), missing, done };
}

const STEPS = ['Personal', 'Contact & Passport', 'Experience & Skills', 'Education & Trade', 'Salary & Medical', 'Review & Resume'];

interface Props {
  initial: ManpowerProfile;
  onSave: (p: ManpowerProfile) => void;
  saving?: boolean;
  onClose?: () => void;
  title?: string;
}

export default function ManpowerProfileWizard({ initial, onSave, saving, onClose, title }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ManpowerProfile>(initial);
  const set = (k: keyof ManpowerProfile, v: any) => setForm(f => ({ ...f, [k]: v }));
  const comp = manpowerCompleteness(form);
  const num = (v: string) => (v === '' ? undefined : Number(v));

  const inputCls = 'w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-gold min-h-[44px]';
  const labelCls = 'font-bold text-brand-navy/70 text-xs mb-1.5 block';

  return (
    <div className="rounded-3xl border border-brand-navy/10 bg-white p-6 sm:p-8 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-brand-navy text-base sm:text-lg">{title || '🌍 Complete Your Career Profile'}</h3>
        {onClose && <button onClick={onClose} className="text-brand-navy/50 hover:text-brand-navy text-xl cursor-pointer">✕</button>}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <div className="flex gap-2 flex-wrap">
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => i < step && setStep(i)} className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all ${i === step ? 'bg-brand-gold text-brand-navy' : i < step ? 'bg-emerald-500/15 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/60'}`}>
                {i < step ? '✓ ' : ''}{s}
              </button>
            ))}
          </div>
          <span className="text-xs sm:text-sm font-bold text-brand-navy/70">{comp.pct}% complete</span>
        </div>
        <div className="h-2.5 rounded-full bg-brand-navy/[0.08] overflow-hidden"><div className="h-full bg-brand-gold transition-all duration-500" style={{ width: `${Math.max(20, comp.pct)}%` }} /></div>
      </div>

      <div className="min-h-[320px]">
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-brand-navy/60">Who you are — all fields optional, fill what you have.</p>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="col-span-2"><label className={labelCls}>Full name *</label><input className={inputCls} value={form.fullName ?? ''} onChange={e => set('fullName', e.target.value)} placeholder="As on passport" /></div>
              <div><label className={labelCls}>Date of birth</label><input type="date" className={inputCls} value={form.dob ?? ''} onChange={e => set('dob', e.target.value)} /></div>
              <div><label className={labelCls}>Gender</label><select className={inputCls} value={form.gender ?? ''} onChange={e => set('gender', e.target.value)}><option value="">--</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
              <div><label className={labelCls}>Nationality</label><input className={inputCls} value={form.nationality ?? ''} onChange={e => set('nationality', e.target.value)} placeholder="Indian" /></div>
              <div><label className={labelCls}>Current city</label><input className={inputCls} value={form.currentCity ?? ''} onChange={e => set('currentCity', e.target.value)} placeholder="Hyderabad" /></div>
              <div className="col-span-2"><label className={labelCls}>Languages (comma separated)</label><input className={inputCls} value={form.languages ?? ''} onChange={e => set('languages', e.target.value)} placeholder="English, Hindi, Arabic" /></div>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-brand-navy/60">How we reach you + passport readiness for Gulf deployment.</p>
            <div className="grid grid-cols-2 gap-3.5">
              <div><label className={labelCls}>Phone / WhatsApp *</label><input className={inputCls} value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="+91 ..." /></div>
              <div><label className={labelCls}>Email *</label><input type="email" className={inputCls} value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="you@email.com" /></div>
              <div><label className={labelCls}>Emergency contact name</label><input className={inputCls} value={form.emergencyContact ?? ''} onChange={e => set('emergencyContact', e.target.value)} placeholder="Parent / next of kin" /></div>
              <div><label className={labelCls}>Emergency phone</label><input className={inputCls} value={form.emergencyPhone ?? ''} onChange={e => set('emergencyPhone', e.target.value)} placeholder="+91 ..." /></div>
              <div className="col-span-2 rounded-2xl border border-brand-navy/10 p-4 space-y-3 bg-brand-navy/[0.02]">
                <label className="flex items-center gap-2 text-brand-navy/80 cursor-pointer"><input type="checkbox" checked={!!form.hasPassport} onChange={e => set('hasPassport', e.target.checked)} className="h-4 w-4 accent-brand-gold" /><span className="text-sm font-bold">I have a valid passport</span></label>
                {form.hasPassport && (
                  <div className="grid grid-cols-2 gap-3.5">
                    <div><label className={labelCls}>Passport number</label><input className={inputCls} value={form.passportNumber ?? ''} onChange={e => set('passportNumber', e.target.value)} placeholder="N1234567" /></div>
                    <div><label className={labelCls}>Expiry date</label><input type="date" className={inputCls} value={form.passportExpiry ?? ''} onChange={e => set('passportExpiry', e.target.value)} /></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-brand-navy/60">Your trade — this drives the Match% engine (35pts exp + 35pts skills).</p>
            <div className="grid grid-cols-2 gap-3.5">
              <div><label className={labelCls}>Total experience (years)</label><input type="number" min={0} step={0.5} className={inputCls} value={form.totalYears ?? ''} onChange={e => set('totalYears', num(e.target.value))} placeholder="4" /></div>
              <div><label className={labelCls}>Current role / trade</label><input className={inputCls} value={form.currentRole ?? ''} onChange={e => set('currentRole', e.target.value)} placeholder="Welder, HVAC Tech, Nurse…" /></div>
              <div><label className={labelCls}>Current employer (optional)</label><input className={inputCls} value={form.currentEmployer ?? ''} onChange={e => set('currentEmployer', e.target.value)} placeholder="Company name" /></div>
              <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-brand-navy/80 cursor-pointer text-sm font-semibold"><input type="checkbox" checked={!!form.willingToTravel} onChange={e => set('willingToTravel', e.target.checked)} className="h-4 w-4 accent-brand-gold" /> Willing to relocate</label></div>
              <div className="col-span-2"><label className={labelCls}>Skills (comma separated — e.g. MIG, TIG, Blueprint, Safety)</label><input className={inputCls} value={form.skills ?? ''} onChange={e => set('skills', e.target.value)} placeholder="MIG Welding, Fabrication, Safety" /></div>
              <div><label className={labelCls}>Trade certifications</label><input className={inputCls} value={form.tradeCertifications ?? ''} onChange={e => set('tradeCertifications', e.target.value)} placeholder="ITI, Diploma, Certified Welder" /></div>
              <div><label className={labelCls}>Driving license</label><select className={inputCls} value={form.drivingLicense ?? ''} onChange={e => set('drivingLicense', e.target.value)}><option value="">--</option><option value="none">None</option><option value="LMV">LMV</option><option value="HMV">HMV</option><option value="both">LMV + HMV</option></select></div>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-brand-navy/60">Education — white-collar roles weight this (15pts).</p>
            <div className="grid grid-cols-2 gap-3.5">
              <div><label className={labelCls}>Highest qualification</label><select className={inputCls} value={form.highestQualification ?? ''} onChange={e => set('highestQualification', e.target.value)}><option value="">--</option><option value="highschool">High School</option><option value="ITI">ITI</option><option value="diploma">Diploma</option><option value="undergrad">Bachelors</option><option value="postgrad">Masters</option><option value="phd">PhD</option></select></div>
              <div><label className={labelCls}>Institution</label><input className={inputCls} value={form.institution ?? ''} onChange={e => set('institution', e.target.value)} placeholder="ITI Hyderabad" /></div>
              <div className="col-span-2"><label className={labelCls}>Field of study / trade</label><input className={inputCls} value={form.fieldOfStudy ?? ''} onChange={e => set('fieldOfStudy', e.target.value)} placeholder="Mechanical, Nursing, Civil…" /></div>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-brand-navy/60">Notice period + medical fitness completes deployment readiness (15pts passport+medical).</p>
            <div className="grid grid-cols-2 gap-3.5">
              <div><label className={labelCls}>Current salary (₹/month)</label><input type="number" min={0} className={inputCls} value={form.currentSalaryPaise ? String(form.currentSalaryPaise/100) : ''} onChange={e => set('currentSalaryPaise', e.target.value ? Number(e.target.value)*100 : null)} placeholder="25000" /></div>
              <div><label className={labelCls}>Expected salary (₹/month)</label><input type="number" min={0} className={inputCls} value={form.expectedSalaryPaise ? String(form.expectedSalaryPaise/100) : ''} onChange={e => set('expectedSalaryPaise', e.target.value ? Number(e.target.value)*100 : null)} placeholder="45000" /></div>
              <div><label className={labelCls}>Notice period (days)</label><input type="number" min={0} className={inputCls} value={form.noticePeriodDays ?? ''} onChange={e => set('noticePeriodDays', num(e.target.value))} placeholder="15" /></div>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 text-brand-navy/80 cursor-pointer"><input type="checkbox" checked={form.selfDeclaredFit === true} onChange={e => set('selfDeclaredFit', e.target.checked)} className="h-4 w-4 accent-brand-gold" /><span className="text-sm font-semibold">I declare myself medically fit for Gulf deployment</span></label>
                <label className="flex items-center gap-2 text-brand-navy/80 cursor-pointer"><input type="checkbox" checked={!!form.hasChronicCondition} onChange={e => set('hasChronicCondition', e.target.checked)} className="h-4 w-4 accent-brand-gold" /><span className="text-sm">Chronic condition to disclose</span></label>
              </div>
            </div>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <p className="text-xs sm:text-sm text-brand-navy/60">Resume + consent — then every job card shows real Match%.</p>
            <div className="rounded-2xl border border-dashed border-brand-navy/15 p-5 space-y-3 bg-brand-navy/[0.02]">
              <div className="text-xs sm:text-sm font-bold text-brand-navy">📄 Resume (PDF, DOCX, JPG — max 5MB)</div>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="px-4 py-2.5 rounded-xl bg-brand-navy text-white text-xs sm:text-sm font-bold">Choose file</span>
                <span className="text-xs sm:text-sm text-brand-navy/60">{form.resumeName || 'No file selected — you can upload later in Documents'}</span>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => { const f=e.target.files?.[0]; if (f) { set('resumeName', f.name); set('resumeKey', `pending:${f.name}`); }}} />
              </label>
              {form.resumeKey && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 font-bold">✓ {form.resumeName} queued — will upload on Save</div>}
            </div>
            <div className="rounded-2xl border border-brand-navy/10 p-4">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={!!form.manpowerConsent} onChange={e => set('manpowerConsent', e.target.checked)} className="h-4 w-4 accent-brand-gold mt-1" />
                <span className="text-xs sm:text-sm text-brand-navy/70 leading-relaxed"><b>Consent (DPDP 2023):</b> I allow Opus to share my profile & resume with verified Gulf employers for this application. I understand Match% is a fit estimate, not a guarantee of selection.</span>
              </label>
            </div>
            <div className="rounded-2xl bg-brand-navy/[0.03] border border-brand-navy/10 p-4">
              <div className="text-xs font-bold uppercase tracking-widest text-brand-navy/50 mb-2">Profile summary</div>
              <div className="flex flex-wrap gap-2">
                {comp.done.map(d => <span key={d} className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 text-xs font-bold">✓ {d}</span>)}
                {comp.missing.map(m => <span key={m} className="px-2.5 py-1 rounded-full bg-brand-navy/[0.06] text-brand-navy/50 text-xs font-bold">○ {m}</span>)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-3 border-t border-brand-navy/10">
        {step > 0 ? <button onClick={() => setStep(s => s-1)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] py-3 rounded-xl font-bold text-brand-navy text-sm cursor-pointer hover:border-brand-gold/50 transition-all">← Back</button> : <div className="flex-1" />}
        {step < STEPS.length - 1 ? <button onClick={() => setStep(s => s+1)} className="flex-1 bg-brand-navy text-white py-3 rounded-xl font-bold text-sm cursor-pointer hover:bg-brand-navy/90 transition-all">Continue →</button> : <button onClick={() => onSave(form)} disabled={saving} className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-3 rounded-xl font-bold text-sm cursor-pointer disabled:opacity-50 transition-all">{saving ? 'Saving…' : comp.pct===100 ? '✓ Save Profile' : 'Save Profile'}</button>}
      </div>
    </div>
  );
}
