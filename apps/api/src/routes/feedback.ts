import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { feedbackSubmissions, staffAlerts, clients } from '../db/schema.js';
import { feedbackSubmissionSchema } from '@opusos/shared';
import { auditBegin } from '../middleware/audit.js';
import { OpusEnv } from '../types.js';

export const feedbackRouter = new Hono<{ Bindings: OpusEnv }>();

// ── 1. PUBLIC: SUBMIT CLIENT FEEDBACK & 5-STAR RATING ──
feedbackRouter.post('/api/public/feedback', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const parsed = feedbackSubmissionSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.format() }, 400);
  }

  const { clientName, rating, division, title, comment, feedbackType, counselorName, metadata } = parsed.data;
  const now = Math.floor(Date.now() / 1000);
  const id = `fb_${crypto.randomUUID().slice(0, 12)}`;

  // Optional client token lookup
  const token = c.req.header('X-Portal-Token');
  let clientId: string | null = null;
  if (token) {
    const client = await db.query.clients.findFirst({
      where: eq(clients.portalToken, token),
    });
    if (client) clientId = client.id;
  }

  await db.insert(feedbackSubmissions).values({
    id,
    clientId,
    clientName,
    division,
    rating,
    title: title || null,
    comment,
    feedbackType,
    isPublicApproved: false, // Moderated before public display
    displayOrder: 0,
    counselorName: counselorName || null,
    metadataJson: metadata ? JSON.stringify(metadata) : '{}',
    createdAt: now,
    updatedAt: now,
  });

  // Low rating alert (detractor recovery trigger)
  if (rating <= 3) {
    await db.insert(staffAlerts).values({
      id: `alt_fb_${crypto.randomUUID().slice(0, 8)}`,
      division: division === 'general' ? 'study-abroad' : division,
      type: 'feedback_detractor',
      severity: 'urgent',
      title: `Low Client Rating (${rating}⭐) — ${clientName}`,
      body: `Client gave ${rating} stars for ${division}. Review: "${comment.slice(0, 100)}"`,
      payloadJson: JSON.stringify({ feedbackId: id, rating, division, clientName }),
      clientId: clientId || undefined,
      status: 'new',
      link: '/admin?tab=feedback',
      createdAt: now,
    });
  }

  // Audit recording
  const audit = await auditBegin(c);
  await audit.auditor({
    entityId: id,
    afterState: { rating, division, feedbackType },
  });

  return c.json({ success: true, id, message: 'Thank you for your feedback! It will be reviewed by our team.' }, 201);
});

// ── 2. PUBLIC: GET SUPERADMIN-APPROVED REVIEWS FOR CAROUSEL ──
feedbackRouter.get('/api/public/feedback/approved', async (c) => {
  const db = getDb(c.env.DB);

  const raw = await db
    .select({
      id: feedbackSubmissions.id,
      clientName: feedbackSubmissions.clientName,
      division: feedbackSubmissions.division,
      rating: feedbackSubmissions.rating,
      title: feedbackSubmissions.title,
      comment: feedbackSubmissions.comment,
      counselorName: feedbackSubmissions.counselorName,
      createdAt: feedbackSubmissions.createdAt,
    })
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.isPublicApproved, true))
    .orderBy(desc(feedbackSubmissions.displayOrder), desc(feedbackSubmissions.createdAt))
    .limit(30);

  // Mask client name for DPDP compliance e.g. "Rahul Sharma" -> "Rahul S."
  const reviews = raw.map((r: { id: string; clientName: string; division: string; rating: number; title: string | null; comment: string; counselorName: string | null; createdAt: number }) => {
    const parts = r.clientName.trim().split(' ');
    const maskedName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : r.clientName;
    return {
      ...r,
      clientName: maskedName,
    };
  });

  return c.json({ reviews });
});

// ── 3. SUPERADMIN & STAFF: GET ALL FEEDBACK + CSAT METRICS ──
feedbackRouter.get('/api/admin/feedback', async (c) => {
  const db = getDb(c.env.DB);
  
  const allSubmissions = await db
    .select()
    .from(feedbackSubmissions)
    .orderBy(desc(feedbackSubmissions.createdAt))
    .limit(100);

  // Compute metrics
  const total = allSubmissions.length;
  const fiveStars = allSubmissions.filter((f: { rating: number }) => f.rating === 5).length;
  const fourStars = allSubmissions.filter((f: { rating: number }) => f.rating === 4).length;
  const threeOrLess = allSubmissions.filter((f: { rating: number }) => f.rating <= 3).length;
  const approved = allSubmissions.filter((f: { isPublicApproved: boolean }) => f.isPublicApproved).length;
  const sumRating = allSubmissions.reduce((acc: number, f: { rating: number }) => acc + f.rating, 0);
  const avgRating = total > 0 ? (sumRating / total).toFixed(1) : '5.0';

  return c.json({
    metrics: {
      total,
      avgRating: Number(avgRating),
      fiveStars,
      fourStars,
      threeOrLess,
      approved,
      csatPercent: total > 0 ? Math.round(((fiveStars + fourStars) / total) * 100) : 100,
    },
    submissions: allSubmissions,
  });
});

// ── 4. SUPERADMIN: TOGGLE PUBLIC APPROVAL ──
feedbackRouter.patch('/api/admin/feedback/:id/moderate', async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const isPublicApproved = Boolean(body.isPublicApproved);
  const displayOrder = Number(body.displayOrder) || 0;
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(feedbackSubmissions)
    .set({
      isPublicApproved,
      displayOrder,
      updatedAt: now,
    })
    .where(eq(feedbackSubmissions.id, id));

  return c.json({ success: true, id, isPublicApproved });
});

// ── 5. SUPERADMIN: DELETE FEEDBACK ──
feedbackRouter.delete('/api/admin/feedback/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');

  await db.delete(feedbackSubmissions).where(eq(feedbackSubmissions.id, id));
  return c.json({ success: true, id });
});
