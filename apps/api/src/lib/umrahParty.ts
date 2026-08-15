// Umrah party-booking pricing & passenger helpers (gold-standard family model).
// One booking = one party (N passengers). Pricing is per person by category:
//   adult (18+)            → retail (or per-departure seasonal override)
//   child_with_bed (2–11)  → package childWithBedPricePaise, fallback adult
//   child_no_bed (2–4)     → package childNoBedPricePaise, fallback adult
//   infant (0–2)           → package infantPricePaise, fallback adult
// Solo supplement applies ONLY when pax === 1 && occupancy === 'solo'.
// Group discount (package groupDiscountPct) applies when pax >= groupDiscountMinPax.
// All money = integer paise. Never floats.

export type PassengerCategory = 'adult' | 'child_with_bed' | 'child_no_bed' | 'infant';

export interface PartyPassenger {
  name: string;
  dob?: string | null;
  passportNumber?: string | null;
  category: PassengerCategory;
  specialNeeds?: string | null;
}

export interface PartyPrice {
  totalPaise: number; // after group discount + solo supplement
  perPersonPaise: { adult: number; childWithBed: number; childNoBed: number; infant: number };
  soloSupplementPaise: number;
  groupDiscountPct: number;
  paxCount: number;
}

/** Per-person price by category with safe fallback to the adult rate. */
export function perPersonPrices(
  adultPricePaise: number,
  pkg?: { childWithBedPricePaise?: number | null; childNoBedPricePaise?: number | null; infantPricePaise?: number | null } | null
): PartyPrice['perPersonPaise'] {
  return {
    adult: adultPricePaise,
    childWithBed: pkg?.childWithBedPricePaise ?? adultPricePaise,
    childNoBed: pkg?.childNoBedPricePaise ?? adultPricePaise,
    infant: pkg?.infantPricePaise ?? adultPricePaise,
  };
}

/**
 * Compute the full party price for a booking.
 * @param adultPricePaise per-person adult price (departure seasonal override or package retail)
 * @param passengers the party (must contain ≥1 adult — validated upstream)
 * @param occupancy 'solo' adds the supplement only when the party is a single person
 * @param pkg package row (child prices, solo supplement, group discount)
 */
export function computePartyPrice(
  adultPricePaise: number,
  passengers: PartyPassenger[],
  occupancy: 'shared' | 'solo',
  pkg?: { soloSupplementPaise?: number | null; groupDiscountPct?: number | null; groupDiscountMinPax?: number | null; childWithBedPricePaise?: number | null; childNoBedPricePaise?: number | null; infantPricePaise?: number | null } | null
): PartyPrice {
  const perPerson = perPersonPrices(adultPricePaise, pkg);
  const pax = passengers.length;

  let total = 0;
  for (const p of passengers) {
    switch (p.category) {
      case 'child_with_bed': total += perPerson.childWithBed; break;
      case 'child_no_bed': total += perPerson.childNoBed; break;
      case 'infant': total += perPerson.infant; break;
      default: total += perPerson.adult;
    }
  }

  // Solo supplement: private room, only for a single traveller.
  const soloSupplementPaise = occupancy === 'solo' && pax === 1 ? (pkg?.soloSupplementPaise ?? 0) : 0;
  total += soloSupplementPaise;

  // Group discount (volume): fields existed unused — now honoured.
  let groupDiscountPct = 0;
  const minPax = pkg?.groupDiscountMinPax;
  if (minPax != null && pax >= minPax && pkg?.groupDiscountPct) {
    groupDiscountPct = pkg.groupDiscountPct;
    total = Math.round((total * (100 - groupDiscountPct)) / 100);
  }

  return { totalPaise: total, perPersonPaise: perPerson, soloSupplementPaise, groupDiscountPct, paxCount: pax };
}

/** Advance = per-person booking fee × pax (industry: deposit per person). */
export function partyAdvancePaise(paxCount: number, bookingFeePaise: number): number {
  return paxCount * bookingFeePaise;
}

/** Mask a passport at the API boundary: first 2 + last 2 chars (e.g. N12••••67). */
export function maskPassport(passport?: string | null): string | null {
  if (!passport) return null;
  if (passport.length <= 4) return '••••';
  return `${passport.slice(0, 2)}${'•'.repeat(Math.max(2, passport.length - 4))}${passport.slice(-2)}`;
}

/** Serialize a passenger row for API responses (passport always masked). */
export function serializePassenger(p: { name: string; dob?: string | null; passportNumber?: string | null; category: string; specialNeeds?: string | null }): PartyPassenger & { passportNumber: string | null } {
  return {
    name: p.name,
    dob: p.dob ?? null,
    passportNumber: maskPassport(p.passportNumber),
    category: p.category as PassengerCategory,
    specialNeeds: p.specialNeeds ?? null,
  };
}