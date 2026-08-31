const STEPS = [
  { key: 'welcome', label: 'Welcome', hint: 'Account created' },
  { key: 'profile', label: 'Complete profile', hint: 'Name, phone, city' },
  { key: 'passport', label: 'Passport details', hint: 'Number + expiry' },
  { key: 'education', label: 'Education', hint: 'Highest qualification' },
  { key: 'intent', label: 'Intent', hint: 'Country + intake' },
];

export function OnboardingChecklist({
  onboarding,
  token: _token,
  onUpdate: _onUpdate,
  onStepClick,
}: {
  onboarding: any;
  token?: string;
  onUpdate?: () => void;
  onStepClick?: (stepKey: string) => void;
}) {
  const pct = onboarding?.pct ?? 0;
  const steps: any[] = onboarding?.steps || STEPS.map((s) => ({ ...s, done: s.key === 'welcome' }));

  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-brand-navy">Onboarding — {pct}%</div>
        <div className="text-[13px] font-bold px-2 py-0.5 rounded-full bg-brand-gold text-brand-navy">
          {pct < 100 ? `${5 - steps.filter((s: any) => s.done).length} left` : '✓ Complete'}
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-brand-navy/10 overflow-hidden mb-3">
        <div className="h-full bg-brand-navy rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-2">
        {steps.map((s: any) => {
          const meta = STEPS.find((x) => x.key === s.key) || s;
          const isWelcome = s.key === 'welcome';
          return (
            <div
              key={s.key}
              onClick={() => {
                if (!isWelcome && onStepClick) {
                  onStepClick(s.key);
                }
              }}
              className={`flex items-center gap-3 p-2.5 rounded-xl border transition ${
                s.done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-white border-brand-navy/10 hover:border-brand-gold/60 hover:shadow-sm cursor-pointer'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold ${
                  s.done ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-transparent'
                }`}
              >
                {s.done ? '✓' : ''}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-bold ${s.done ? 'text-emerald-800' : 'text-brand-navy'}`}>
                  {meta.label}
                </div>
                <div className="text-[12px] text-brand-navy/60">{meta.hint}</div>
              </div>
              {!isWelcome && (
                <span className="text-[11px] font-bold text-brand-gold hover:underline">
                  {s.done ? 'Edit' : 'Fill →'}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-brand-navy/50 mt-3">
        Click any step to complete your profile in real-time. Staff sees updates live in CRM.
      </p>
    </div>
  );
}
