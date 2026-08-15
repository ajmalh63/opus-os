import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Client portal — Attestation section (token-auth).
// Browse indicative price ranges → create application (one doc) → send docs to
// our office → track the chain timeline → delivery. Prices NEVER guaranteed.

interface RateCard { id: string; country: string; category: string; route: string; title?: string | null; description?: string | null; featured?: boolean; pricePaise: number; timelineDays: number; steps: string[] }
interface AttestationApp {
  id: string;
  document: { holderName: string; documentName: string; issuingState: string; issuingYear?: number; documentNumber?: string; purpose?: string };
  category: string;
  route: string;
  destinationCountry: string;
  chain: { key: string; label: string; status: string; date: number | null; note: string | null }[];
  fees: { govtFeePaise: number; serviceFeePaise: number; courierFeePaise: number; translationFeePaise: number; totalQuotePaise: number };
  translationNeeded: boolean;
  pickup: { status: string; address: string | null; courierInbound: string | null; courierOutbound: string | null; courierReturn: string | null };
  stage: string;
  urgency?: string;
  deadline?: number | null;
  documentStatus?: string;
  createdAt: number;
  updatedAt: number;
}

const STAGE_LABEL: Record<string, string> = {
  quote_requested: 'Quote Requested', quote_confirmed: 'Quote Confirmed', docs_awaiting: 'Awaiting Your Documents', in_process: 'In Process', completed: 'Completed', dispatched: 'Dispatched', delivered: 'Delivered', rejected: 'Rejected',
};
const CATEGORY_LABEL: Record<string, string> = { educational: 'Educational', personal: 'Personal', commercial: 'Commercial' };
const ROUTE_LABEL: Record<string, string> = { apostille: 'Apostille', embassy: 'Embassy Attestation' };
const INR = (p: number) => '₹' + (p / 100).toLocaleString('en-IN');

export default function AttestationClientSection({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'browse' | 'tracker'>('browse');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('educational');
  const [docName, setDocName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [issuingState, setIssuingState] = useState('');
  const [translation, setTranslation] = useState(false);
  const [urgency, setUrgency] = useState('normal');
  const [deadline, setDeadline] = useState('');
  const [scanFile, setScanFile] = useState<File | null>(null);

  const { data: bandsData } = useQuery<{ success: boolean; bands: any; disclaimer: string }>({
    queryKey: ['attestationBands', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/attestation/price-bands?token=${token}`);
      if (!r.ok) throw new Error('Price bands failed');
      return r.json();
    }
  });

  const { data: rateData } = useQuery<{ success: boolean; countries: string[]; rateCards: RateCard[]; disclaimer: string }>({
    queryKey: ['attestationRates', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/attestation/rate-cards?token=${token}`);
      if (!r.ok) throw new Error('Rate cards failed');
      return r.json();
    }
  });

  const { data: appsData } = useQuery<{ success: boolean; applications: AttestationApp[] }>({
    queryKey: ['attestationApps', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/attestation/applications?token=${token}`);
      if (!r.ok) throw new Error('Applications failed');
      return r.json();
    },
    enabled: tab === 'tracker',
    refetchInterval: 30000
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/public/portal/attestation/applications?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: token,
          document: { holderName, documentName: docName, issuingState },
          category, route: 'embassy', destinationCountry: country, translationNeeded: translation,
          urgency, deadline: deadline ? Math.floor(new Date(deadline).getTime() / 1000) : undefined
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Creation failed');
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['attestationApps', token] });
      if (scanFile && data.id) {
        try {
          const presignedRes = await fetch(`/api/public/portal/attestation/applications/${data.id}/document/presigned?token=${token}&filename=${encodeURIComponent(scanFile.name)}`, { method: 'POST' });
          const presigned = await presignedRes.json();
          if (presignedRes.ok && presigned.url) {
            await fetch(presigned.url, { method: 'PUT', body: await scanFile.arrayBuffer() });
          }
        } catch { /* scan upload failure shouldn't block the request */ }
      }
      alert(data.message || 'Quote request submitted.');
      setTab('tracker');
    },
    onError: (e: any) => alert(e.message)
  });

  const pickupMutation = useMutation({
    mutationFn: async ({ id, address, awb }: { id: string; address: string; awb: string }) => {
      const r = await fetch(`/api/public/portal/attestation/applications/${id}/pickup?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupAddress: address, courierInbound: awb })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Pickup failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attestationApps', token] });
      alert('Pickup booked. Send your original documents to our office — we handle the rest.');
    },
    onError: (e: any) => alert(e.message)
  });

  const band = bandsData?.bands?.['embassy']?.[category] || bandsData?.bands?.['apostille']?.[category] || null;
  const featuredProducts = (rateData?.rateCards || []).filter(rc => rc.featured || rc.title);
  const inputCls = 'w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2.5 text-xs text-brand-navy outline-none focus:border-brand-gold min-h-[44px]';
  const labelCls = 'font-semibold text-brand-navy/40 text-[10px] mb-1 block';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-brand-navy text-sm">🧾 Attestation Services</h3>
        <div className="flex gap-1.5 bg-brand-navy/[0.05] p-1 rounded-xl text-[10px] font-bold text-brand-navy/60">
          {(['browse', 'tracker'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${tab === t ? 'bg-brand-gold text-brand-navy' : 'hover:text-brand-navy'}`}>
              {t === 'browse' ? 'Get a Quote' : 'My Applications'}
            </button>
          ))}
        </div>
      </div>

      {/* ── BROWSE / QUOTE ── */}
      {tab === 'browse' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] p-3 text-[10px] text-brand-navy/70">
            {bandsData?.disclaimer || rateData?.disclaimer || 'Prices shown are indicative ranges and are not guaranteed — final cost may vary based on government fees, document type and processing. Subject to change without notice.'}
          </div>

          {featuredProducts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">★ Popular services</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {featuredProducts.slice(0, 4).map(fp => (
                  <div key={fp.id} className="rounded-xl border border-brand-navy/10 bg-white p-3 shadow-sm space-y-1">
                    <div className="font-bold text-brand-navy text-[11px]">{fp.title || `${fp.country} — ${fp.category}`}</div>
                    {fp.description && <div className="text-[9px] text-brand-navy/50 line-clamp-2">{fp.description}</div>}
                    <div className="flex items-center justify-between">
                      <span className="text-brand-gold font-bold text-sm">{INR(fp.pricePaise)}</span>
                      <button onClick={() => { setCountry(fp.country); setCategory(fp.category); }} className="text-[9px] font-bold text-brand-gold hover:underline cursor-pointer">Quote this →</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3">
            <div className="font-bold text-brand-navy text-xs">Request an attestation quote</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Destination country</label>
                <select className={inputCls} value={country} onChange={e => setCountry(e.target.value)}>
                  <option value="">-- Select --</option>
                  {(rateData?.countries || []).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Document category</label>
                <select className={inputCls} value={category} onChange={e => setCategory(e.target.value)}>
                  {['educational', 'personal', 'commercial'].map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </select>
              </div>
              <div><label className={labelCls}>Document name *</label><input className={inputCls} value={docName} onChange={e => setDocName(e.target.value)} placeholder="e.g. B.Tech Degree Certificate" /></div>
              <div><label className={labelCls}>Holder name *</label><input className={inputCls} value={holderName} onChange={e => setHolderName(e.target.value)} placeholder="Name on the document" /></div>
              <div><label className={labelCls}>Issuing state *</label><input className={inputCls} value={issuingState} onChange={e => setIssuingState(e.target.value)} placeholder="e.g. Telangana" /></div>
              <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer"><input type="checkbox" checked={translation} onChange={e => setTranslation(e.target.checked)} className="h-4 w-4 accent-brand-gold" /> Arabic certified translation needed</label></div>
            </div>

            {band && (
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3 space-y-1.5">
                <div className="flex justify-between text-[10px] text-brand-navy/70"><span>Expected range ({ROUTE_LABEL['embassy']})</span><b>{INR(band.min * 100)} – {INR(band.max * 100)}</b></div>
                <div className="text-[9px] text-brand-navy/40">Indicative only — the exact price is confirmed after we check with our processing partners.</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Urgency</label>
                <select className={inputCls} value={urgency} onChange={e => setUrgency(e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Needed by (optional)</label>
                <input type="date" className={inputCls} value={deadline} onChange={e => setDeadline(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Document scan (helps us quote faster — optional)</label>
                <label className="flex items-center gap-2 rounded-lg border border-dashed border-brand-navy/20 px-3 py-2.5 cursor-pointer hover:border-brand-gold/50 transition-all">
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" onChange={(e) => setScanFile(e.target.files?.[0] || null)} />
                  <span className="text-[10px] text-brand-navy/60">{scanFile ? `✓ ${scanFile.name}` : '📎 Attach a scan of the document'}</span>
                </label>
              </div>
            </div>
            <div className="rounded-lg bg-amber-500/10 border border-amber-200 p-2.5 text-[9px] text-amber-800">
              The range shown is <b>indicative only</b> — it is not compulsory to stay within this bracket and the final price <b>may go up</b> based on government fees and document specifics. We confirm the exact price before you send anything.
            </div>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!country || !docName.trim() || !holderName.trim() || !issuingState.trim() || createMutation.isPending}
              className="w-full bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2.5 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
            >
              {createMutation.isPending ? 'Submitting…' : 'Get a Quote'}
            </button>
            <div className="text-[9px] text-brand-navy/40">One application per document. We'll confirm the exact price with you — then you send the original to our office and we handle the rest.</div>
          </div>
        </div>
      )}

      {/* ── TRACKER ── */}
      {tab === 'tracker' && (
        <div className="space-y-3">
          {(appsData?.applications || []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-8 text-center text-xs text-brand-navy/40">
              No attestation applications yet. Get a quote to start.
            </div>
          )}
          {(appsData?.applications || []).map(app => (
            <div key={app.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-brand-navy">{app.document.documentName}</div>
                  <div className="text-[10px] text-brand-navy/40 mt-0.5">{app.document.holderName} · {app.document.issuingState} → {app.destinationCountry} · {ROUTE_LABEL[app.route]}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase shrink-0 ${app.stage === 'delivered' ? 'bg-emerald-600/15 text-emerald-800' : app.stage === 'rejected' ? 'bg-rose-500/15 text-rose-600' : app.stage === 'in_process' ? 'bg-blue-500/15 text-blue-700' : app.stage === 'quote_requested' ? 'bg-amber-500/15 text-amber-700' : app.stage === 'quote_confirmed' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/60'}`}>{STAGE_LABEL[app.stage]}</span>
              </div>

              {/* Chain timeline */}
              <div className="space-y-1.5">
                {app.chain.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold shrink-0 ${step.status === 'done' ? 'bg-emerald-500 text-white' : step.status === 'failed' ? 'bg-rose-500 text-white' : 'bg-brand-navy/[0.08] text-brand-navy/40'}`}>
                      {step.status === 'done' ? '✓' : step.status === 'failed' ? '✕' : i + 1}
                    </div>
                    <span className={`text-[10px] ${step.status === 'done' ? 'text-brand-navy font-semibold' : 'text-brand-navy/50'}`}>{step.label}</span>
                    {step.date && <span className="text-[9px] text-brand-navy/30 ml-auto">{new Date(step.date * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                  </div>
                ))}
              </div>

              {/* Fees */}
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-2.5 text-[10px] text-brand-navy/70 flex justify-between">
                <span>Indicative total{app.translationNeeded ? ' (incl. translation)' : ''}</span>
                <b>{INR(app.fees.totalQuotePaise)}</b>
              </div>

              {app.stage === 'quote_requested' && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-200 p-3 text-[10px] text-amber-800 space-y-1">
                  <div><b>Quote requested.</b> Our team is confirming the exact price with our processing partners — we'll update you shortly.</div>
                  <div className="flex flex-wrap gap-2 text-[9px]">
                    {app.urgency === 'urgent' && <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 font-bold">⚡ Urgent</span>}
                    {app.deadline && <span>Needed by: <b>{new Date(app.deadline * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</b></span>}
                    <span>Scan: <b className={app.documentStatus === 'received' ? 'text-emerald-700' : 'text-brand-navy/50'}>{app.documentStatus === 'received' ? '✓ uploaded' : 'not uploaded'}</b></span>
                  </div>
                </div>
              )}
              {app.stage === 'quote_confirmed' && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-200 p-3 text-[10px] text-emerald-800">
                  <b>✓ Quote confirmed: {INR(app.fees.totalQuotePaise)}</b> — book the pickup below to send your documents.
                </div>
              )}

              {/* Pickup — client sends docs to US */}
              {(app.stage === 'quote' || app.stage === 'quote_confirmed') && (
                <div className="rounded-lg border border-brand-gold/30 bg-brand-gold/[0.05] p-3 space-y-2">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/50">📦 Send your documents to us</div>
                  <PickupForm onBook={(address, awb) => pickupMutation.mutate({ id: app.id, address, awb })} busy={pickupMutation.isPending} />
                </div>
              )}
              {app.stage !== 'quote' && app.pickup.courierInbound && (
                <div className="text-[9px] text-brand-navy/40">📦 Your documents: {app.pickup.courierInbound}{app.pickup.courierOutbound ? ` · To processing: ${app.pickup.courierOutbound}` : ''}{app.pickup.courierReturn ? ` · Return: ${app.pickup.courierReturn}` : ''}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PickupForm({ onBook, busy }: { onBook: (address: string, awb: string) => void; busy: boolean }) {
  const [address, setAddress] = useState('');
  const [awb, setAwb] = useState('');
  return (
    <div className="space-y-2">
      <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Your address (we'll courier the docs back here)" className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[10px] text-brand-navy outline-none focus:border-brand-gold" />
      <div className="flex gap-2">
        <input value={awb} onChange={e => setAwb(e.target.value)} placeholder="Courier AWB (after you ship)" className="flex-1 rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[10px] text-brand-navy outline-none focus:border-brand-gold" />
        <button onClick={() => address.trim() && onBook(address.trim(), awb.trim())} disabled={!address.trim() || busy} className="bg-brand-navy text-white text-[9px] font-bold px-3 py-2 rounded hover:bg-brand-navy/90 transition-all cursor-pointer disabled:opacity-50 shrink-0">
          {busy ? 'Booking…' : 'Book Pickup'}
        </button>
      </div>
      <div className="text-[9px] text-brand-navy/40">Ship the original document to our office address (shared on WhatsApp). We dispatch to processing and return it to you — tracked at every step.</div>
    </div>
  );
}