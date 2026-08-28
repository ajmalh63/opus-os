import { useState } from 'react';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

const STEPS = [
  { key: 'welcome', label: 'Welcome', hint: 'Account created' },
  { key: 'profile', label: 'Complete profile', hint: 'Name, phone, city' },
  { key: 'passport', label: 'Passport details', hint: 'Number + expiry' },
  { key: 'education', label: 'Education', hint: 'Highest qualification' },
  { key: 'intent', label: 'Intent', hint: 'Country + intake' },
];

export function OnboardingChecklist({ onboarding, token, onUpdate }: { onboarding: any, token: string, onUpdate: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const pct = onboarding?.pct ?? 0;
  const steps: any[] = onboarding?.steps || STEPS.map(s=> ({...s, done: s.key==='welcome'}));
  const toggle = async (key: string, done: boolean) => {
    setSaving(key);
    try {
      await fetch(`${API}/api/public/portal/onboarding/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
        body: JSON.stringify({ step: key, done }),
      });
      onUpdate();
    } finally { setSaving(null); }
  };
  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-brand-navy">Onboarding — {pct}%</div>
        <div className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-brand-gold text-brand-navy">{pct <100 ? `${5 - steps.filter((s:any)=> s.done).length} left` : '✓ Complete'}</div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-brand-navy/10 overflow-hidden mb-3"><div className="h-full bg-brand-navy rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="space-y-2">
        {steps.map((s:any) => {
          const meta = STEPS.find(x=> x.key===s.key) || s;
          return (
            <label key={s.key} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition ${s.done ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-brand-navy/10 hover:border-brand-navy/20'}`}>
              <input type="checkbox" checked={!!s.done} disabled={s.key==='welcome' || saving===s.key} onChange={e=> toggle(s.key, e.target.checked)} className="w-4 h-4 rounded border-brand-navy/20 text-brand-navy focus:ring-brand-navy" />
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-bold ${s.done ? 'text-emerald-700' : 'text-brand-navy'}`}>{meta.label}</div>
                <div className="text-[13px] text-brand-navy/50">{meta.hint}</div>
              </div>
              {saving===s.key && <span className="text-[13px] text-brand-navy/40">Saving…</span>}
            </label>
          );
        })}
      </div>
      <p className="text-[13px] text-brand-navy/40 mt-3">Complete in under 4 min — pre-completed Welcome counts. Staff sees your progress live.</p>
    </div>
  );
}
