import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';
const API = (import.meta as any).env?.VITE_API_URL || '';

const DIV_LABELS: Record<string, string> = {
  'study-abroad': 'Study Abroad',
  visa: 'Visa Prep & Filing',
  umrah: 'Umrah Pilgrimage',
  attestation: 'Document Attestation',
  manpower: 'Overseas Manpower',
  general: 'General / All Divisions',
};

const DIV_COLORS: Record<string, string> = {
  'study-abroad': 'bg-blue-500/10 text-blue-700 border-blue-200',
  visa: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  umrah: 'bg-amber-500/10 text-amber-800 border-amber-200',
  attestation: 'bg-purple-500/10 text-purple-700 border-purple-200',
  manpower: 'bg-rose-500/10 text-rose-700 border-rose-200',
  general: 'bg-slate-500/10 text-slate-700 border-slate-200',
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 border border-slate-200',
    sent: 'bg-blue-50 text-blue-700 border border-blue-200',
    signed: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    active: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    terminated: 'bg-rose-50 text-rose-600 border border-rose-200',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-sm font-bold uppercase tracking-wider ${map[status] || 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
}

export default function AgreementsTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const qc = useQueryClient();
  const [view, setView] = useState<'agreements' | 'templates' | 'clauses'>('agreements');
  const [agrForm, setAgrForm] = useState({ clientId: '', templateId: '' });
  const [selectedAgreement, setSelectedAgreement] = useState<any | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [dispatchingAgreement, setDispatchingAgreement] = useState<any | null>(null);
  const [dispatchChannel, setDispatchChannel] = useState<'all' | 'whatsapp' | 'chatwoot' | 'email'>('all');
  const [dispatchNote, setDispatchNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState('all');

  // Custom template form state
  const [tplForm, setTplForm] = useState({ name: '', division: 'study-abroad', clauses: [] as string[] });
  const [showCreateTplModal, setShowCreateTplModal] = useState(false);

  const { data: agreementsData, isLoading: loadingAgreements } = useQuery<any>({
    queryKey: ['agreements'],
    queryFn: async () => (await fetch(`${API}/api/agreements`, { credentials: 'include' })).json(),
  });

  const { data: templatesData } = useQuery<any>({
    queryKey: ['agreementTemplates'],
    queryFn: async () => (await fetch(`${API}/api/agreements/templates`, { credentials: 'include' })).json(),
  });

  const { data: clausesData } = useQuery<any>({
    queryKey: ['clauseLibrary'],
    queryFn: async () => (await fetch(`${API}/api/agreements/clauses`, { credentials: 'include' })).json(),
  });

  const { data: clientsData } = useQuery<any>({
    queryKey: ['clientsList'],
    queryFn: async () => (await fetch(`${API}/api/clients`, { credentials: 'include' })).json(),
  });

  const agreements = agreementsData?.agreements || [];
  const templates = templatesData?.templates || [];
  const clauses = clausesData?.clauses || [];
  const clients = clientsData?.clients || clientsData?.data || [];

  const dispatchAgr = useMutation({
    mutationFn: async () => {
      if (!dispatchingAgreement) return;
      const r = await fetch(`${API}/api/agreements/${dispatchingAgreement.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: dispatchChannel,
          note: dispatchNote.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to dispatch agreement');
      }
      return r.json();
    },
    onSuccess: (d) => {
      alert(d.message || 'Agreement dispatched successfully to client!');
      setDispatchingAgreement(null);
      setDispatchNote('');
      qc.invalidateQueries({ queryKey: ['agreements'] });
    },
    onError: (err: any) => alert(err.message || 'Dispatch failed'),
  });

  const createAgr = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/agreements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agrForm),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create agreement');
      }
      return r.json();
    },
    onSuccess: (d) => {
      alert(d.message || 'Agreement draft created successfully! Link dispatched to client.');
      setAgrForm({ clientId: '', templateId: '' });
      qc.invalidateQueries({ queryKey: ['agreements'] });
    },
    onError: (err: any) => alert(err.message || 'Agreement creation failed'),
  });

  const signAgr = useMutation({
    mutationFn: async ({ id, method }: { id: string; method: string }) => {
      const r = await fetch(`${API}/api/agreements/${id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ esignMethod: method }),
      });
      if (!r.ok) throw new Error('Sign failed');
      return r.json();
    },
    onSuccess: (d) => {
      alert(d.message || 'Agreement successfully signed and timestamped with SHA-256 checksum!');
      if (selectedAgreement) setSelectedAgreement(null);
      qc.invalidateQueries({ queryKey: ['agreements'] });
      qc.invalidateQueries({ queryKey: ['clientsList'] });
    },
    onError: () => alert('Signature capture failed'),
  });

  const createTpl = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/agreements/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tplForm.name,
          division: tplForm.division,
          clausesJson: JSON.stringify(tplForm.clauses),
        }),
      });
      if (!r.ok) throw new Error('Template creation failed');
      return r.json();
    },
    onSuccess: () => {
      alert('New template created successfully!');
      setShowCreateTplModal(false);
      setTplForm({ name: '', division: 'study-abroad', clauses: [] });
      qc.invalidateQueries({ queryKey: ['agreementTemplates'] });
    },
    onError: () => alert('Template creation failed'),
  });

  const clauseMap = useMemo(() => {
    const map = new Map<string, any>();
    clauses.forEach((c: any) => map.set(c.clauseId, c));
    return map;
  }, [clauses]);

  const clientMap = useMemo(() => {
    const map = new Map<string, any>();
    clients.forEach((c: any) => map.set(c.id, c));
    return map;
  }, [clients]);

  const templateMap = useMemo(() => {
    const map = new Map<string, any>();
    templates.forEach((t: any) => map.set(t.id, t));
    return map;
  }, [templates]);

  const filteredAgreements = useMemo(() => {
    return agreements.filter((a: any) => {
      const client = clientMap.get(a.clientId);
      const template = templateMap.get(a.templateId);
      if (selectedDivisionFilter !== 'all') {
        if (template && template.division !== selectedDivisionFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const clientName = (client?.name || '').toLowerCase();
        const tplName = (template?.name || '').toLowerCase();
        return clientName.includes(q) || tplName.includes(q) || a.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [agreements, clientMap, templateMap, selectedDivisionFilter, searchQuery]);

  return (
    <div ref={rootRef} className="space-y-8 max-w-7xl mx-auto">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">
              Digital Contracts & Governance
            </span>
          </div>
          <h2 className="font-display font-bold text-xl sm:text-2xl text-brand-navy mt-1">
            Client Service Agreements & Master Templates
          </h2>
          <p className="text-xs text-brand-navy/60 mt-0.5">
            Legally binding corporate contracts with DPDP 2023 compliance, Aadhaar/OTP e-Signatures, and SHA-256 evidentiary hash chains.
          </p>
        </div>

        <div className="flex gap-1.5 rounded-2xl border border-brand-navy/15 bg-white p-1.5 shadow-xs text-xs font-bold uppercase">
          <button
            onClick={() => setView('agreements')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              view === 'agreements' ? 'bg-brand-gold text-brand-navy font-black shadow-xs' : 'text-brand-navy/60 hover:text-brand-navy'
            }`}
          >
            <span>📜</span>
            <span>All Agreements ({agreements.length})</span>
          </button>
          <button
            onClick={() => setView('templates')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              view === 'templates' ? 'bg-brand-gold text-brand-navy font-black shadow-xs' : 'text-brand-navy/60 hover:text-brand-navy'
            }`}
          >
            <span>📑</span>
            <span>Templates ({templates.length})</span>
          </button>
          <button
            onClick={() => setView('clauses')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              view === 'clauses' ? 'bg-brand-gold text-brand-navy font-black shadow-xs' : 'text-brand-navy/60 hover:text-brand-navy'
            }`}
          >
            <span>⚖️</span>
            <span>Clause Library ({clauses.length})</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: ALL AGREEMENTS & CREATION DESK */}
      {view === 'agreements' && (
        <div className="space-y-6">
          {/* CREATE AGREEMENT BAR */}
          <div className="rounded-3xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-gold" />
                <h3 className="font-display font-bold text-base text-brand-navy">
                  Generate New Service Agreement
                </h3>
              </div>
              <span className="text-sm text-brand-navy/50 font-medium">
                Auto-assembles verified legal clauses from chosen division template
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2">
              <div className="sm:col-span-5">
                <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">
                  1. Select Client
                </label>
                <select
                  value={agrForm.clientId}
                  onChange={(e) => setAgrForm({ ...agrForm, clientId: e.target.value })}
                  className="w-full bg-brand-navy/[0.02] border border-brand-navy/15 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-brand-navy focus:outline-none focus:border-brand-gold cursor-pointer"
                >
                  <option value="">Choose client profile…</option>
                  {clients.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || c.email || c.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">
                  2. Select Master Contract Template
                </label>
                <select
                  value={agrForm.templateId}
                  onChange={(e) => setAgrForm({ ...agrForm, templateId: e.target.value })}
                  className="w-full bg-brand-navy/[0.02] border border-brand-navy/15 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-brand-navy focus:outline-none focus:border-brand-gold cursor-pointer"
                >
                  <option value="">Choose template…</option>
                  {templates.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({DIV_LABELS[t.division] || t.division})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={() => createAgr.mutate()}
                  disabled={!agrForm.clientId || !agrForm.templateId || createAgr.isPending}
                  className="w-full bg-brand-gold hover:bg-brand-gold/90 text-brand-navy font-black text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl disabled:opacity-40 transition-all cursor-pointer shadow-xs h-[38px] flex items-center justify-center gap-1.5"
                >
                  {createAgr.isPending ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </div>
          </div>

          {/* FILTERS & SEARCH */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-navy/[0.02] border border-brand-navy/10 rounded-2xl p-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <span className="text-sm">🔍</span>
              <input
                type="text"
                placeholder="Search agreements by client name, contract ID, or template..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-brand-navy placeholder:text-brand-navy/40 focus:outline-none font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-xs text-brand-navy/40 hover:text-brand-navy font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-sm font-bold text-brand-navy/50 uppercase tracking-wider mr-1">
                Division:
              </span>
              {['all', 'study-abroad', 'visa', 'umrah', 'attestation', 'manpower'].map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDivisionFilter(d)}
                  className={`px-2.5 py-1 rounded-lg text-sm font-bold transition cursor-pointer ${
                    selectedDivisionFilter === d
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'bg-white text-brand-navy/60 hover:text-brand-navy border border-brand-navy/10'
                  }`}
                >
                  {d === 'all' ? 'All' : DIV_LABELS[d] || d}
                </button>
              ))}
            </div>
          </div>

          {/* AGREEMENTS LIST */}
          <div className="rounded-3xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <h3 className="font-display font-bold text-base text-brand-navy">
                Active Agreement Records ({filteredAgreements.length})
              </h3>
              <span className="text-xs text-brand-navy/40 font-mono">
                Real-time D1 Records
              </span>
            </div>

            {loadingAgreements ? (
              <div className="py-12 text-center text-xs text-brand-navy/40 animate-pulse">
                Loading agreements from database…
              </div>
            ) : filteredAgreements.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <div className="text-3xl">📜</div>
                <div className="font-bold text-sm text-brand-navy">No agreements found</div>
                <div className="text-xs text-brand-navy/50 max-w-sm mx-auto">
                  Select a client and master template above to draft a legally binding contract.
                </div>
              </div>
            ) : (
              <div className="divide-y divide-brand-navy/5">
                {filteredAgreements.map((a: any) => {
                  const client = clientMap.get(a.clientId);
                  const template = templateMap.get(a.templateId);
                  const isSigned = a.status === 'signed';

                  return (
                    <div
                      key={a.id}
                      className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-brand-navy/[0.01] transition rounded-2xl px-3"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display font-bold text-sm text-brand-navy">
                            {client ? client.name : `Client UID: ${a.clientId}`}
                          </span>
                          {template && (
                            <span
                              className={`px-2 py-0.5 rounded text-[13px] font-bold border ${
                                DIV_COLORS[template.division] || 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {DIV_LABELS[template.division] || template.division}
                            </span>
                          )}
                          <span className="text-sm font-mono text-brand-navy/40">
                            #{a.id.slice(0, 8)}
                          </span>
                        </div>

                        <div className="text-xs text-brand-navy/60 flex items-center gap-3 flex-wrap">
                          <span>
                            Template: <strong>{template?.name || a.templateId}</strong>
                          </span>
                          <span>•</span>
                          <span>Created {new Date(a.createdAt * 1000).toLocaleDateString()}</span>
                          {isSigned && a.signedAt && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-bold">
                                Signed {new Date(a.signedAt * 1000).toLocaleDateString()} ({a.esignMethod})
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={a.status} />

                        <button
                          type="button"
                          onClick={() => setSelectedAgreement(a)}
                          className="px-3 py-1.5 rounded-xl border border-brand-navy/15 bg-white hover:bg-brand-navy/[0.06] text-brand-navy text-xs font-bold transition cursor-pointer flex items-center gap-1"
                        >
                          <span>👁️</span>
                          <span>View</span>
                        </button>

                        {!isSigned && (
                          <button
                            type="button"
                            onClick={() => {
                              setDispatchingAgreement(a);
                              setDispatchChannel('all');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5"
                          >
                            <span>📤</span>
                            <span>Send to Client</span>
                          </button>
                        )}

                        <a
                          href={`/sign/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl border border-brand-gold bg-brand-gold/10 hover:bg-brand-gold/20 text-brand-navy text-xs font-bold transition cursor-pointer flex items-center gap-1"
                        >
                          <span>✍️</span>
                          <span>{isSigned ? 'Certificate' : 'e-Sign'}</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            const signUrl = `${window.location.origin}/sign/${a.id}`;
                            navigator.clipboard.writeText(signUrl);
                            alert(`Sign link copied: ${signUrl}`);
                          }}
                          title="Copy Sign Link"
                          className="px-2.5 py-1.5 rounded-xl border border-brand-navy/15 bg-white hover:bg-brand-navy/[0.06] text-brand-navy text-xs font-bold transition cursor-pointer"
                        >
                          🔗
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: TEMPLATES DIRECTORY */}
      {view === 'templates' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-brand-navy/10 rounded-3xl p-6 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-gold" />
                <h3 className="font-display font-bold text-base text-brand-navy">
                  Master Service Contract Templates ({templates.length})
                </h3>
              </div>
              <p className="text-xs text-brand-navy/60 mt-0.5">
                Standard corporate contracts drafted for each business division with DPDP 2023 compliance & Telangana jurisdiction.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateTplModal(true)}
              className="bg-brand-navy hover:bg-brand-navy/90 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer shadow-xs"
            >
              + Create Custom Template
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((t: any) => {
              const clauseIds: string[] = JSON.parse(t.clausesJson || '[]');
              return (
                <div
                  key={t.id}
                  className="rounded-3xl border border-brand-navy/10 bg-white p-6 shadow-sm flex flex-col justify-between gap-5 hover:border-brand-gold/50 transition duration-200"
                >
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[13px] font-bold border ${
                          DIV_COLORS[t.division] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {DIV_LABELS[t.division] || t.division}
                      </span>
                      <span className="text-[13px] font-mono text-brand-navy/40">v{t.version}</span>
                    </div>

                    <h4 className="font-display font-bold text-base text-brand-navy leading-snug">
                      {t.name}
                    </h4>

                    <div className="space-y-2">
                      <div className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/50">
                        Included Legal Articles ({clauseIds.length}):
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {clauseIds.map((cid) => {
                          const matched = clauseMap.get(cid);
                          return (
                            <div
                              key={cid}
                              className="px-2.5 py-1.5 rounded-lg bg-brand-navy/[0.02] border border-brand-navy/10 flex items-center justify-between gap-2"
                            >
                              <span className="text-sm font-semibold text-brand-navy truncate">
                                {matched ? matched.title : cid}
                              </span>
                              {matched?.mandatory && (
                                <span className="text-sm font-bold text-rose-600 bg-rose-50 px-1 py-0.2 rounded uppercase">
                                  Req
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-brand-navy/10 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTemplate(t)}
                      className="px-3.5 py-1.5 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.03] hover:bg-brand-navy/[0.08] text-brand-navy text-xs font-bold cursor-pointer transition flex items-center gap-1"
                    >
                      <span>👁️</span>
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAgrForm({ ...agrForm, templateId: t.id });
                        setView('agreements');
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-xs font-bold cursor-pointer transition shadow-xs flex items-center gap-1"
                    >
                      <span>Use Template</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: CLAUSE LIBRARY */}
      {view === 'clauses' && (
        <div className="space-y-6">
          <div className="bg-white border border-brand-navy/10 rounded-3xl p-6 shadow-sm">
            <h3 className="font-display font-bold text-base text-brand-navy">
              Standard Legal Clause Library ({clauses.length})
            </h3>
            <p className="text-xs text-brand-navy/60 mt-0.5">
              Statutory legal terms including DPDP 2023 privacy consents, GST 18% statutory billing terms, and Hyderabad court jurisdiction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clauses.map((c: any) => (
              <div
                key={c.id}
                className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-xs space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-brand-navy text-sm">{c.title}</span>
                    {c.mandatory && (
                      <span className="px-2 py-0.5 rounded text-xs font-black uppercase bg-rose-500/10 text-rose-700 border border-rose-200">
                        Mandatory
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold border ${
                      DIV_COLORS[c.division] || 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {DIV_LABELS[c.division] || c.division}
                  </span>
                </div>

                <div className="text-[13px] font-mono text-brand-navy/50">Clause ID: {c.clauseId}</div>

                <p className="text-xs text-brand-navy/70 leading-relaxed bg-brand-navy/[0.02] p-3 rounded-xl border border-brand-navy/5 whitespace-pre-line font-serif">
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: VIEW FULL AGREEMENT */}
      {selectedAgreement && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-brand-navy/15 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-brand-navy/10 flex items-center justify-between bg-brand-navy/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-gold/20 border border-brand-gold/40 flex items-center justify-center text-lg shadow-xs">
                  📜
                </div>
                <div>
                  <h3 className="font-display font-bold text-brand-navy text-lg">
                    Client Service Agreement Document
                  </h3>
                  <p className="text-xs text-brand-navy/60">
                    Client: <strong>{clientMap.get(selectedAgreement.clientId)?.name}</strong> · ID:{' '}
                    <span className="font-mono">{selectedAgreement.id}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgreement(null)}
                className="w-8 h-8 rounded-full border border-brand-navy/20 flex items-center justify-center text-brand-navy/60 hover:text-brand-navy cursor-pointer font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="p-8 overflow-y-auto font-serif text-xs text-brand-navy/85 leading-relaxed space-y-4 whitespace-pre-line bg-amber-500/[0.01]">
              <div className="border border-brand-navy/15 bg-white p-6 rounded-2xl shadow-xs">
                {selectedAgreement.content}
              </div>
            </div>

            <div className="p-4 bg-brand-navy/[0.03] border-t border-brand-navy/10 flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <div className="font-mono text-[13px] text-brand-navy/60">
                  Status: <strong>{selectedAgreement.status.toUpperCase()}</strong>
                </div>
                {selectedAgreement.sha256Hash && (
                  <div className="font-mono text-xs text-brand-navy/40 truncate max-w-xs">
                    Hash: {selectedAgreement.sha256Hash}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedAgreement.content);
                    alert('Agreement text copied to clipboard!');
                  }}
                  className="px-3 py-1.5 rounded-xl border border-brand-navy/15 bg-white text-brand-navy text-xs font-bold cursor-pointer hover:bg-brand-navy/5"
                >
                  📋 Copy Text
                </button>
                {selectedAgreement.status !== 'signed' && (
                  <button
                    type="button"
                    onClick={() => signAgr.mutate({ id: selectedAgreement.id, method: 'otp' })}
                    className="px-4 py-1.5 rounded-xl bg-brand-gold text-brand-navy text-xs font-bold cursor-pointer shadow-xs hover:bg-brand-gold/90"
                  >
                    ✍️ Sign (Email OTP)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VIEW / PREVIEW MASTER TEMPLATE */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-brand-navy/15 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-brand-navy/10 flex items-center justify-between bg-brand-navy/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-navy text-brand-gold flex items-center justify-center text-lg font-bold shadow-xs">
                  🏛️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-brand-navy text-lg">
                      {selectedTemplate.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded text-[13px] font-bold border ${
                        DIV_COLORS[selectedTemplate.division] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {DIV_LABELS[selectedTemplate.division] || selectedTemplate.division}
                    </span>
                  </div>
                  <p className="text-xs text-brand-navy/60">
                    Master Contract Specimen · Template ID: <span className="font-mono">{selectedTemplate.id}</span> · Version: {selectedTemplate.version}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="w-8 h-8 rounded-full border border-brand-navy/20 flex items-center justify-center text-brand-navy/60 hover:text-brand-navy cursor-pointer font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* DOCUMENT BODY */}
            <div className="p-8 overflow-y-auto font-serif text-xs text-brand-navy/85 leading-relaxed space-y-6 bg-slate-50/50">
              <div className="border border-brand-navy/15 bg-white p-8 rounded-2xl shadow-sm space-y-6">
                {/* LETTERHEAD */}
                <div className="text-center border-b-2 border-brand-navy/20 pb-5 space-y-1">
                  <div className="text-sm font-mono tracking-[0.2em] font-bold uppercase text-brand-gold">
                    OPUS OVERSEAS
                  </div>
                  <h1 className="font-display font-black text-base uppercase tracking-wider text-brand-navy">
                    OPUS OVERSEAS EDUCATIONAL & IMMIGRATION SERVICES PVT. LTD.
                  </h1>
                  <p className="text-[13px] text-brand-navy/60 font-sans">
                    Corporate Registered Office: Hyderabad, Telangana, India | GSTIN: 36ALPPH3337R1ZE | State Code: 36
                  </p>
                </div>

                {/* CONTRACT TITLE */}
                <div className="text-center space-y-1">
                  <h2 className="font-display font-bold text-sm uppercase tracking-widest text-brand-navy underline decoration-brand-gold decoration-2 underline-offset-4">
                    {selectedTemplate.name.toUpperCase()}
                  </h2>
                  <div className="text-[13px] font-sans text-brand-navy/50">
                    Governed under the Arbitration and Conciliation Act, 1996 & DPDP Act, 2023
                  </div>
                </div>

                {/* RECITALS & PREAMBLE */}
                <div className="space-y-2 text-sm leading-relaxed border-b border-brand-navy/10 pb-4">
                  <p>
                    <strong>THIS SERVICE AGREEMENT</strong> is entered into as of the Effective Date, by and between:
                  </p>
                  <p className="pl-3 border-l-2 border-brand-gold">
                    <strong>FIRST PARTY (SERVICE PROVIDER):</strong> M/s Opus Overseas Educational & Immigration Services Pvt. Ltd., having its corporate office in Hyderabad, Telangana (hereinafter referred to as "Opus Overseas").
                  </p>
                  <p className="pl-3 border-l-2 border-brand-navy/30">
                    <strong>SECOND PARTY (CLIENT / APPLICANT):</strong> [Client Full Legal Name], Passport No: [PASSPORT_NO], UID: [CLIENT_UID] (hereinafter referred to as the "Client").
                  </p>
                  <p className="pt-2 italic text-brand-navy/70">
                    WHEREAS Opus Overseas provides professional advisory and processing services for {DIV_LABELS[selectedTemplate.division] || selectedTemplate.division}, and the Client desires to retain Opus Overseas on the following statutory terms and covenants:
                  </p>
                </div>

                {/* ASSEMBLED ARTICLES */}
                <div className="space-y-5">
                  {JSON.parse(selectedTemplate.clausesJson || '[]').map((cid: string, idx: number) => {
                    const clause = clauseMap.get(cid);
                    return (
                      <div key={cid} className="space-y-1.5">
                        <div className="font-sans font-bold text-xs text-brand-navy uppercase flex items-center justify-between border-b border-brand-navy/10 pb-1">
                          <span>{clause?.title || `Article ${idx + 1}: ${cid}`}</span>
                          <span className="text-xs font-mono text-brand-navy/40 font-normal">
                            Code: {cid}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-brand-navy/80 pl-2 whitespace-pre-line">
                          {clause?.body || 'Legal text loaded from statutory clause registry.'}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* SIGNATURE BLOCK */}
                <div className="pt-6 border-t-2 border-brand-navy/20 grid grid-cols-2 gap-8 text-sm">
                  <div className="space-y-8">
                    <p className="font-bold text-brand-navy">FOR FIRST PARTY (OPUS OVERSEAS):</p>
                    <div className="border-t border-brand-navy/40 pt-1 space-y-0.5">
                      <p className="font-bold">Authorized Signatory</p>
                      <p className="text-[13px] text-brand-navy/60">Opus Overseas Legal Operations</p>
                    </div>
                  </div>
                  <div className="space-y-8">
                    <p className="font-bold text-brand-navy">FOR SECOND PARTY (CLIENT):</p>
                    <div className="border-t border-brand-navy/40 pt-1 space-y-0.5">
                      <p className="font-bold">[Client Signature / Aadhaar e-Sign]</p>
                      <p className="text-[13px] text-brand-navy/60">Date & Evidentiary Timestamp</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="p-4 bg-brand-navy/[0.03] border-t border-brand-navy/10 flex items-center justify-between text-xs">
              <div className="text-sm text-brand-navy/60 font-medium">
                {JSON.parse(selectedTemplate.clausesJson || '[]').length} legal articles compiled
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const clauseIds = JSON.parse(selectedTemplate.clausesJson || '[]');
                    let text = `MASTER TEMPLATE: ${selectedTemplate.name.toUpperCase()}\n\n`;
                    clauseIds.forEach((cid: string) => {
                      const c = clauseMap.get(cid);
                      if (c) text += `${c.title}\n${c.body}\n\n`;
                    });
                    navigator.clipboard.writeText(text);
                    alert('Master template terms copied to clipboard!');
                  }}
                  className="px-3.5 py-1.5 rounded-xl border border-brand-navy/15 bg-white text-brand-navy text-xs font-bold cursor-pointer hover:bg-brand-navy/5"
                >
                  📋 Copy Text
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAgrForm({ ...agrForm, templateId: selectedTemplate.id });
                    setSelectedTemplate(null);
                    setView('agreements');
                  }}
                  className="px-4 py-1.5 rounded-xl bg-brand-gold text-brand-navy text-xs font-bold cursor-pointer shadow-xs hover:bg-brand-gold/90 flex items-center gap-1"
                >
                  <span>🚀 Use in Agreement</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CREATE CUSTOM TEMPLATE */}
      {showCreateTplModal && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-brand-navy/15 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <h3 className="font-display font-bold text-brand-navy text-lg">Create Custom Template</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-brand-navy/70 mb-1">Template Name</label>
                <input
                  type="text"
                  value={tplForm.name}
                  onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })}
                  placeholder="e.g. VIP Concierge Study Abroad Agreement"
                  className="w-full bg-brand-navy/[0.02] border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy outline-none focus:border-brand-gold"
                />
              </div>

              <div>
                <label className="block font-bold text-brand-navy/70 mb-1">Division</label>
                <select
                  value={tplForm.division}
                  onChange={(e) => setTplForm({ ...tplForm, division: e.target.value })}
                  className="w-full bg-brand-navy/[0.02] border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy outline-none cursor-pointer"
                >
                  {Object.entries(DIV_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-brand-navy/70 mb-1">Select Clauses to Include</label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-brand-navy/10 rounded-xl p-3 bg-brand-navy/[0.02]">
                  {clauses.map((c: any) => {
                    const isChecked = tplForm.clauses.includes(c.clauseId);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 cursor-pointer text-xs p-1 hover:bg-brand-navy/[0.04] rounded"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTplForm({ ...tplForm, clauses: [...tplForm.clauses, c.clauseId] });
                            } else {
                              setTplForm({ ...tplForm, clauses: tplForm.clauses.filter((id) => id !== c.clauseId) });
                            }
                          }}
                          className="accent-brand-gold"
                        />
                        <span className="font-semibold text-brand-navy">{c.title}</span>
                        <span className="text-[13px] font-mono text-brand-navy/40">({c.clauseId})</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-brand-navy/10 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowCreateTplModal(false)}
                className="px-4 py-2 rounded-xl border border-brand-navy/15 text-brand-navy font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => createTpl.mutate()}
                disabled={!tplForm.name || tplForm.clauses.length === 0}
                className="px-5 py-2 rounded-xl bg-brand-gold text-brand-navy font-bold disabled:opacity-40 cursor-pointer shadow-xs"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DISPATCH AGREEMENT TO CLIENT */}
      {dispatchingAgreement && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-brand-navy/15 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center text-lg shadow-xs">
                  📤
                </div>
                <div>
                  <h3 className="font-display font-bold text-brand-navy text-lg">
                    Send Agreement to Client
                  </h3>
                  <p className="text-xs text-brand-navy/60">
                    Recipient: <strong>{clientMap.get(dispatchingAgreement.clientId)?.name}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDispatchingAgreement(null)}
                className="w-8 h-8 rounded-full border border-brand-navy/20 flex items-center justify-center text-brand-navy/60 hover:text-brand-navy cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* CHANNEL SELECTOR */}
              <div>
                <label className="block font-bold text-brand-navy mb-1.5 uppercase tracking-wider text-[13px]">
                  Select Dispatch Channel:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'all', label: '⚡ Omnichannel', sub: 'WA + Email' },
                    { key: 'whatsapp', label: '🟢 WhatsApp', sub: 'OpenWA' },
                    { key: 'chatwoot', label: '🟣 Chatwoot', sub: 'Live Chat' },
                    { key: 'email', label: '🔵 Email', sub: 'Listmonk' },
                  ].map((ch) => (
                    <button
                      key={ch.key}
                      type="button"
                      onClick={() => setDispatchChannel(ch.key as any)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        dispatchChannel === ch.key
                          ? 'border-brand-navy bg-brand-navy text-white shadow-xs'
                          : 'border-brand-navy/15 bg-white text-brand-navy hover:bg-brand-navy/[0.02]'
                      }`}
                    >
                      <div className="font-bold text-xs">{ch.label}</div>
                      <div className={`text-[13px] ${dispatchChannel === ch.key ? 'text-white/70' : 'text-brand-navy/40'}`}>
                        {ch.sub}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* RECIPIENT DETAILS */}
              <div className="p-3 bg-brand-navy/[0.02] border border-brand-navy/10 rounded-2xl space-y-1 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-navy/50 font-sans">Phone (WhatsApp):</span>
                  <span className="font-bold text-brand-navy">
                    {clientMap.get(dispatchingAgreement.clientId)?.phone || 'Not provided'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-navy/50 font-sans">Email:</span>
                  <span className="font-bold text-brand-navy">
                    {clientMap.get(dispatchingAgreement.clientId)?.email || 'Not provided'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-brand-navy/5">
                  <span className="text-brand-navy/50 font-sans">Sign URL:</span>
                  <span className="text-brand-gold font-bold truncate max-w-[240px]">
                    {window.location.origin}/sign/{dispatchingAgreement.id}
                  </span>
                </div>
              </div>

              {/* CUSTOM NOTE */}
              <div>
                <label className="block font-bold text-brand-navy mb-1 text-sm">
                  Custom Note / Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={dispatchNote}
                  onChange={(e) => setDispatchNote(e.target.value)}
                  placeholder="e.g. Please review and sign before tomorrow 5 PM so we can submit your university application."
                  className="w-full bg-brand-navy/[0.02] border border-brand-navy/15 rounded-xl p-2.5 text-brand-navy outline-none focus:border-brand-gold text-xs resize-none"
                />
              </div>

              {/* MESSAGE PREVIEW */}
              <div className="p-3 bg-emerald-500/[0.04] border border-emerald-500/20 rounded-2xl space-y-1.5">
                <div className="text-[13px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <span>📱 Message Preview</span>
                </div>
                <p className="text-sm text-emerald-950/80 leading-relaxed font-sans">
                  "Action Required: Your service agreement for <strong>{templateMap.get(dispatchingAgreement.templateId)?.name || 'Opus Overseas'}</strong> has been generated and is ready for secure digital signature.
                  {dispatchNote ? ` Note: ${dispatchNote}` : ''}
                  👉 Review & Sign: {window.location.origin}/sign/{dispatchingAgreement.id}"
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-brand-navy/10 flex justify-between items-center text-xs">
              <button
                type="button"
                onClick={() => {
                  const signUrl = `${window.location.origin}/sign/${dispatchingAgreement.id}`;
                  navigator.clipboard.writeText(signUrl);
                  alert(`Sign link copied: ${signUrl}`);
                }}
                className="px-3 py-2 rounded-xl border border-brand-navy/15 text-brand-navy font-semibold hover:bg-brand-navy/5 cursor-pointer"
              >
                📋 Copy Link
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDispatchingAgreement(null)}
                  className="px-4 py-2 rounded-xl border border-brand-navy/15 text-brand-navy font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={dispatchAgr.isPending}
                  onClick={() => dispatchAgr.mutate()}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-40 cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <span>{dispatchAgr.isPending ? 'Sending…' : '🚀 Send Invite'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}