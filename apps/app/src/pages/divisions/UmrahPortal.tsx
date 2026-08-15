import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../lib/session';
import UmrahCalendar, { UmrahCalendarDay, TIER_INFO } from '../../components/UmrahCalendar';

interface Pilgrim {
  id: string;
  name: string;
  phone: string;
  email: string;
  primaryDivision: string;
}

interface Departure {
  id: string;
  packageId: string | null;
  packageTier: 'economy' | 'standard' | 'premium' | 'luxury';
  departureDate: number;
  departureCity: string | null;
  capacity: number;
  bookedSeats: number;
  price: number;
  bookingFee: number;
  status: string;
}

interface UmrahPackage {
  id: string;
  name: string;
  tier: 'economy' | 'standard' | 'premium' | 'luxury';
  totalDays: number;
  makkahNights: number;
  madinahNights: number;
  flightType: string;
  airline: string | null;
  departureCity: string | null;
  arrivalAirport: string | null;
  baggageAllowance: string | null;
  flightClass: string;
  zamzamIncluded: boolean;
  makkahHotel: string | null;
  makkahHotelStars: number | null;
  makkahDistanceMeters: number | null;
  makkahWalkMinutes: number | null;
  makkahHaramView: string;
  madinahHotel: string | null;
  madinahHotelStars: number | null;
  madinahDistanceMeters: number | null;
  madinahWalkMinutes: number | null;
  madinahHaramView: string;
  roomSharing: string;
  mealsPlan: string;
  shuttleService: boolean;
  airportTransfer: boolean;
  intercityTransport: string;
  ziyaratTours: boolean;
  groupLeader: boolean;
  guideLanguage: string | null;
  visaIncluded: boolean;
  ksaInsurance: boolean;
  visaLeadDays: number;
  wholesalePricePaise: number;
  retailPricePaise: number;
  advanceFeePaise: number;
  childWithBedPricePaise?: number | null;
  childNoBedPricePaise?: number | null;
  infantPricePaise?: number | null;
  reserveHoldHours: number;
  balanceDueDaysBefore: number;
  installmentAvailable: boolean;
  groupDiscountPct: number | null;
  groupDiscountMinPax: number | null;
  description: string | null;
  inclusionsJson: string;
  exclusionsJson: string;
  documentsJson: string;
  itineraryJson: string;
  termsJson: string;
  specialNeeds: string | null;
  supplierRef: string | null;
  featured: boolean;
  status: string;
  departureCount?: number;
  openDepartureCount?: number;
  totalSeats?: number;
  filledSeats?: number;
}

interface ManifestRow {
  bookingId: string;
  status: string;
  occupancy: string;
  paxCount: number;
  roomConfig: string | null;
  passengers: { name: string; dob: string | null; passportNumber: string | null; category: string; specialNeeds: string | null }[];
  clientId: string;
  name: string;
  phone: string | null;
  checklistId: string | null;
  passportScanned: boolean;
  visaIssued: boolean;
  vaccineCertificate: boolean;
  ticketIssued: boolean;
}

const CATEGORY_SHORT: Record<string, string> = {
  adult: 'Adult', child_with_bed: 'Child+bed', child_no_bed: 'Child (no bed)', infant: 'Infant',
};

const TIER_LABEL: Record<string, string> = { economy: 'Economy', standard: 'Standard', premium: 'Premium', luxury: 'Luxury' };
const INR = (p: number) => '₹' + (p / 100).toLocaleString('en-IN');

// Empty package template for the create/edit form.
const emptyPkg = (): Record<string, any> => ({
  name: '', tier: 'standard', totalDays: 7, makkahNights: 0, madinahNights: 0,
  flightType: 'varies', airline: '', departureCity: '', arrivalAirport: '', baggageAllowance: '', flightClass: 'economy', zamzamIncluded: true,
  makkahHotel: '', makkahHotelStars: 3, makkahDistanceMeters: 0, makkahWalkMinutes: 0, makkahHaramView: 'none',
  madinahHotel: '', madinahHotelStars: 3, madinahDistanceMeters: 0, madinahWalkMinutes: 0, madinahHaramView: 'none',
  roomSharing: 'quad', soloAvailable: false, soloSupplementPaise: 0, mealsPlan: 'breakfast', shuttleService: false,
  airportTransfer: true, intercityTransport: 'group_bus', ziyaratTours: true, groupLeader: false, guideLanguage: '',
  visaIncluded: true, ksaInsurance: true, visaLeadDays: 21,
  wholesalePricePaise: 0, retailPricePaise: 0, advanceFeePaise: 50000, reserveHoldHours: 72, balanceDueDaysBefore: 30,
  childWithBedPricePaise: '', childNoBedPricePaise: '', infantPricePaise: '',
  installmentAvailable: false, groupDiscountPct: '', groupDiscountMinPax: '',
  description: '', inclusionsJson: '[]', exclusionsJson: '[]', documentsJson: '[]', itineraryJson: '[]', termsJson: '[]',
  specialNeeds: '', supplierRef: '', featured: false, status: 'draft',
});

export default function UmrahPortal() {
  const { me } = useSession();
  const isManager = me?.role === 'super_admin' || me?.role === 'manager';
  const queryClient = useQueryClient();
  const [activeSubTab, setActiveSubTab] = useState<'packages' | 'departures' | 'groups'>('packages');
  const [selectedDepartureId, setSelectedDepartureId] = useState<string | null>(null);
  const [packagesBusy, setPackagesBusy] = useState(false);

  // Calendar month state
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [announceDate, setAnnounceDate] = useState<Date | null>(null);
  const [announcePkgId, setAnnouncePkgId] = useState('');
  const [announceCity, setAnnounceCity] = useState('');
  const [announcePrice, setAnnouncePrice] = useState('');
  const [announceEndDate, setAnnounceEndDate] = useState('');
  const [announceCapacity, setAnnounceCapacity] = useState('30');
  const [selectedDay, setSelectedDay] = useState<UmrahCalendarDay | null>(null);

  // Package form modal
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [editingPkg, setEditingPkg] = useState<UmrahPackage | null>(null);
  const [pkgForm, setPkgForm] = useState<Record<string, any>>(emptyPkg());

  // Book seat modal (select a pilgrim client)
  const [showBook, setShowBook] = useState(false);
  const [bookClientId, setBookClientId] = useState('');

  // ── Queries ──
  const { data: pkgData, isLoading: pkgsLoading } = useQuery<{ success: boolean; packages: UmrahPackage[] }>({
    queryKey: ['umrahPackages'],
    queryFn: async () => {
      const r = await fetch('/api/umrah/packages');
      if (!r.ok) throw new Error('Failed to fetch packages');
      return r.json();
    }
  });

  const { data: settingsData } = useQuery<{ success: boolean; enabled: boolean }>({
    queryKey: ['umrahSettings'],
    queryFn: async () => {
      const r = await fetch('/api/umrah/settings');
      if (!r.ok) throw new Error('Failed to fetch settings');
      return r.json();
    }
  });
  const inventoryEnabled = settingsData?.enabled ?? false;

  const { data: depData, isLoading: depsLoading } = useQuery<{ departures: Departure[] }>({
    queryKey: ['umrahDepartures'],
    queryFn: async () => {
      const r = await fetch('/api/umrah/departures');
      if (!r.ok) throw new Error('Failed to fetch departures');
      return r.json();
    }
  });

  const { data: calData } = useQuery<{ success: boolean; days: UmrahCalendarDay[] }>({
    queryKey: ['umrahCalendar', calMonth.getFullYear(), calMonth.getMonth()],
    queryFn: async () => {
      const ym = `${calMonth.getFullYear()}-${String(calMonth.getMonth() + 1).padStart(2, '0')}`;
      const r = await fetch(`/api/umrah/departures/calendar?month=${ym}`);
      if (!r.ok) throw new Error('Calendar failed');
      return r.json();
    }
  });

  const { data: clientsData } = useQuery<{ clients: Pilgrim[] }>({
    queryKey: ['clientsList'],
    queryFn: async () => {
      const r = await fetch('/api/clients');
      if (!r.ok) throw new Error('Failed to fetch clients');
      return r.json();
    }
  });

  const packages = pkgData?.packages || [];
  const departures = (depData?.departures || []).sort((a, b) => a.departureDate - b.departureDate);
  const selectedDep = departures.find(d => d.id === selectedDepartureId) || departures[0] || null;

  const { data: manifestData, isLoading: manifestLoading } = useQuery<{ success: boolean; manifest: ManifestRow[] }>({
    queryKey: ['umrahManifest', selectedDep?.id],
    queryFn: async () => {
      if (!selectedDep) return { success: true, manifest: [] };
      const r = await fetch(`/api/umrah/departures/${selectedDep.id}/manifest`);
      if (!r.ok) throw new Error('Manifest failed');
      return r.json();
    },
    enabled: !!selectedDep
  });

  const manifest = manifestData?.manifest || [];
  const umrahClients = (clientsData?.clients || []).filter(c => c.primaryDivision === 'umrah');

  // ── Mutations ──
  const toggleSettingsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await fetch('/api/umrah/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (!r.ok) throw new Error('Settings update failed');
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['umrahSettings'] }),
    onError: (e: any) => alert(e.message)
  });

  const savePackageMutation = useMutation({
    mutationFn: async (payload: any) => {
      const isEdit = !!payload.id;
      const r = await fetch(isEdit ? `/api/umrah/packages/${payload.id}` : '/api/umrah/packages', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body)
      });
      if (!r.ok) throw new Error('Package save failed');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['umrahPackages'] });
      setShowPkgModal(false);
      setEditingPkg(null);
      setPkgForm(emptyPkg());
    },
    onError: (e: any) => alert(e.message)
  });

  const pkgStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/umrah/packages/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error('Status update failed');
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['umrahPackages'] }),
    onError: (e: any) => alert(e.message)
  });

  const announceMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch(`/api/umrah/packages/${payload.packageId}/departures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body)
      });
      if (!r.ok) throw new Error('Announce failed');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['umrahCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['umrahDepartures'] });
      queryClient.invalidateQueries({ queryKey: ['umrahPackages'] });
      setAnnounceDate(null);
    },
    onError: (e: any) => alert(e.message)
  });

  const bookSeatMutation = useMutation({
    mutationFn: async (payload: { departureId: string; clientId: string }) => {
      const r = await fetch(`/api/umrah/departures/${payload.departureId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: payload.clientId })
      });
      if (!r.ok) throw new Error('Failed to book seat');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['umrahDepartures'] });
      queryClient.invalidateQueries({ queryKey: ['umrahManifest', selectedDep?.id] });
      queryClient.invalidateQueries({ queryKey: ['umrahCalendar'] });
      setShowBook(false);
      setBookClientId('');
    },
    onError: (e: any) => alert(e.message)
  });

  // Super-admin calendar control: cancel a departure (cancels linked bookings)
  const cancelDepartureMutation = useMutation({
    mutationFn: async (departureId: string) => {
      const r = await fetch(`/api/umrah/departures/${departureId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      if (!r.ok) throw new Error('Cancel failed');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['umrahCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['umrahDepartures'] });
      setSelectedDay(null);
      alert('Departure cancelled. Linked bookings released.');
    },
    onError: (e: any) => alert(e.message)
  });

  // Super-admin control: release a single booking (returns seat to inventory)
  const releaseBookingMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const r = await fetch(`/api/umrah/bookings/${bookingId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!r.ok) throw new Error('Release failed');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['umrahManifest', selectedDep?.id] });
      queryClient.invalidateQueries({ queryKey: ['umrahCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['umrahDepartures'] });
    },
    onError: (e: any) => alert(e.message)
  });

  const toggleChecklistFlag = useMutation({
    mutationFn: async ({ row, key, value }: { row: ManifestRow; key: 'passportScanned' | 'visaIssued' | 'vaccineCertificate' | 'ticketIssued'; value: boolean }) => {
      let checklistId = row.checklistId;
      if (!checklistId) {
        const boot = await fetch(`/api/umrah/checklists?bookingId=${row.bookingId}`).then(r => r.json());
        checklistId = boot?.checklist?.id || null;
      }
      if (!checklistId) throw new Error('Checklist bootstrap failed');
      const r = await fetch(`/api/umrah/checklists/${checklistId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      if (!r.ok) throw new Error('Checklist update failed');
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['umrahManifest', selectedDep?.id] }),
    onError: (e: any) => alert(e.message)
  });

  const exportCsv = () => {
    if (!selectedDep) return;
    const head = ['Pilgrim', 'Phone', 'Booking Status', 'Pax', 'Room', 'Travellers', 'Passport', 'Visa', 'Vaccine', 'Ticket'];
    const rows = manifest.map(m => [
      m.name, m.phone || '', m.status, m.paxCount || 1,
      m.occupancy === 'solo' ? 'Solo' : (m.roomConfig || 'Shared'),
      (m.passengers || []).map(p => `${p.name} (${CATEGORY_SHORT[p.category] || p.category})`).join('; '),
      m.passportScanned ? 'Yes' : 'No', m.visaIssued ? 'Yes' : 'No', m.vaccineCertificate ? 'Yes' : 'No', m.ticketIssued ? 'Yes' : 'No'
    ]);
    const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `umrah-manifest-${selectedDep.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // ── Package form helpers ──
  const openCreatePkg = () => { setEditingPkg(null); setPkgForm(emptyPkg()); setShowPkgModal(true); };
  const openEditPkg = (p: UmrahPackage) => {
    setEditingPkg(p);
    setPkgForm({
      ...emptyPkg(),
      ...p,
      groupDiscountPct: p.groupDiscountPct ?? '',
      groupDiscountMinPax: p.groupDiscountMinPax ?? '',
    });
    setShowPkgModal(true);
  };
  const setF = (k: string, v: any) => setPkgForm(prev => ({ ...prev, [k]: v }));
  const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
  const bool = (v: any) => v === true || v === 'true' || v === 1;

  const submitPkg = () => {
    const body: Record<string, any> = {
      name: pkgForm.name, tier: pkgForm.tier,
      totalDays: num(pkgForm.totalDays) ?? 7, makkahNights: num(pkgForm.makkahNights) ?? 0, madinahNights: num(pkgForm.madinahNights) ?? 0,
      flightType: pkgForm.flightType, airline: pkgForm.airline || undefined, departureCity: pkgForm.departureCity || undefined,
      arrivalAirport: pkgForm.arrivalAirport || undefined, baggageAllowance: pkgForm.baggageAllowance || undefined,
      flightClass: pkgForm.flightClass, zamzamIncluded: bool(pkgForm.zamzamIncluded),
      makkahHotel: pkgForm.makkahHotel || undefined, makkahHotelStars: num(pkgForm.makkahHotelStars),
      makkahDistanceMeters: num(pkgForm.makkahDistanceMeters), makkahWalkMinutes: num(pkgForm.makkahWalkMinutes),
      makkahHaramView: pkgForm.makkahHaramView,
      madinahHotel: pkgForm.madinahHotel || undefined, madinahHotelStars: num(pkgForm.madinahHotelStars),
      madinahDistanceMeters: num(pkgForm.madinahDistanceMeters), madinahWalkMinutes: num(pkgForm.madinahWalkMinutes),
      madinahHaramView: pkgForm.madinahHaramView,
      roomSharing: pkgForm.roomSharing, soloAvailable: bool(pkgForm.soloAvailable), soloSupplementPaise: Math.round((num(pkgForm.soloSupplementPaise) ?? 0) * 100), mealsPlan: pkgForm.mealsPlan, shuttleService: bool(pkgForm.shuttleService),
      airportTransfer: bool(pkgForm.airportTransfer), intercityTransport: pkgForm.intercityTransport,
      ziyaratTours: bool(pkgForm.ziyaratTours), groupLeader: bool(pkgForm.groupLeader), guideLanguage: pkgForm.guideLanguage || undefined,
      visaIncluded: bool(pkgForm.visaIncluded), ksaInsurance: bool(pkgForm.ksaInsurance), visaLeadDays: num(pkgForm.visaLeadDays) ?? 21,
      wholesalePricePaise: Math.round((num(pkgForm.wholesalePricePaise) ?? 0) * 100),
      retailPricePaise: Math.round((num(pkgForm.retailPricePaise) ?? 0) * 100),
      advanceFeePaise: Math.round((num(pkgForm.advanceFeePaise) ?? 500) * 100),
      reserveHoldHours: num(pkgForm.reserveHoldHours) ?? 72, balanceDueDaysBefore: num(pkgForm.balanceDueDaysBefore) ?? 30,
      installmentAvailable: bool(pkgForm.installmentAvailable),
      groupDiscountPct: num(pkgForm.groupDiscountPct), groupDiscountMinPax: num(pkgForm.groupDiscountMinPax),
      childWithBedPricePaise: pkgForm.childWithBedPricePaise !== '' && pkgForm.childWithBedPricePaise != null ? Math.round((num(pkgForm.childWithBedPricePaise) ?? 0) * 100) : null,
      childNoBedPricePaise: pkgForm.childNoBedPricePaise !== '' && pkgForm.childNoBedPricePaise != null ? Math.round((num(pkgForm.childNoBedPricePaise) ?? 0) * 100) : null,
      infantPricePaise: pkgForm.infantPricePaise !== '' && pkgForm.infantPricePaise != null ? Math.round((num(pkgForm.infantPricePaise) ?? 0) * 100) : null,
      description: pkgForm.description || undefined,
      inclusionsJson: pkgForm.inclusionsJson || '[]', exclusionsJson: pkgForm.exclusionsJson || '[]',
      documentsJson: pkgForm.documentsJson || '[]', itineraryJson: pkgForm.itineraryJson || '[]', termsJson: pkgForm.termsJson || '[]',
      specialNeeds: pkgForm.specialNeeds || undefined, supplierRef: pkgForm.supplierRef || undefined,
      featured: bool(pkgForm.featured), status: pkgForm.status,
    };
    savePackageMutation.mutate({ id: editingPkg?.id, body });
  };

  const inputCls = 'w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold text-xs';
  const labelCls = 'font-semibold text-brand-navy/40 block mb-1 text-[10px] uppercase tracking-wider';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-navy">Umrah &amp; Travel Desk</h1>
          <p className="text-xs text-brand-navy/40 font-medium">Package inventory, announced dates (capacity 30), manifests, and checklists.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${inventoryEnabled ? 'bg-emerald-500/15 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>
            {inventoryEnabled ? '● Live' : '○ Coming Soon'}
          </span>
          {isManager && (
            <button
              onClick={() => toggleSettingsMutation.mutate(!inventoryEnabled)}
              disabled={toggleSettingsMutation.isPending}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50 ${inventoryEnabled ? 'border border-rose-300 text-rose-600 hover:bg-rose-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
            >
              {inventoryEnabled ? 'Switch to Coming Soon' : 'Go Live'}
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-brand-navy/[0.08] text-xs font-semibold gap-6 pb-2.5">
        <button
          onClick={() => setActiveSubTab('packages')}
          className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${activeSubTab === 'packages' ? 'border-brand-gold text-brand-navy' : 'border-transparent text-brand-navy/50 hover:text-brand-navy'}`}
        >
          Packages
        </button>
        <button
          onClick={() => setActiveSubTab('departures')}
          className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${activeSubTab === 'departures' ? 'border-brand-gold text-brand-navy' : 'border-transparent text-brand-navy/50 hover:text-brand-navy'}`}
        >
          Departure Calendar
        </button>
        <button
          onClick={() => { setActiveSubTab('groups'); }}
          className={`pb-2.5 transition-colors cursor-pointer border-b-2 ${activeSubTab === 'groups' ? 'border-brand-gold text-brand-navy' : 'border-transparent text-brand-navy/50 hover:text-brand-navy'}`}
        >
          Group Departures Manifest
        </button>
      </div>

      {/* ══════════ PACKAGES TAB ══════════ */}
      {activeSubTab === 'packages' && (
        <div className="space-y-4">
          {/* Tier guide — what each tier means (staff + client see the same) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(TIER_INFO).map(([k, info]) => (
              <div key={k} className="rounded-xl border border-brand-navy/10 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${k === 'premium' ? 'bg-brand-gold/15 text-brand-gold' : k === 'luxury' ? 'bg-purple-500/15 text-purple-700' : k === 'standard' ? 'bg-blue-500/15 text-blue-700' : 'bg-brand-navy/[0.06] text-brand-navy/60'}`}>{TIER_LABEL[k]}</span>
                </div>
                <p className="text-[10px] text-brand-navy/50 mt-1.5 leading-relaxed">{info}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-brand-navy/40">{pkgsLoading ? 'Loading packages…' : `${packages.length} packages in inventory`}</p>
            {isManager && (
              <button
                onClick={openCreatePkg}
                className="bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer"
              >
                + New Package
              </button>
            )}
          </div>
          {pkgsLoading ? (
            <p className="text-xs text-brand-navy/50 italic">Loading…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {packages.map(p => {
                const fill = p.totalSeats ? Math.round(((p.filledSeats || 0) / p.totalSeats) * 100) : 0;
                return (
                  <div key={p.id} className="rounded-xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3 hover:border-brand-gold/60 hover:bg-brand-navy/[0.04] backdrop-blur-sm transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${p.tier === 'premium' ? 'bg-brand-gold/15 text-brand-gold' : p.tier === 'luxury' ? 'bg-purple-500/15 text-purple-700' : p.tier === 'standard' ? 'bg-blue-500/15 text-blue-700' : 'bg-brand-navy/[0.06] text-brand-navy/60'}`}>{TIER_LABEL[p.tier]} Tier</span>
                      <div className="flex items-center gap-1.5">
                        {p.featured && <span className="text-[9px] font-bold uppercase text-brand-gold">★ Featured</span>}
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${p.status === 'open' ? 'bg-emerald-500/15 text-emerald-700' : p.status === 'draft' ? 'bg-brand-navy/[0.06] text-brand-navy/50' : p.status === 'paused' ? 'bg-amber-500/15 text-amber-700' : 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{p.status}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-brand-navy font-bold text-sm">{p.name}</div>
                      <div className="text-[10px] text-brand-navy/40 mt-0.5">
                        {p.totalDays} days · {p.makkahNights}N Makkah / {p.madinahNights}N Madinah · {p.flightType.replace('_', ' ')}
                        {p.departureCity ? ` · from ${p.departureCity}` : ''}
                      </div>
                    </div>
                    <div className="text-[10px] text-brand-navy/40 space-y-1">
                      <div>Retail: <span className="font-bold text-brand-gold">{INR(p.retailPricePaise)}</span> · Advance: {INR(p.advanceFeePaise)} (non-refundable)</div>
                      <div>Wholesale: <span className="font-mono">{INR(p.wholesalePricePaise)}</span> · Margin: <span className="font-bold text-emerald-700">{p.retailPricePaise > 0 ? Math.round(((p.retailPricePaise - p.wholesalePricePaise) / p.retailPricePaise) * 100) : 0}%</span></div>
                      <div>Departures: <span className="font-bold text-brand-navy">{p.openDepartureCount || 0} open</span> · {p.departureCount || 0} total</div>
                      {p.totalSeats ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-brand-navy/[0.08] overflow-hidden">
                            <div className={`h-full rounded-full ${fill >= 100 ? 'bg-rose-500' : fill >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, fill)}%` }} />
                          </div>
                          <span className="font-mono text-[9px]">{p.filledSeats}/{p.totalSeats} seats</span>
                        </div>
                      ) : (
                        <div className="text-[9px] italic text-brand-navy/30">No open departures announced yet</div>
                      )}
                    </div>
                    {isManager && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button onClick={() => openEditPkg(p)} className="border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy text-[10px] font-bold px-2.5 py-1 rounded hover:border-brand-gold/50 transition-all cursor-pointer">✎ Edit</button>
                        {p.status === 'draft' && <button onClick={() => pkgStatusMutation.mutate({ id: p.id, status: 'open' })} className="bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded hover:bg-emerald-700 transition-all cursor-pointer">Publish</button>}
                        {p.status === 'open' && <button onClick={() => pkgStatusMutation.mutate({ id: p.id, status: 'paused' })} className="border border-amber-300 text-amber-700 text-[10px] font-bold px-2.5 py-1 rounded hover:bg-amber-50 transition-all cursor-pointer">Pause</button>}
                        {p.status === 'paused' && <button onClick={() => pkgStatusMutation.mutate({ id: p.id, status: 'open' })} className="bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded hover:bg-emerald-700 transition-all cursor-pointer">Resume</button>}
                        {(p.status === 'open' || p.status === 'paused') && <button onClick={() => pkgStatusMutation.mutate({ id: p.id, status: 'closed' })} className="border border-rose-300 text-rose-600 text-[10px] font-bold px-2.5 py-1 rounded hover:bg-rose-50 transition-all cursor-pointer">Close</button>}
                      </div>
                    )}
                  </div>
                );
              })}
              {packages.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-brand-navy/15 bg-white/60 p-10 text-center">
                  <p className="text-sm font-bold text-brand-navy">No packages yet</p>
                  <p className="text-xs text-brand-navy/40 mt-1">Create your first Umrah package to start building inventory.</p>
                  {isManager && (
                    <button onClick={openCreatePkg} className="mt-4 bg-brand-gold text-brand-navy text-xs font-bold px-4 py-2 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer">+ New Package</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════ DEPARTURE CALENDAR TAB ══════════ */}
      {activeSubTab === 'departures' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UmrahCalendar
              days={calData?.days || []}
              month={calMonth}
              onMonthChange={setCalMonth}
              onSelectDay={(d) => setSelectedDay(d)}
              mode="staff"
              onAnnounce={(d) => setAnnounceDate(d)}
            />
          </div>
          <div className="space-y-4">
            {selectedDay ? (
              <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-brand-navy text-sm">Departure Detail</h3>
                  <button onClick={() => setSelectedDay(null)} className="text-brand-navy/40 hover:text-brand-navy cursor-pointer">✕</button>
                </div>
                <div className="space-y-1.5 text-brand-navy/70">
                  <div className="font-bold text-brand-navy">{fmtDate(selectedDay.date)}{selectedDay.endDate && selectedDay.endDate !== selectedDay.date ? ` → ${fmtDate(selectedDay.endDate)}` : ''}</div>
                  <div>{selectedDay.packageName || 'Standalone departure'} · <span className="font-bold text-brand-gold">{TIER_LABEL[selectedDay.tier] || selectedDay.tier}</span></div>
                  {TIER_INFO[selectedDay.tier] && <div className="text-[10px] text-brand-navy/50 italic">{TIER_INFO[selectedDay.tier]}</div>}
                  {selectedDay.departureCity && <div>From {selectedDay.departureCity}</div>}
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-brand-navy/[0.08] overflow-hidden">
                      <div className={`h-full rounded-full ${selectedDay.fillPct >= 100 ? 'bg-rose-500' : selectedDay.fillPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, selectedDay.fillPct)}%` }} />
                    </div>
                    <span className="font-mono text-[10px]">{selectedDay.bookedSeats}/{selectedDay.capacity} booked</span>
                  </div>
                  <div>Available: <span className={`font-bold ${selectedDay.available > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{selectedDay.available} seats</span></div>
                  <div>Retail {INR(selectedDay.retailPricePaise)} · Advance {INR(selectedDay.advanceFeePaise)}</div>
                  <div className="text-[10px] text-brand-navy/40">Status: <span className="font-bold uppercase">{selectedDay.status}</span></div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => { setSelectedDepartureId(selectedDay.id); setActiveSubTab('groups'); }}
                    className="flex-1 bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded hover:bg-brand-gold/90 transition-all cursor-pointer"
                  >
                    View Manifest
                  </button>
                  {isManager && (
                    <button
                      onClick={() => { setShowBook(true); setSelectedDay(null); }}
                      className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded hover:border-brand-gold/50 transition-all cursor-pointer"
                    >
                      + Book Seat
                    </button>
                  )}
                  {isManager && selectedDay.status !== 'cancelled' && (
                    <button
                      onClick={() => { if (confirm(`Cancel this departure (${fmtDate(selectedDay.date)})? All linked bookings will be released.`)) cancelDepartureMutation.mutate(selectedDay.id); }}
                      disabled={cancelDepartureMutation.isPending}
                      className="w-full border border-rose-300 text-rose-600 text-[10px] font-bold px-3 py-1.5 rounded hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancel Departure
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-6 text-center text-xs text-brand-navy/40">
                Select a date on the calendar to see departure details.
                {isManager && <p className="mt-2 text-[10px]">Tip: click an empty future date to announce a departure (capacity 30).</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ MANIFEST TAB ══════════ */}
      {activeSubTab === 'groups' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 text-xs">
          <div className="lg:col-span-1 rounded-2xl border border-brand-navy/10 bg-white p-4 h-[420px] overflow-y-auto space-y-3 shadow-sm backdrop-blur-sm">
            <h3 className="text-xs uppercase font-bold text-brand-gold tracking-wider">Departure Batches</h3>
            {depsLoading ? <p className="text-xs text-brand-navy/50 italic">Loading…</p> : (
              <div className="space-y-2">
                {departures.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDepartureId(d.id)}
                    className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer flex flex-col gap-1 ${selectedDep?.id === d.id ? 'border-brand-gold bg-brand-gold/10 font-semibold' : 'border-brand-navy/10 hover:border-brand-gold/50 bg-brand-navy/[0.04]'}`}
                  >
                    <span className="font-bold text-brand-navy">{TIER_LABEL[d.packageTier]} · {fmtDate(d.departureDate)}</span>
                    <span className="text-[10px] text-brand-navy/40 font-mono">{d.bookedSeats}/{d.capacity} seats · {INR(d.price)}</span>
                  </button>
                ))}
                {departures.length === 0 && <p className="text-xs text-brand-navy/50 italic">No departures yet.</p>}
              </div>
            )}
          </div>

          <div className="lg:col-span-3 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4 backdrop-blur-sm">
            {selectedDep ? (
              <>
                <div className="flex items-center justify-between border-b border-brand-navy/[0.08] pb-3">
                  <div>
                    <h3 className="font-display font-bold text-brand-navy text-sm">Passenger Manifest</h3>
                    <p className="text-[10px] text-brand-navy/50 mt-0.5">{TIER_LABEL[selectedDep.packageTier]} · {fmtDate(selectedDep.departureDate)} · {manifest.length} passengers</p>
                  </div>
                  <div className="flex gap-2">
                    {isManager && (
                      <button
                        onClick={() => setShowBook(true)}
                        className="bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded hover:bg-brand-gold/90 transition-all cursor-pointer"
                      >
                        + Book Seat
                      </button>
                    )}
                    <button
                      onClick={exportCsv}
                      disabled={manifest.length === 0}
                      className="border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded hover:border-brand-gold/50 transition-all cursor-pointer disabled:opacity-40"
                    >
                      Export Manifest (CSV)
                    </button>
                  </div>
                </div>

                {manifestLoading ? (
                  <p className="text-xs text-brand-navy/50 italic">Loading manifest…</p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-brand-navy/10 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-brand-navy/[0.08] bg-brand-navy/[0.04] text-[10px] uppercase font-bold tracking-wider text-brand-gold">
                        <tr>
                          <th className="px-4 py-3">Pilgrim / Party</th>
                          <th className="px-4 py-3">Booking</th>
                          <th className="px-4 py-3">Room</th>
                          <th className="px-4 py-3">Passport</th>
                          <th className="px-4 py-3">Visa</th>
                          <th className="px-4 py-3">Vaccine</th>
                          <th className="px-4 py-3">Ticket</th>
                          {isManager && <th className="px-4 py-3">Control</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-navy/[0.08] text-brand-navy/70">
                        {manifest.map(m => (
                          <tr key={m.bookingId} className="hover:bg-brand-navy/[0.04]">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-brand-navy">{m.name}</div>
                              {m.paxCount > 1 && (
                                <div className="mt-1 space-y-0.5">
                                  {m.passengers?.map((p, i) => (
                                    <div key={i} className="text-[9px] text-brand-navy/50 flex items-center gap-1">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-gold/60" />
                                      {p.name} <span className="text-brand-navy/30">· {CATEGORY_SHORT[p.category] || p.category}{p.passportNumber ? ` · ${p.passportNumber}` : ''}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {m.paxCount > 1 && <span className="mt-1 inline-flex rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-[9px] font-bold text-brand-navy/60">👨‍👩‍👧‍👦 {m.paxCount} pax</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${m.status === 'confirmed' ? 'bg-emerald-500/15 text-emerald-700' : m.status === 'waitlist' ? 'bg-amber-500/15 text-amber-700' : m.status === 'reserved' ? 'bg-blue-500/15 text-blue-700' : 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{m.status}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${m.occupancy === 'solo' ? 'bg-purple-500/15 text-purple-700' : 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{m.occupancy === 'solo' ? '🧳 Solo' : 'Shared'}</span>
                              {m.roomConfig && m.paxCount > 1 && <span className="ml-1 inline-flex rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-[9px] font-bold text-brand-navy/50">{m.roomConfig}</span>}
                            </td>
                            {(['passportScanned', 'visaIssued', 'vaccineCertificate', 'ticketIssued'] as const).map(key => (
                              <td key={key} className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={m[key]}
                                  onChange={(e) => toggleChecklistFlag.mutate({ row: m, key, value: e.target.checked })}
                                  className="h-4 w-4 rounded accent-brand-gold border-brand-navy/20 cursor-pointer"
                                />
                              </td>
                            ))}
                            {isManager && (
                              <td className="px-4 py-3">
                                {m.status !== 'cancelled' && (
                                  <button
                                    onClick={() => { if (confirm(`Release ${m.name}'s booking? Seat returns to inventory.`)) releaseBookingMutation.mutate(m.bookingId); }}
                                    disabled={releaseBookingMutation.isPending}
                                    className="border border-rose-300 text-rose-600 text-[9px] font-bold px-2 py-1 rounded hover:bg-rose-50 transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    Release
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                        {manifest.length === 0 && (
                          <tr><td colSpan={isManager ? 8 : 7} className="px-4 py-8 text-center text-brand-navy/50 italic">No passengers assigned yet. Book a seat to start the checklist.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-brand-navy/50 italic py-12 text-center">Select a departure batch to view its manifest.</p>
            )}
          </div>
        </div>
      )}

      {/* ══════════ PACKAGE FORM MODAL ══════════ */}
      {showPkgModal && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl border border-brand-navy/10 bg-white w-full max-w-2xl shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-brand-navy/10 px-6 py-4 flex justify-between items-center z-10">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">{editingPkg ? 'Edit Package' : 'New Umrah Package'}</h3>
              <button onClick={() => setShowPkgModal(false)} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
            </div>
            <div className="p-6 space-y-5 text-xs">
              {/* Identity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className={labelCls}>Package Name *</label>
                  <input className={inputCls} value={pkgForm.name} onChange={(e) => setF('name', e.target.value)} placeholder="e.g. Economy 7-Night Umrah — Hyderabad" />
                </div>
                <div>
                  <label className={labelCls}>Tier</label>
                  <select className={inputCls} value={pkgForm.tier} onChange={(e) => setF('tier', e.target.value)}>
                    <option value="economy">Economy</option><option value="standard">Standard</option><option value="premium">Premium</option><option value="luxury">Luxury</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={pkgForm.status} onChange={(e) => setF('status', e.target.value)}>
                    <option value="draft">Draft</option><option value="open">Open</option><option value="paused">Paused</option><option value="closed">Closed</option><option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Duration */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">Duration</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className={labelCls}>Total Days</label><input type="number" className={inputCls} value={pkgForm.totalDays} onChange={(e) => setF('totalDays', e.target.value)} /></div>
                  <div><label className={labelCls}>Makkah Nights</label><input type="number" className={inputCls} value={pkgForm.makkahNights} onChange={(e) => setF('makkahNights', e.target.value)} /></div>
                  <div><label className={labelCls}>Madinah Nights</label><input type="number" className={inputCls} value={pkgForm.madinahNights} onChange={(e) => setF('madinahNights', e.target.value)} /></div>
                </div>
              </div>

              {/* Flight */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">✈️ Flight</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><label className={labelCls}>Flight Type</label>
                    <select className={inputCls} value={pkgForm.flightType} onChange={(e) => setF('flightType', e.target.value)}>
                      <option value="direct">Direct</option><option value="one_stop">1 Stop</option><option value="two_stop">2 Stops</option><option value="varies">Varies</option>
                    </select>
                  </div>
                  <div><label className={labelCls}>Airline</label><input className={inputCls} value={pkgForm.airline} onChange={(e) => setF('airline', e.target.value)} placeholder="Saudia / IndiGo" /></div>
                  <div><label className={labelCls}>Departure City</label><input className={inputCls} value={pkgForm.departureCity} onChange={(e) => setF('departureCity', e.target.value)} placeholder="Hyderabad" /></div>
                  <div><label className={labelCls}>Arrival Airport</label><input className={inputCls} value={pkgForm.arrivalAirport} onChange={(e) => setF('arrivalAirport', e.target.value)} placeholder="Jeddah (JED)" /></div>
                  <div><label className={labelCls}>Baggage Allowance</label><input className={inputCls} value={pkgForm.baggageAllowance} onChange={(e) => setF('baggageAllowance', e.target.value)} placeholder="30 kg + 7 kg hand" /></div>
                  <div><label className={labelCls}>Class</label>
                    <select className={inputCls} value={pkgForm.flightClass} onChange={(e) => setF('flightClass', e.target.value)}>
                      <option value="economy">Economy</option><option value="business">Business</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2 text-brand-navy/60 cursor-pointer">
                  <input type="checkbox" checked={bool(pkgForm.zamzamIncluded)} onChange={(e) => setF('zamzamIncluded', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" />
                  Zamzam (5L) included
                </label>
              </div>

              {/* Makkah hotel */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">🏨 Makkah Hotel</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2"><label className={labelCls}>Hotel</label><input className={inputCls} value={pkgForm.makkahHotel} onChange={(e) => setF('makkahHotel', e.target.value)} placeholder="Swissôtel Al Maqam" /></div>
                  <div><label className={labelCls}>Stars</label><input type="number" min={1} max={7} className={inputCls} value={pkgForm.makkahHotelStars} onChange={(e) => setF('makkahHotelStars', e.target.value)} /></div>
                  <div><label className={labelCls}>Distance (m)</label><input type="number" className={inputCls} value={pkgForm.makkahDistanceMeters} onChange={(e) => setF('makkahDistanceMeters', e.target.value)} placeholder="150" /></div>
                  <div><label className={labelCls}>Walk (min)</label><input type="number" className={inputCls} value={pkgForm.makkahWalkMinutes} onChange={(e) => setF('makkahWalkMinutes', e.target.value)} placeholder="2" /></div>
                  <div><label className={labelCls}>Haram View</label>
                    <select className={inputCls} value={pkgForm.makkahHaramView} onChange={(e) => setF('makkahHaramView', e.target.value)}>
                      <option value="none">None</option><option value="partial">Partial</option><option value="full">Full</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Madinah hotel */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">🏨 Madinah Hotel</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2"><label className={labelCls}>Hotel</label><input className={inputCls} value={pkgForm.madinahHotel} onChange={(e) => setF('madinahHotel', e.target.value)} placeholder="Mövenpick Anwar Al Madinah" /></div>
                  <div><label className={labelCls}>Stars</label><input type="number" min={1} max={7} className={inputCls} value={pkgForm.madinahHotelStars} onChange={(e) => setF('madinahHotelStars', e.target.value)} /></div>
                  <div><label className={labelCls}>Distance (m)</label><input type="number" className={inputCls} value={pkgForm.madinahDistanceMeters} onChange={(e) => setF('madinahDistanceMeters', e.target.value)} placeholder="400" /></div>
                  <div><label className={labelCls}>Walk (min)</label><input type="number" className={inputCls} value={pkgForm.madinahWalkMinutes} onChange={(e) => setF('madinahWalkMinutes', e.target.value)} placeholder="5" /></div>
                  <div><label className={labelCls}>Haram View</label>
                    <select className={inputCls} value={pkgForm.madinahHaramView} onChange={(e) => setF('madinahHaramView', e.target.value)}>
                      <option value="none">None</option><option value="partial">Partial</option><option value="full">Full</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Room & meals */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">🛏️ Room &amp; Meals</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><label className={labelCls}>Room Sharing</label>
                    <select className={inputCls} value={pkgForm.roomSharing} onChange={(e) => setF('roomSharing', e.target.value)}>
                      <option value="quad">Quad</option><option value="triple">Triple</option><option value="double">Double</option><option value="single">Single</option>
                    </select>
                  </div>
                  <div><label className={labelCls}>Meals Plan</label>
                    <select className={inputCls} value={pkgForm.mealsPlan} onChange={(e) => setF('mealsPlan', e.target.value)}>
                      <option value="none">None</option><option value="breakfast">Breakfast</option><option value="half_board">Half Board</option><option value="full_board">Full Board</option>
                    </select>
                  </div>
                  <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={bool(pkgForm.shuttleService)} onChange={(e) => setF('shuttleService', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> Shuttle service</label></div>
                </div>
                <div className="mt-3 rounded-lg border border-brand-navy/10 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer">
                    <input type="checkbox" checked={bool(pkgForm.soloAvailable)} onChange={(e) => setF('soloAvailable', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" />
                    <span className="font-semibold">🧳 Solo travel available</span>
                    <span className="text-[9px] text-brand-navy/40">(client travels alone — private room)</span>
                  </label>
                  {bool(pkgForm.soloAvailable) && (
                    <div>
                      <label className={labelCls}>Solo supplement (₹, per person)</label>
                      <input type="number" className={inputCls} value={pkgForm.soloSupplementPaise} onChange={(e) => setF('soloSupplementPaise', e.target.value)} placeholder="e.g. 20000" />
                      <p className="text-[9px] text-brand-navy/40 mt-1">Added to the retail price when a client books solo occupancy.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Transport & tours */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">🚌 Transport &amp; Tours</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><label className={labelCls}>Intercity Transport</label>
                    <select className={inputCls} value={pkgForm.intercityTransport} onChange={(e) => setF('intercityTransport', e.target.value)}>
                      <option value="group_bus">Group Bus</option><option value="private_car">Private Car</option><option value="luxury_car">Luxury Car</option><option value="none">None</option>
                    </select>
                  </div>
                  <div><label className={labelCls}>Guide Language</label><input className={inputCls} value={pkgForm.guideLanguage} onChange={(e) => setF('guideLanguage', e.target.value)} placeholder="Telugu / Urdu / Hindi / English" /></div>
                  <div className="flex flex-col gap-2 justify-end pb-1">
                    <label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={bool(pkgForm.airportTransfer)} onChange={(e) => setF('airportTransfer', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> Airport transfer</label>
                    <label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={bool(pkgForm.ziyaratTours)} onChange={(e) => setF('ziyaratTours', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> Ziyarat tours</label>
                    <label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={bool(pkgForm.groupLeader)} onChange={(e) => setF('groupLeader', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> Group leader</label>
                  </div>
                </div>
              </div>

              {/* Visa */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">🛂 Visa</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><label className={labelCls}>Visa Lead (days)</label><input type="number" className={inputCls} value={pkgForm.visaLeadDays} onChange={(e) => setF('visaLeadDays', e.target.value)} /></div>
                  <div className="flex flex-col gap-2 justify-end pb-1">
                    <label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={bool(pkgForm.visaIncluded)} onChange={(e) => setF('visaIncluded', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> Visa included</label>
                    <label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={bool(pkgForm.ksaInsurance)} onChange={(e) => setF('ksaInsurance', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> KSA insurance</label>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">💰 Pricing (₹)</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div><label className={labelCls}>Wholesale (cost)</label><input type="number" className={inputCls} value={pkgForm.wholesalePricePaise} onChange={(e) => setF('wholesalePricePaise', e.target.value)} placeholder="0" /></div>
                  <div><label className={labelCls}>Retail (per person)</label><input type="number" className={inputCls} value={pkgForm.retailPricePaise} onChange={(e) => setF('retailPricePaise', e.target.value)} placeholder="125000" /></div>
                  <div><label className={labelCls}>Advance (non-refundable)</label><input type="number" className={inputCls} value={pkgForm.advanceFeePaise} onChange={(e) => setF('advanceFeePaise', e.target.value)} placeholder="500" /></div>
                  <div><label className={labelCls}>Reserve hold (hours)</label><input type="number" className={inputCls} value={pkgForm.reserveHoldHours} onChange={(e) => setF('reserveHoldHours', e.target.value)} placeholder="72" /></div>
                  <div><label className={labelCls}>Balance due (days before)</label><input type="number" className={inputCls} value={pkgForm.balanceDueDaysBefore} onChange={(e) => setF('balanceDueDaysBefore', e.target.value)} placeholder="30" /></div>
                  <div><label className={labelCls}>Group discount (%)</label><input type="number" className={inputCls} value={pkgForm.groupDiscountPct} onChange={(e) => setF('groupDiscountPct', e.target.value)} placeholder="5" /></div>
                  <div><label className={labelCls}>Group min pax</label><input type="number" className={inputCls} value={pkgForm.groupDiscountMinPax} onChange={(e) => setF('groupDiscountMinPax', e.target.value)} placeholder="20" /></div>
                  <div><label className={labelCls}>Child 2–11 with bed (₹)</label><input type="number" className={inputCls} value={pkgForm.childWithBedPricePaise} onChange={(e) => setF('childWithBedPricePaise', e.target.value)} placeholder="blank = adult rate" /></div>
                  <div><label className={labelCls}>Child 2–4 no bed (₹)</label><input type="number" className={inputCls} value={pkgForm.childNoBedPricePaise} onChange={(e) => setF('childNoBedPricePaise', e.target.value)} placeholder="blank = adult rate" /></div>
                  <div><label className={labelCls}>Infant 0–2 (₹)</label><input type="number" className={inputCls} value={pkgForm.infantPricePaise} onChange={(e) => setF('infantPricePaise', e.target.value)} placeholder="blank = adult rate" /></div>
                  <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={bool(pkgForm.installmentAvailable)} onChange={(e) => setF('installmentAvailable', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> Installments available</label></div>
                </div>
              </div>

              {/* Content */}
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">📋 Content</h4>
                <div className="space-y-3">
                  <div><label className={labelCls}>Description</label><textarea className={inputCls} rows={2} value={pkgForm.description} onChange={(e) => setF('description', e.target.value)} placeholder="What makes this package special…" /></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className={labelCls}>Inclusions (JSON array)</label><textarea className={inputCls} rows={3} value={pkgForm.inclusionsJson} onChange={(e) => setF('inclusionsJson', e.target.value)} placeholder='["Visa + KSA insurance", "Return flights", "Hotel nights"]' /></div>
                    <div><label className={labelCls}>Exclusions (JSON array)</label><textarea className={inputCls} rows={3} value={pkgForm.exclusionsJson} onChange={(e) => setF('exclusionsJson', e.target.value)} placeholder='["PCR test", "Room service", "Personal expenses"]' /></div>
                    <div><label className={labelCls}>Documents (JSON array)</label><textarea className={inputCls} rows={3} value={pkgForm.documentsJson} onChange={(e) => setF('documentsJson', e.target.value)} placeholder='["Passport (6-month validity)", "Photos", "Vaccination"]' /></div>
                    <div><label className={labelCls}>Terms &amp; refund (JSON array)</label><textarea className={inputCls} rows={3} value={pkgForm.termsJson} onChange={(e) => setF('termsJson', e.target.value)} placeholder='["Advance ₹500 non-refundable", "Balance due 30 days before"]' /></div>
                  </div>
                  <div><label className={labelCls}>Special needs</label><input className={inputCls} value={pkgForm.specialNeeds} onChange={(e) => setF('specialNeeds', e.target.value)} placeholder="Wheelchair accessible, elderly-friendly, family rooms" /></div>
                  <div><label className={labelCls}>Supplier reference</label><input className={inputCls} value={pkgForm.supplierRef} onChange={(e) => setF('supplierRef', e.target.value)} placeholder="Wholesale supplier ref" /></div>
                  <label className="flex items-center gap-2 text-brand-navy/60 cursor-pointer"><input type="checkbox" checked={bool(pkgForm.featured)} onChange={(e) => setF('featured', e.target.checked)} className="h-3.5 w-3.5 accent-brand-gold" /> ★ Featured package</label>
                </div>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-brand-navy/10 px-6 py-4 flex gap-3">
              <button onClick={() => setShowPkgModal(false)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
              <button
                disabled={!pkgForm.name || savePackageMutation.isPending}
                onClick={submitPkg}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
              >
                {editingPkg ? 'Save Changes' : 'Create Package'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ANNOUNCE DEPARTURE MODAL (from calendar) ══════════ */}
      {announceDate && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-96 shadow-lg space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Announce Departure</h3>
              <button onClick={() => setAnnounceDate(null)} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
            </div>
            <p className="text-[10px] text-brand-navy/40">Start: <span className="font-bold text-brand-navy">{announceDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>{announceEndDate ? ` → End: ${new Date(announceEndDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}` : ''}</p>
            <div className="space-y-3">
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Package</label>
                <select
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white"
                  value={announcePkgId}
                  onChange={(e) => setAnnouncePkgId(e.target.value)}
                >
                  <option value="">-- Standalone (no package) --</option>
                  {packages.filter(p => p.status === 'open').map(p => <option key={p.id} value={p.id}>{p.name} — {INR(p.retailPricePaise)}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-brand-navy/40 block mb-1">End Date (optional)</label>
                  <input type="date" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" value={announceEndDate} onChange={(e) => setAnnounceEndDate(e.target.value)} />
                </div>
                <div>
                  <label className="font-semibold text-brand-navy/40 block mb-1">Slots (capacity)</label>
                  <input type="number" min={1} max={200} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" value={announceCapacity} onChange={(e) => setAnnounceCapacity(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Departure City (optional)</label>
                <input className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" value={announceCity} onChange={(e) => setAnnounceCity(e.target.value)} placeholder="Hyderabad" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Price override (₹, optional)</label>
                <input type="number" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" value={announcePrice} onChange={(e) => setAnnouncePrice(e.target.value)} placeholder="Leave empty = package retail" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setAnnounceDate(null)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
              <button
                disabled={packagesBusy}
                onClick={() => {
                  setPackagesBusy(true);
                  const pkg = packages.find(p => p.id === announcePkgId);
                  const endTs = announceEndDate ? Math.floor(new Date(announceEndDate).getTime() / 1000) : undefined;
                  announceMutation.mutate({
                    packageId: announcePkgId || pkg?.id,
                    body: {
                      packageTier: pkg?.tier || 'standard',
                      departureDate: Math.floor(announceDate.getTime() / 1000),
                      endDate: endTs,
                      departureCity: announceCity || undefined,
                      price: announcePrice ? Math.round(parseFloat(announcePrice) * 100) : undefined,
                      bookingFee: undefined,
                      capacity: announceCapacity ? Math.max(1, Math.min(200, parseInt(announceCapacity) || 30)) : 30,
                    }
                  });
                  setTimeout(() => setPackagesBusy(false), 1500);
                }}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
              >
                Announce ({announceCapacity ? Math.max(1, Math.min(200, parseInt(announceCapacity) || 30)) : 30} slots)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ BOOK SEAT MODAL ══════════ */}
      {showBook && selectedDep && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-96 shadow-lg space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Book Seat — {TIER_LABEL[selectedDep.packageTier]} {fmtDate(selectedDep.departureDate)}</h3>
              <button onClick={() => setShowBook(false)} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-brand-navy/40 block mb-1">Select Umrah Pilgrim</label>
              <select value={bookClientId} onChange={(e) => setBookClientId(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white">
                <option value="">-- Choose pilgrim --</option>
                {umrahClients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                {umrahClients.length === 0 && <option disabled>No umrah-division clients registered</option>}
              </select>
              <p className="text-[10px] text-brand-navy/40 italic pt-1">Seat booking charges the booking fee to the client&apos;s ledger automatically.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowBook(false)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
              <button
                disabled={!bookClientId}
                onClick={() => bookSeatMutation.mutate({ departureId: selectedDep.id, clientId: bookClientId })}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
              >
                Confirm Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
