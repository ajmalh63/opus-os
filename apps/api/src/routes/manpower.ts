import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, engagements } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const manpowerRouter = new Hono<{ Bindings: { DB: D1Database; MANPOWER_AI?: 'mock' | 'real' } }>();

// Explicitly labeled demo candidates (B-3). Only used when MANPOWER_AI !== 'real'.
// Never presented as a real Workers AI result.
const MOCK_CANDIDATES = {
  default: {
    name: "Aditya Verma",
    email: "aditya.verma@example.com",
    phone: "+91 98989 12345",
    skills: ["Java", "Spring Boot", "Docker", "Kubernetes", "SQL"],
    experience: ["Software Engineer at Infosys (2 years)", "Intern at Tech Solutions (6 months)"],
    education: "B.Tech in Computer Science from NIT Nagpur"
  },
  priya: {
    name: "Priya Patel",
    email: "priya.patel@example.com",
    phone: "+91 97979 54321",
    skills: ["React", "TypeScript", "Tailwind CSS", "Redux", "Figma"],
    experience: ["Frontend Developer at Wipro (3 years)"],
    education: "B.E. in Information Technology from Pune University"
  }
};

// POST /api/manpower/resume/parse (Workers AI Resume Parser)
manpowerRouter.post('/resume/parse', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.resume as File | undefined;

    if (!file) {
      return c.json({ error: "No resume file uploaded." }, 400);
    }

    // B-3: demo data must never run silently in production paths.
    // When MANPOWER_AI=real, only a real Workers AI parse is acceptable. The
    // Workers AI resume parser is NOT implemented, so fail LOUD (501) instead
    // of returning the hardcoded fake candidate.
    if (c.env.MANPOWER_AI === 'real') {
      return c.json(
        { error: "MANPOWER_AI=real configured but Workers AI call not implemented" },
        501
      );
    }

    // Mock mode (MANPOWER_AI !== 'real', e.g. dev default "mock"): return the
    // training/demo candidate wrapped so the response is EXPLICITLY demo data.
    const fileNameLower = file.name?.toLowerCase() || '';
    const mockCandidate = fileNameLower.includes('priya')
      ? MOCK_CANDIDATES.priya
      : MOCK_CANDIDATES.default;

    return c.json({
      success: true,
      mocked: true,
      candidate: mockCandidate,
      parsedData: mockCandidate,
      message: "Resume processed by mock parser (MANPOWER_AI != 'real'). DEMO DATA — not a real parsing result."
    });

  } catch (error: any) {
    return c.json({ error: "Resume parser exception", details: error.message }, 500);
  }
});

// GET /api/manpower/candidates (Screening Pool Desk View)
manpowerRouter.get('/candidates', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const activeManpowerEngs = await db
      .select()
      .from(engagements)
      .where(eq(engagements.division, 'manpower'))
      .all();

    if (activeManpowerEngs.length === 0) {
      return c.json({ candidates: [] });
    }

    const clientIds = activeManpowerEngs.map(e => e.clientId);
    const allClients = await db.select().from(clients).all();
    const list = allClients
      .filter(cl => clientIds.includes(cl.id))
      .map(cl => ({
        id: cl.id,
        name: cl.name,
        email: cl.email,
        phone: cl.phone,
        highestQualification: cl.highestQualification,
        createdAt: cl.createdAt
      }));

    return c.json({ candidates: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch candidates pool", details: error.message }, 500);
  }
});
