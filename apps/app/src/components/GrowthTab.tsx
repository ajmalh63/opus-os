import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

// A-5: session-driven auth ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â read the live better-auth cookie; no forged admin token.
const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

interface LeadScore { clientId: string; name: string; phone: string; email: string; score: number; band: string; interactions: number; }
interface RuleRow { id: string; division: string; serviceId: string | null; trigger: string; amount: number; isPercent: boolean; active: boolean; }

export default function GrowthTab() {
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  // ---- Marketing: lead scores / bands (Section 26.2) ----
  const { data: leadsData, isLoading: leadsLoading } = useQuery<{ leads: LeadScore[] }>({
    queryKey: ['marketingLeads'],
    queryFn: async () => { const r = await fetch('/api/marketing/leads', { headers: AUTH }); if (!r.ok) throw new Error('load failed'); return r.json(); }
  });

  // ---- Marketing: segments (Section 26.3) ----
  const { data: segData } = useQuery<{ segments: any[]; derived?: boolean }>({
    queryKey: ['marketingSegments'],
    queryFn: async () => { const r = await fetch('/api/marketing/segments', { headers: AUTH }); if (!r.ok) throw new Error('load failed'); return r.json(); }
  });

  // ---- Incentives: rules (Section 29/31) ----
  const { data: rulesData, refetch: refetchRules } = useQuery<{ rules: RuleRow[] }>({
    queryKey: ['incentiveRules'],
    queryFn: async () => { const r = await fetch('/api/incentives/rules', { headers: AUTH }); if (!r.ok) throw new Error('load failed'); return r.json(); }
  });

  // ---- Incentives: statements ----
  const { data: stmtData, refetch: refetchStmts } = useQuery<{ statements: any[] }>({
    queryKey: ['incentiveStatements'],
    queryFn: async () => { const r = await fetch('/api/incentives/statements', { headers: AUTH }); if (!r.ok) throw new Error('load failed'); return r.json(); }
  });

  // New rule form
  const [division, setDivision] = useState('study-abroad');
  const [trigger, setTrigger] = useState('agreement_signed');
  const [amountRs, setAmountRs] = useState('');
  const [period, setPeriod] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const createRule = useMutation({
    mutationFn: async () => {
      const amountPaise = Math.round(parseFloat(amountRs || '0') * 100);
      if (!amountPaise) throw new Error('Enter an amount');
      const r = await fetch('/api/incentives/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTH },
        body: JSON.stringify({ division, trigger, amount: amountPaise, isPercent: false })
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Create failed'); }
      return r.json();
    },
    onSuccess: (d) => { flash(d.message || 'Rule created'); setAmountRs(''); refetchRules(); },
    onError: (e: any) => flash(e.message, 'err'),
  });

  const closePeriod = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/incentives/close', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH },
        body: JSON.stringify({ period })
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Close failed'); }
      return r.json();
    },
    onSuccess: (d: any) => { flash(d.message || `Period closed - ${d.statements?.length || 0} draft statement(s)`); refetchStmts(); },
    onError: (e: any) => flash(e.message, 'err'),
  });

  const bandColor = (b: string) => b === 'hot' ? 'text-brand-error' : b === 'warm' ? 'text-brand-warning' : 'text-slate-500';
  const bandBg = (b: string) => b === 'hot' ? 'bg-brand-error/15' : b === 'warm' ? 'bg-brand-warning/15' : 'bg-white';

  return (
    <div className="space-y-8">
      {toast && <div className={`p-3 rounded-lg text-xs font-semibold ${toast.type === 'ok' ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-400' : 'bg-rose-950/40 border border-rose-800 text-rose-400'}`}>{toast.msg}</div>}

      {/* AUDIENCE SCORING - Section 26.2 */}
      <div className="bg-[#1C2541]/40 border border-brand-navy/10 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-brand-navy/10 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-bold text-sm text-brand-gold">Audience Temperature (Event-Driven Scoring)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Each interaction earns points ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ auto band. Gold standard: cold &lt;50 Ãƒâ€šÃ‚Â· warm 50ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“75 Ãƒâ€šÃ‚Â· hot &gt;75.</p>
          </div>
          <div className="flex gap-3 text-[10px]">
            {segData?.segments?.map(s => (
              <span key={s.name} className="px-2 py-1 rounded border border-brand-navy/10 bg-white text-slate-700">
                {s.name}: <b className="text-brand-navy">{s.count ?? s.rules_json?.band}</b>
              </span>
            ))}
          </div>
        </div>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-white text-slate-500 uppercase tracking-wider text-[10px] border-b border-brand-navy/10">
              <th className="p-4">Client</th>
              <th className="p-4">Score</th>
              <th className="p-4">Band</th>
              <th className="p-4">Interactions</th>
            </tr>
          </thead>
          <tbody>
            {leadsData?.leads.map(l => (
              <tr key={l.clientId} className="border-b border-brand-navy/10/60 hover:bg-slate-900/40">
                <td className="p-4">
                  <p className="font-semibold text-brand-navy">{l.name}</p>
                  <p className="text-[10px] text-slate-600">{l.clientId}</p>
                </td>
                <td className="p-4 font-mono font-bold text-brand-navy">{l.score}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${bandBg(l.band)} ${bandColor(l.band)}`}>{l.band}</span>
                </td>
                <td className="p-4 text-slate-500">{l.interactions}</td>
              </tr>
            ))}
            {!leadsLoading && (!leadsData || leadsData.leads.length === 0) && (
              <tr><td colSpan={4} className="p-8 text-center text-slate-600">No scored leads. Public interactions (lead form, consultation, WhatsApp reply) auto-score via /api/marketing/interactions.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* INCENTIVE RULES + CLOSE (Section 29) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rules */}
        <div className="bg-[#1C2541]/40 border border-brand-navy/10 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="font-display font-bold text-sm text-brand-gold">Staff Incentive Rules</h3>
            <p className="text-xs text-slate-500 mt-0.5">Fixed amount (paise) per trigger per division ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â earnings auto-computed from real transactions.</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); createRule.mutate(); }} className="flex flex-wrap gap-2">
            <select value={division} onChange={e => setDivision(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
              {['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={trigger} onChange={e => setTrigger(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
              <option value="agreement_signed">Agreement signed</option>
              <option value="milestone_paid">Milestone paid</option>
              <option value="visa_granted">Visa granted</option>
              <option value="placement_confirmed">Placement confirmed</option>
            </select>
            <input type="number" min="1" step="0.01" value={amountRs} onChange={e => setAmountRs(e.target.value)} placeholder="ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹ per event" className="w-28 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder-slate-400" />
            <button type="submit" className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-4 py-2 rounded text-xs font-bold">Add Rule</button>
          </form>
          <div className="space-y-1.5">
            {rulesData?.rules.map(r => (
              <div key={r.id} className="flex justify-between items-center bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs">
                <span className="text-brand-navy font-semibold">{r.division} Ãƒâ€šÃ‚Â· {r.trigger}</span>
                <span className="text-brand-gold font-mono">ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹{(r.amount / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Payout close */}
        <div className="bg-[#1C2541]/40 border border-brand-navy/10 rounded-xl p-6 space-y-4">
          <div>
            <h3 className="font-display font-bold text-sm text-brand-navy">Payout Statements</h3>
            <p className="text-xs text-slate-500 mt-0.5">Close a period ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ accruals are frozen (no double-count), statements drafted with TDS (<code className="text-brand-gold">10%</code>).</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); closePeriod.mutate(); }} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Period (YYYY-MM)</label>
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy" />
            </div>
            <button type="submit" className="bg-brand-success hover:opacity-90 text-brand-navy px-4 py-2.5 rounded text-xs font-bold">Close Period</button>
          </form>
          <div className="space-y-1.5">
            {stmtData?.statements.map(s => (
              <div key={s.id} className="flex justify-between items-center bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs">
                <span className="text-brand-navy font-semibold">{s.employeeId} Ãƒâ€šÃ‚Â· {s.period}</span>
                <span className="flex gap-3">
                  <span className="text-slate-500">Gross <b className="text-brand-navy">ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹{(s.gross / 100).toFixed(2)}</b></span>
                  <span className="text-slate-500">Net <b className="text-brand-success">ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹{(s.net / 100).toFixed(2)}</b></span>
                  <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${s.status === 'approved' ? 'bg-brand-success/15 text-brand-success' : 'bg-slate-700 text-slate-700'}`}>{s.status}</span>
                </span>
              </div>
            ))}
            {(!stmtData || stmtData.statements.length === 0) && <p className="text-[10px] text-slate-600 text-center py-3">No payout statements yet. Close a period after accruals exist.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
