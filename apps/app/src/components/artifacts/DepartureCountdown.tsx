import { useEffect, useState } from 'react';
import ArtifactShell from './ArtifactShell';
import { EVENTS, track } from '../../lib/umami';

interface Departure {
  id: string;
  packageTier: string;
  departureDate: number;
  seatsLeft: number;
  capacity: number;
  availability: 'green' | 'yellow' | 'red';
  pricePaise: number;
  bookingFeePaise: number;
}

const BAND_STYLES: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-rose-500',
};
const BAND_LABEL: Record<string, string> = { green: 'Seats Open', yellow: 'Few Left', red: 'Near Full' };

const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtINR = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export default function DepartureCountdown() {
  const [list, setList] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wave 1 taxonomy: a visitor SAW the umrah departures surface.
    track(EVENTS.umrahView);
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/public/umrah/departures');
        const data = await res.json();
        if (alive) setList(data.departures ?? []);
      } catch {
        if (alive) setList([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <ArtifactShell title="Next Group Departures" caption="Live seat availability · updated in real time">
      {loading ? (
        <div className="space-y-2.5">
          {[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-brand-navy/5" />)}
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl bg-brand-gold/10 px-3.5 py-3 text-center text-xs text-brand-gold">
          New group departures are being planned — check back soon.
        </p>
      ) : (
        <div className="space-y-2.5">
          {list.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-xl border border-brand-navy/5 bg-white/70 px-3.5 py-2.5">
              <div>
                <p className="text-xs font-bold capitalize text-brand-navy">{d.packageTier} Package</p>
                <p className="text-[10px] text-brand-textLight">{fmtDate(d.departureDate)} · {fmtDate(0) === '' ? '' : `from ${fmtINR(d.pricePaise)}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-brand-navy/5 px-2.5 py-1 text-[10px] font-bold text-brand-navy">
                  <span className={`h-2 w-2 rounded-full ${BAND_STYLES[d.availability]}`} />
                  {BAND_LABEL[d.availability]} · {d.seatsLeft} seats
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ArtifactShell>
  );
}