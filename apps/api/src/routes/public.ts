import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { groupDepartures, jobPostings, attestationChains, universities } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';

// ============================================================
// 24.1.1 PUBLIC ARTIFACTS ” homepage hero live widgets
// Staff-auth-free by design: these feed the public website's
// hero carousel (Eligibility Checker, Departure Countdown,
// Attestation Chain, Job Ticker). All responses are real D1
// data ” never mocks. Empty stores return empty arrays.
// ============================================================

export const publicRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/public/jobs ” open job postings for the Manpower job ticker
publicRouter.get('/jobs', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(jobPostings).where(eq(jobPostings.status, 'open')).all();
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
