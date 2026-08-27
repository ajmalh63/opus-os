import { useState } from 'react';

// A calendar day = one announced departure (capacity-30 group) OR an empty slot.
export interface UmrahCalendarDay {
  id: string;
  date: number; // unix seconds — trip start
  endDate: number | null; // unix seconds — trip end (null = single-day)
  packageId: string | null;
  packageName: string | null;
  tier: string;
  departureCity: string | null;
  capacity: number;
  bookedSeats: number;
  available: number;
  fillPct: number;
  status: string;
  pricePaise: number;
  advanceFeePaise: number;
  retailPricePaise: number;
}

interface UmrahCalendarProps {
  days: UmrahCalendarDay[];
  month: Date; // the month being displayed
  onMonthChange: (d: Date) => void;
  onSelectDay: (day: UmrahCalendarDay) => void;
  mode: 'staff' | 'client' | 'partner';
  /** staff: click an empty future date to announce a departure */
  onAnnounce?: (date: Date) => void;
  /** client/partner: show only future dates as actionable */
  futureOnly?: boolean;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TIER_BADGE: Record<string, string> = {
  economy: 'bg-brand-navy/[0.06] text-brand-navy/60',
  standard: 'bg-blue-500/15 text-blue-700',
  premium: 'bg-brand-gold/15 text-brand-gold',
  luxury: 'bg-purple-500/15 text-purple-700',
};

// Distinctive tier labels + what each tier means (shown to staff AND clients).
export const TIER_LABEL: Record<string, string> = {
  economy: 'Economy',
  standard: 'Standard',
  premium: 'Premium',
  luxury: 'Luxury',
};

export const TIER_INFO: Record<string, string> = {
  economy: '2–3★ hotels · shared rooms · 600m+ from Haram · group transport',
  standard: '3–4★ hotels · 300–500m from Haram · half-board meals',
  premium: '5★ hotels · 50–200m from Haram · full-board · private transport',
  luxury: '5★ Haram-view hotels · private car · VIP visa · full-board',
};

function statusChip(status: string): string {
  switch (status) {
    case 'open': return 'bg-emerald-500/15 text-emerald-700';
    case 'confirmed': return 'bg-blue-500/15 text-blue-700';
    case 'cancelled': return 'bg-rose-500/15 text-rose-600';
    case 'draft': return 'bg-brand-navy/[0.06] text-brand-navy/50';
    default: return 'bg-brand-navy/[0.06] text-brand-navy/50';
  }
}

export default function UmrahCalendar({ days, month, onMonthChange, onSelectDay, mode, onAnnounce, futureOnly }: UmrahCalendarProps) {
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Expand each trip across its full date range (start → end; single-day if no end).
  const byDate = new Map<number, UmrahCalendarDay[]>();
  for (const d of days) {
    const start = new Date(d.date * 1000);
    const end = d.endDate ? new Date(d.endDate * 1000) : new Date(start);
    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
      const k = dt.getFullYear() * 100 + dt.getMonth() * 100 + dt.getDate();
      const arr = byDate.get(k) || [];
      arr.push(d);
      byDate.set(k, arr);
    }
  }

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, m, d));

  const isPast = (d: Date) => d.getTime() < today.getTime();
  const keyOf = (d: Date) => d.getFullYear() * 100 + d.getMonth() * 100 + d.getDate();

  const prev = () => onMonthChange(new Date(year, m - 1, 1));
  const next = () => onMonthChange(new Date(year, m + 1, 1));

  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-brand-navy text-sm">
          {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-1">
          <button onClick={prev} className="h-7 w-7 rounded-lg border border-brand-navy/10 text-brand-navy hover:border-brand-gold/60 hover:bg-brand-gold/10 transition-all cursor-pointer text-xs font-bold">‹</button>
          <button onClick={next} className="h-7 w-7 rounded-lg border border-brand-navy/10 text-brand-navy hover:border-brand-gold/60 hover:bg-brand-gold/10 transition-all cursor-pointer text-xs font-bold">›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-xs font-bold uppercase tracking-wider text-brand-navy/40 py-1">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="min-h-[64px] rounded-lg" />;
          const dayList = byDate.get(keyOf(d));
          const day = dayList?.[0];
          const extra = dayList ? dayList.length - 1 : 0;
          const isRange = !!day?.endDate && day.endDate !== day.date;
          const past = isPast(d);
          const actionable = !past || (mode === 'staff' && !futureOnly);
          return (
            <div
              key={d.toISOString()}
              onMouseEnter={() => setHoverDate(d)}
              onMouseLeave={() => setHoverDate(null)}
              className={`min-h-[64px] rounded-lg border p-1.5 flex flex-col gap-1 transition-all ${day ? 'border-brand-navy/10 bg-brand-navy/[0.03]' : 'border-dashed border-brand-navy/[0.08]'} ${actionable ? 'cursor-pointer hover:border-brand-gold/60 hover:bg-brand-gold/[0.06]' : 'opacity-40'}`}
              onClick={() => {
                if (!actionable) return;
                if (day) onSelectDay(day);
                else if (mode === 'staff' && onAnnounce && !past) onAnnounce(d);
              }}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[13px] font-bold ${d.getTime() === today.getTime() ? 'text-brand-gold' : 'text-brand-navy/60'}`}>{d.getDate()}</span>
                {day && (
                  <span className={`text-sm font-bold uppercase px-1 py-0.5 rounded ${statusChip(day.status)}`}>
                    {day.status === 'open' ? (day.available === 0 ? 'Full' : 'Open') : day.status}
                  </span>
                )}
              </div>
              {day ? (
                <>
                  <div className="h-1 w-full rounded-full bg-brand-navy/[0.08] overflow-hidden">
                    <div className={`h-full rounded-full ${day.fillPct >= 100 ? 'bg-rose-500' : day.fillPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, day.fillPct)}%` }} />
                  </div>
                  <div className="text-sm text-brand-navy/50 font-mono leading-tight">
                    {isRange ? '↔ trip' : `${day.available}/${day.capacity} left`}
                    {day.tier && <span className={`ml-1 px-1 rounded ${TIER_BADGE[day.tier] || ''}`}>{TIER_LABEL[day.tier] || day.tier}</span>}
                    {extra > 0 && <span className="ml-1 text-brand-gold font-bold">+{extra}</span>}
                  </div>
                </>
              ) : (
                <div className="text-sm text-brand-navy/30 italic leading-tight">
                  {mode === 'staff' && !past ? (hoverDate?.getTime() === d.getTime() ? '+ Announce' : '') : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 pt-2 border-t border-brand-navy/[0.06] text-xs text-brand-navy/40">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Open</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Filling fast (≥70%)</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Full</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-navy/20" /> No departure</span>
        <span className="ml-auto flex items-center gap-2">
          {Object.entries(TIER_LABEL).map(([k, label]) => (
            <span key={k} className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${TIER_BADGE[k] || ''}`}>{label}</span>
          ))}
        </span>
      </div>
    </div>
  );
}
