import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

interface Props {
  clientId?: string;
  clientName?: string;
  defaultCountry?: string;
  defaultDegree?: string;
}

export default function AiVisaRiskCopilot({
  clientId,
  clientName,
  defaultCountry = 'United Kingdom',
  defaultDegree = 'Masters',
}: Props) {
  const [targetCountry, setTargetCountry] = useState(defaultCountry);
  const [degreeLevel, setDegreeLevel] = useState(defaultDegree);
  const [academicGpaOrPercent, setAcademicGpaOrPercent] = useState('68%');
  const [gapYears, setGapYears] = useState<number>(1);
  const [workExperienceYears, setWorkExperienceYears] = useState<number>(1);
  const [ieltsOverall, setIeltsOverall] = useState('6.5');
  const [budgetInrLakhs, setBudgetInrLakhs] = useState<number>(25);
  const [priorVisaRefusals, setPriorVisaRefusals] = useState<boolean>(false);
  const [notes, setNotes] = useState('');

  const [assessment, setAssessment] = useState<any>(null);

  const riskMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/staff/ai/visa-risk', { credentials: 'include', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          targetCountry,
          degreeLevel,
          academicGpaOrPercent,
          gapYears: Number(gapYears),
          workExperienceYears: Number(workExperienceYears),
          ieltsOverall,
          budgetInrLakhs: Number(budgetInrLakhs),
          priorVisaRefusals,
          notes,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Visa risk evaluation failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setAssessment(data.assessment);
    },
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20';
    if (score >= 60) return 'text-amber-400 border-amber-500/30 bg-amber-950/20';
    return 'text-rose-400 border-rose-500/30 bg-rose-950/20';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-lg">
            🛡️
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              AI Visa Risk Copilot & Profile Scorer
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Staff Only
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Evaluates refusal probability, financial adequacy, and academic gaps for{' '}
              <span className="text-indigo-300 font-semibold">{clientName || 'Candidate'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Input Parameters Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target Country</label>
          <select
            value={targetCountry}
            onChange={(e) => setTargetCountry(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          >
            <option value="United Kingdom">United Kingdom (UK Tier-4)</option>
            <option value="United States">United States (US F-1)</option>
            <option value="Germany">Germany (Aufenthaltserlaubnis)</option>
            <option value="Canada">Canada (Study Permit)</option>
            <option value="Australia">Australia (Subclass 500)</option>
            <option value="Saudi Arabia">Saudi Arabia (Umrah / Work)</option>
            <option value="United Arab Emirates">UAE (Employment / Tourist)</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Program / Degree Level</label>
          <select
            value={degreeLevel}
            onChange={(e) => setDegreeLevel(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          >
            <option value="Masters">Masters / Postgraduate (MSc / MA / MBA)</option>
            <option value="Bachelors">Bachelors / Undergraduate (BSc / BEng)</option>
            <option value="Diploma">Diploma / Foundation Pathway</option>
            <option value="Doctorate">Doctorate / PhD</option>
            <option value="Work Visa">Skilled Work / Employment Visa</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Academic Grade / GPA</label>
          <input
            type="text"
            value={academicGpaOrPercent}
            onChange={(e) => setAcademicGpaOrPercent(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
            placeholder="e.g. 74% or 7.8 CGPA"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">IELTS / PTE / English Score</label>
          <input
            type="text"
            value={ieltsOverall}
            onChange={(e) => setIeltsOverall(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
            placeholder="e.g. 6.5 Overall (no band < 6.0)"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Education Gap (Years)</label>
          <input
            type="number"
            min="0"
            value={gapYears}
            onChange={(e) => setGapYears(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Work Experience (Years)</label>
          <input
            type="number"
            min="0"
            value={workExperienceYears}
            onChange={(e) => setWorkExperienceYears(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Liquid Financial Proof (INR Lakhs)</label>
          <input
            type="number"
            min="0"
            value={budgetInrLakhs}
            onChange={(e) => setBudgetInrLakhs(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
            placeholder="e.g. 28 Lakhs"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">Specific Case Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200"
            placeholder="e.g. Backlogs in 3rd year cleared; sponsor is paternal uncle"
          />
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer bg-slate-950 border border-slate-800 p-2.5 rounded-xl w-full">
            <input
              type="checkbox"
              checked={priorVisaRefusals}
              onChange={(e) => setPriorVisaRefusals(e.target.checked)}
              className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
            />
            <span className="text-xs font-semibold text-rose-300">Prior Visa Refusal History</span>
          </label>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => riskMutation.mutate()}
          disabled={riskMutation.isPending}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/20"
        >
          {riskMutation.isPending ? 'Analyzing Visa File...' : '⚡ Run AI Visa Risk Assessment'}
        </button>
      </div>

      {/* Assessment Output Report */}
      {assessment && (
        <div className="mt-6 border-t border-slate-800 pt-6 space-y-6">
          {/* Top Score Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-2xl border flex items-center justify-between ${getScoreColor(assessment.score)}`}>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider block opacity-70">
                  Approval Likelihood
                </span>
                <span className="text-3xl font-extrabold">{assessment.score}%</span>
              </div>
              <div className="text-2xl">
                {assessment.score >= 80 ? '🎯' : assessment.score >= 60 ? '⚠️' : '🚨'}
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/80">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Refusal Risk Tier
              </span>
              <span
                className={`text-lg font-bold uppercase mt-1 inline-block ${
                  assessment.riskLevel === 'low'
                    ? 'text-emerald-400'
                    : assessment.riskLevel === 'medium'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {assessment.riskLevel} Risk
              </span>
            </div>

            <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/80">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Required Proof Balance
              </span>
              <span className="text-lg font-bold text-indigo-300 mt-1 inline-block">
                ₹{assessment.recommendedFinancialProofINR || budgetInrLakhs} Lakhs Liquid
              </span>
            </div>
          </div>

          {/* Red Flags Alert */}
          {assessment.redFlags && assessment.redFlags.length > 0 && (
            <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5 uppercase tracking-wider">
                <span>🚨</span> Critical Immigration Red Flags Detected
              </h4>
              <ul className="list-disc list-inside text-xs text-rose-200/90 space-y-1">
                {assessment.redFlags.map((flag: string, idx: number) => (
                  <li key={idx}>{flag}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Observations */}
          {assessment.keyObservations && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Key Case Observations
              </h4>
              <ul className="list-disc list-inside text-xs text-slate-300/80 space-y-1">
                {assessment.keyObservations.map((obs: string, idx: number) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actionable Mitigation Steps */}
          {assessment.mitigationSteps && (
            <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5 uppercase tracking-wider">
                <span>✅</span> Required Counselor Action Checklist
              </h4>
              <ul className="space-y-1.5 text-xs text-emerald-200/90">
                {assessment.mitigationSteps.map((step: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
