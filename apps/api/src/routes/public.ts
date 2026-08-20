import { MASTER_VISA_PRODUCTS } from "../data/visaProducts.js";
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { groupDepartures, jobPostings, attestationChains, universities, visaProducts } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';
import { getDivisionsEnabled, isDivisionEnabled, DIVISION_KEYS } from '../lib/divisions.js';

// ============================================================
// 24.1.1 PUBLIC ARTIFACTS ” homepage hero live widgets
// Staff-auth-free by design: these feed the public website's
// hero carousel (Eligibility Checker, Departure Countdown,
// Attestation Chain, Job Ticker). All responses are real D1
// data ” never mocks. Empty stores return empty arrays.
// ============================================================

export const publicRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// Edge-Cache headers for Public Reads (100% Free Cloudflare CDN Caching)
// Serves sub-10ms cached responses from 330+ Cloudflare edge locations
// while keeping data fresh in background (stale-while-revalidate) and resilient during blips (stale-if-error).
publicRouter.use('*', async (c, next) => {
  await next();
  if (c.req.method === 'GET' && c.res.status === 200) {
    c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600, stale-if-error=86400');
    c.header('CDN-Cache-Control', 'max-age=300');
  }
});

// GET /api/public/divisions — central registry driving ALL frontends
// (coming-soon states, nav, dropdown options). No auth — tiny static read.
publicRouter.get('/divisions', async (c) => {
  const enabled = await getDivisionsEnabled(c.env);
  return c.json({ enabled, list: [...DIVISION_KEYS] });
});

// GET /api/public/jobs ” open job postings for the Manpower job ticker.
// Only tier='public' openings are ever exposed — secret roles stay on the
// internal board only (data-exposure gate before it was polyfilled).
// Division kill-switch: manpower off → empty ticker (server-side, never UI-only).
publicRouter.get('/jobs', async (c) => {
  if (!(await isDivisionEnabled(c.env, 'manpower'))) return c.json({ jobs: [] });
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(jobPostings)
      .where(and(eq(jobPostings.status, 'open'), eq(jobPostings.tier, 'public'))).all();
    const jobs = rows.map((j) => ({ id: j.id, title: j.title, country: j.country, sector: j.sector }));
    return c.json({ jobs });
  } catch (error: any) {
    return c.json({ error: "Job ticker failed",  }, 500);
  }
});

// GET /api/public/umrah/departures ” next scheduled departures with live availability bands
publicRouter.get('/umrah/departures', async (c) => {
  if (!(await isDivisionEnabled(c.env, 'umrah'))) return c.json({ departures: [] });
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
    return c.json({ error: "Departure ticker failed",  }, 500);
  }
});

// GET /api/public/attestation/chains ” attestation step chains per country
publicRouter.get('/attestation/chains', async (c) => {
  if (!(await isDivisionEnabled(c.env, 'attestation'))) return c.json({ chains: [] });
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
    return c.json({ error: "Attestation chains failed",  }, 500);
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
  if (!(await isDivisionEnabled(c.env, 'study-abroad'))) {
    return c.json({ error: 'Unavailable', code: 'DIVISION_DISABLED' }, 404);
  }
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
    return c.json({ error: "Eligibility match failed",  }, 500);
  }
});

// GET /api/public/visa/products — fetch active visa products catalog
publicRouter.get('/visa/products', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    let list = await db.select().from(visaProducts).where(eq(visaProducts.status, "active")).all();
    if (list.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      for (const v of MASTER_VISA_PRODUCTS) {
        await db.insert(visaProducts).values({ ...v, createdAt: now, updatedAt: now }).onConflictDoNothing();
      }
      list = await db.select().from(visaProducts).where(eq(visaProducts.status, "active")).all();
    }
    return c.json({ products: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch visa products",  }, 500);
  }
});
