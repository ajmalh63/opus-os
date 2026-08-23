import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import UmrahCalendar, { UmrahCalendarDay, TIER_INFO } from './UmrahCalendar';

interface UmrahPackage {
  id: string;
  name: string;
  tier: string;
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
  soloAvailable: boolean;
  soloSupplementPaise: number;
  childWithBedPricePaise?: number | null;
  childNoBedPricePaise?: number | null;
  infantPricePaise?: number | null;
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
  retailPricePaise: number;
  advanceFeePaise: number;
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
  featured: boolean;
  upcomingDepartures?: number;
  nextDeparture?: number | null;
}

interface Departure {
  id: string;
  departureDate: number;
  endDate: number | null;
  departureCity: string | null;
  capacity: number;
  bookedSeats: number;
  available: number;
  price: number;
  bookingFee: number;
  status: string;
}

interface MyBooking {
  id: string;
  status: string;
  occupancy: string;
  paxCount: number;
  roomConfig: string | null;
  passengers: { name: string; dob: string | null; passportNumber: string | null; category: string; specialNeeds: string | null }[];
  partyTotalPaise: number;
  perPersonPaise: { adult: number; childWithBed: number; childNoBed: number; infant: number } | null;
  soloSupplementPaise: number;
  groupDiscountPct: number;
  advancePaid: boolean;
  balancePaid: boolean;
  reservedUntil: number | null;
  createdAt: number;
  departure: { id: string; date: number; city: string | null; status: string } | null;
  package: { id: string; name: string; tier: string; retailPricePaise: number } | null;
  advance_fee_paise: number;
  balance_paise: number;
  balance_due: number;
  hold_expired: boolean;
}

type PaxCategory = 'adult' | 'child_with_bed' | 'child_no_bed' | 'infant';
interface PaxRow { id: number; name: string; dob: string; category: PaxCategory; }

const CATEGORY_LABEL: Record<PaxCategory, string> = {
  adult: 'Adult (18+)',
  child_with_bed: 'Child 2–11 (with bed)',
  child_no_bed: 'Child 2–4 (no bed)',
  infant: 'Infant 0–2',
};
const CATEGORY_SHORT: Record<PaxCategory, string> = {
  adult: 'Adult', child_with_bed: 'Child+bed', child_no_bed: 'Child (no bed)', infant: 'Infant',
};

const INR = (p: number) => '₹' + (p / 100).toLocaleString('en-IN');
const TIER_LABEL: Record<string, string> = { economy: 'Economy', standard: 'Standard', premium: 'Premium', luxury: 'Luxury' };
const MEALS: Record<string, string> = { none: 'No meals', breakfast: 'Breakfast', half_board: 'Half board', full_board: 'Full board' };
const ROOM: Record<string, string> = { quad: 'Quad', triple: 'Triple', double: 'Double', single: 'Single' };
const FLIGHT: Record<string, string> = { direct: 'Direct', one_stop: '1 stop', two_stop: '2 stops', varies: 'Varies' };

function distanceZone(m: number | null): string | null {
  if (m === null || m === undefined) return null;
  if (m <= 200) return 'Ultra-close';
  if (m <= 500) return 'Comfortable';
  if (m <= 800) return 'Manageable';
  return 'Shuttle';
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function UmrahClientSection({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'browse' | 'detail' | 'tracker'>('browse');
  const [selectedPkg, setSelectedPkg] = useState<UmrahPackage | null>(null);
  const [calMonth, setCalMonth] = useState(() => new Date());
  const [bookingDep, setBookingDep] = useState<Departure | null>(null);
  const [bookingOccupancy, setBookingOccupancy] = useState<'shared' | 'solo'>('shared');
  const [paxRows, setPaxRows] = useState<PaxRow[]>([]);
  const [roomConfig, setRoomConfig] = useState<string>('quad');
  const [payingBalance, setPayingBalance] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const toggleWishlist = (id: string) => setWishlist(s => { const ns = new Set(s); if (ns.has(id)) ns.delete(id); else ns.add(id); return ns; });
  const [openAccordion, setOpenAccordion] = useState('flight');
  // wishlist + compare + hold timer + sticky CTA — P1 Polish (spec in docs/STRATEGIC-IMPLEMENTATIONS)
  void wishlist; void toggleWishlist; void openAccordion; void setOpenAccordion;

  // ── Party builder helpers ──
  const paxCount = paxRows.length;
  const setCategoryCount = (cat: PaxCategory, count: number) => {
    setPaxRows(prev => {
      const existing = prev.filter(p => p.category !== cat);
      const add = Math.max(0, Math.min(30 - existing.length, count));
      const rows: PaxRow[] = [...existing];
      for (let i = 0; i < add; i++) {
        rows.push({ id: Date.now() + Math.random(), name: '', dob: '', category: cat });
      }
      return rows;
    });
  };
  const updatePaxRow = (id: number, patch: Partial<PaxRow>) => {
    setPaxRows(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  };
  const categoryCount = (cat: PaxCategory) => paxRows.filter(p => p.category === cat).length;

  // Live party price preview (mirrors the API math: per-person by category,
  // solo supplement only for a single traveller, group discount at threshold).
  const previewPartyPrice = (dep: Departure, pkg: UmrahPackage | undefined, rows: PaxRow[], occupancy: 'shared' | 'solo') => {
    const adult = dep.price || pkg?.retailPricePaise || 0;
    const childBed = pkg?.childWithBedPricePaise ?? adult;
    const childNoBed = pkg?.childNoBedPricePaise ?? adult;
    const infant = pkg?.infantPricePaise ?? adult;
    let total = 0;
    for (const r of rows) {
      if (r.category === 'child_with_bed') total += childBed;
      else if (r.category === 'child_no_bed') total += childNoBed;
      else if (r.category === 'infant') total += infant;
      else total += adult;
    }
    if (occupancy === 'solo' && rows.length === 1) total += pkg?.soloSupplementPaise ?? 0;
    const minPax = pkg?.groupDiscountMinPax;
    let discount = 0;
    if (minPax != null && rows.length >= minPax && pkg?.groupDiscountPct) {
      discount = pkg.groupDiscountPct;
      total = Math.round((total * (100 - discount)) / 100);
    }
    const advance = rows.length * (dep.bookingFee || pkg?.advanceFeePaise || 50000);
    return { total, advance, balance: Math.max(0, total - advance), adult, childBed, childNoBed, infant, discount };
  };

  // ── Queries ──
  const { data: pkgData, isLoading } = useQuery<{ success: boolean; comingSoon: boolean; enabled: boolean; packages: UmrahPackage[] }>({
    queryKey: ['portalUmrahPackages', token],
    queryFn: async () => {
      const r = await fetch('/api/public/portal/umrah/packages');
      if (!r.ok) throw new Error('Failed to fetch packages');
      return r.json();
    }
  });

  const { data: calData } = useQuery<{ success: boolean; comingSoon: boolean; enabled: boolean; days: UmrahCalendarDay[] }>({
    queryKey: ['portalUmrahCalendar', token, calMonth.getFullYear(), calMonth.getMonth()],
    queryFn: async () => {
      const r = await fetch('/api/public/portal/umrah/calendar');
      if (!r.ok) throw new Error('Calendar failed');
      return r.json();
    }
  });

  const { data: detailData } = useQuery<{ success: boolean; package: UmrahPackage; departures: Departure[] }>({
    queryKey: ['portalUmrahPkgDetail', selectedPkg?.id],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/umrah/packages/${selectedPkg!.id}`);
      if (!r.ok) throw new Error('Package detail failed');
      return r.json();
    },
    enabled: !!selectedPkg && view === 'detail'
  });

  const { data: myBookings } = useQuery<{ success: boolean; bookings: MyBooking[] }>({
    queryKey: ['portalUmrahMyBookings', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/umrah/my-bookings?token=${token}`);
      if (!r.ok) throw new Error('Bookings failed');
      return r.json();
    },
    enabled: view === 'tracker'
  });

  const comingSoon = pkgData?.comingSoon ?? false;
  const enabled = pkgData?.enabled ?? false;
  const packages = pkgData?.packages || [];
  const detail = detailData?.package;
  const departures = detailData?.departures || [];

  // ── Mutations ──
  const bookMutation = useMutation({
    mutationFn: async (departureId: string) => {
      const r = await fetch(`/api/public/portal/umrah/departures/${departureId}/book?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departureId })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Booking failed');
      return data;
    },
    onError: (e: any) => alert(e.message)
  });

  const verifyAdvanceMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch(`/api/public/portal/umrah/bookings/${payload.bookingId}/verify-advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Verification failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalUmrahMyBookings', token] });
      queryClient.invalidateQueries({ queryKey: ['portalUmrahCalendar', token] });
      alert('✓ Advance paid. Your seat is reserved for 3 days.');
      setView('tracker');
    },
    onError: (e: any) => alert(e.message)
  });

  const payBalanceMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const r = await fetch(`/api/public/portal/umrah/bookings/${bookingId}/pay-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Balance order failed');
      return data;
    }
  });

  const verifyBalanceMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch(`/api/public/portal/umrah/bookings/${payload.bookingId}/verify-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Verification failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalUmrahMyBookings', token] });
      alert('✓ Balance received. Your booking is confirmed.');
    },
    onError: (e: any) => alert(e.message)
  });

  // ── Razorpay flows ──
  const startAdvanceCheckout = async (dep: Departure, occupancy: 'shared' | 'solo' = 'shared', rows: PaxRow[] = [], room: string | null = null) => {
    const loaded = await loadRazorpay();
    if (!loaded) { alert('Razorpay checkout failed to load.'); return; }
    try {
      // Party payload: passengers default to the token client as a single adult.
      const passengers = rows.length
        ? rows.map(r => ({ name: r.name.trim(), dob: r.dob || undefined, category: r.category }))
        : undefined;
      if (rows.length && rows.some(r => !r.name.trim())) {
        alert('Please enter a name for every traveller.');
        return;
      }
      const res = await fetch(`/api/public/portal/umrah/departures/${dep.id}/book?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departureId: dep.id, occupancy, roomConfig: room || undefined, passengers })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Booking failed');

      const options = {
        key: data.key,
        amount: data.amount_paise,
        currency: data.currency || 'INR',
        name: 'Opus Overseas',
        description: `Umrah advance (non-refundable) — ${data.pax_count} pax`,
        order_id: data.order_id,
        handler: async function (response: any) {
          verifyAdvanceMutation.mutate({
            bookingId: data.bookingId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
        },
        theme: { color: '#0a2d50' }
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e: any) {
      alert(`Checkout failed: ${e.message}`);
    }
  };

  const startBalanceCheckout = async (b: MyBooking) => {
    const loaded = await loadRazorpay();
    if (!loaded) { alert('Razorpay checkout failed to load.'); return; }
    setPayingBalance(b.id);
    try {
      const res = await payBalanceMutation.mutateAsync(b.id);
      if (!res.success) throw new Error(res.error || 'Order failed');
      const options = {
        key: res.key,
        amount: res.amount_paise,
        currency: res.currency || 'INR',
        name: 'Opus Overseas',
        description: 'Umrah balance payment',
        order_id: res.order_id,
        handler: async function (response: any) {
          verifyBalanceMutation.mutate({
            bookingId: b.id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
        },
        theme: { color: '#0a2d50' }
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (e: any) {
      alert(`Balance checkout failed: ${e.message}`);
    } finally {
      setPayingBalance(null);
    }
  };

  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtDateTime = (ts: number) => new Date(ts * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const parseJson = (s: string): string[] => {
    try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
  };

  // Umrah documents upload — uses same generic vault presigned PUT as other divisions (portal.ts)
  // Gap fix: Umrah client had no <input type=file> (StudyAbroad has 2, Visa has 2, Manpower has 1, Umrah had 0)
  const uploadUmrahDoc = async (file: File) => {
    try {
      const pRes = await fetch(`/api/public/portal/documents/presigned?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(file.name)}`);
      const pData = await pRes.json();
      if (!pRes.ok || !pData.success || !pData.url) throw new Error(pData.error || 'Failed to generate upload link');
      const uRes = await fetch(pData.url, { method: 'PUT', body: await file.arrayBuffer() });
      if (!uRes.ok) throw new Error('Upload failed');
      queryClient.invalidateQueries({ queryKey: ['portalUmrahMyBookings', token] });
      alert('✓ ' + file.name + ' uploaded — our team will verify it shortly.');
    } catch (e: any) {
      alert('Upload failed: ' + (e.message || 'unknown'));
    }
  };

  // ── Coming Soon state ──
  if (comingSoon || !enabled) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-10 text-center">
        <div className="text-3xl mb-2">🕋</div>
        <h3 className="font-display font-bold text-brand-navy text-lg">Umrah Packages — Coming Soon</h3>
        <p className="text-xs text-brand-navy/40 mt-2 max-w-md mx-auto">
          We are finalising our Umrah packages. Check back soon to browse packages, view departure dates and reserve your seat.
        </p>
      </div>
    );
  }

  // ── Tracker view ──
  if (view === 'tracker') {
    const bookings = myBookings?.bookings || [];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-brand-navy text-sm">My Umrah Bookings</h3>
          <button onClick={() => setView('browse')} className="text-[10px] font-bold text-brand-gold hover:underline cursor-pointer">← Browse packages</button>
        </div>
        {bookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-8 text-center text-xs text-brand-navy/40">
            No bookings yet. Browse packages to reserve your seat.
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map(b => (
              <div key={b.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-brand-navy">{b.package?.name || 'Umrah booking'}</div>
                    <div className="text-[10px] text-brand-navy/40 mt-0.5">
                      {b.departure ? `Departure ${fmtDate(b.departure.date)}${b.departure.city ? ` · from ${b.departure.city}` : ''}` : 'Departure details pending'}
                      {b.occupancy === 'solo' && b.paxCount === 1 && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-700 font-bold">🧳 Solo (private room)</span>}
                      {b.paxCount > 1 && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-brand-navy/[0.06] text-brand-navy/60 font-bold">👨‍👩‍👧‍👦 {b.paxCount} travellers</span>}
                      {b.roomConfig && b.paxCount > 1 && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-brand-navy/[0.06] text-brand-navy/60 font-bold">🛏️ {b.roomConfig} rooming</span>}
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full ${b.status === 'confirmed' ? 'bg-emerald-500/15 text-emerald-700' : b.status === 'reserved' ? 'bg-blue-500/15 text-blue-700' : b.status === 'waitlist' ? 'bg-amber-500/15 text-amber-700' : b.status === 'cancelled' ? 'bg-rose-500/15 text-rose-600' : 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{b.status}</span>
                </div>

                {/* Party manifest (client view) */}
                {b.passengers && b.passengers.length > 0 && (
                  <div className="rounded-lg border border-brand-navy/10 bg-brand-navy/[0.02] p-3">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40 mb-1.5">Travellers ({b.passengers.length})</div>
                    <div className="space-y-1">
                      {b.passengers.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px] text-brand-navy/70">
                          <span className="font-semibold">{p.name}</span>
                          <span className="text-brand-navy/40">
                            {CATEGORY_SHORT[p.category as PaxCategory] || p.category}
                            {p.passportNumber ? ` · ${p.passportNumber}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                    {b.groupDiscountPct > 0 && (
                      <div className="text-[9px] text-emerald-700 font-bold mt-1.5">🎉 Group discount {b.groupDiscountPct}% applied</div>
                    )}
                  </div>
                )}

                {b.status === 'held' && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-200 p-3 text-[10px] text-amber-800 space-y-1">
                    <div className="font-bold">Advance payment pending</div>
                    <div>Pay the non-refundable advance of <b>{INR(b.advance_fee_paise)}</b> ({b.paxCount} × {INR(b.advance_fee_paise / Math.max(1, b.paxCount))}) to reserve {b.paxCount > 1 ? `${b.paxCount} seats` : 'your seat'} for 3 days.</div>
                    <div className="text-[9px] opacity-70">Unpaid holds are released automatically after 24 hours.</div>
                  </div>
                )}

                {b.status === 'reserved' && (
                  <div className="rounded-lg bg-blue-500/10 border border-blue-200 p-3 text-[10px] text-blue-800 space-y-1">
                    <div className="font-bold">{b.paxCount > 1 ? `${b.paxCount} seats reserved` : 'Seat reserved'}</div>
                    {b.reservedUntil && <div>Reserved until <b>{fmtDateTime(b.reservedUntil)}</b> (3 days).</div>}
                    <div>Advance paid: {INR(b.advance_fee_paise)} (non-refundable)</div>
                    <div>Party total: <b>{INR(b.partyTotalPaise)}</b>{b.groupDiscountPct > 0 ? ` (incl. ${b.groupDiscountPct}% group discount)` : ''}</div>
                    {b.balance_due > 0 && (
                      <div className="pt-1">
                        <div>Balance due: <b>{INR(b.balance_due)}</b> — pay online or at our office before departure.</div>
                        <button
                          onClick={() => startBalanceCheckout(b)}
                          disabled={payingBalance === b.id}
                          className="mt-2 bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-1.5 rounded hover:bg-brand-gold/90 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {payingBalance === b.id ? 'Opening checkout…' : `Pay balance online (${INR(b.balance_due)})`}
                        </button>
                        <div className="text-[9px] opacity-70 mt-1">Prefer to pay at the office? Visit us — cash / UPI / bank transfer accepted.</div>
                      </div>
                    )}
                  </div>
                )}

                {b.status === 'confirmed' && (
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-200 p-3 text-[10px] text-emerald-800">
                    <div className="font-bold">✓ Booking confirmed — fully paid</div>
                    <div className="mt-0.5">May Allah accept your Umrah. Our team will contact you with the travel kit and checklist.</div>
                  </div>
                )}

                {b.status === 'waitlist' && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-200 p-3 text-[10px] text-amber-800">
                    <div className="font-bold">Waiting list</div>
                    <div className="mt-0.5">This departure is full. We will contact you if a seat opens up.</div>
                  </div>
                )}

                {b.status === 'cancelled' && (
                  <div className="rounded-lg bg-rose-500/10 border border-rose-200 p-3 text-[10px] text-rose-700">
                    <div className="font-bold">Booking released</div>
                    <div className="mt-0.5">This booking was released (hold expired or cancelled).</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Detail view ──
  if (view === 'detail' && detail) {
    const inclusions = parseJson(detail.inclusionsJson);
    const exclusions = parseJson(detail.exclusionsJson);
    const documents = parseJson(detail.documentsJson);
    const terms = parseJson(detail.termsJson);
    const mkZone = distanceZone(detail.makkahDistanceMeters);
    const mdZone = distanceZone(detail.madinahDistanceMeters);
    return (
      <div className="space-y-4">
        <button onClick={() => { setView('browse'); setSelectedPkg(null); }} className="text-[10px] font-bold text-brand-gold hover:underline cursor-pointer">← All packages</button>

        <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-brand-navy text-lg">{detail.name}</h3>
              <p className="text-[10px] text-brand-navy/40 mt-0.5">
                {TIER_LABEL[detail.tier]} · {detail.totalDays} days ({detail.makkahNights}N Makkah / {detail.madinahNights}N Madinah)
              </p>
              {TIER_INFO[detail.tier] && <p className="text-[10px] text-brand-navy/50 italic mt-1">{TIER_INFO[detail.tier]}</p>}
            </div>
            <div className="text-right">
              <div className="text-brand-gold font-display font-extrabold text-xl">{INR(detail.retailPricePaise)}</div>
              <div className="text-[9px] text-brand-navy/40">per person · {ROOM[detail.roomSharing]} sharing</div>
            </div>
          </div>

          {detail.description && <p className="text-xs text-brand-navy/60 leading-relaxed">{detail.description}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Flight */}
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">✈️ Flight</h4>
              <div className="text-brand-navy/70"><b>{FLIGHT[detail.flightType] || detail.flightType}</b>{detail.airline ? ` · ${detail.airline}` : ''}</div>
              {detail.departureCity && <div className="text-brand-navy/60">From {detail.departureCity}{detail.arrivalAirport ? ` → ${detail.arrivalAirport}` : ''}</div>}
              {detail.baggageAllowance && <div className="text-brand-navy/60">Baggage: {detail.baggageAllowance}</div>}
              <div className="text-brand-navy/60">{detail.flightClass === 'business' ? 'Business class' : 'Economy class'}{detail.zamzamIncluded ? ' · Zamzam 5L included' : ''}</div>
            </div>
            {/* Makkah hotel */}
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">🏨 Makkah Hotel</h4>
              <div className="text-brand-navy/70 font-semibold">{detail.makkahHotel || 'To be confirmed'}</div>
              {detail.makkahHotelStars && <div className="text-brand-navy/60">{detail.makkahHotelStars}★ hotel</div>}
              {detail.makkahDistanceMeters !== null && detail.makkahDistanceMeters !== undefined && (
                <div className="text-brand-navy/60">
                  {detail.makkahDistanceMeters}m from Haram{detail.makkahWalkMinutes ? ` · ~${detail.makkahWalkMinutes} min walk` : ''}
                  {mkZone && <span className="ml-1 px-1.5 py-0.5 rounded bg-brand-gold/15 text-brand-gold text-[9px] font-bold">{mkZone}</span>}
                </div>
              )}
              {detail.makkahHaramView !== 'none' && <div className="text-brand-navy/60">{detail.makkahHaramView === 'full' ? 'Full Haram view' : 'Partial Haram view'}</div>}
            </div>
            {/* Madinah hotel */}
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">🏨 Madinah Hotel</h4>
              <div className="text-brand-navy/70 font-semibold">{detail.madinahHotel || 'To be confirmed'}</div>
              {detail.madinahHotelStars && <div className="text-brand-navy/60">{detail.madinahHotelStars}★ hotel</div>}
              {detail.madinahDistanceMeters !== null && detail.madinahDistanceMeters !== undefined && (
                <div className="text-brand-navy/60">
                  {detail.madinahDistanceMeters}m from Masjid an-Nabawi{detail.madinahWalkMinutes ? ` · ~${detail.madinahWalkMinutes} min walk` : ''}
                  {mdZone && <span className="ml-1 px-1.5 py-0.5 rounded bg-brand-gold/15 text-brand-gold text-[9px] font-bold">{mdZone}</span>}
                </div>
              )}
              {detail.madinahHaramView !== 'none' && <div className="text-brand-navy/60">{detail.madinahHaramView === 'full' ? 'Full Haram view' : 'Partial Haram view'}</div>}
            </div>
            {/* Meals & room */}
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">🛏️ Stay &amp; Meals</h4>
              <div className="text-brand-navy/70">{ROOM[detail.roomSharing]} sharing · {MEALS[detail.mealsPlan] || detail.mealsPlan}</div>
              {detail.shuttleService && <div className="text-brand-navy/60">Shuttle service available</div>}
              {detail.specialNeeds && <div className="text-brand-navy/60">{detail.specialNeeds}</div>}
            </div>
            {/* Transport */}
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">🚌 Transport &amp; Tours</h4>
              <div className="text-brand-navy/70">{detail.airportTransfer ? 'Airport transfers included' : 'Airport transfers not included'}</div>
              <div className="text-brand-navy/60">{detail.intercityTransport.replace('_', ' ')} between Makkah &amp; Madinah</div>
              {detail.ziyaratTours && <div className="text-brand-navy/60">Ziyarat tours included</div>}
              {detail.groupLeader && <div className="text-brand-navy/60">Group leader{detail.guideLanguage ? ` (${detail.guideLanguage})` : ''}</div>}
            </div>
            {/* Visa */}
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">🛂 Visa &amp; Insurance</h4>
              <div className="text-brand-navy/70">{detail.visaIncluded ? 'Umrah visa included' : 'Visa not included'}</div>
              {detail.ksaInsurance && <div className="text-brand-navy/60">KSA insurance included</div>}
              <div className="text-brand-navy/60">Visa lead time: ~{detail.visaLeadDays} days</div>
            </div>
            {/* Payment */}
            <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/[0.04] p-4 space-y-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">💰 Payment</h4>
              <div className="text-brand-navy/70">Advance: <b>{INR(detail.advanceFeePaise)}</b> (non-refundable) → reserves your seat for <b>{detail.reserveHoldHours / 24} days</b></div>
              <div className="text-brand-navy/60">Balance: {INR(Math.max(0, detail.retailPricePaise - detail.advanceFeePaise))} — online or at our office</div>
              <div className="text-brand-navy/60">Balance due {detail.balanceDueDaysBefore} days before departure</div>
              {detail.soloAvailable && <div className="text-brand-navy/70">🧳 <b>Solo travel available</b> — private room for +{INR(detail.soloSupplementPaise)}</div>}
              {detail.installmentAvailable && <div className="text-brand-navy/60">Installment plans available</div>}
              {detail.groupDiscountPct && <div className="text-brand-navy/60">Group discount: {detail.groupDiscountPct}% for {detail.groupDiscountMinPax}+ pilgrims</div>}
            </div>
          </div>

          {/* Inclusions / exclusions / documents / terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {inclusions.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 mb-2">✓ Inclusions</h4>
                <ul className="space-y-1 text-brand-navy/70">
                  {inclusions.map((inc, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-600">✓</span>{inc}</li>)}
                </ul>
              </div>
            )}
            {exclusions.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-rose-600 mb-2">✕ Exclusions</h4>
                <ul className="space-y-1 text-brand-navy/70">
                  {exclusions.map((ex, i) => <li key={i} className="flex gap-1.5"><span className="text-rose-500">✕</span>{ex}</li>)}
                </ul>
              </div>
            )}
            {documents.length > 0 && (
              <div className="rounded-xl border border-brand-navy/10 p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">📄 Required Documents</h4>
                <ul className="space-y-1 text-brand-navy/70">
                  {documents.map((d, i) => <li key={i} className="flex gap-1.5"><span className="text-brand-gold">•</span>{d}</li>)}
                </ul>
                <label className="mt-3 flex items-center justify-center gap-2 cursor-pointer rounded-lg border border-dashed border-brand-gold/40 bg-brand-gold/[0.06] px-3 py-2.5 text-[10px] font-bold text-brand-gold hover:bg-brand-gold/15 transition-all">
                  📎 Upload Document for this booking
                  <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e)=>{const f=e.target.files?.[0]; if(f) uploadUmrahDoc(f); (e.target as HTMLInputElement).value='';}} />
                </label>
                <div className="text-[9px] text-brand-navy/40 mt-1.5 text-center">Secure R2 vault · presigned PUT (15-min HMAC) → staff verifies live via <code className="bg-slate-100 px-1 rounded">client:{'{id}'}:documents</code></div>
              </div>
            )}
            {terms.length > 0 && (
              <div className="rounded-xl border border-brand-navy/10 p-4">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">📋 Terms &amp; Refund</h4>
                <ul className="space-y-1 text-brand-navy/70">
                  {terms.map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-brand-gold">•</span>{t}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Departure dates */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-gold mb-2">📆 Available Departure Dates</h4>
            {departures.length === 0 ? (
              <p className="text-xs text-brand-navy/40 italic">No open departure dates announced yet for this package.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {departures.map(d => (
                  <div key={d.id} className="rounded-xl border border-brand-navy/10 p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-brand-navy text-sm">{fmtDate(d.departureDate)}{d.endDate && d.endDate !== d.departureDate ? ` → ${fmtDate(d.endDate)}` : ''}</div>
                      <div className="text-[10px] text-brand-navy/40 mt-0.5">
                        {d.available > 0 ? <span className="text-emerald-700 font-bold">{d.available} seats left</span> : <span className="text-rose-600 font-bold">Full</span>} · {d.bookedSeats}/{d.capacity} booked
                        {d.departureCity ? ` · from ${d.departureCity}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => setBookingDep(d)}
                      disabled={d.available === 0}
                      className="bg-brand-gold text-brand-navy text-[10px] font-bold px-3 py-2 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {d.available === 0 ? 'Full' : 'Book Seat'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Booking confirmation modal — party builder (family / group / solo) */}
        {bookingDep && (
          <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-full max-w-lg shadow-lg space-y-4 text-xs my-8">
              <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
                <h3 className="font-display font-extrabold text-brand-navy text-sm">Reserve Your Seats</h3>
                <button onClick={() => { setBookingDep(null); setPaxRows([]); setRoomConfig('quad'); setBookingOccupancy('shared'); }} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
              </div>
              <div className="space-y-3 text-brand-navy/70">
                <div className="font-bold text-brand-navy">{detail.name}</div>
                <div>Departure: <b>{fmtDate(bookingDep.departureDate)}</b>{bookingDep.endDate && bookingDep.endDate !== bookingDep.departureDate ? ` → ${fmtDate(bookingDep.endDate)}` : ''} · <b>{bookingDep.available} seats left</b></div>

                {/* Traveller stepper */}
                <div className="rounded-lg border border-brand-navy/10 p-3 space-y-2">
                  <div className="font-bold text-brand-navy text-[10px]">👨‍👩‍👧‍👦 Who is travelling? (max 30)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['adult', 'child_with_bed', 'child_no_bed', 'infant'] as PaxCategory[]).map(cat => (
                      <div key={cat} className="flex items-center justify-between rounded-lg border border-brand-navy/10 px-2.5 py-1.5">
                        <span className="text-[10px] text-brand-navy/70">{CATEGORY_LABEL[cat]}</span>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => setCategoryCount(cat, Math.max(0, categoryCount(cat) - 1))} className="w-6 h-6 rounded bg-brand-navy/[0.06] hover:bg-brand-navy/10 font-bold text-brand-navy cursor-pointer">−</button>
                          <span className="w-4 text-center font-bold text-brand-navy">{categoryCount(cat)}</span>
                          <button type="button" onClick={() => setCategoryCount(cat, categoryCount(cat) + 1)} className="w-6 h-6 rounded bg-brand-gold/20 hover:bg-brand-gold/30 font-bold text-brand-navy cursor-pointer">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {paxCount === 0 && <div className="text-[9px] text-rose-600 font-bold">Add at least one traveller (every party needs an adult).</div>}
                  {paxCount > 0 && !paxRows.some(p => p.category === 'adult') && <div className="text-[9px] text-rose-600 font-bold">Every party needs at least one adult (18+).</div>}
                </div>

                {/* Passenger name rows */}
                {paxRows.length > 0 && (
                  <div className="rounded-lg border border-brand-navy/10 p-3 space-y-2">
                    <div className="font-bold text-brand-navy text-[10px]">Traveller names (passport details can be added later)</div>
                    {paxRows.map((row, idx) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-brand-navy/40 w-16 shrink-0">{CATEGORY_SHORT[row.category]}</span>
                        <input
                          value={row.name}
                          onChange={(e) => updatePaxRow(row.id, { name: e.target.value })}
                          placeholder={`Traveller ${idx + 1} name`}
                          className="flex-1 rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-[10px] text-brand-navy focus:outline-none focus:border-brand-gold"
                        />
                        <input
                          value={row.dob}
                          onChange={(e) => updatePaxRow(row.id, { dob: e.target.value })}
                          placeholder="DOB (YYYY-MM-DD)"
                          className="w-32 rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-[10px] text-brand-navy focus:outline-none focus:border-brand-gold"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Solo toggle — only meaningful for a single traveller */}
                {detail.soloAvailable && paxCount <= 1 && (
                  <div className="rounded-lg border border-brand-navy/10 p-3 space-y-2">
                    <div className="font-bold text-brand-navy text-[10px]">🧳 How would you like to travel?</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setBookingOccupancy('shared')}
                        className={`rounded-lg border p-2.5 text-left transition-all cursor-pointer ${bookingOccupancy === 'shared' ? 'border-brand-gold bg-brand-gold/10' : 'border-brand-navy/10 hover:border-brand-gold/50'}`}
                      >
                        <div className="font-bold text-brand-navy">👥 Shared</div>
                        <div className="text-[9px] text-brand-navy/40 mt-0.5">Quad / triple / double sharing</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBookingOccupancy('solo')}
                        className={`rounded-lg border p-2.5 text-left transition-all cursor-pointer ${bookingOccupancy === 'solo' ? 'border-brand-gold bg-brand-gold/10' : 'border-brand-navy/10 hover:border-brand-gold/50'}`}
                      >
                        <div className="font-bold text-brand-navy">🧳 Solo</div>
                        <div className="text-[9px] text-brand-navy/40 mt-0.5">Private room · +{INR(detail.soloSupplementPaise)}</div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Room configuration — families & groups */}
                {paxCount > 1 && (
                  <div className="rounded-lg border border-brand-navy/10 p-3 space-y-2">
                    <div className="font-bold text-brand-navy text-[10px]">🛏️ Room preference (for the whole party)</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[['quad', 'Quad — 1 room for 4'], ['double', 'Double — pairs'], ['triple', 'Triple — 3 per room'], ['single', 'Single — own room each']].map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setRoomConfig(val)}
                          className={`rounded-lg border px-2.5 py-1.5 text-left transition-all cursor-pointer ${roomConfig === val ? 'border-brand-gold bg-brand-gold/10' : 'border-brand-navy/10 hover:border-brand-gold/50'}`}
                        >
                          <div className="font-bold text-brand-navy text-[10px]">{label}</div>
                        </button>
                      ))}
                    </div>
                    <div className="text-[9px] text-brand-navy/40">Final rooming is confirmed by our team based on hotel availability.</div>
                  </div>
                )}

                {/* Live price summary */}
                {paxCount > 0 && (() => {
                  const preview = previewPartyPrice(bookingDep, detail, paxRows, bookingOccupancy);
                  return (
                    <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3 space-y-1.5">
                      <div className="font-bold text-brand-navy text-[10px]">💰 Price summary ({paxCount} traveller{paxCount > 1 ? 's' : ''})</div>
                      <div className="flex justify-between text-[10px] text-brand-navy/70"><span>Adult × {categoryCount('adult')}</span><span>{INR(preview.adult * categoryCount('adult'))}</span></div>
                      {categoryCount('child_with_bed') > 0 && <div className="flex justify-between text-[10px] text-brand-navy/70"><span>Child with bed × {categoryCount('child_with_bed')}</span><span>{INR(preview.childBed * categoryCount('child_with_bed'))}</span></div>}
                      {categoryCount('child_no_bed') > 0 && <div className="flex justify-between text-[10px] text-brand-navy/70"><span>Child no bed × {categoryCount('child_no_bed')}</span><span>{INR(preview.childNoBed * categoryCount('child_no_bed'))}</span></div>}
                      {categoryCount('infant') > 0 && <div className="flex justify-between text-[10px] text-brand-navy/70"><span>Infant × {categoryCount('infant')}</span><span>{INR(preview.infant * categoryCount('infant'))}</span></div>}
                      {bookingOccupancy === 'solo' && paxCount === 1 && <div className="flex justify-between text-[10px] text-brand-navy/70"><span>Solo supplement</span><span>{INR(detail.soloSupplementPaise)}</span></div>}
                      {preview.discount > 0 && <div className="flex justify-between text-[10px] text-emerald-700 font-bold"><span>Group discount ({preview.discount}%)</span><span>−{INR(Math.round((preview.total / (100 - preview.discount)) * preview.discount))}</span></div>}
                      <div className="border-t border-brand-navy/10 pt-1.5 flex justify-between font-bold text-brand-navy"><span>Party total</span><span>{INR(preview.total)}</span></div>
                      <div className="flex justify-between text-[10px] text-brand-navy/70"><span>Advance now (non-refundable)</span><span className="font-bold text-brand-gold">{INR(preview.advance)}</span></div>
                      <div className="flex justify-between text-[10px] text-brand-navy/70"><span>Balance later (online / office)</span><span>{INR(preview.balance)}</span></div>
                    </div>
                  );
                })()}

                <div className="rounded-lg bg-amber-500/10 border border-amber-200 p-3 text-[10px] text-amber-800 space-y-1">
                  <div className="font-bold">How it works</div>
                  <div>1. Pay the non-refundable advance of <b>{INR(paxCount > 0 ? previewPartyPrice(bookingDep, detail, paxRows, bookingOccupancy).advance : detail.advanceFeePaise)}</b> now ({paxCount > 0 ? `${paxCount} × ${INR(bookingDep.bookingFee || detail.advanceFeePaise)}` : 'per person'}).</div>
                  <div>2. Your {paxCount > 1 ? `${paxCount} seats are` : 'seat is'} <b>reserved for {detail.reserveHoldHours / 24} days</b>.</div>
                  <div>3. Pay the balance online or at our office before departure.</div>
                </div>
                <div className="text-[9px] text-brand-navy/40">The advance is <b>non-refundable</b>. Unpaid holds are released after 24 hours. Passport details can be shared with our team later.</div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setBookingDep(null); setPaxRows([]); setRoomConfig('quad'); setBookingOccupancy('shared'); }} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
                <button
                  onClick={() => {
                    if (paxCount === 0) { alert('Add at least one traveller.'); return; }
                    if (!paxRows.some(p => p.category === 'adult')) { alert('Every party needs at least one adult (18+).'); return; }
                    if (paxRows.some(p => !p.name.trim())) { alert('Please enter a name for every traveller.'); return; }
                    const occupancy = paxCount === 1 ? bookingOccupancy : 'shared';
                    startAdvanceCheckout(bookingDep, occupancy, paxRows, paxCount > 1 ? roomConfig : null);
                    setBookingDep(null); setPaxRows([]); setRoomConfig('quad'); setBookingOccupancy('shared');
                  }}
                  disabled={bookMutation.isPending || paxCount === 0}
                  className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
                >
                  Pay {INR(paxCount > 0 ? previewPartyPrice(bookingDep, detail, paxRows, bookingOccupancy).advance : detail.advanceFeePaise)} &amp; Reserve
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Browse view (default) ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-brand-navy text-sm">Umrah Packages</h3>
        <button onClick={() => setView('tracker')} className="text-[10px] font-bold text-brand-gold hover:underline cursor-pointer">My bookings →</button>
      </div>

      {/* Tier guide — what each tier includes */}
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

      {/* Availability calendar */}
      <UmrahCalendar
        days={calData?.days || []}
        month={calMonth}
        onMonthChange={setCalMonth}
        onSelectDay={(d) => {
          const pkg = packages.find(p => p.id === d.packageId);
          if (pkg) { setSelectedPkg(pkg); setView('detail'); }
        }}
        mode="client"
        futureOnly
      />

      {isLoading ? (
        <p className="text-xs text-brand-navy/50 italic">Loading packages…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map(p => (
            <div key={p.id} className="rounded-xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3 hover:border-brand-gold/60 hover:bg-brand-navy/[0.04] backdrop-blur-sm transition-all duration-300 cursor-pointer" onClick={() => { setSelectedPkg(p); setView('detail'); }}>
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${p.tier === 'premium' ? 'bg-brand-gold/15 text-brand-gold' : p.tier === 'luxury' ? 'bg-purple-500/15 text-purple-700' : p.tier === 'standard' ? 'bg-blue-500/15 text-blue-700' : 'bg-brand-navy/[0.06] text-brand-navy/60'}`}>{TIER_LABEL[p.tier]}</span>
                {p.featured && <span className="text-[9px] font-bold uppercase text-brand-gold">★ Featured</span>}
              </div>
              <div>
                <div className="text-brand-navy font-bold text-sm">{p.name}</div>
                <div className="text-[10px] text-brand-navy/40 mt-0.5">
                  {p.totalDays} days · {p.makkahNights}N Makkah / {p.madinahNights}N Madinah · {FLIGHT[p.flightType] || p.flightType}
                  {p.departureCity ? ` · from ${p.departureCity}` : ''}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-brand-gold font-display font-extrabold text-lg">{INR(p.retailPricePaise)}</div>
                  <div className="text-[9px] text-brand-navy/40">per person · {ROOM[p.roomSharing]} sharing</div>
                </div>
                {p.nextDeparture && (
                  <div className="text-right text-[9px] text-brand-navy/40">
                    <div>Next departure</div>
                    <div className="font-bold text-brand-navy">{fmtDate(p.nextDeparture)}</div>
                  </div>
                )}
              </div>
              <div className="text-[9px] text-brand-navy/40">
                Advance {INR(p.advanceFeePaise)} (non-refundable) · {MEALS[p.mealsPlan] || p.mealsPlan}
              </div>
            </div>
          ))}
          {packages.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-brand-navy/15 bg-white/60 p-10 text-center text-xs text-brand-navy/40">
              No packages available yet. Check back soon.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
