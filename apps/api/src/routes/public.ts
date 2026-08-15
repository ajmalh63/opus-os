import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { groupDepartures, jobPostings, attestationChains, universities, visaProducts } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';

// ============================================================
// 24.1.1 PUBLIC ARTIFACTS ” homepage hero live widgets
// Staff-auth-free by design: these feed the public website's
// hero carousel (Eligibility Checker, Departure Countdown,
// Attestation Chain, Job Ticker). All responses are real D1
// data ” never mocks. Empty stores return empty arrays.
// ============================================================

export const publicRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/public/jobs ” open job postings for the Manpower job ticker.
// Only tier='public' openings are ever exposed — secret roles stay on the
// internal board only (data-exposure gate before it was polyfilled).
publicRouter.get('/jobs', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(jobPostings)
      .where(and(eq(jobPostings.status, 'open'), eq(jobPostings.tier, 'public'))).all();
    const jobs = rows.map((j) => ({ id: j.id, title: j.title, country: j.country, sector: j.sector, salaryText: j.salaryText }));
    return c.json({ jobs });
  } catch (error: any) {
    return c.json({ error: "Job ticker failed", details: error.message }, 500);
  }
});

// GET /api/public/umrah/departures ” next scheduled departures with live availability bands
publicRouter.get('/umrah/departures', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
const rows = await db.select().from(groupDepartures).where(eq(groupDepartures.status, 'open')).all();

    const departures = rows
      .sort((a, b) => a.departureDate - b.departureDate)
      .slice(0, 5)
      .map((d) => {
        const seatsLeft = Math.max(0, (d.capacity ?? 0) - (d.bookedSeats ?? 0));
        const band = seatsLeft > 10 ? 'green' : seatsLeft > 0 ? 'yellow' : 'red';
        return {
          id: d.id,
          packageTier: d.packageTier,
          departureDate: d.departureDate,
          seatsLeft,
          capacity: d.capacity,
          availability: band,
          pricePaise: d.price,
          bookingFeePaise: d.bookingFee,
        };
      });

    return c.json({ departures });
  } catch (error: any) {
    return c.json({ error: "Departure ticker failed", details: error.message }, 500);
  }
});

// GET /api/public/attestation/chains ” attestation step chains per country
publicRouter.get('/attestation/chains', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(attestationChains).all();
    const chains = rows.map((c2) => {
      let steps: any[] = [];
      try { steps = JSON.parse(c2.stepsJson || '[]'); } catch { steps = []; }
      return { country: c2.country, steps };
    });
    return c.json({ chains });
  } catch (error: any) {
    return c.json({ error: "Attestation chains failed", details: error.message }, 500);
  }
});

// POST /api/public/match/eligibility ” GPA/test/budget/country -> ranked university matches
const matchSchema = z.object({
  gpa: z.number().min(0).max(10),
  ielts: z.number().min(0).max(9).optional(),
  budget: z.number().min(0).optional(), // lakh INR per year
  country: z.string().optional(),
});

publicRouter.post('/match/eligibility', rateLimit({ bucket: 'eligibility', windowSeconds: 3600, limit: 20 }), zValidator('json', matchSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  try {
    const rows = await db.select().from(universities).all();
    if (rows.length === 0) return c.json({ matches: [], empty: true });

    const scored = rows
      .map((u) => {
        if (data.gpa < u.minGpa) return null;
        if (data.ielts !== undefined && data.ielts < u.ieltsMin) return null;
        if (data.budget !== undefined && data.budget < u.budgetLpaMin) return null;
        if (data.country && u.country.toLowerCase() !== data.country.toLowerCase()) return null;

        // Weighted heuristic: gpa fit 0.5, budget fit 0.3, country bonus 0.2
        const gpaFit = Math.min(1, data.gpa / Math.max(0.01, u.minGpa + 2));
        const budgetFit = data.budget !== undefined ? Math.min(1, data.budget / Math.max(0.01, u.budgetLpaMin)) : 0.6;
        const countryBonus = data.country ? 1 : 0.5;
        const score = gpaFit * 0.5 + budgetFit * 0.3 + countryBonus * 0.2;

        return {
          id: u.id, name: u.name, country: u.country, intake: u.intake,
          matchPct: Math.round(Math.min(1, Math.max(0, score)) * 100),
        };
      })
      .filter((x) => x !== null)
      .sort((a: any, b: any) => b.matchPct - a.matchPct)
      .slice(0, 3);

    return c.json({ matches: scored, empty: false });
  } catch (error: any) {
    return c.json({ error: "Eligibility match failed", details: error.message }, 500);
  }
});

// GET /api/public/visa/products — fetch active visa products catalog
publicRouter.get('/visa/products', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    let list = await db.select().from(visaProducts).where(eq(visaProducts.status, 'active')).all();
    if (list.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      const defaultVisas = [
  {
    "id": "v1",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 30 Days Single Entry (Without Insurance)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 720000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v2",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 30 Days Express Single Entry (Without Insurance)",
    "entryType": "Single Entry",
    "processingTime": "1 Day",
    "feePaise": 820000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v3",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 30 Days Multiple Entry (Without Insurance)",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1300000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v4",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 60 Days Single Entry (Without Insurance)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1100000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v5",
    "country": "Dubai 🇦🇪",
    "visaType": "UAE 60 Days Multiple Entry (Without Insurance)",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1800000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v6",
    "country": "Thailand 🇹🇭",
    "visaType": "Thailand 15 Days Visa on Arrival (E-VOA)",
    "entryType": "Single Entry",
    "processingTime": "1-2 Days",
    "feePaise": 550000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Confirmed hotel booking\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v7",
    "country": "Thailand 🇹🇭",
    "visaType": "Thailand 30 Days Single Entry Tourist",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Confirmed flight ticket\"]",
    "status": "active"
  },
  {
    "id": "v8",
    "country": "Thailand 🇹🇭",
    "visaType": "Thailand 60 Days Single Entry Tourist",
    "entryType": "Single Entry",
    "processingTime": "3-5 Days",
    "feePaise": 950000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank statement\", \"Flight booking\"]",
    "status": "active"
  },
  {
    "id": "v9",
    "country": "Thailand 🇹🇭",
    "visaType": "Thailand Multiple Entry Tourist (METV)",
    "entryType": "Multiple Entry",
    "processingTime": "5-7 Days",
    "feePaise": 1800000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank statement 6 months\", \"Employment proof\"]",
    "status": "active"
  },
  {
    "id": "v10",
    "country": "Malaysia 🇲🇾",
    "visaType": "Malaysia 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "2-3 Days",
    "feePaise": 380000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Flight booking\", \"Hotel voucher\"]",
    "status": "active"
  },
  {
    "id": "v11",
    "country": "Malaysia 🇲🇾",
    "visaType": "Malaysia 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3 Days",
    "feePaise": 650000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Flight ticket\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v12",
    "country": "Malaysia 🇲🇾",
    "visaType": "Malaysia 30 Days Single Entry Business",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 800000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Invitation letter\", \"Company proof\"]",
    "status": "active"
  },
  {
    "id": "v13",
    "country": "Vietnam 🇻🇳",
    "visaType": "Vietnam 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 420000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Entry/Exit port info\"]",
    "status": "active"
  },
  {
    "id": "v14",
    "country": "Vietnam 🇻🇳",
    "visaType": "Vietnam 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Entry/Exit port info\"]",
    "status": "active"
  },
  {
    "id": "v15",
    "country": "Vietnam 🇻🇳",
    "visaType": "Vietnam 90 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v16",
    "country": "Vietnam 🇻🇳",
    "visaType": "Vietnam 90 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1100000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v17",
    "country": "Sri Lanka 🇱🇰",
    "visaType": "Sri Lanka 30 Days Tourist ETA (Double Entry)",
    "entryType": "Double Entry",
    "processingTime": "1-2 Days",
    "feePaise": 450000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v18",
    "country": "Sri Lanka 🇱🇰",
    "visaType": "Sri Lanka 30 Days Business ETA (Multiple Entry)",
    "entryType": "Multiple Entry",
    "processingTime": "2 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Company invitation\"]",
    "status": "active"
  },
  {
    "id": "v19",
    "country": "Sri Lanka 🇱🇰",
    "visaType": "Sri Lanka 2 Year Tourist Visa (Multiple Entry)",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 1850000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank balance proof\"]",
    "status": "active"
  },
  {
    "id": "v20",
    "country": "Azerbaijan 🇦🇿",
    "visaType": "Azerbaijan 30 Days Single Entry ASAN E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v21",
    "country": "Azerbaijan 🇦🇿",
    "visaType": "Azerbaijan 30 Days Urgent ASAN E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Hours",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v22",
    "country": "Bahrain 🇧🇭",
    "visaType": "Bahrain 14 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3-5 Days",
    "feePaise": 450000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v23",
    "country": "Bahrain 🇧🇭",
    "visaType": "Bahrain 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "4 Days",
    "feePaise": 780000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking\", \"Return ticket\"]",
    "status": "active"
  },
  {
    "id": "v24",
    "country": "Bahrain 🇧🇭",
    "visaType": "Bahrain 1 Year Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "4-5 Days",
    "feePaise": 1650000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank statement 3 months\"]",
    "status": "active"
  },
  {
    "id": "v25",
    "country": "Cambodia 🇰🇭",
    "visaType": "Cambodia 30 Days Single Entry E-Visa (Tourist)",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 380000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v26",
    "country": "Cambodia 🇰🇭",
    "visaType": "Cambodia 30 Days Single Entry E-Visa (Business)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 550000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Business invitation\"]",
    "status": "active"
  },
  {
    "id": "v27",
    "country": "Egypt 🇪🇬",
    "visaType": "Egypt 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "5 Days",
    "feePaise": 320000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v28",
    "country": "Egypt 🇪🇬",
    "visaType": "Egypt 90 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "5-7 Days",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v29",
    "country": "Ethiopia 🇪🇹",
    "visaType": "Ethiopia 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 750000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v30",
    "country": "Ethiopia 🇪🇹",
    "visaType": "Ethiopia 90 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "4 Days",
    "feePaise": 1250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v31",
    "country": "Georgia 🇬🇪",
    "visaType": "Georgia 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "5 Days",
    "feePaise": 280000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Travel insurance\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v32",
    "country": "Georgia 🇬🇪",
    "visaType": "Georgia 90 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "5-7 Days",
    "feePaise": 550000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Travel insurance\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v33",
    "country": "Hong Kong 🇭🇰",
    "visaType": "Hong Kong 14 Days Pre-Arrival Registration (PAR)",
    "entryType": "Multiple Entry",
    "processingTime": "1 Day",
    "feePaise": 120000,
    "requiredDocsJson": "[\"Passport details\"]",
    "status": "active"
  },
  {
    "id": "v34",
    "country": "Hong Kong 🇭🇰",
    "visaType": "Hong Kong 30 Days Visit Visa (Tourist)",
    "entryType": "Single Entry",
    "processingTime": "4 Weeks",
    "feePaise": 380000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Financial status proof\", \"Sponsor letter\"]",
    "status": "active"
  },
  {
    "id": "v35",
    "country": "Indonesia 🇮🇩",
    "visaType": "Indonesia 30 Days Visa on Arrival (E-VOA)",
    "entryType": "Single Entry",
    "processingTime": "1 Day",
    "feePaise": 350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Return flight\"]",
    "status": "active"
  },
  {
    "id": "v36",
    "country": "Indonesia 🇮🇩",
    "visaType": "Indonesia 60 Days Single Entry Tourist Visa (B211A)",
    "entryType": "Single Entry",
    "processingTime": "5-7 Days",
    "feePaise": 1250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Bank statement min $2000\", \"Sponsor details\"]",
    "status": "active"
  },
  {
    "id": "v37",
    "country": "Kenya 🇰🇪",
    "visaType": "Kenya 90 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 580000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v38",
    "country": "Kenya 🇰🇪",
    "visaType": "Kenya 90 Days Transit E-Visa",
    "entryType": "Single Entry",
    "processingTime": "2 Days",
    "feePaise": 250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Connecting flight ticket\"]",
    "status": "active"
  },
  {
    "id": "v39",
    "country": "Morocco 🇲🇦",
    "visaType": "Morocco 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel voucher\"]",
    "status": "active"
  },
  {
    "id": "v40",
    "country": "Morocco 🇲🇦",
    "visaType": "Morocco 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "4 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel voucher\"]",
    "status": "active"
  },
  {
    "id": "v41",
    "country": "Myanmar 🇲🇲",
    "visaType": "Myanmar 28 Days Single Entry E-Visa (Tourist)",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 480000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel voucher\"]",
    "status": "active"
  },
  {
    "id": "v42",
    "country": "Myanmar 🇲🇲",
    "visaType": "Myanmar 70 Days Single Entry E-Visa (Business)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Invitation letter\", \"Company registration copy\"]",
    "status": "active"
  },
  {
    "id": "v43",
    "country": "Oman 🇴🇲",
    "visaType": "Oman 10 Days Single Entry E-Visa (26A)",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v44",
    "country": "Oman 🇴🇲",
    "visaType": "Oman 30 Days Single Entry E-Visa (26B)",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 550000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking\"]",
    "status": "active"
  },
  {
    "id": "v45",
    "country": "Oman 🇴🇲",
    "visaType": "Oman 1 Year Multiple Entry E-Visa (36B)",
    "entryType": "Multiple Entry",
    "processingTime": "4 Days",
    "feePaise": 1350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Valid GCC visa/Entry status copy\"]",
    "status": "active"
  },
  {
    "id": "v46",
    "country": "Qatar 🇶🇦",
    "visaType": "Qatar 30 Days Visa on Arrival (Hayya)",
    "entryType": "Single Entry",
    "processingTime": "1 Day",
    "feePaise": 250000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Hotel booking via Discover Qatar\"]",
    "status": "active"
  },
  {
    "id": "v47",
    "country": "Qatar 🇶🇦",
    "visaType": "Qatar 30 Days E-Visa (Tourist)",
    "entryType": "Single Entry",
    "processingTime": "3-4 Days",
    "feePaise": 380000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Flight booking\"]",
    "status": "active"
  },
  {
    "id": "v48",
    "country": "Russia 🇷🇺",
    "visaType": "Russia 16 Days Unified E-Visa",
    "entryType": "Single Entry",
    "processingTime": "4 Days",
    "feePaise": 480000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Medical insurance\"]",
    "status": "active"
  },
  {
    "id": "v49",
    "country": "Russia 🇷🇺",
    "visaType": "Russia 30 Days Single Entry Tourist Visa",
    "entryType": "Single Entry",
    "processingTime": "7-10 Days",
    "feePaise": 950000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Tourist invitation voucher\"]",
    "status": "active"
  },
  {
    "id": "v50",
    "country": "Turkey 🇹🇷",
    "visaType": "Turkey 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "2 Days",
    "feePaise": 420000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Valid US/UK/Schengen visa copy\"]",
    "status": "active"
  },
  {
    "id": "v51",
    "country": "Turkey 🇹🇷",
    "visaType": "Turkey 90 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3-4 Days",
    "feePaise": 950000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\", \"Travel insurance\"]",
    "status": "active"
  },
  {
    "id": "v52",
    "country": "Uzbekistan 🇺🇿",
    "visaType": "Uzbekistan 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 280000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v53",
    "country": "Uzbekistan 🇺🇿",
    "visaType": "Uzbekistan 30 Days Double Entry E-Visa",
    "entryType": "Double Entry",
    "processingTime": "3 Days",
    "feePaise": 450000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v54",
    "country": "Uzbekistan 🇺🇿",
    "visaType": "Uzbekistan 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "3 Days",
    "feePaise": 680000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v55",
    "country": "Zambia 🇿🇲",
    "visaType": "Zambia 30 Days Single Entry E-Visa",
    "entryType": "Single Entry",
    "processingTime": "3 Days",
    "feePaise": 350000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  },
  {
    "id": "v56",
    "country": "Zambia 🇿🇲",
    "visaType": "Zambia 30 Days Multiple Entry E-Visa",
    "entryType": "Multiple Entry",
    "processingTime": "4 Days",
    "feePaise": 650000,
    "requiredDocsJson": "[\"Passport scan\", \"Photo\"]",
    "status": "active"
  }
]
      for (const v of defaultVisas) {
        await db.insert(visaProducts).values({ ...v, createdAt: now, updatedAt: now }).onConflictDoNothing();
      }
      list = await db.select().from(visaProducts).where(eq(visaProducts.status, 'active')).all();
    }
    return c.json({ products: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch visa products", details: error.message }, 500);
  }
});
