import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useRoute, useLocation } from 'wouter';
import { createSyncClient } from '../../lib/syncClient';

type FleetItem = {
  key: string; name: string; host: string; port: number; kind: string;
  dash: string; envKey: string; doc: string;
  state: 'stub'|'live'|'down'; latencyMs?: number; detail?: string;
};

const KIND_COLOR: Record<string,string> = {
  messaging:'emerald', books:'blue', email:'amber', analytics:'teal',
  monitoring:'indigo', ops:'slate', automation:'violet', crm:'slate',
  logistics:'cyan', ai:'fuchsia',
};

function badge(state: string) {
  if(state==='live') return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20';
  if(state==='down') return 'bg-rose-500/15 text-rose-700 border-rose-500/20';
  return 'bg-brand-navy/[0.06] text-brand-navy/50 border-brand-navy/10';
}

export default function FleetConsole() {
  const [location, setLocation] = useLocation();
  const [, infraParams] = useRoute('/workspaces/infra/:app*');
  const [, fleetParams] = useRoute('/workspaces/fleet/:app*');
  const qc = useQueryClient();
  const selected = ((infraParams as any)?.app || (fleetParams as any)?.app || (location.startsWith('/workspaces/fleet/') ? location.split('/').pop() : undefined) || (location.startsWith('/workspaces/infra/') ? location.split('/').pop() : undefined)) as string | undefined;

  // Fleet + integrations + overview (three sources, one screen)
  const { data: fleetData, isLoading: fleetLoading, refetch: refFleet } = useQuery<{ fleet: FleetItem[]; summary: any }>({
    queryKey:['fleetMap'],
    queryFn: async()=>{ const r=await fetch('/api/infrastructure/fleet',{credentials:'include'}); if(!r.ok) throw new Error('fleet'); return r.json(); },
    refetchInterval: 20_000,
  });
  const { data: docker } = useQuery<{ overview:any }>({
    queryKey:['fleetDockerOverview'],
    queryFn: async()=>{ const r=await fetch('/api/infrastructure/docker-overview',{credentials:'include'}); if(!r.ok) throw new Error('docker'); return r.json(); },
    refetchInterval: 20_000,
  });
  const { data: intData } = useQuery<{ integrations:any[]; summary:any }>({
    queryKey:['fleetIntegrations'],
    queryFn: async()=>{ const r=await fetch('/api/infrastructure/integrations',{credentials:'include'}); if(!r.ok) throw new Error('int'); return r.json(); },
    refetchInterval: 20_000,
  });

  // Realtime — staff:global:infra (overview) + per-app
  useEffect(()=>{
    const enabled=(import.meta as any).env?.VITE_SYNC_ENABLED!=='false';
    if(!enabled || typeof window==='undefined') return;
    const c=createSyncClient({
      plane:'staff',
      channels: selected ? ['staff:global:infra', `staff:global:infra:${selected}`, 'staff:global:alerts'] : ['staff:global:infra','staff:global:alerts'],
      enabled,
      onEvent:(e)=>{
        if(e.channel.startsWith('staff:global:infra')){
          qc.invalidateQueries({queryKey:['fleetMap']});
          qc.invalidateQueries({queryKey:['fleetDockerOverview']});
          qc.invalidateQueries({queryKey:['fleetIntegrations']});
          qc.invalidateQueries({queryKey:['fleetApp', selected]});
        }
      }
    });
    c.connect(); return ()=>{ try{(c as any).disconnect?.();}catch{} };
  },[qc, selected]);

  const fleet = fleetData?.fleet || [];
  const overview = docker?.overview;
  const selectedItem = useMemo(()=> fleet.find(f=>f.key===selected),[fleet, selected]);

  // Per-app detail fetches are done inside FleetAppDetail (lazy)
  if (selected) {
    return <FleetAppDetail item={selectedItem} fleet={fleet} onBack={()=> setLocation('/workspaces/infra')} />;
  }

  return (
    <div className="space-y-8">
      {/* Header — same language as InfraHealth */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-brand-navy/10 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="gold-dot" />
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-gold">Fleet Command Center</p>
          </div>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-navy">Fleet Console — 13 Apps</h1>
          <p className="mt-1 text-sm text-brand-navy/60">Every Docker app behind <span className="font-mono text-brand-navy">*.opusoverseas.com</span> — Tunnel-native, owner-only, realtime via SyncHub.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold border ${fleetData?.summary?.down ? 'bg-rose-500/10 text-rose-700 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'}`}>
            {fleetLoading ? 'Probing…' : `${fleetData?.summary?.live ?? 0}/${fleetData?.summary?.total ?? 13} live · ${fleetData?.summary?.down ?? 0} down`}
          </span>
          <button onClick={()=>{refFleet(); qc.invalidateQueries({queryKey:['fleetDockerOverview']}); qc.invalidateQueries({queryKey:['fleetIntegrations']});}} className="cursor-pointer rounded-full border border-brand-navy/15 bg-white px-4 py-1.5 text-sm font-bold text-brand-navy hover:border-brand-gold hover:text-brand-gold active:scale-95">↻ Refresh Fleet</button>
        </div>
      </div>

      {/* Ops ribbon */}
      <div className="flex flex-wrap gap-2 text-[13px] font-bold">
        <span className="rounded-full bg-brand-navy/[0.05] px-3 py-1 text-brand-navy/60">QUIC hyd03 · TLS 1.3 · X25519MLKEM768</span>
        <span className="rounded-full bg-brand-navy/[0.05] px-3 py-1 text-brand-navy/60">KV 30s cache · 8000ms probe timeout · parallel fan-out</span>
        <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-700">Realtime: staff:global:infra</span>
      </div>

      {/* 13-app grid — each card is route-linked */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {fleetLoading && Array.from({length:6}).map((_,i)=>(<div key={i} className="h-44 animate-pulse rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.04]" />))}
        {fleet.map((f)=> {
          const ov:any = overview?.[f.key];
          const latency = f.latencyMs ?? (intData?.integrations?.find((x:any)=>x.key===f.key)?.latencyMs);
          const state = (f.state as any) || ov?.state || 'stub';
          const kcol = KIND_COLOR[f.kind] || 'slate';
          return (
            <Link key={f.key} href={`/workspaces/infra/${f.key}`} className="group flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-[0_16px_36px_-16px_rgba(10,45,80,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-16px_rgba(10,45,80,0.14)] border-brand-navy/10">
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-black border bg-${kcol}-500/10 text-${kcol}-700 border-${kcol}-500/20`}>{f.name.slice(0,2).toUpperCase()}</span>
                    <div>
                      <div className="font-display text-sm font-bold text-brand-navy flex items-center gap-1.5">{f.name} <span className="text-xs font-mono text-brand-navy/40">{f.host}</span></div>
                      <div className="text-[13px] text-brand-navy/50">{f.doc} · :{f.port} · {f.kind}</div>
                    </div>
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${badge(state)}`}>{state}</span>
                </div>
                <div className="mt-3.5 rounded-xl bg-brand-navy/[0.03] p-3 text-xs">
                  <div className="flex items-center justify-between"><span className="text-sm text-brand-navy/60">Latency</span><span className="font-mono text-sm font-bold text-brand-navy">{latency != null ? `${latency}ms` : '—'}</span></div>
                  <div className="mt-1.5 flex items-center justify-between"><span className="text-sm text-brand-navy/60">State</span><span className="font-mono text-sm text-brand-navy truncate max-w-[60%] text-right">{f.detail || ov?.details || 'Unconfigured'}</span></div>
                  {f.key==='openwa' && ov?.session && (<div className="mt-1.5 flex items-center justify-between"><span className="text-sm text-brand-navy/60">Session</span><span className="font-mono text-[13px] font-bold text-emerald-800">{ov.session.phone || ov.session.status}</span></div>)}
                  {f.key==='openwa' && ov?.plugins?.length>0 && (<div className="mt-2 flex flex-wrap gap-1">{ov.plugins.slice(0,6).map((p:any)=>(<span key={p.id} className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-800">{p.name}</span>))}</div>)}
                  {f.key==='erpnext' && ov?.parity && (<div className="mt-1.5 flex items-center justify-between"><span className="text-sm text-brand-navy/60">Parity</span><span className="font-mono text-[13px] font-bold text-blue-800">{ov.parity.syncedCount}/{ov.parity.totalPayments} synced</span></div>)}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-brand-navy/10 pt-3">
                <span className="text-sm font-bold text-brand-navy group-hover:text-brand-gold">Open {f.name} →</span>
                <a href={f.dash} target="_blank" rel="noreferrer" onClick={(e)=> e.stopPropagation()} className="rounded-full border border-brand-navy/15 bg-white px-2.5 py-1 text-[13px] font-bold text-brand-navy hover:border-brand-gold hover:text-brand-gold">Dash ↗</a>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Integrations latency strip */}
      {intData && (
        <section className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
          <h3 className="font-display text-sm font-bold text-brand-navy">Fleet Latency Matrix</h3>
          <p className="mt-0.5 text-[13px] text-brand-navy/40">Parallel probes @ 8000ms · auth failures surface as `auth failed` detail (audit M1)</p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {intData.integrations.map((it:any)=> (
              <div key={it.key} className="flex items-center justify-between rounded-xl border border-brand-navy/10 bg-brand-navy/[0.04] px-3.5 py-2.5 text-xs">
                <span className="flex items-center gap-2 font-semibold text-brand-navy"><span className={`h-1.5 w-1.5 rounded-full ${it.state==='live'?'bg-emerald-500': it.state==='down'?'bg-rose-500':'bg-brand-navy/20'}`} />{it.name}</span>
                <span className="flex items-center gap-2">
                  {it.latencyMs!=null && <span className="font-mono text-xs text-brand-navy/50">{it.latencyMs}ms</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${it.state==='live'?'bg-emerald-500/15 text-emerald-700': it.state==='down'?'bg-rose-500/15 text-rose-700':'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{it.state}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FleetAppDetail({ item, fleet, onBack }: { item?: FleetItem; fleet: FleetItem[]; onBack: ()=>void }) {
  const key = item?.key || (fleet[0]?.key ?? 'openwa');
  const def = item || fleet.find(f=>f.key===key);
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview'|'actions'|'activity'>('overview');
  const [waPhone,setWaPhone]=useState('+91'); const [waText,setWaText]=useState('Hello from Fleet Console — realtime test'); const [waHumanize,setWaHumanize]=useState(false);
  const [email,setEmail]=useState(''); const [kind,setKind]=useState('verify');

  const { data: appData } = useQuery<{ overview:any }>({
    queryKey:['fleetApp', key],
    queryFn: async()=>{ const r=await fetch('/api/infrastructure/docker-overview',{credentials:'include'}); if(!r.ok) throw new Error('overview'); const j=await r.json(); return { overview: j.overview[key] }; },
    refetchInterval: 10_000,
  });

  useEffect(()=>{
    const c=createSyncClient({ plane:'staff', channels:[`staff:global:infra:${key}`,'staff:global:infra'], enabled:(import.meta as any).env?.VITE_SYNC_ENABLED!=='false', onEvent:()=> qc.invalidateQueries({queryKey:['fleetApp', key]}) });
    c.connect(); return ()=>{ try{(c as any).disconnect?.();}catch{} };
  },[key, qc]);

  const fleetAction = useMutation({
    mutationFn: async (payload:any)=>{
      const res=await fetch(`/api/infrastructure/fleet/${key}/action`,{
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Idempotency-Key': crypto.randomUUID() },
        credentials:'include',
        body: JSON.stringify(payload)
      });
      const j=await res.json().catch(()=>({})); if(!res.ok) throw new Error(j.error || 'action failed'); return j;
    },
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['fleetApp', key]}); qc.invalidateQueries({queryKey:['fleetMap']}); },
  });

  if(!def) return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-sm text-rose-700">
      Unknown fleet app <code className="font-mono">{key}</code> — <button onClick={onBack} className="underline font-bold">Back to Fleet</button>
    </div>
  );

  const ov:any = appData?.overview;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-full border border-brand-navy/15 bg-white px-3 py-1.5 text-xs font-bold text-brand-navy hover:border-brand-gold">← Fleet</button>
        <span className="text-xs text-brand-navy/40">/ {def.host}</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-[13px] font-bold uppercase ${badge(ov?.state || def.state)}`}>{ov?.state || def.state}</span>
        <span className="ml-auto rounded-full bg-brand-navy/[0.05] px-3 py-1 font-mono text-[13px] text-brand-navy/60">staff:global:infra:{key}</span>
      </div>

      <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-extrabold text-brand-navy">{def.name}</h1>
            <p className="mt-1 text-xs text-brand-navy/60">{def.doc} · <a href={def.dash} target="_blank" rel="noreferrer" className="font-mono text-brand-gold underline">{def.dash}</a> · :{def.port} · {def.kind}</p>
            <p className="mt-2 font-mono text-sm text-brand-navy/50">{def.detail || ov?.details || 'Tunnel-native via *.opusoverseas.com — secrets never leave the Worker'}</p>
          </div>
          <div className="flex gap-2">
            <a href={def.dash} target="_blank" rel="noreferrer" className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white hover:bg-brand-gold hover:text-brand-navy">Open Dashboard ↗</a>
            <button onClick={()=> qc.invalidateQueries({queryKey:['fleetApp', key]})} className="rounded-xl border border-brand-navy/15 bg-white px-4 py-2 text-xs font-bold text-brand-navy hover:border-brand-gold">↻ Refresh</button>
          </div>
        </div>

        <div className="mt-4 flex gap-1 rounded-full border border-brand-navy/10 bg-brand-navy/[0.04] p-1 w-fit text-sm font-bold">
          {(['overview','actions','activity'] as const).map(t=> (
            <button key={t} onClick={()=> setTab(t)} className={`rounded-full px-3 py-1.5 capitalize transition-all cursor-pointer ${tab===t?'bg-brand-navy text-white shadow':'text-brand-navy/60 hover:text-brand-navy'}`}>{t}</button>
          ))}
        </div>

        {tab==='overview' && (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-4">
              <div className="text-sm font-bold uppercase tracking-wider text-brand-navy/50">Connection</div>
              <div className="mt-2 space-y-2 text-xs font-mono">
                <div className="flex justify-between"><span className="text-brand-navy/60">Host</span><span className="font-bold text-brand-navy">{def.host}</span></div>
                <div className="flex justify-between"><span className="text-brand-navy/60">Tunnel</span><span className="font-bold text-emerald-700">CF 6f1a97cc… hyd03 QUIC</span></div>
                <div className="flex justify-between"><span className="text-brand-navy/60">Env</span><span className="font-bold text-brand-navy">{def.envKey}</span></div>
                <div className="flex justify-between"><span className="text-brand-navy/60">State</span><span className={`rounded-full px-2 py-0.5 text-[13px] font-bold ${badge(ov?.state || def.state)}`}>{ov?.state || def.state}</span></div>
              </div>
            </div>
            <div className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-4">
              <div className="text-sm font-bold uppercase tracking-wider text-brand-navy/50">Fleet Fact</div>
              <pre className="mt-2 overflow-auto rounded-lg bg-brand-navy p-3 font-mono text-sm leading-relaxed text-emerald-100">{JSON.stringify(ov || { state: def.state, detail: def.doc }, null, 2)}</pre>
            </div>
          </div>
        )}

        {tab==='actions' && (
          <div className="mt-6 space-y-4">
            {key==='openwa' && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                <div className="text-xs font-bold text-emerald-900">OpenWA — Send Test WhatsApp (hardened: humanize false by default)</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input value={waPhone} onChange={e=> setWaPhone(e.target.value)} placeholder="+919876543210" className="rounded-xl border border-brand-navy/15 px-3 py-2 font-mono text-sm" />
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={waHumanize} onChange={e=> setWaHumanize(e.target.checked)} /> humanize (queued, non-blocking)</label>
                </div>
                <textarea value={waText} onChange={e=> setWaText(e.target.value)} rows={3} className="mt-3 w-full rounded-xl border border-brand-navy/15 px-3 py-2 text-xs" />
                <button disabled={fleetAction.isPending} onClick={()=> fleetAction.mutate({ action:'test_send', to: waPhone, text: waText, humanize: waHumanize })} className="mt-3 rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {fleetAction.isPending ? 'Sending…' : 'Dispatch via Fleet Proxy (Idempotency-Key)'}
                </button>
                {fleetAction.data && <pre className="mt-2 overflow-auto rounded-lg bg-white p-2 font-mono text-[13px] leading-relaxed">{JSON.stringify(fleetAction.data, null, 2)}</pre>}
              </div>
            )}
            {key==='listmonk' && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                <div className="text-xs font-bold text-amber-900">Listmonk — Send Test Email</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input value={email} onChange={e=> setEmail(e.target.value)} placeholder="applicant@example.com" className="flex-1 min-w-[220px] rounded-xl border border-brand-navy/15 px-3 py-2 font-mono text-sm" />
                  <select value={kind} onChange={e=> setKind(e.target.value)} className="rounded-xl border border-brand-navy/15 px-3 py-2 text-xs font-bold">
                    <option value="verify">15 Verify</option><option value="otp">17 OTP</option><option value="paymentReceipt">18 Receipt</option><option value="agreementInvite">19 Invite</option>
                  </select>
                  <button disabled={fleetAction.isPending || !email} onClick={()=> fleetAction.mutate({ action:'test_email', email, kind })} className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Send</button>
                </div>
                {fleetAction.data && <pre className="mt-2 overflow-auto rounded-lg bg-white p-2 font-mono text-[13px]">{JSON.stringify(fleetAction.data, null, 2)}</pre>}
              </div>
            )}
            {key==='erpnext' && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4 flex flex-wrap gap-2">
                <button disabled={fleetAction.isPending} onClick={()=> fleetAction.mutate({ action:'reconcile' })} className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{fleetAction.isPending?'Syncing…':'Reconcile (parity)'}</button>
                <button disabled={fleetAction.isPending} onClick={()=> fleetAction.mutate({ action:'sync_pending' })} className="rounded-xl border border-brand-navy/15 bg-white px-4 py-2 text-xs font-bold text-brand-navy">Retry Pending (bounded)</button>
                {fleetAction.data && <pre className="w-full mt-2 overflow-auto rounded-lg bg-white p-2 font-mono text-[13px]">{JSON.stringify(fleetAction.data, null, 2)}</pre>}
              </div>
            )}
            {key==='indiapost' && (
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4">
                <div className="text-xs font-bold text-cyan-900">India Post DNK — Book Shipment (stub credit path, Idempotent)</div>
                <button disabled={fleetAction.isPending} onClick={()=> fleetAction.mutate({ action:'book', payload:{ pincode:'110001', weight_gm: 250 } })} className="mt-3 rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Book Test Shipment</button>
                {fleetAction.data && <pre className="mt-2 overflow-auto rounded-lg bg-white p-2 font-mono text-[13px]">{JSON.stringify(fleetAction.data, null, 2)}</pre>}
              </div>
            )}
            {!['openwa','listmonk','erpnext','indiapost'].includes(key) && (
              <div className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-4 text-xs">
                <div className="font-bold text-brand-navy">Actions for {def.name}</div>
                <p className="mt-1 text-brand-navy/60">Open the native dashboard (secrets stay in Worker). Mutating actions are gated per-app and publish to <code className="font-mono text-brand-navy">staff:global:infra:{key}</code>.</p>
                <button onClick={()=> fleetAction.mutate({ action:'open' })} className="mt-3 rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Emit Open Event (realtime)</button>
                {fleetAction.data && <pre className="mt-2 overflow-auto rounded-lg bg-white p-2 font-mono text-[13px]">{JSON.stringify(fleetAction.data, null, 2)}</pre>}
              </div>
            )}
            <p className="text-[13px] text-brand-navy/40">All fleet POSTs carry <code className="font-mono">Idempotency-Key: crypto.randomUUID()</code> and publish <code className="font-mono">staff:global:infra</code> + <code className="font-mono">staff:global:infra:{key}</code> (fleet audit H1/L2).</p>
          </div>
        )}

        {tab==='activity' && (
          <div className="mt-6 rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-4 text-xs">
            <div className="font-bold text-brand-navy">Realtime</div>
            <p className="mt-1 text-brand-navy/60">Subscribed to <code className="font-mono">staff:global:infra</code> + <code className="font-mono">staff:global:infra:{key}</code> — any fleet action invalidates Fleet Console instantly (no poll lag).</p>
            <p className="mt-2 font-mono text-[13px] text-brand-navy/40">KV-cached docker-overview (30s) · RBAC super_admin · never trusts browser URLs.</p>
          </div>
        )}
      </div>
    </div>
  );
}
