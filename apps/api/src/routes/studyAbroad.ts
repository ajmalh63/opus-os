import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, universities, studyAbroadShortlists, engagements, tasks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

export const studyAbroadRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// 1. GET /api/study-abroad/universities/match — Match candidate qualifications to eligible universities
studyAbroadRouter.get('/universities/match', async (c) => {
  const clientId = c.req.query('clientId');
  if (!clientId) {
    return c.json({ error: "clientId is required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) {
      return c.json({ error: "Client not found" }, 404);
    }

    // Extract counselor/intake context metrics (gpa, ielts, budget).
    // The portal persists the canonical keys cgpa/englishScore/tuitionBudget;
    // legacy gpa/ielts/budgetLpa keys are still honored for older records.
    let clientGpa = 0.0;
    let clientIelts = 0.0;
    let clientBudgetLpa = 999.0; // very high budget defaults
    let targetCountry: string | null = null;

    if (client.intakeContext) {
      try {
        const context = JSON.parse(client.intakeContext);
        if (context.cgpa || context.gpa) clientGpa = parseFloat(context.cgpa ?? context.gpa);
        if (context.englishScore || context.ielts) clientIelts = parseFloat(context.englishScore ?? context.ielts);
        if (context.tuitionBudget || context.budgetLpa) clientBudgetLpa = parseFloat(context.tuitionBudget ?? context.budgetLpa);
        if (context.targetCountry) targetCountry = String(context.targetCountry);
      } catch (e) {}
    }

    // Fallback based on highest qualification
    if (clientGpa === 0) {
      if (client.highestQualification === 'postgrad') clientGpa = 8.0;
      else if (client.highestQualification === 'undergrad') clientGpa = 7.0;
      else clientGpa = 6.0;
    }
    if (clientIelts === 0) clientIelts = 6.5; // generic default

    // Retrieve all universities and evaluate matching metrics
    const allUnis = await db.select().from(universities).all();
    const matched = allUnis.filter(uni => {
      const gpaOk = clientGpa >= uni.minGpa;
      const ieltsOk = clientIelts >= uni.ieltsMin;
      const budgetOk = clientBudgetLpa >= uni.budgetLpaMin;
      const countryOk = !targetCountry || uni.country.toLowerCase() === targetCountry.toLowerCase();
      return gpaOk && ieltsOk && budgetOk && countryOk;
    });

    return c.json({ success: true, matches: matched });
  } catch (error: any) {
    return c.json({ error: "Matching failed", details: error.message }, 500);
  }
});

// 2. GET /api/study-abroad/shortlist — Retrieve all shortlist entries (or for a specific client)
studyAbroadRouter.get('/shortlist', async (c) => {
  const clientId = c.req.query('clientId');

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const list = clientId
      ? await db.select().from(studyAbroadShortlists).where(eq(studyAbroadShortlists.clientId, clientId)).all()
      : await db.select().from(studyAbroadShortlists).all();

    // Join with university details
    const uniIds = list.map(item => item.universityId);
    const matchedUnis = uniIds.length > 0 
      ? await db.select().from(universities).all()
      : [];

    const joined = list.map(item => {
      const uni = matchedUnis.find(u => u.id === item.universityId);
      return {
        ...item,
        universityName: uni?.name || "Unknown University",
        country: uni?.country || "Unknown Country",
        intake: uni?.intake || ""
      };
    });

    return c.json({ success: true, shortlist: joined });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch shortlist", details: error.message }, 500);
  }
});

// 3. POST /api/study-abroad/shortlist — Add a university to the student's shortlist
studyAbroadRouter.post('/shortlist', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { clientId?: string; universityId?: string; status?: string; notes?: string };
  const { clientId, universityId, status, notes } = body;
  if (!clientId || !universityId) {
    return c.json({ error: "Missing required fields: clientId, universityId" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    // Check if duplicate entry exists
    const duplicate = await db.select().from(studyAbroadShortlists)
      .where(and(
        eq(studyAbroadShortlists.clientId, clientId),
        eq(studyAbroadShortlists.universityId, universityId)
      )).get();
    
    if (duplicate) {
      return c.json({ error: "University is already shortlisted for this student" }, 400);
    }

    const targetStatus = (status && ['shortlisted', 'docs_uploaded', 'submitted', 'offer_letter', 'enrolled', 'rejected', 'cancelled'].includes(status))
      ? (status as any)
      : 'shortlisted';

    const id = crypto.randomUUID();
    await db.insert(studyAbroadShortlists).values({
      id,
      clientId,
      universityId,
      status: targetStatus,
      notes: notes || null,
      createdAt: now,
      updatedAt: now
    });

    await auditEvent(c as any, {
      action: 'LEAD_CREATED',
      entityName: 'study_abroad_shortlists',
      entityId: id,
      afterState: { id, clientId, universityId, status: targetStatus }
    }).catch(() => {});

    return c.json({ success: true, id, message: "University added to student's shortlist." });
  } catch (error: any) {
    return c.json({ error: "Failed to create shortlist entry", details: error.message }, 500);
  }
});

// 4. PATCH /api/study-abroad/shortlist/:id/status — Update shortlist entry status and trigger automated tasks
studyAbroadRouter.patch('/shortlist/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { status?: 'pending' | 'applied' | 'admitted' | 'rejected' | 'cancelled'; notes?: string };
  const { status, notes } = body;
  if (!status) {
    return c.json({ error: "status is required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const entry = await db.select().from(studyAbroadShortlists).where(eq(studyAbroadShortlists.id, id)).get();
    if (!entry) {
      return c.json({ error: "Shortlist entry not found" }, 404);
    }

    const updateFields: any = {
      status,
      updatedAt: now
    };
    if (notes !== undefined) updateFields.notes = notes;

    await db.update(studyAbroadShortlists).set(updateFields).where(eq(studyAbroadShortlists.id, id));

    const uni = await db.select().from(universities).where(eq(universities.id, entry.universityId)).get();
    const uniName = uni?.name || "the university";

    // Trigger automated coordinator tasks based on status transitions
    if (status === 'applied') {
      // 14 days follow-up deadline
      const followUpDue = now + 14 * 24 * 3600;
      const taskId = crypto.randomUUID();
      await db.insert(tasks).values({
        id: taskId,
        clientId: entry.clientId,
        title: `University Decision Follow-up: ${uniName}`,
        description: `Check admission portal status for entry shortlist ID ${id}`,
        priority: 'medium',
        status: 'open',
        cos: 'standard',
        dueDate: followUpDue,
        createdAt: now,
        updatedAt: now
      });
    } else if (status === 'admitted') {
      // 3 days visa prep deadline
      const visaPrepDue = now + 3 * 24 * 3600;
      const taskId = crypto.randomUUID();
      await db.insert(tasks).values({
        id: taskId,
        clientId: entry.clientId,
        title: `Visa Documentation Checklist: ${uniName}`,
        description: `Admission offer letter received. Compile financial proof, visa files, and checklist items.`,
        priority: 'high',
        status: 'open',
        cos: 'standard',
        dueDate: visaPrepDue,
        createdAt: now,
        updatedAt: now
      });

      // Update student's engagement stage to processing
      const engList = await db.select().from(engagements).where(eq(engagements.clientId, entry.clientId)).all();
      const primaryEng = engList.find(e => e.division === 'study-abroad');
      if (primaryEng) {
        await db.update(engagements)
          .set({ stageKey: 'processing', updatedAt: now })
          .where(eq(engagements.id, primaryEng.id));
      }
    }

    await auditEvent(c as any, {
      action: 'STAGE_CHANGE',
      entityName: 'study_abroad_shortlists',
      entityId: id,
      afterState: { id, oldStatus: entry.status, newStatus: status }
    }).catch(() => {});

    return c.json({ success: true, message: `Shortlist status updated to ${status}.` });
  } catch (error: any) {
    return c.json({ error: "Failed to update shortlist status", details: error.message }, 500);
  }
});

// 5. GET /api/study-abroad/universities — Retrieve all universities in the master database
studyAbroadRouter.get('/universities', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const list = await db.select().from(universities).all();
    return c.json({ success: true, universities: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch universities", details: error.message }, 500);
  }
});

// 6. DELETE /api/study-abroad/shortlist/:id — Delete university shortlist entry
studyAbroadRouter.delete('/shortlist/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  try {
    await db.delete(studyAbroadShortlists).where(eq(studyAbroadShortlists.id, id));
    return c.json({ success: true, message: "Shortlist entry deleted" });
  } catch (error: any) {
    return c.json({ error: "Delete failed", details: error.message }, 500);
  }
});
