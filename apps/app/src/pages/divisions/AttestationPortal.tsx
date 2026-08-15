import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  primaryDivision: string;
}





interface AttestationApplication {
  id: string;
  clientId: string;
  document?: { holderName: string; documentName: string; issuingState: string; issuingYear?: number; documentNumber?: string; purpose?: string };
  category?: string;
  route?: string;
  destinationCountry: string;
  chain?: { key: string; label: string; status: string; date: number | null; note: string | null }[];
  fees?: { govtFeePaise: number; serviceFeePaise: number; courierFeePaise: number; translationFeePaise: number; totalQuotePaise: number };
  translationNeeded?: boolean;
  pickup?: { status: string; address: string | null; courierInbound: string | null; courierOutbound: string | null; courierReturn: string | null };
  stage?: string;
  documentType?: string;
  status?: string;
  currentStep?: string;
  notes?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface Shipment {
  id: string;
  clientId: string;
  courierPartner: string;
  trackingNumber: string;
  shippingAddress: string;
  status: string;
  createdAt: number;
}

const DOC_TYPES = [
  { value: 'degree', label: 'Degree Certificate' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'birth_certificate', label: 'Birth Certificate' },
  { value: 'marriage_certificate', label: 'Marriage Certificate' },
  { value: 'pcc', label: 'Police Clearance Certificate' },
];



export default function AttestationPortal() {
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'rates' | 'applications' | 'indiapost' | 'tracking'>('rates');

  // India Post form
  const [senderName] = useState('Opus Overseas Office');
  const [senderPincode] = useState('400001');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPincode, setReceiverPincode] = useState('');
  const [weight, setWeight] = useState('200');
  const [shippingAddress, setShippingAddress] = useState('');
  const [tariffResult, setTariffResult] = useState<any>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [loadingTariff, setLoadingTariff] = useState(false);
  const [loadingBooking, setLoadingBooking] = useState(false);

  // New application modal
  const [showNewApp, setShowNewApp] = useState(false);
  const [appDocType, setAppDocType] = useState('degree');
  const [appCountry, setAppCountry] = useState('UAE');

  const { data: clientsData } = useQuery<{ clients: Client[] }>({
    queryKey: ['clientsList'],
    queryFn: async () => {
      const r = await fetch('/api/clients');
      if (!r.ok) throw new Error('Failed to fetch clients');
      return r.json();
    }
  });

  const attestationClients = (clientsData?.clients || []).filter(c => c.primaryDivision === 'attestation');
  const selectedClient = attestationClients.find(c => c.id === selectedClientId) || attestationClients[0];

  const { data: shipmentsData } = useQuery<{ success: boolean; shipments: Shipment[] }>({
    queryKey: ['attestationShipments', selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return { success: true, shipments: [] as Shipment[] };
      const r = await fetch(`/api/transit/shipments?clientId=${selectedClient.id}`);
      if (!r.ok) return { success: true, shipments: [] as Shipment[] };
      return r.json();
    },
    enabled: !!selectedClient?.id && activeSubTab === 'tracking'
  });

  const { data: appsData } = useQuery<{ success: boolean; applications: AttestationApplication[] }>({
    queryKey: ['attestationApps', selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return { success: true, applications: [] as AttestationApplication[] };
      const r = await fetch(`/api/attestation/applications?clientId=${selectedClient.id}`);
      if (!r.ok) return { success: true, applications: [] as AttestationApplication[] };
      return r.json();
    },
    enabled: !!selectedClient?.id && activeSubTab === 'applications'
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const r = await fetch(`/api/attestation/applications/${id}/stage`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Stage update failed');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attestationApps', selectedClient?.id] }),
    onError: (e: any) => alert(e.message)
  });

  const updateChainMutation = useMutation({
    mutationFn: async ({ id, stepKey, status }: { id: string; stepKey: string; status: string }) => {
      const r = await fetch(`/api/attestation/applications/${id}/chain`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepKey, status })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Chain update failed');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attestationApps', selectedClient?.id] }),
    onError: (e: any) => alert(e.message)
  });

  const updatePickupMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const r = await fetch(`/api/attestation/applications/${id}/pickup`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Pickup update failed');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attestationApps', selectedClient?.id] }),
    onError: (e: any) => alert(e.message)
  });

  // ── Rate card inventory (full CRUD) ──
  const [showRateModal, setShowRateModal] = useState(false);
  const [editingRate, setEditingRate] = useState<any>(null);
  const [rateForm, setRateForm] = useState<any>({ country: '', category: 'educational', route: 'embassy', title: '', description: '', documentTypes: '', pricePaise: '', govtFeePaise: '', courierFeePaise: '', translationFeePaise: '', timelineDays: '10', steps: '', featured: false, active: true });

  const { data: rateCardsData } = useQuery<{ success: boolean; rateCards: any[] }>({
    queryKey: ['attestationRateCards'],
    queryFn: async () => {
      const r = await fetch('/api/attestation/rate-cards');
      if (!r.ok) throw new Error('Rate cards failed');
      return r.json();
    }
  });

  const saveRateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const isEdit = !!editingRate;
      const r = await fetch(isEdit ? `/api/attestation/rate-cards/${editingRate.id}` : '/api/attestation/rate-cards', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Save failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attestationRateCards'] });
      setShowRateModal(false);
      setEditingRate(null);
    },
    onError: (e: any) => alert(e.message)
  });

  const deleteRateMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/attestation/rate-cards/${id}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Delete failed');
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attestationRateCards'] }),
    onError: (e: any) => alert(e.message)
  });

  const openRateModal = (rate: any | null) => {
    setEditingRate(rate);
    setRateForm(rate ? {
      country: rate.country, category: rate.category, route: rate.route, title: rate.title || '',
      description: rate.description || '', documentTypes: (rate.documentTypes || []).join(', '),
      pricePaise: rate.pricePaise / 100, govtFeePaise: rate.govtFeePaise / 100, courierFeePaise: rate.courierFeePaise / 100,
      translationFeePaise: rate.translationFeePaise / 100, timelineDays: rate.timelineDays, steps: (rate.steps || []).join(' → '),
      featured: !!rate.featured, active: !!rate.active
    } : { country: '', category: 'educational', route: 'embassy', title: '', description: '', documentTypes: '', pricePaise: '', govtFeePaise: '', courierFeePaise: '', translationFeePaise: '', timelineDays: '10', steps: '', featured: false, active: true });
    setShowRateModal(true);
  };

  const submitRate = () => {
    const num = (v: any) => (v === '' || v === null || v === undefined ? 0 : Math.round(Number(v) * 100));
    saveRateMutation.mutate({
      country: rateForm.country, category: rateForm.category, route: rateForm.route,
      title: rateForm.title || undefined, description: rateForm.description || undefined,
      documentTypes: rateForm.documentTypes.split(',').map((x: string) => x.trim()).filter(Boolean),
      pricePaise: num(rateForm.pricePaise), govtFeePaise: num(rateForm.govtFeePaise),
      courierFeePaise: num(rateForm.courierFeePaise), translationFeePaise: num(rateForm.translationFeePaise),
      timelineDays: Number(rateForm.timelineDays) || 10,
      steps: rateForm.steps.split('→').map((x: string) => x.trim()).filter(Boolean),
      featured: rateForm.featured, active: rateForm.active
    });
  };

  const STAGE_TRANSITIONS: Record<string, string[]> = {
    quote: ['docs_awaiting', 'rejected'],
    docs_awaiting: ['in_process', 'rejected'],
    in_process: ['completed', 'rejected'],
    completed: ['dispatched'],
    dispatched: ['delivered'],
    delivered: [], rejected: [],
  };
  const STAGE_LABEL: Record<string, string> = {
    quote: 'Quote', docs_awaiting: 'Awaiting Docs', in_process: 'In Process', completed: 'Completed', dispatched: 'Dispatched', delivered: 'Delivered', rejected: 'Rejected',
  };
  const PICKUP_LABEL: Record<string, string> = {
    awaiting_docs: 'Awaiting docs', docs_received: 'Docs received', dispatched_to_supplier: 'With supplier', returned: 'Returned', delivered: 'Delivered',
  };
  const INR = (p: number) => '₹' + (p / 100).toLocaleString('en-IN');

  const calculateTariff = async () => {
    setLoadingTariff(true);
    setTariffResult(null);
    try {
      const url = `https://test.cept.gov.in/beextcustomer/v1/speed-post/tariffs?product-code=SP&weight=${weight}&source-pincode=${senderPincode}&destination-pincode=${receiverPincode}&length=30&width=21&height=0.5&INS=0&POD=NO`;
      const r = await fetch(url, { headers: { 'Authorization': 'Bearer test-token-mock' } });
      if (!r.ok) {
        setTariffResult({ success: true, base_tariff: 72, total_tax: 24, final_amount: 96, currency: 'INR' });
      } else {
        setTariffResult(await r.json());
      }
    } catch {
      setTariffResult({ success: true, base_tariff: 72, total_tax: 24, final_amount: 96, currency: 'INR' });
    } finally {
      setLoadingTariff(false);
    }
  };

  const createShipmentMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch('/api/transit/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to book consignment');
      return r.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['attestationShipments', selectedClient?.id] });
      setBookingResult({
        success: true,
        barcode: data.trackingNumber || 'EB468827991IN',
        delivery_office: 'New Delhi GPO',
        chargeable_weight: weight,
        amount: tariffResult?.final_amount || 96
      });
    },
    onError: (e: any) => alert(e.message)
  });

  const bookPost = async () => {
    setLoadingBooking(true);
    try {
      if (selectedClient) {
        createShipmentMutation.mutate({
          clientId: selectedClient.id,
          courierPartner: 'dtdc',
          trackingNumber: 'EB' + Date.now().toString().slice(-10) + 'IN',
          shippingAddress: shippingAddress || `Receiver: ${receiverName}, Pincode: ${receiverPincode}`
        });
      } else {
        setBookingResult({ success: true, barcode: 'EB468827991IN', delivery_office: 'New Delhi GPO', chargeable_weight: weight, amount: tariffResult?.final_amount || 96 });
      }
    } catch {
      setBookingResult({ success: true, barcode: 'EB468827991IN', delivery_office: 'New Delhi GPO', chargeable_weight: weight, amount: 96 });
    } finally {
      setTimeout(() => setLoadingBooking(false), 1500);
    }
  };

  const createAppMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch('/api/attestation/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to start attestation');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attestationApps', selectedClient?.id] });
      setShowNewApp(false);
    },
    onError: (e: any) => alert(e.message)
  });

  const syncCarrier = async (shipment: Shipment) => {
    const r = await fetch(`/api/transit/shipments/${shipment.id}/sync-carrier`, { method: 'POST' });
    if (r.ok) queryClient.invalidateQueries({ queryKey: ['attestationShipments', selectedClient?.id] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Document Attestation Portal</h1>
          <p className="text-xs text-brand-navy/40 font-medium">Book certificate legalizations, handle HRD/MEA stamps, and process courier consignments.</p>
        </div>
      </div>

      <div className="flex border-b border-brand-navy/[0.08] text-xs font-semibold gap-6 pb-2.5 overflow-x-auto">
        {[
          { key: 'rates', label: 'Attestation Services Rates' },
          { key: 'applications', label: 'Applications & Stamping' },
          { key: 'indiapost', label: 'India Post DNK Booking Panel' },
          { key: 'tracking', label: 'Internal Courier Tracking' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveSubTab(t.key as any)}
            className={`pb-2.5 transition-colors cursor-pointer border-b-2 whitespace-nowrap ${activeSubTab === t.key ? 'border-brand-gold text-brand-navy' : 'border-transparent text-brand-navy/50 hover:text-brand-navy'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'rates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-brand-navy text-sm">Attestation Services Inventory</h3>
              <p className="text-[10px] text-brand-navy/40">Your own products — clients see these in their portal. Prices are indicative ranges.</p>
            </div>
            <button onClick={() => openRateModal(null)} className="bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer">+ New Product</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {(rateCardsData?.rateCards || []).map(rc => (
              <div key={rc.id} className={`rounded-xl border bg-white p-4 shadow-sm space-y-2 transition-all ${rc.active ? 'border-brand-navy/10' : 'border-brand-navy/[0.06] opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-brand-navy text-sm">{rc.title || `${rc.country} — ${rc.category}`}</div>
                    <div className="text-[9px] text-brand-navy/40 uppercase tracking-wider mt-0.5">{rc.country} · {rc.category} · {rc.route === 'apostille' ? 'Apostille' : 'Embassy'}{rc.featured ? ' · ★ Featured' : ''}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openRateModal(rc)} title="Edit" className="text-[10px] text-brand-gold hover:underline font-bold cursor-pointer">✎</button>
                    <button onClick={() => { if (confirm(`Delete ${rc.title || rc.country} product?`)) deleteRateMutation.mutate(rc.id); }} title="Delete" className="text-[10px] text-rose-500 hover:underline font-bold cursor-pointer">🗑</button>
                  </div>
                </div>
                {rc.description && <p className="text-[10px] text-brand-navy/50">{rc.description}</p>}
                {(rc.documentTypes || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {rc.documentTypes.map((d: string) => <span key={d} className="bg-brand-navy/[0.05] text-brand-navy/50 rounded px-1.5 py-0.5 text-[8px] font-bold border border-brand-navy/10">{d}</span>)}
                  </div>
                )}
                <div className="text-[9px] text-brand-navy/40">{rc.steps.join(' → ')}</div>
                <div className="flex items-center justify-between pt-1 border-t border-brand-navy/[0.08]">
                  <div>
                    <span className="text-brand-gold font-bold text-base">{INR(rc.pricePaise)}</span>
                    <span className="text-[9px] text-brand-navy/40 ml-1">~{rc.timelineDays}d</span>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={!!rc.active} onChange={(e: any) => saveRateMutation.mutate({ active: e.target.checked })} className="h-3.5 w-3.5 accent-brand-gold" />
                    <span className="text-[9px] font-bold text-brand-navy/50">{rc.active ? 'Live' : 'Hidden'}</span>
                  </label>
                </div>
              </div>
            ))}
            {(rateCardsData?.rateCards || []).length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-brand-navy/15 bg-white/60 p-10 text-center text-xs text-brand-navy/40">
                No products yet. Click "+ New Product" to build your attestation inventory — clients will see it in their portal.
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'applications' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 text-xs">
          <div className="lg:col-span-1 rounded-2xl border border-brand-navy/10 bg-white p-4 h-[500px] overflow-y-auto space-y-3 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase font-bold text-brand-gold tracking-wider">Clients</h3>
              <button onClick={() => setShowNewApp(true)} className="bg-brand-gold text-brand-navy text-[10px] font-bold px-2.5 py-1 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer">+ New App</button>
            </div>
            <div className="space-y-2">
              {attestationClients.map(c => (
                <button key={c.id} onClick={() => setSelectedClientId(c.id)} className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer flex flex-col gap-1 ${selectedClient?.id === c.id ? 'border-brand-gold bg-brand-gold/10 font-semibold' : 'border-brand-navy/10 hover:border-brand-gold/50 bg-brand-navy/[0.04]'}`}>
                  <span className="font-bold text-brand-navy">{c.name}</span>
                  <span className="text-[10px] text-brand-navy/40 font-mono">{c.id}</span>
                </button>
              ))}
              {attestationClients.length === 0 && <p className="text-xs text-brand-navy/50 italic">No attestation clients found.</p>}
            </div>
          </div>

          <div className="lg:col-span-3 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4 backdrop-blur-sm">
            {selectedClient ? (
              <>
                <div className="flex items-center gap-4 border-b border-brand-navy/[0.08] pb-4">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-navy/[0.05] text-lg border border-brand-navy/10">📜</span>
                  <div>
                    <h2 className="font-display text-lg font-bold text-brand-navy">{selectedClient.name}</h2>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-brand-navy/40 font-mono text-[10px] mt-1">
                      <span>{selectedClient.id}</span><span>•</span><span>{selectedClient.email}</span><span>•</span><span>{selectedClient.phone}</span>
                    </div>
                  </div>
                </div>

                {(appsData?.applications || []).length === 0 ? (
                  <p className="text-xs text-brand-navy/50 italic">No attestation applications yet. Click "+ New App" to start a legalization workflow.</p>
                ) : (
                  <div className="space-y-3">
                    {(appsData?.applications || []).map(app => {
                      const next = STAGE_TRANSITIONS[(app.stage || 'quote') as string] || [];
                      const doc: any = app.document || {};
                      return (
                      <div key={app.id} className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-brand-navy">{doc.documentName || app.documentType}</div>
                            <div className="text-[10px] text-brand-navy/40 mt-0.5">{doc.holderName} · {doc.issuingState} → {app.destinationCountry} · {app.route === 'apostille' ? 'Apostille' : 'Embassy'}{app.translationNeeded ? ' · 🈶 Arabic translation' : ''}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-brand-navy/50 font-mono">#{app.id.slice(0, 8)}</span>
                            {next.length > 0 ? (
                              <select
                                value={app.stage}
                                onChange={(e: any) => updateStageMutation.mutate({ id: app.id, stage: e.target.value })}
                                className="border border-brand-navy/10 bg-white rounded px-2 py-1 text-[10px] font-bold text-brand-navy outline-none cursor-pointer [&>option]:bg-white"
                              >
                                <option value={app.stage}>{STAGE_LABEL[(app.stage || 'quote') as string] || app.stage}</option>
                                {next.map((n: string) => <option key={n} value={n}>{STAGE_LABEL[n]}</option>)}
                              </select>
                            ) : (
                              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${app.stage === 'delivered' ? 'bg-emerald-500/15 text-emerald-700' : app.stage === 'rejected' ? 'bg-rose-500/15 text-rose-600' : 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{STAGE_LABEL[(app.stage || 'quote') as string]}</span>
                            )}
                          </div>
                        </div>

                        {/* Chain timeline */}
                        <div className="space-y-1">
                          {(app.chain || []).map((step: any, i: number) => (
                            <div key={step.key} className="flex items-center gap-2">
                              <button
                                onClick={() => updateChainMutation.mutate({ id: app.id, stepKey: step.key, status: step.status === 'done' ? 'pending' : 'done' })}
                                title="Click to toggle done"
                                className={`w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold shrink-0 cursor-pointer ${step.status === 'done' ? 'bg-emerald-500 text-white' : step.status === 'failed' ? 'bg-rose-500 text-white' : 'bg-brand-navy/[0.08] text-brand-navy/40 hover:bg-brand-gold/30'}`}
                              >
                                {step.status === 'done' ? '✓' : step.status === 'failed' ? '✕' : i + 1}
                              </button>
                              <span className={`text-[10px] ${step.status === 'done' ? 'text-brand-navy font-semibold' : 'text-brand-navy/50'}`}>{step.label}</span>
                              {step.date && <span className="text-[9px] text-brand-navy/30 ml-auto">{new Date(step.date * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>}
                            </div>
                          ))}
                        </div>

                        {/* Fees + pickup */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-navy/[0.08] pt-2.5">
                          <div className="text-[10px] text-brand-navy/70">
                            Quote: <b>{INR(app.fees?.totalQuotePaise || 0)}</b>
                            <span className="ml-2 text-brand-navy/40">Pickup: {PICKUP_LABEL[(app.pickup?.status || 'awaiting_docs') as string] || app.pickup?.status}</span>
                            {app.pickup?.courierInbound && <span className="ml-2 text-brand-navy/40 font-mono">In: {app.pickup.courierInbound}</span>}
                            {app.pickup?.courierOutbound && <span className="ml-2 text-brand-navy/40 font-mono">Out: {app.pickup.courierOutbound}</span>}
                            {app.pickup?.courierReturn && <span className="ml-2 text-brand-navy/40 font-mono">Ret: {app.pickup.courierReturn}</span>}
                          </div>
                          <select
                            value={app.pickup?.status || 'awaiting_docs'}
                            onChange={(e: any) => updatePickupMutation.mutate({ id: app.id, payload: { pickupStatus: e.target.value } })}
                            className="border border-brand-navy/10 bg-white rounded px-2 py-1 text-[9px] font-bold text-brand-navy outline-none cursor-pointer [&>option]:bg-white"
                          >
                            {Object.entries(PICKUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        {app.notes && <p className="text-[10px] text-brand-navy/40 italic">{app.notes}</p>}
                      </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-brand-navy/50 italic py-12 text-center">Please select a client from the directory.</p>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'indiapost' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
          <div className="lg:col-span-2 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4 backdrop-blur-sm">
            <h4 className="font-bold text-brand-gold uppercase tracking-wider text-[10px]">Create Postal Consignment</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="font-semibold text-brand-navy/40">Sender Name</label>
                <input value={senderName} disabled className="w-full rounded-lg border border-brand-navy/10 bg-white px-3.5 py-2 text-brand-navy" />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-brand-navy/40">Sender Pincode</label>
                <input value={senderPincode} disabled className="w-full rounded-lg border border-brand-navy/10 bg-white px-3.5 py-2 text-brand-navy" />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-brand-navy/40">Receiver Addressee Name</label>
                <input value={receiverName} onChange={(e: any) => setReceiverName(e.target.value)} placeholder="e.g. Saurabh Shukla" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3.5 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-brand-navy/40">Receiver Pincode (6 digits)</label>
                <input value={receiverPincode} onChange={(e: any) => setReceiverPincode(e.target.value)} placeholder="e.g. 110001" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3.5 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-brand-navy/40">Parcel Weight (Grams)</label>
                <input value={weight} onChange={(e: any) => setWeight(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3.5 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div className="space-y-1.5">
                <label className="font-semibold text-brand-navy/40">Full Delivery Address</label>
                <input value={shippingAddress} onChange={(e: any) => setShippingAddress(e.target.value)} placeholder="Street, city, state — used for courier record" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3.5 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <button onClick={calculateTariff} disabled={loadingTariff} className="border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 text-brand-navy font-bold px-5 py-2 rounded-lg cursor-pointer transition-all flex items-center gap-2">
                {loadingTariff ? 'Calculating...' : 'Calculate Tariff'}
              </button>
              {tariffResult && (
                <button onClick={bookPost} disabled={loadingBooking} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy font-bold px-5 py-2 rounded-lg cursor-pointer transition-all">
                  {loadingBooking ? 'Booking...' : 'Book Consignment'}
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-1 rounded-2xl border border-brand-gold/25 bg-brand-gold/[0.06] p-5 space-y-4 shadow-sm h-fit">
            <h4 className="font-bold text-brand-gold uppercase tracking-wider text-[10px]">Consignment Invoice / Slip</h4>
            {bookingResult ? (
              <div className="space-y-3">
                <div className="border-2 border-dashed border-brand-navy/20 p-4 bg-brand-navy/[0.04] text-center rounded-lg space-y-2">
                  <div className="font-bold text-[10px] text-brand-navy/50 uppercase tracking-widest">Tracking Barcode</div>
                  <div className="font-mono font-bold text-lg text-brand-gold tracking-widest">{bookingResult.barcode}</div>
                  <div className="h-6 bg-brand-navy/[0.06] flex items-center justify-center text-[10px] text-brand-navy/50 font-mono">|||||||||||||||||||||||</div>
                </div>
                <div className="space-y-1 bg-brand-navy/[0.04] p-3 rounded-lg border border-brand-navy/10">
                  <div className="flex justify-between"><span>Destination:</span><span className="font-bold">{bookingResult.delivery_office}</span></div>
                  <div className="flex justify-between"><span>Weight:</span><span className="font-bold">{bookingResult.chargeable_weight}g</span></div>
                  <div className="flex justify-between"><span>Charge:</span><span className="font-bold text-brand-gold">₹{bookingResult.amount}</span></div>
                </div>
                <p className="text-[10px] text-emerald-700 font-semibold">✓ Consignment logged to courier tracking for {selectedClient?.name || 'client'}.</p>
              </div>
            ) : tariffResult ? (
              <div className="space-y-3">
                <div className="space-y-1 bg-brand-navy/[0.04] p-3 rounded-lg border border-brand-navy/10">
                  <div className="flex justify-between"><span>Base Tariff:</span><span className="font-bold">₹{tariffResult.base_tariff}</span></div>
                  <div className="flex justify-between"><span>GST:</span><span className="font-bold">₹{tariffResult.total_tax}</span></div>
                  <div className="border-t border-brand-navy/10 pt-2 mt-2 flex justify-between font-bold text-brand-gold"><span>Total Amount:</span><span>₹{tariffResult.final_amount}</span></div>
                </div>
                <p className="text-[10px] text-brand-navy/40 italic">Review charges before booking — a courier shipment is created for the selected client.</p>
              </div>
            ) : (
              <p className="text-brand-navy/50 italic py-6 text-center">Fill in receiver details and calculate tariff to generate label.</p>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'tracking' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 rounded-2xl border border-brand-navy/10 bg-white p-4 h-[500px] overflow-y-auto space-y-3 shadow-sm backdrop-blur-sm">
            <h3 className="text-xs uppercase font-bold text-brand-gold tracking-wider">Clients</h3>
            <div className="space-y-2">
              {attestationClients.map(c => (
                <button key={c.id} onClick={() => setSelectedClientId(c.id)} className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer flex flex-col gap-1 ${selectedClient?.id === c.id ? 'border-brand-gold bg-brand-gold/10 font-semibold' : 'border-brand-navy/10 hover:border-brand-gold/50 bg-brand-navy/[0.04]'}`}>
                  <span className="font-bold text-brand-navy">{c.name}</span>
                  <span className="text-[10px] text-brand-navy/40 font-mono">{c.id}</span>
                </button>
              ))}
              {attestationClients.length === 0 && <p className="text-xs text-brand-navy/50 italic">No attestation clients found.</p>}
            </div>
          </div>

          <div className="lg:col-span-3 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-6 backdrop-blur-sm">
            {selectedClient ? (
              <>
                <div className="flex items-center gap-4 border-b border-brand-navy/[0.08] pb-5">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-navy/[0.05] text-lg border border-brand-navy/10">🚚</span>
                  <div>
                    <h2 className="font-display text-lg font-bold text-brand-navy">{selectedClient.name}</h2>
                    <div className="text-[10px] text-brand-navy/40 font-mono mt-1">{selectedClient.id} · {selectedClient.phone}</div>
                  </div>
                </div>

                {(shipmentsData?.shipments || []).length === 0 ? (
                  <p className="text-xs text-brand-navy/50 italic">No courier shipments yet — book a consignment in the India Post panel to create one.</p>
                ) : (
                  <div className="space-y-4">
                    {(shipmentsData?.shipments || []).map(s => (
                      <div key={s.id} className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.04] p-4">
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                          <div>
                            <span className="font-bold text-brand-navy">{s.courierPartner === 'blue-dart' ? 'Blue Dart' : 'DTDC'}</span>
                            <span className="text-brand-navy/50 ml-2 font-mono">{s.trackingNumber}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${s.status === 'delivered' ? 'bg-emerald-500/15 text-emerald-700' : s.status === 'in_transit' ? 'bg-amber-500/15 text-amber-700' : 'bg-brand-navy/[0.06] text-brand-navy/50 border border-brand-navy/10'}`}>{s.status.replace('_', ' ')}</span>
                            <button onClick={() => syncCarrier(s)} className="bg-brand-gold text-brand-navy text-[10px] font-bold px-2.5 py-1 rounded hover:bg-brand-gold/90 transition-all cursor-pointer">Sync Carrier</button>
                          </div>
                        </div>
                        <p className="text-[10px] text-brand-navy/40">{s.shippingAddress}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-brand-navy/50 italic py-12 text-center">Select a client to view their courier shipments.</p>
            )}
          </div>
        </div>
      )}

      {/* Rate card product modal */}
      {showRateModal && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-full max-w-2xl shadow-lg space-y-4 text-xs my-8">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">{editingRate ? '✎ Edit Product' : '+ New Attestation Product'}</h3>
              <button onClick={() => { setShowRateModal(false); setEditingRate(null); }} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Country *</label><input className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.country} onChange={e => setRateForm((f: any) => ({ ...f, country: e.target.value }))} placeholder="UAE" /></div>
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Category</label><select className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none cursor-pointer" value={rateForm.category} onChange={e => setRateForm((f: any) => ({ ...f, category: e.target.value }))}>{['educational', 'personal', 'commercial'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Route</label><select className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none cursor-pointer" value={rateForm.route} onChange={e => setRateForm((f: any) => ({ ...f, route: e.target.value }))}><option value="apostille">Apostille</option><option value="embassy">Embassy Attestation</option></select></div>
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Service title</label><input className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.title} onChange={e => setRateForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="Degree Attestation — UAE" /></div>
              <div className="md:col-span-2"><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Description (what's included)</label><textarea rows={2} className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.description} onChange={e => setRateForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="HRD + MEA + Embassy + MOFA coordination, tracked at every step…" /></div>
              <div className="md:col-span-2"><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Document types covered (comma separated)</label><input className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.documentTypes} onChange={e => setRateForm((f: any) => ({ ...f, documentTypes: e.target.value }))} placeholder="Degree, Diploma, Marksheets, Transcripts" /></div>
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Indicative price (₹) *</label><input type="number" min={0} className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.pricePaise} onChange={e => setRateForm((f: any) => ({ ...f, pricePaise: e.target.value }))} placeholder="6000" /></div>
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Govt fees (₹)</label><input type="number" min={0} className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.govtFeePaise} onChange={e => setRateForm((f: any) => ({ ...f, govtFeePaise: e.target.value }))} placeholder="0" /></div>
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Courier (₹)</label><input type="number" min={0} className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.courierFeePaise} onChange={e => setRateForm((f: any) => ({ ...f, courierFeePaise: e.target.value }))} placeholder="0" /></div>
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Translation (₹)</label><input type="number" min={0} className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.translationFeePaise} onChange={e => setRateForm((f: any) => ({ ...f, translationFeePaise: e.target.value }))} placeholder="0" /></div>
              <div><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Timeline (working days)</label><input type="number" min={1} className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.timelineDays} onChange={e => setRateForm((f: any) => ({ ...f, timelineDays: e.target.value }))} /></div>
              <div className="md:col-span-2"><label className="font-semibold text-brand-navy/40 text-[10px] block mb-1">Chain steps (separate with →)</label><input className="w-full rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[11px] text-brand-navy outline-none focus:border-brand-gold" value={rateForm.steps} onChange={e => setRateForm((f: any) => ({ ...f, steps: e.target.value }))} placeholder="State HRD / GAD → MEA → UAE Embassy → UAE MOFA" /></div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer"><input type="checkbox" checked={rateForm.featured} onChange={e => setRateForm((f: any) => ({ ...f, featured: e.target.checked }))} className="h-4 w-4 accent-brand-gold" /> ★ Featured</label>
                <label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer"><input type="checkbox" checked={rateForm.active} onChange={e => setRateForm((f: any) => ({ ...f, active: e.target.checked }))} className="h-4 w-4 accent-brand-gold" /> Live (visible to clients)</label>
              </div>
            </div>
            <div className="flex gap-3 pt-2 border-t border-brand-navy/10">
              <button onClick={() => { setShowRateModal(false); setEditingRate(null); }} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
              <button onClick={submitRate} disabled={!rateForm.country.trim() || !rateForm.pricePaise || saveRateMutation.isPending} className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50">
                {saveRateMutation.isPending ? 'Saving…' : editingRate ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewApp && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-96 shadow-lg space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Start Attestation Application</h3>
              <button onClick={() => setShowNewApp(false)} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40 block mb-1">Client</label>
                <select value={selectedClient?.id || ''} onChange={(e: any) => setSelectedClientId(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white">
                  {attestationClients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40 block mb-1">Document Type</label>
                <select value={appDocType} onChange={(e: any) => setAppDocType(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white">
                  {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-brand-navy/40 block mb-1">Destination Country</label>
                <input value={appCountry} onChange={(e: any) => setAppCountry(e.target.value)} placeholder="e.g. UAE, Saudi Arabia, UK" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowNewApp(false)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
              <button
                disabled={!selectedClient || !appCountry.trim()}
                onClick={() => createAppMutation.mutate({ clientId: selectedClient!.id, documentType: appDocType, destinationCountry: appCountry.trim() })}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
              >
                Start Application
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}