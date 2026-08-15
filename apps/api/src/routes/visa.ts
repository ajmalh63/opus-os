import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, visaApplications, visaMockInterviews, engagements, tasks, visaProducts, documents } from '../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { visaFormSchema, missingVisaSections } from '../validation/visaForm.js';

export const visaRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// 1. GET /api/visa/applications — Retrieve visa application records for a client
// Extended (Visa Phase-1): optional status / country / q (client name or token)
// filters; rows expose clientName, clientToken, formJson (raw), submittedAt,
// decisionAt, rejectionReason, deliveredAt. Existing clientId filter + keys kept.
visaRouter.get('/applications', async (c) => {
  const clientId = c.req.query('clientId');
  const status = c.req.query('status');
  const country = c.req.query('country');
  const q = c.req.query('q');

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    let list = clientId
      ? await db.select().from(visaApplications).where(eq(visaApplications.clientId, clientId)).all()
      : await db.select().from(visaApplications).all();

    const clientRows = await db.select().from(clients).all();
    const clientById = new Map(clientRows.map((cl: any) => [cl.id, cl]));

    if (status) list = list.filter((a: any) => a.status === status);
    if (country) list = list.filter((a: any) => a.country === country);
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((a: any) => {
        const cl = clientById.get(a.clientId);
        const nameMatch = (cl?.name || '').toLowerCase().includes(needle);
        const tokenMatch = (a.clientId || '').toLowerCase().includes(needle);
        return nameMatch || tokenMatch;
      });
    }

    const applications = list.map((a: any) => ({
      ...a,
      clientName: clientById.get(a.clientId)?.name || null,
      clientToken: a.clientId,
      formJson: a.formJson ?? null,
      submittedAt: a.submittedAt ?? null,
      decisionAt: a.decisionAt ?? null,
      rejectionReason: a.rejectionReason ?? null,
      deliveredAt: a.deliveredAt ?? null,
    }));

    return c.json({ success: true, applications });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch visa applications", details: error.message }, 500);
  }
});

// 2. POST /api/visa/applications — Create a new visa application record
visaRouter.post('/applications', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    clientId?: string;
    country?: string;
    visaType?: string;
    appointmentDate?: number;
    appointmentLocation?: string;
    notes?: string;
  };
  const { clientId, country, visaType, appointmentDate, appointmentLocation, notes } = body;
  if (!clientId || !country || !visaType) {
    return c.json({ error: "Missing required fields: clientId, country, visaType" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const id = crypto.randomUUID();
    await db.insert(visaApplications).values({
      id,
      clientId,
      country,
      visaType,
      appointmentDate: appointmentDate || null,
      appointmentLocation: appointmentLocation || null,
      status: 'document_prep',
      notes: notes || null,
      createdAt: now,
      updatedAt: now
    });

    await auditEvent(c as any, {
      action: 'LEAD_CREATED',
      entityName: 'visa_applications',
      entityId: id,
      afterState: { id, clientId, country, visaType, status: 'document_prep' }
    }).catch(() => {});

    return c.json({ success: true, id, message: "Visa application record created." });
  } catch (error: any) {
    return c.json({ error: "Failed to create visa application", details: error.message }, 500);
  }
});

// 3. PATCH /api/visa/applications/:id/status — Update visa status and automate actions
// Extended (Visa Phase-1): 8-status enum, no-state-jump rules, rejected needs
// rejectionReason, delivered stamps deliveredAt. Existing doc interlock for
// submitted/granted and the slot_booked task + granted engagement-close keep.
const VISA_STATUS_ENUM = ['draft', 'submitted', 'document_prep', 'slot_booked', 'granted', 'rejected', 'delivered', 'cancelled'];

visaRouter.patch('/applications/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as {
    status?: string;
    appointmentDate?: number;
    appointmentLocation?: string;
    notes?: string;
    rejectionReason?: string;
    overrideDocs?: boolean;
  };
  const { status, appointmentDate, appointmentLocation, notes, rejectionReason, overrideDocs } = body;
  if (!status) {
    return c.json({ error: "status is required" }, 400);
  }
  if (!VISA_STATUS_ENUM.includes(status)) {
    return c.json({ error: `Invalid status. Must be one of: ${VISA_STATUS_ENUM.join(', ')}` }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const entry = await db.select().from(visaApplications).where(eq(visaApplications.id, id)).get();
    if (!entry) {
      return c.json({ error: "Visa application record not found" }, 404);
    }

    // Workflow Interlock Validation Gate for submission and grants
    if ((status === 'submitted' || status === 'granted') && !overrideDocs) {
      // Find matching visa products to parse required checklist docs
      const matchedProds = await db.select().from(visaProducts).where(eq(visaProducts.country, entry.country)).all();
      const docsList = await db.select().from(documents).where(eq(documents.clientId, entry.clientId)).all();
      
      let requiredDocsList: string[] = [];
      if (matchedProds.length > 0) {
        // Try to find the exact matching visa product by type, or fallback to first matched country product
        const specificProd = matchedProds.find(p => p.visaType.toLowerCase() === entry.visaType.toLowerCase()) || matchedProds[0];
        try {
          requiredDocsList = JSON.parse(specificProd.requiredDocsJson || '[]');
        } catch {
          requiredDocsList = ["Passport scan", "Photo"];
        }
      } else {
        requiredDocsList = ["Passport scan", "Photo"];
      }

      const missingOrUnverified = requiredDocsList.filter((docName: string) => {
        const found = docsList.find(d => 
          d.fileName.toLowerCase().includes(docName.toLowerCase().replace(/\s+/g, '_')) || 
          d.fileName.toLowerCase().includes(docName.toLowerCase())
        );
        return !found || found.status !== 'verified';
      });

      if (missingOrUnverified.length > 0) {
        return c.json({
          success: false,
          code: 'unverified_documents',
          message: `Cannot transition status to ${status} because required documents (${missingOrUnverified.join(', ')}) are missing or unverified.`,
          details: missingOrUnverified
        }, 400);
      }
    }

    // No-state-jump rules (Visa Phase-1)
    if (status === 'submitted' && entry.status === 'draft') {
      return c.json({ error: "Cannot submit directly from draft — move to document_prep first." }, 400);
    }
    if (status === 'granted' && !['submitted', 'slot_booked'].includes(entry.status)) {
      return c.json({ error: "Cannot grant — application must be submitted or slot_booked first." }, 400);
    }
    if (status === 'document_prep' && !['draft', 'submitted'].includes(entry.status)) {
      return c.json({ error: "Cannot move to document_prep from current status." }, 400);
    }
    if (status === 'cancelled' && !['draft', 'submitted', 'document_prep'].includes(entry.status)) {
      return c.json({ error: "Cannot cancel from current status." }, 400);
    }
    if (status === 'rejected' && !rejectionReason) {
      return c.json({ error: "rejectionReason is required to mark an application as rejected." }, 400);
    }

    const updateFields: any = {
      status,
      updatedAt: now
    };
    if (appointmentDate !== undefined) updateFields.appointmentDate = appointmentDate;
    if (appointmentLocation !== undefined) updateFields.appointmentLocation = appointmentLocation;
    if (notes !== undefined) updateFields.notes = notes;
    if (rejectionReason !== undefined) updateFields.rejectionReason = rejectionReason;
    if (status === 'delivered') updateFields.deliveredAt = now;
    if (status === 'granted' || status === 'rejected') updateFields.decisionAt = now;

    await db.update(visaApplications).set(updateFields).where(eq(visaApplications.id, id));

    // Handle automation milestones
    if (status === 'slot_booked') {
      // Schedule document checklist validation task 2 days before the slot
      const due = (appointmentDate && appointmentDate > now) ? (appointmentDate - 2 * 24 * 3600) : now + 24 * 3600;
      const taskId = crypto.randomUUID();
      await db.insert(tasks).values({
        id: taskId,
        clientId: entry.clientId,
        title: `Pre-Visa Submission Document Audit (${entry.country})`,
        description: `Verify and stamp final physical and digital document file set before consulate slot for ID ${id}`,
        priority: 'high',
        status: 'open',
        cos: 'expedite',
        dueDate: due,
        createdAt: now,
        updatedAt: now
      });
    } else if (status === 'granted') {
      // Progress the corresponding visa engagement to completed
      const engList = await db.select().from(engagements).where(eq(engagements.clientId, entry.clientId)).all();
      const primaryEng = engList.find(e => e.division === 'visa');
      if (primaryEng) {
        await db.update(engagements)
          .set({ stageKey: 'completed', status: 'closed', updatedAt: now })
          .where(eq(engagements.id, primaryEng.id));
      }
    }

    await auditEvent(c as any, {
      action: 'STAGE_CHANGE',
      entityName: 'visa_applications',
      entityId: id,
      afterState: { id, oldStatus: entry.status, newStatus: status }
    }).catch(() => {});

    return c.json({ success: true, message: `Visa application status updated to ${status}.` });
  } catch (error: any) {
    return c.json({ error: "Failed to update status", details: error.message }, 500);
  }
});

// 3b. PATCH /api/visa/applications/:id — staff generic update (Visa Phase-1):
// notes / appointmentDate / appointmentLocation / formJson (full replace,
// zod-validated) / rejectionReason / deliveredAt.
visaRouter.patch('/applications/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as {
    notes?: string;
    appointmentDate?: number;
    appointmentLocation?: string;
    formJson?: any;
    rejectionReason?: string;
    deliveredAt?: number;
  };

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const entry = await db.select().from(visaApplications).where(eq(visaApplications.id, id)).get();
    if (!entry) {
      return c.json({ error: "Visa application record not found" }, 404);
    }

    const updateFields: any = { updatedAt: now };
    if (body.notes !== undefined) {
      if (typeof body.notes !== 'string') return c.json({ error: "notes must be a string" }, 400);
      updateFields.notes = body.notes;
    }
    if (body.appointmentDate !== undefined) {
      if (typeof body.appointmentDate !== 'number') return c.json({ error: "appointmentDate must be an epoch-seconds integer" }, 400);
      updateFields.appointmentDate = body.appointmentDate;
    }
    if (body.appointmentLocation !== undefined) {
      if (typeof body.appointmentLocation !== 'string') return c.json({ error: "appointmentLocation must be a string" }, 400);
      updateFields.appointmentLocation = body.appointmentLocation;
    }
    if (body.rejectionReason !== undefined) {
      if (typeof body.rejectionReason !== 'string') return c.json({ error: "rejectionReason must be a string" }, 400);
      updateFields.rejectionReason = body.rejectionReason;
    }
    if (body.deliveredAt !== undefined) {
      if (typeof body.deliveredAt !== 'number') return c.json({ error: "deliveredAt must be an epoch-seconds integer" }, 400);
      updateFields.deliveredAt = body.deliveredAt;
    }
    if (body.formJson !== undefined) {
      if (typeof body.formJson !== 'object' || body.formJson === null || Array.isArray(body.formJson)) {
        return c.json({ error: "formJson must be an object (full form replace)" }, 400);
      }
      const parsed = visaFormSchema.safeParse(body.formJson);
      if (!parsed.success) {
        const missing = missingVisaSections(body.formJson);
        return c.json({
          success: false,
          error: `formJson is not a complete valid visa form: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
          missingSections: missing,
        }, 400);
      }
      updateFields.formJson = JSON.stringify(parsed.data);
    }

    await db.update(visaApplications).set(updateFields).where(eq(visaApplications.id, id));

    await auditEvent(c as any, {
      action: 'VISA_APPLICATION_UPDATED',
      entityName: 'visa_applications',
      entityId: id,
      afterState: { id, ...Object.fromEntries(Object.entries(updateFields).filter(([k]) => k !== 'updatedAt')) }
    }).catch(() => {});

    return c.json({ success: true, id, message: "Visa application updated." });
  } catch (error: any) {
    return c.json({ error: "Failed to update visa application", details: error.message }, 500);
  }
});

// 4. GET /api/visa/mock-interviews — Retrieve mock interview logs
visaRouter.get('/mock-interviews', async (c) => {
  const clientId = c.req.query('clientId');
  if (!clientId) {
    return c.json({ error: "clientId is required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const list = await db.select()
      .from(visaMockInterviews)
      .where(eq(visaMockInterviews.clientId, clientId))
      .all();
    return c.json({ success: true, interviews: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch mock interviews", details: error.message }, 500);
  }
});

// 5. POST /api/visa/mock-interviews — Schedule a visa mock interview session
visaRouter.post('/mock-interviews', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    clientId?: string;
    scheduledAt?: number;
    interviewerId?: string;
  };
  const { clientId, scheduledAt, interviewerId } = body;
  if (!clientId || !scheduledAt) {
    return c.json({ error: "Missing required fields: clientId, scheduledAt" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const interviewId = crypto.randomUUID();
    await db.insert(visaMockInterviews).values({
      id: interviewId,
      clientId,
      interviewerId: interviewerId || null,
      scheduledAt,
      status: 'scheduled',
      score: null,
      feedback: null,
      createdAt: now,
      updatedAt: now
    });

    // Automatically create a calendar task for the session
    const taskId = crypto.randomUUID();
    const formattedTime = new Date(scheduledAt * 1000).toLocaleString();
    await db.insert(tasks).values({
      id: taskId,
      clientId,
      assigneeId: interviewerId || null,
      title: `Conduct Visa Mock Interview`,
      description: `Prepare applicant for embassy interview session. Scheduled for ${formattedTime}. Session record ID: ${interviewId}`,
      priority: 'medium',
      status: 'open',
      cos: 'standard',
      dueDate: scheduledAt,
      createdAt: now,
      updatedAt: now
    });

    await auditEvent(c as any, {
      action: 'LEAD_CREATED',
      entityName: 'visa_mock_interviews',
      entityId: interviewId,
      afterState: { id: interviewId, clientId, scheduledAt, status: 'scheduled' }
    }).catch(() => {});

    return c.json({ success: true, id: interviewId, taskId, message: "Mock interview scheduled and calendar task assigned." });
  } catch (error: any) {
    return c.json({ error: "Failed to schedule mock interview", details: error.message }, 500);
  }
});

// 6. PATCH /api/visa/mock-interviews/:id/complete — Log score & feedback and close task
visaRouter.patch('/mock-interviews/:id/complete', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { score?: number; feedback?: string };
  const { score, feedback } = body;
  if (score === undefined || !feedback) {
    return c.json({ error: "score and feedback are required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const entry = await db.select().from(visaMockInterviews).where(eq(visaMockInterviews.id, id)).get();
    if (!entry) {
      return c.json({ error: "Mock interview session not found" }, 404);
    }

    await db.update(visaMockInterviews)
      .set({
        status: 'completed',
        score,
        feedback,
        updatedAt: now
      })
      .where(eq(visaMockInterviews.id, id));

    // Find and resolve the matching task
    const allTasks = await db.select().from(tasks).where(eq(tasks.clientId, entry.clientId)).all();
    const mockTask = allTasks.find(t => t.title === 'Conduct Visa Mock Interview' && t.status === 'open');
    if (mockTask) {
      await db.update(tasks)
        .set({ status: 'done', completedAt: now, updatedAt: now })
        .where(eq(tasks.id, mockTask.id));
    }

    await auditEvent(c as any, {
      action: 'STAGE_CHANGE',
      entityName: 'visa_mock_interviews',
      entityId: id,
      afterState: { id, score, status: 'completed' }
    }).catch(() => {});

    return c.json({ success: true, message: "Mock interview evaluation completed successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to complete evaluation", details: error.message }, 500);
  }
});

// 7. GET /api/visa/products - fetch active & inactive products inventory
visaRouter.get('/products', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    let list = await db.select().from(visaProducts).where(ne(visaProducts.status, 'archived')).all();
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
      list = await db.select().from(visaProducts).where(ne(visaProducts.status, 'archived')).all();
    }
    return c.json({ success: true, products: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch visa products", details: error.message }, 500);
  }
});

// 8. POST /api/visa/products - add visa product to inventory
visaRouter.post('/products', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
const body = await c.req.json().catch(() => ({})) as {
    country: string;
    visaType: string;
    entryType: string;
    processingTime: string;
    feePaise: number;
    requiredDocsJson?: string;
    category?: string;
    tier?: string;
    validityDays?: number | null;
    maxStayDays?: number | null;
    insuranceIncluded?: boolean;
  };

  if (!body.country || !body.visaType || !body.entryType || !body.processingTime || !body.feePaise) {
    return c.json({ error: "Missing required fields: country, visaType, entryType, processingTime, feePaise" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  try {
    await db.insert(visaProducts).values({
      id,
      country: body.country,
      visaType: body.visaType,
      entryType: body.entryType,
      processingTime: body.processingTime,
      feePaise: body.feePaise,
      requiredDocsJson: body.requiredDocsJson || '[]',
      category: body.category || 'Tourist',
      tier: body.tier || 'Standard',
      validityDays: body.validityDays ?? null,
      maxStayDays: body.maxStayDays ?? null,
      insuranceIncluded: !!body.insuranceIncluded,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });
    return c.json({ success: true, id, message: "Visa product created successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to create visa product", details: error.message }, 500);
  }
});

// 9. PUT /api/visa/products/:id - update visa product in inventory
visaRouter.put('/products/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as {
    country?: string;
    visaType?: string;
    entryType?: string;
    processingTime?: string;
    feePaise?: number;
    requiredDocsJson?: string;
    status?: string;
    category?: string;
    tier?: string;
    validityDays?: number | null;
    maxStayDays?: number | null;
    insuranceIncluded?: boolean;
  };

  try {
    const updateFields: any = {
      updatedAt: Math.floor(Date.now() / 1000)
    };
    if (body.country !== undefined) updateFields.country = body.country;
    if (body.visaType !== undefined) updateFields.visaType = body.visaType;
    if (body.entryType !== undefined) updateFields.entryType = body.entryType;
    if (body.processingTime !== undefined) updateFields.processingTime = body.processingTime;
    if (body.feePaise !== undefined) updateFields.feePaise = body.feePaise;
    if (body.requiredDocsJson !== undefined) updateFields.requiredDocsJson = body.requiredDocsJson;
    if (body.status !== undefined) updateFields.status = body.status;
    if (body.category !== undefined) updateFields.category = body.category;
    if (body.tier !== undefined) updateFields.tier = body.tier;
    if (body.validityDays !== undefined) updateFields.validityDays = body.validityDays;
    if (body.maxStayDays !== undefined) updateFields.maxStayDays = body.maxStayDays;
    if (body.insuranceIncluded !== undefined) updateFields.insuranceIncluded = body.insuranceIncluded;

    await db.update(visaProducts).set(updateFields).where(eq(visaProducts.id, id));
    return c.json({ success: true, id, message: "Visa product updated successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to update visa product", details: error.message }, 500);
  }
});

// 10. DELETE /api/visa/products/:id - archive visa product
visaRouter.delete('/products/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  try {
    await db.update(visaProducts).set({ status: 'archived', updatedAt: Math.floor(Date.now() / 1000) }).where(eq(visaProducts.id, id));
    return c.json({ success: true, id, message: "Visa product archived successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to delete visa product", details: error.message }, 500);
  }
});

// 11. PATCH /api/visa/documents/:id/status - Approve or reject an uploaded document
visaRouter.patch('/documents/:id/status', async (c) => {
  const docId = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { status: 'verified' | 'rejected'; notes?: string };
  const { status, notes } = body;

  if (!status || !['verified', 'rejected'].includes(status)) {
    return c.json({ error: "Invalid status value. Must be 'verified' or 'rejected'." }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const doc = await db.select().from(documents).where(eq(documents.id, docId)).get();
    if (!doc) {
      return c.json({ error: "Document record not found" }, 404);
    }

    await db.update(documents)
      .set({
        status,
        verifiedAt: status === 'verified' ? now : null
      })
      .where(eq(documents.id, docId));

    // Log verification to audit trail
    await auditEvent(c as any, {
      action: 'STAGE_CHANGE',
      entityName: 'documents',
      entityId: docId,
      afterState: { id: docId, status, notes }
    }).catch(() => {});

    // Create a client alert task if rejected
    if (status === 'rejected' && notes) {
      await db.insert(tasks).values({
        id: crypto.randomUUID(),
        clientId: doc.clientId,
        title: `Rejected Document: ${doc.fileName}`,
        description: `The visa desk rejected "${doc.fileName}". Correction needed: "${notes}". Please re-upload immediately.`,
        priority: 'high',
        status: 'open',
        cos: 'expedite',
        createdAt: now,
        updatedAt: now
      }).catch(() => {});
    }

    return c.json({ success: true, message: `Document status set to ${status}.` });
  } catch (error: any) {
    return c.json({ error: "Failed to update document status", details: error.message }, 500);
  }
});

// 12. GET /api/visa/documents/:id/download - Stream/download file content from R2
visaRouter.get('/documents/:id/download', async (c) => {
  const docId = c.req.param('id');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const doc = await db.select().from(documents).where(eq(documents.id, docId)).get();
    if (!doc) {
      return c.json({ error: "Document record not found" }, 404);
    }

    const bucket = (c.env as any).BUCKET;
    if (!bucket) {
      return c.json({ error: "Cloudflare R2 storage bucket 'BUCKET' not configured" }, 500);
    }

    const fileObject = await bucket.get(doc.r2Key);
    if (!fileObject) {
      return c.json({ error: "File binary not found in storage bucket" }, 404);
    }

    const headers = new Headers();
    // OWASP: no MIME-sniffing; serve the verified mime (stored at upload) or
    // force octet-stream; safe renderables inline, everything else as attachment.
    const mime = doc.mimeType || fileObject.httpMetadata?.contentType || 'application/octet-stream';
    headers.set("Content-Type", mime);
    headers.set("X-Content-Type-Options", "nosniff");
    const safeInline = /^image\/(png|jpe?g|webp)$/.test(mime) || mime === 'application/pdf';
    const disposition = safeInline ? 'inline' : 'attachment';
    headers.set("Content-Disposition", `${disposition}; filename="${encodeURIComponent(doc.fileName)}"`);
    return new Response(fileObject.body, { headers });
  } catch (error: any) {
    return c.json({ error: "Download request failed", details: error.message }, 500);
  }
});
