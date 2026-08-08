import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../lib/session';

// Staff Tools — moved out of a floating public button into the workspace, and
// upgraded: live overdue tasks (real /api/tasks/overdue), quick WhatsApp copy,
// GST split, attestation estimator, visa checklists, expiry reminders.

interface OverdueTask {
  id: string;
  clientId: string;
  title: string;
  description?: string;
  priority?: string;
  dueDate?: number;
}

const baseAuth = (): HeadersInit => {
  const s = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith('better-auth.session_token='));
  return s ? { Cookie: s } : {};
};

export default function StaffTools() {
  const { me } = useSession();
  const [tab, setTab] = useState<'overdue' | 'gst' | 'attestation' | 'visa' | 'expiry'>('overdue');

  // GST
  const [inr, setInr] = useState('');
  const [inter, setInter] = useState(false);
  const gst = (() => {
    const paise = Math.round((parseFloat(inr) || 0) * 100);
    const base = Math.round(paise / 1.18);
    const g = paise - base;
    return { paise, base, g, igst: inter ? g : 0, cgst: inter ? 0 : Math.round(g / 2), sgst: inter ? 0 : g - Math.round(g / 2) };
  })();

  // Attestation estimator
  const [docType, setDocType] = useState('Degree');
  const [dest, setDest] = useState('Saudi Arabia');
  const matrix: Record<string, Record<string, { chain: string; price: number; days: number }>> = {
    Degree: { 'Saudi Arabia': { chain: 'Notary → HRD → MEA → Saudi Embassy', price: 550000, days: 12 }, UAE: { chain: 'Notary → SDM → MEA → UAE Embassy', price: 680000, days: 10 }, Kuwait: { chain: 'Notary → HRD → MEA → Kuwait Embassy', price: 480000, days: 14 } },
    Birth: { 'Saudi Arabia': { chain: 'Notary → MEA → Saudi Embassy', price: 350000, days: 8 }, UAE: { chain: 'Notary → MEA → UAE Embassy', price: 420000, days: 7 }, Kuwait: { chain: 'Notary → MEA → Kuwait Embassy', price: 320000, days: 10 } },
  };
  const att = matrix[docType]?.[dest] || { chain: 'Notary → MEA', price: 200000, days: 5 };

  // Visa checklist
  const [visaCountry, setVisaCountry] = useState('Germany');
  const visa: Record<string, string[]> = {
    Germany: ['German University Admission Letter', 'Blocked Account (Sperrkonto €11,900)', 'Travel Health Insurance', 'Academic Certificates & Transcripts', 'English/German proficiency proof'],
    UK: ['CAS Letter', 'IHS Payment Confirmation', 'TB Test Certificate (UKVI clinic)', 'Financial proof (28 days bank statement)'],
    US: ['Form I-20 (SEVP)', 'SEVIS I-901 receipt ($350)', 'DS-160 confirmation & barcode', 'Visa interview appointment letter', 'Liquid funds for 1st year cost'],
  };

  // Live overdue tasks (real API)
  const { data: overdueData } = useQuery({
    queryKey: ['staffOverdue'],
    queryFn: async () => {
      const r = await fetch('/api/tasks/overdue', { headers: baseAuth() });
      if (!r.ok) return { overdue: [] as any[] };
      return r.json();
    },
    staleTime: 30_000,
  });
  const overdue: OverdueTask[] = (overdueData as any)?.overdue || [];

  // Mock expiry list (real data hook later via documents vault)
  const expiries = [
    { name: 'Ramesh Kumar', item: 'Passport', daysLeft: 45, token: 'OP-2026-1001' },
    { name: 'Priya Patel', item: 'German Visa', daysLeft: 12, token: 'OP-2026-1002' },
  ];

  const copyText = (t: string) => navigator.clipboard.writeText(t);

  const tabs = [
    ['overdue', 'SLA Tasks', '🔔'],
    ['gst', 'GST Split', '🧾'],
    ['attestation', 'Attest Quotes', '📜'],
    ['visa', 'Visa Checklist', '🛂'],
    ['expiry', 'Expiries', '⏳'],
  ] as const;

  const inputCls = 'w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none';

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-white">Staff Tools</h2>
        <span className="rounded-full bg-brand-gold/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-gold">Workspace only</span>
      </div>

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-white/5 p-1 text-xs font-bold">
        {tabs.map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 transition-all ${tab === key ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'}`}
          >
            {icon} {label}
            {key === 'overdue' && overdue.length > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">{overdue.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overdue' && (
        <div className="space-y-2.5">
          {overdue.length === 0 ? (
            <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">No overdue SLA tasks — you're on track.</p>
          ) : overdue.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{t.title}</p>
                <p className="text-[10px] text-white/50">{t.clientId} · priority {t.priority || 'normal'}</p>
              </div>
              <button
                onClick={() => copyText(`Hi, this is a reminder from Opus Overseas about your ${t.title}. Please reply here.`)}
                className="shrink-0 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500 hover:text-white"
              >
                Copy WA
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'gst' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/50">Invoice amount (₹)</label>
              <input type="number" value={inr} onChange={(e) => setInr(e.target.value)} placeholder="e.g. 15000" className={inputCls} />
            </div>
            <label className="flex items-center gap-2 pb-1 text-xs text-white/60">
              <input type="checkbox" checked={inter} onChange={(e) => setInter(e.target.checked)} className="accent-brand-gold" />
              Interstate (IGST)
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-4 text-xs sm:grid-cols-4">
            <Stat label="Total paise" value={gst.paise.toLocaleString()} />
            <Stat label="Base (÷1.18)" value={gst.base.toLocaleString()} />
            {inter ? <Stat label="IGST 18%" value={gst.igst.toLocaleString()} gold /> : <><Stat label="CGST 9%" value={gst.cgst.toLocaleString()} gold /><Stat label="SGST 9%" value={gst.sgst.toLocaleString()} gold /></>}
          </div>
        </div>
      )}

      {tab === 'attestation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/50">Doc type</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className={inputCls}>
                <option>Degree</option><option>Birth</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-white/50">Embassy</label>
              <select value={dest} onChange={(e) => setDest(e.target.value)} className={inputCls}>
                <option>Saudi Arabia</option><option>UAE</option><option>Kuwait</option>
              </select>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-4 text-xs">
            <p className="text-brand-gold">{att.chain}</p>
            <div className="mt-2 flex justify-between"><span className="text-white/50">Cost</span><span className="font-mono text-white">₹{(att.price / 100).toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Turnaround</span><span className="text-white">{att.days} business days</span></div>
          </div>
        </div>
      )}

      {tab === 'visa' && (
        <div className="space-y-4">
          <select value={visaCountry} onChange={(e) => setVisaCountry(e.target.value)} className={inputCls}>
            <option>Germany</option><option>UK</option><option>US</option>
          </select>
          <ul className="space-y-2">
            {(visa[visaCountry] || []).map((item, i) => (
              <li key={i} className="flex gap-2 rounded-xl bg-white/5 px-3.5 py-2.5 text-xs text-white/80">
                <span className="text-brand-gold">✔</span>{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'expiry' && (
        <div className="space-y-3">
          {expiries.map((e, i) => (
            <div key={i} className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-4 text-xs">
              <div className="flex justify-between">
                <span className="font-semibold text-white">{e.name}</span>
                <span className="rounded bg-rose-900/50 px-2 py-0.5 font-mono text-rose-300">Expires {e.daysLeft}d</span>
              </div>
              <p className="mt-1 text-white/50">{e.item} · {e.token}</p>
              <button
                onClick={() => copyText(`Hi ${e.name}, your ${e.item} renewal window is open. Please upload your document to OpusOS vault.`)}
                className="mt-2 w-full rounded-lg bg-emerald-500/20 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500 hover:text-white"
              >
                Copy WhatsApp reminder
              </button>
            </div>
          ))}
          {me && <p className="text-[10px] text-white/30">Signed in as {me.name}</p>}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`mt-0.5 font-mono text-sm ${gold ? 'text-brand-gold' : 'text-white'}`}>{value}</p>
    </div>
  );
}