import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';
import { useRevealRoot } from '../lib/reveal';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  primaryDivision: string;
  status: 'active' | 'blocked';
  createdAt: number;
  highestQualification?: string;
  intakeContext?: string;
}

export default function ClientsList() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [, setLocation] = useLocation();
  const { me } = useSession();
  const queryClient = useQueryClient();
  
  // Search & filter states
  const [search, setSearch] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [savedViews, setSavedViews] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('clientSavedViews') || '[]'); } catch { return []; } });
  const [viewName, setViewName] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal control states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [anonymizingClientId, setAnonymizingClientId] = useState<string | null>(null);

  // Form states for manual creation
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addDivision, setAddDivision] = useState('study-abroad');
  const [addQualification, setAddQualification] = useState('undergrad');
  const [addError, setAddError] = useState('');

  // Form states for editing
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editQualification, setEditQualification] = useState('');
  const [editError, setEditError] = useState('');

  // Toast feedback state
  const [toast, setToast] = useState<string | null>(null);
  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Queries
  const { data: clientsData, isLoading } = useQuery<{ clients: Client[] }>({
    queryKey: ['clientsList'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/clients`);
      if (!r.ok) throw new Error('Failed to fetch clients');
      return r.json();
    }
  });

  // Mutations
  const createClientMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      email: string;
      phone: string;
      primaryDivision: string;
      highestQualification: string;
    }) => {
      const r = await fetch(`${API}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create client user');
      }
      return r.json();
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['clientsList'] });
      setIsAddModalOpen(false);
      // Reset form
      setAddName('');
      setAddEmail('');
      setAddPhone('');
      setAddDivision('study-abroad');
      setAddQualification('undergrad');
      setAddError('');
      triggerToast(`Successfully onboarded client user: ${res.client.id}`);
    },
    onError: (err: any) => {
      setAddError(err.message || 'Verification failed. Phone number might be duplicate.');
    }
  });

  const updateClientMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      email: string;
      phone: string;
      highestQualification: string;
    }) => {
      const r = await fetch(`${API}/api/clients/${payload.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name,
          email: payload.email,
          phone: payload.phone,
          highestQualification: payload.highestQualification
        })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update client profile');
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientsList'] });
      setEditingClient(null);
      setEditError('');
      triggerToast('Client profile updated successfully.');
    },
    onError: (err: any) => {
      setEditError(err.message || 'Update failed.');
    }
  });

  const toggleBlockMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'blocked' }) => {
      const r = await fetch(`${API}/api/clients/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error('Failed to update status');
      return r.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clientsList'] });
      triggerToast(`Client status changed to ${variables.status}.`);
    }
  });

  const anonymizeClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${API}/api/compliance/clients/${id}/anonymize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to anonymize client user');
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientsList'] });
      setAnonymizingClientId(null);
      triggerToast('DPDP Anonymization request completed successfully.');
    },
    onError: (err: any) => {
      alert(`Compliance Error: ${err.message}`);
    }
  });

  const list = clientsData?.clients || [];

  // Calculate high-level admin metrics
  const totalProfiles = list.length;
  const activeProfiles = list.filter(c => c.status !== 'blocked').length;
  const suspendedProfiles = list.filter(c => c.status === 'blocked').length;
  const divisionDist = list.reduce((acc, c) => {
    acc[c.primaryDivision] = (acc[c.primaryDivision] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Profile completeness (mirror of the study-abroad desk)
  const completenessOf = (c: any): number => {
    if (!c.intakeContext) return 0;
    try {
      const ctx = JSON.parse(c.intakeContext);
      const checks = [
        !!(ctx.pct10th && ctx.pct12th) || !!ctx.degreeName,
        ctx.cgpa !== undefined && ctx.cgpa !== null && ctx.cgpa !== '',
        (ctx.englishScore !== undefined && ctx.englishScore !== null && ctx.englishScore !== '') || ctx.testPlanned === true,
        !!ctx.targetCountry, !!ctx.targetIntake, !!ctx.preferredCourse,
        ctx.tuitionBudget !== undefined && ctx.tuitionBudget !== null && ctx.tuitionBudget !== '',
        ctx.universitySharingConsent === true,
      ];
      return Math.round((checks.filter(Boolean).length / checks.length) * 100);
    } catch { return 0; }
  };

  const saveView = () => {
    if (!viewName.trim()) return;
    const view = { name: viewName.trim(), search, divisionFilter, statusFilter };
    const views = [...savedViews.filter(v => v !== viewName.trim()), viewName.trim()];
    localStorage.setItem('clientSavedViews', JSON.stringify(views));
    localStorage.setItem(`clientView_${viewName.trim()}`, JSON.stringify(view));
    setSavedViews(views);
    setViewName('');
  };
  const loadView = (name: string) => {
    try {
      const v = JSON.parse(localStorage.getItem(`clientView_${name}`) || '{}');
      if (v.search !== undefined) setSearch(v.search);
      if (v.divisionFilter) setDivisionFilter(v.divisionFilter);
      if (v.statusFilter) setStatusFilter(v.statusFilter);
    } catch { /* ignore */ }
  };
  const deleteView = (name: string) => {
    localStorage.removeItem(`clientView_${name}`);
    const views = savedViews.filter(v => v !== name);
    localStorage.setItem('clientSavedViews', JSON.stringify(views));
    setSavedViews(views);
  };

  const exportCsv = () => {
    const rows = filtered.map(c => [c.id, c.name, c.phone, c.email, c.primaryDivision || '', c.status || '', `${completenessOf(c)}%`]);
    const head = ['ID', 'Name', 'Phone', 'Email', 'Division', 'Status', 'Profile %'];
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `clients-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = list.filter(c => {
    const matchesSearch = (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search) ||
      (c.id || '').toLowerCase().includes(search.toLowerCase());
    
    const matchesDiv = divisionFilter === 'all' || c.primaryDivision === divisionFilter;
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;

    return matchesSearch && matchesDiv && matchesStatus;
  });

  const isSuperAdmin = me?.role === 'super_admin';
  const isEditor = me?.role === 'super_admin' || me?.role === 'manager';

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setEditName(client.name || '');
    setEditEmail(client.email || '');
    setEditPhone(client.phone || '');
    setEditQualification(client.highestQualification || 'undergrad');
    setEditError('');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    createClientMutation.mutate({
      name: addName,
      email: addEmail,
      phone: addPhone,
      primaryDivision: addDivision,
      highestQualification: addQualification
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setEditError('');
    updateClientMutation.mutate({
      id: editingClient.id,
      name: editName,
      email: editEmail,
      phone: editPhone,
      highestQualification: editQualification
    });
  };

  return (
    <div ref={rootRef} className="space-y-6">
      
      {/* Toast Feedback */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-brand-navy p-4 text-xs font-bold text-white shadow-2xl border border-brand-gold/30 flex items-center gap-2 animate-bounce">
          <span className="text-brand-gold">✓</span>
          <span>{toast}</span>
        </div>
      )}

      {/* Directory Header */}
      <div className="reveal flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Clients Directory</h1>
          <p className="text-xs text-brand-navy/40">Centralized database to monitor, troubleshoot, edit and suspend client profiles.</p>
        </div>
        {isEditor && (
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="cursor-pointer flex items-center gap-1.5 rounded-xl bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-4 py-2.5 text-xs font-bold transition shadow hover:shadow-md"
          >
            <span>+ Add Client User</span>
          </button>
        )}
      </div>

      {/* ADMIN METRICS PANEL */}
      <div className="reveal grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-brand-navy/10 p-5 shadow-sm">
          <span className="text-[13px] text-brand-navy/45 font-bold uppercase tracking-wider block">Total Profiles</span>
          <span className="text-2xl font-extrabold text-brand-navy mt-1 block">{totalProfiles}</span>
        </div>
        <div className="bg-white rounded-2xl border border-brand-navy/10 p-5 shadow-sm">
          <span className="text-[13px] text-brand-navy/45 font-bold uppercase tracking-wider block">Active Accounts</span>
          <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">{activeProfiles}</span>
        </div>
        <div className="bg-white rounded-2xl border border-brand-navy/10 p-5 shadow-sm">
          <span className="text-[13px] text-brand-navy/45 font-bold uppercase tracking-wider block">Suspended Profiles</span>
          <span className="text-2xl font-extrabold text-rose-600 mt-1 block">{suspendedProfiles}</span>
        </div>
        <div className="bg-white rounded-2xl border border-brand-navy/10 p-5 shadow-sm">
          <span className="text-[13px] text-brand-navy/45 font-bold uppercase tracking-wider block">Study Abroad Leads</span>
          <span className="text-2xl font-extrabold text-brand-gold mt-1 block">{divisionDist['study-abroad'] || 0}</span>
        </div>
      </div>

      {/* Filters bar */}
      <div className="reveal flex flex-wrap gap-3 rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm backdrop-blur-md">
        <input
          type="text"
          placeholder="Search by name, email, phone or Token ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-brand-navy/10 bg-white px-3.5 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
        />

        <select
          value={divisionFilter}
          onChange={(e) => setDivisionFilter(e.target.value)}
          className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy outline-none focus:border-brand-gold [&>option]:bg-white"
        >
          <option value="all">All Divisions</option>
          <option value="study-abroad">Study Abroad</option>
          <option value="visa">Visa Prep</option>
          <option value="umrah">Tours &amp; Travels</option>
          <option value="attestation">Attestation</option>
          <option value="manpower">Manpower</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy outline-none focus:border-brand-gold [&>option]:bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>

        <div className="flex items-center gap-1.5">
          <input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Save this view as…" className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[13px] text-brand-navy outline-none focus:border-brand-gold w-36" />
          <button onClick={saveView} disabled={!viewName.trim()} className="rounded-lg border border-brand-navy/15 bg-brand-navy/[0.04] px-2.5 py-2 text-[13px] font-bold text-brand-navy hover:border-brand-gold/50 transition-all cursor-pointer disabled:opacity-40">💾 Save</button>
        </div>
        {savedViews.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {savedViews.map(v => (
              <span key={v} className="flex items-center gap-1 rounded-lg bg-brand-gold/10 border border-brand-gold/30 px-2 py-1 text-[13px] font-bold text-brand-navy">
                <button onClick={() => loadView(v)} className="cursor-pointer">{v}</button>
                <button onClick={() => deleteView(v)} className="text-brand-navy/40 hover:text-rose-500 cursor-pointer">✕</button>
              </span>
            ))}
          </div>
        )}

        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="ml-auto rounded-lg border border-brand-navy/15 bg-brand-navy/[0.04] px-3.5 py-2 text-xs font-bold text-brand-navy hover:border-brand-gold/50 transition-all cursor-pointer disabled:opacity-40"
        >
          📤 Export CSV ({filtered.length})
        </button>
      </div>

      {/* Spreadsheet directory table */}
      <div className="reveal overflow-hidden rounded-2xl border border-brand-navy/15 bg-white shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-brand-navy/10 bg-[#FAF8F4] text-[13px] uppercase tracking-wider text-brand-gold font-extrabold">
              <tr>
                <th className="px-4 py-3.5">Token ID</th>
                <th className="px-4 py-3.5">Client Name</th>
                <th className="px-4 py-3.5">Profile Score</th>
                <th className="px-4 py-3.5">Phone</th>
                <th className="px-4 py-3.5">Email</th>
                <th className="px-4 py-3.5">Primary Division</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy/[0.06] text-brand-navy/80">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-brand-textLight">Loading client directory...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-brand-textLight">No clients match your search filter.</td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-brand-navy/[0.02] transition-colors">
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono font-bold text-brand-navy">{c.id}</td>
                    <td className="px-4 py-3.5 font-bold text-brand-navy">
                      {c.name}
                      {c.name === 'Deleted Candidate' && (
                        <span className="ml-1.5 inline-block text-sm bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded font-bold uppercase border border-rose-200">DPDP Anonymized</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-brand-navy/[0.08] overflow-hidden">
                          <div className={`h-full ${completenessOf(c) === 100 ? 'bg-emerald-500' : completenessOf(c) >= 50 ? 'bg-brand-gold' : 'bg-amber-400'}`} style={{ width: `${completenessOf(c)}%` }} />
                        </div>
                        <span className={`text-xs font-black ${completenessOf(c) === 100 ? 'text-emerald-700' : completenessOf(c) >= 50 ? 'text-brand-gold' : 'text-amber-600'}`}>{completenessOf(c)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-sm text-brand-navy/70">{c.phone}</td>
                    <td className="px-4 py-3.5 text-brand-navy/70">{c.email}</td>
                    <td className="px-4 py-3.5 capitalize font-medium text-brand-navy">{c.primaryDivision?.replace('-', ' ')}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-black uppercase border tracking-wider ${c.status === 'blocked' ? 'bg-rose-500/10 border-rose-500/30 text-rose-700' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'}`}>
                        {c.status || 'active'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right space-x-1.5">
                    
                    {/* Workspace Desk */}
                    <button
                      onClick={() => setLocation(`/clients/${c.id}`)}
                      className="cursor-pointer rounded bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-2 py-1 text-[13px] font-bold transition"
                      title="Open Counselor 360 Workspace"
                    >
                      360 Desk
                    </button>

                    {/* Impersonation support Desk */}
                    <a
                      href={`/portal?token=${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded bg-brand-navy/10 hover:bg-brand-navy/20 text-brand-navy px-2 py-1 text-[13px] font-bold transition"
                      title="View workspace from Candidate portal perspective"
                    >
                      Impersonate
                    </a>

                    {/* Edit Profile */}
                    {isEditor && c.name !== 'Deleted Candidate' && (
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="cursor-pointer rounded bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 text-[13px] font-bold transition"
                      >
                        Edit
                      </button>
                    )}

                    {/* Block/Unblock */}
                    {isEditor && c.name !== 'Deleted Candidate' && (
                      <button
                        onClick={() => toggleBlockMutation.mutate({ id: c.id, status: c.status === 'blocked' ? 'active' : 'blocked' })}
                        className={`cursor-pointer rounded px-2 py-1 text-[13px] font-bold transition ${c.status === 'blocked' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                      >
                        {c.status === 'blocked' ? 'Unblock' : 'Block'}
                      </button>
                    )}

                    {/* DPDP Anonymization */}
                    {isSuperAdmin && c.name !== 'Deleted Candidate' && (
                      <button
                        onClick={() => setAnonymizingClientId(c.id)}
                        className="cursor-pointer rounded bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 text-[13px] font-bold transition"
                        title="DPDP-2023 Subject Erasure Action"
                      >
                        DPDP Delete
                      </button>
                    )}

                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* ========================================================
          ADD CLIENT USER MODAL (B2B Gold Standard)
          ======================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden border border-brand-navy/15 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-brand-navy p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="font-display font-extrabold text-lg text-white">Manual Candidate Registration</h3>
                <p className="text-[13px] text-brand-gold font-bold uppercase tracking-wider mt-0.5">Onboard Portal User Directly</p>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/60 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              {addError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                  ⚠️ {addError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Full Name *</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Suresh Kumar"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                  />
                </div>
                <div>
                  <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Phone Number *</label>
                  <input 
                    type="text"
                    required
                    placeholder="+91 99999 44444"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Email Address *</label>
                <input 
                  type="email"
                  required
                  placeholder="suresh@opusoverseas.com"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Primary Division *</label>
                  <select
                    value={addDivision}
                    onChange={(e) => setAddDivision(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                  >
                    <option value="study-abroad">Study Abroad</option>
                    <option value="visa">Visa Prep</option>
                    <option value="umrah">Tours &amp; Travels</option>
                    <option value="attestation">Attestation</option>
                    <option value="manpower">Manpower</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Qualification *</label>
                  <select
                    value={addQualification}
                    onChange={(e) => setAddQualification(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                  >
                    <option value="highschool">High School (12th)</option>
                    <option value="undergrad">Bachelors Degree</option>
                    <option value="postgrad">Masters Degree</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border rounded text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createClientMutation.isPending}
                  className="px-4 py-2 bg-brand-gold hover:bg-brand-goldHover text-brand-navy rounded text-xs font-bold transition disabled:opacity-50"
                >
                  {createClientMutation.isPending ? 'Onboarding...' : 'Onboard Candidate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          EDIT CLIENT PROFILE MODAL
          ======================================================== */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden border border-brand-navy/15 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-brand-navy p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="font-display font-bold text-lg text-white">Modify Client profile</h3>
                <p className="text-[13px] text-brand-gold font-bold uppercase tracking-wider mt-0.5">Token: {editingClient.id}</p>
              </div>
              <button 
                onClick={() => setEditingClient(null)}
                className="text-white/60 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-xs font-semibold">
                  ⚠️ {editError}
                </div>
              )}

              <div>
                <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Full Name</label>
                <input 
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Phone Number</label>
                  <input 
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                  />
                </div>
                <div>
                  <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Highest Qualification</label>
                  <select
                    value={editQualification}
                    onChange={(e) => setEditQualification(e.target.value)}
                    className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                  >
                    <option value="highschool">High School (12th)</option>
                    <option value="undergrad">Bachelors Degree</option>
                    <option value="postgrad">Masters Degree</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[13px] uppercase font-bold text-brand-navy tracking-wider block mb-1">Email Address</label>
                <input 
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white outline-none focus:border-brand-gold"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2 border rounded text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateClientMutation.isPending}
                  className="px-4 py-2 bg-brand-gold hover:bg-brand-goldHover text-brand-navy rounded text-xs font-bold transition disabled:opacity-50"
                >
                  {updateClientMutation.isPending ? 'Updating...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          DPDP ANONYMIZATION DOUBLE-CONFIRMATION MODAL
          ======================================================== */}
      {anonymizingClientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden border border-brand-navy/15 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-rose-600 p-5 text-white flex justify-between items-center">
              <h3 className="font-display font-extrabold text-base text-white">DPDP subject-right Erasure</h3>
              <button 
                onClick={() => setAnonymizingClientId(null)}
                className="text-white/60 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 bg-rose-50 text-rose-800 rounded-xl text-xs space-y-1">
                <p className="font-bold">⚠️ CRITICAL COMPLIANCE NOTICE (DPDP Act, 2023):</p>
                <p>This action implements data erasure by anonymizing all personally identifiable information (PII) for candidate <strong>{anonymizingClientId}</strong>:</p>
                <ul className="list-disc pl-4 mt-2 space-y-1">
                  <li>Name will be overridden to "Deleted Candidate"</li>
                  <li>Email will be overridden to a dead sandbox address</li>
                  <li>Phone number will be cleared (+91 00000 00000)</li>
                  <li>All digital consents will be marked as withdrawn</li>
                </ul>
                <p className="mt-2 font-semibold">This operation is irreversible under statutory guidelines.</p>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAnonymizingClientId(null)}
                  className="px-4 py-2 border rounded text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => anonymizeClientMutation.mutate(anonymizingClientId)}
                  disabled={anonymizeClientMutation.isPending}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition disabled:opacity-50"
                >
                  {anonymizeClientMutation.isPending ? 'Yes, Confirm Anonymization' : 'Yes, Confirm Anonymization'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
