import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, engagements, consents, candidateProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { parseResumeWithAI } from '../infra/ai.js';

export const manpowerRouter = new Hono<{ Bindings: { DB: D1Database; MANPOWER_AI?: 'mock' | 'real'; AI?: unknown } }>();

// Persist the parsed candidate profile (DPDP-gated: only when the client has a
// granted manpower-retain consent). Fail-open — never blocks the parse itself.
async function persistCandidate(env: { DB: D1Database }, clientId: string | undefined, candidate: any, resumeKey: string | null, source: 'ai' | 'mock') {
  if (!clientId || !env?.DB || !candidate) return;
  try {
    const db = getDb(env.DB);
    const consent = await db.select().from(consents)
      .where(eq(consents.clientId, clientId))
      .all();
    const retain = consent.some((ct: any) => ct.consentType === 'manpower-retain' && ct.status === 'granted');
    if (!retain) return; // DPDP: no retain consent → no profile storage

    const now = Math.floor(Date.now() / 1000);
    const existing = await db.select().from(candidateProfiles).where(eq(candidateProfiles.clientId, clientId)).get();
    const fields = {
      name: String(candidate.name || 'Unnamed'),
      email: candidate.email || null,
      phone: candidate.phone || null,
      skillsJson: JSON.stringify(candidate.skills || []),
      experienceJson: JSON.stringify(candidate.experience || []),
      education: candidate.education || null,
      resumeKey: resumeKey || null,
      source,
      updatedAt: now,
    };
    if (existing) {
      await db.update(candidateProfiles).set({ ...fields, updatedAt: now }).where(eq(candidateProfiles.clientId, clientId));
    } else {
      await db.insert(candidateProfiles).values({ id: crypto.randomUUID(), clientId, createdAt: now, ...fields });
    }
  } catch (e: any) {
    console.error('candidate profile persist failed', e?.message);
  }
}

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

    // B-3: when MANPOWER_AI=real we use the real AI parser (no mock, no 501).
    // Contract: resume TEXT arrives in the `text` form field (or a .txt file) —
    // PDF text-extraction is a Queue job (§10 ms CPU rule). Silent demo data is
    // never produced in real mode.
    if (c.env.MANPOWER_AI === 'real') {
      let text = String(body.text || '');
      if (!text && file && (file.name || '').toLowerCase().endsWith('.txt')) {
        const buf = await file.arrayBuffer().catch(() => null);
        if (buf) text = new TextDecoder('utf-8').decode(buf);
      }
      if (!text) {
        return c.json({ error: 'MANPOWER_AI=real requires a `text` form field (or .txt file) with the resume content' }, 400);
      }

      const result = await parseResumeWithAI(c.env, text);
      if (!result.ok || !result.candidate) {
        return c.json({ error: result.reason || 'AI resume parse failed' }, 502);
      }
      await persistCandidate(c.env, String(body.clientId || ''), result.candidate, String(body.resumeKey || null), 'ai');
      return c.json({
        success: true,
        mocked: false,
        candidate: result.candidate,
        parsedData: result.candidate,
        message: 'Resume parsed by Workers AI (real mode).',
      });
    }

// Mock mode (MANPOWER_AI !== 'real', e.g. dev default "mock"): return the
    // training/demo candidate wrapped so the response is EXPLICITLY demo data.
    const fileNameLower = file.name?.toLowerCase() || '';
    const mockCandidate = fileNameLower.includes('priya')
      ? MOCK_CANDIDATES.priya
      : MOCK_CANDIDATES.default;

    await persistCandidate(c.env, String(body.clientId || ''), mockCandidate, String(body.resumeKey || null), 'mock').catch(() => {});

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
