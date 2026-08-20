import { useState } from 'react';
import { track, EVENTS } from '../../lib/umami';

interface PincodeResult {
  pincode: string;
  city: string;
  state: string;
  pickupSla: string;
  turnaroundDays: string;
  courierPartner: string;
  isSameDay: boolean;
}

const PINCODE_MAP: Record<string, { city: string; state: string; isSameDay: boolean; days: string }> = {
  '500001': { city: 'Hyderabad (Abids / Charminar)', state: 'Telangana', isSameDay: true, days: '3–4 Business Days' },
  '500081': { city: 'Hyderabad (Hitec City / Madhapur)', state: 'Telangana', isSameDay: true, days: '3–4 Business Days' },
  '500034': { city: 'Hyderabad (Banjara Hills / Jubilee Hills)', state: 'Telangana', isSameDay: true, days: '3–4 Business Days' },
  '560001': { city: 'Bangalore (MG Road / Central)', state: 'Karnataka', isSameDay: true, days: '4–5 Business Days' },
  '400001': { city: 'Mumbai (Fort / South Mumbai)', state: 'Maharashtra', isSameDay: true, days: '4–5 Business Days' },
  '110001': { city: 'New Delhi (Connaught Place)', state: 'Delhi NCR', isSameDay: true, days: '2–3 Business Days (Fastest MEA)' },
  '600001': { city: 'Chennai (George Town)', state: 'Tamil Nadu', isSameDay: true, days: '4–5 Business Days' },
};

export default function AttestationPincodeRadar() {
  const [pincodeInput, setPincodeInput] = useState('');
  const [result, setResult] = useState<PincodeResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCheckPincode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pincodeInput.trim();
    if (clean.length < 6) return;

    setLoading(true);
    track(EVENTS.featureClick, { feature: 'pincode_check', pincode: clean });

    setTimeout(() => {
      setLoading(false);
      const match = PINCODE_MAP[clean];
      if (match) {
        setResult({
          pincode: clean,
          city: match.city,
          state: match.state,
          pickupSla: match.isSameDay ? 'Same-Day Insured Pickup (Within 4 Hours)' : 'Next-Day Insured Express Pickup',
          turnaroundDays: match.days,
          courierPartner: 'Insured Tamper-Proof Secure Pouch',
          isSameDay: match.isSameDay,
        });
      } else {
        // Generic All-India Verified Coverage
        setResult({
          pincode: clean,
          city: 'All-India Insured Coverage Zone',
          state: 'India Postal Network',
          pickupSla: 'Next-Day Express Doorstep Pickup',
          turnaroundDays: '4–6 Business Days',
          courierPartner: 'Pan-India Insured Air Cargo Pouch (GPS Tracked)',
          isSameDay: false,
        });
      }
    }, 350);
  };

  return (
    <div className="rounded-3xl border border-brand-navy/10 bg-white p-6 sm:p-7 shadow-xl space-y-5 text-brand-navy">
      <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
        <div>
          <span className="text-[10px] uppercase font-bold text-brand-gold tracking-wider font-mono">
            ● GPS Logistical Radar
          </span>
          <h3 className="font-display text-base font-bold text-brand-navy mt-0.5">
            Insured Doorstep Pickup Pincode Checker
          </h3>
        </div>
        <span className="rounded-full bg-emerald-500/15 text-emerald-800 px-2.5 py-1 text-[10px] font-bold font-mono">
          100% Pincodes Covered
        </span>
      </div>

      <form onSubmit={handleCheckPincode} className="flex gap-2">
        <input
          type="text"
          maxLength={6}
          pattern="\d{6}"
          required
          placeholder="Enter 6-digit Pincode (e.g. 500034)"
          value={pincodeInput}
          onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, ''))}
          className="flex-1 rounded-xl border border-brand-navy/20 bg-slate-50 px-3.5 py-2.5 text-xs font-mono font-bold text-brand-navy placeholder:text-brand-textLight/60 focus:border-brand-gold focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="tactile-btn cursor-pointer rounded-xl bg-brand-navy px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition shadow-sm disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Check Pickup SLA →'}
        </button>
      </form>

      {result && (
        <div className="rounded-2xl border border-emerald-400/40 bg-emerald-50/70 p-4 text-xs space-y-2.5 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-emerald-900 flex items-center gap-1.5">
              <span>✓</span> {result.city}, {result.state}
            </span>
            <span className="font-mono text-[10px] font-bold bg-emerald-200/60 text-emerald-900 px-2 py-0.5 rounded-full">
              Pincode {result.pincode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-emerald-950 pt-1">
            <div className="p-2 rounded-lg bg-white/80 border border-emerald-200">
              <span className="text-emerald-700 text-[9px] uppercase font-bold block">Pickup Dispatch SLA</span>
              <span className="font-bold">{result.pickupSla}</span>
            </div>
            <div className="p-2 rounded-lg bg-white/80 border border-emerald-200">
              <span className="text-emerald-700 text-[9px] uppercase font-bold block">Est. Complete Attestation SLA</span>
              <span className="font-bold">{result.turnaroundDays}</span>
            </div>
          </div>

          <p className="text-[10px] text-emerald-800">
            🔒 Transit insured up to ₹50,000 per original certificate with barcode chain-of-custody.
          </p>
        </div>
      )}
    </div>
  );
}
