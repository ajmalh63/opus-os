import { Hono } from 'hono';
import { eq, desc, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { feedbackSubmissions, staffAlerts, clients } from '../db/schema.js';
import { feedbackSubmissionSchema, syncExternalReviewsSchema } from '@opusos/shared';
import { auditEvent } from '../middleware/audit.js';
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

  const { clientName, rating, division, title, comment, feedbackType, counselorName, source, authorAvatarUrl, authorLocation, sourceUrl, metadata } = parsed.data;
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
    source: source || 'native',
    authorAvatarUrl: authorAvatarUrl || null,
    authorLocation: authorLocation || null,
    sourceUrl: sourceUrl || null,
    isFeatured: false,
    verifiedBuyer: true,
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
  await auditEvent(c, {
    action: 'FEEDBACK_SUBMITTED',
    entityName: 'feedback_submissions',
    entityId: id,
    afterState: { rating, division, feedbackType, source: source || 'native' },
  });

  return c.json({ success: true, id, message: 'Thank you for your feedback! It will be reviewed by our team.' }, 201);
});

// ── 2. PUBLIC: GET MULTI-SOURCE REVIEWS & AGGREGATE SUMMARY (FOR PUBLIC WIDGETS + SEO) ──
feedbackRouter.get('/api/public/feedback/approved', async (c) => {
  const db = getDb(c.env.DB);
  const divisionQuery = c.req.query('division');
  const sourceQuery = c.req.query('source');
  const featuredOnly = c.req.query('featured') === 'true';
  const limit = Math.min(Number(c.req.query('limit')) || 30, 100);

  const raw = await db
    .select({
      id: feedbackSubmissions.id,
      clientName: feedbackSubmissions.clientName,
      division: feedbackSubmissions.division,
      rating: feedbackSubmissions.rating,
      title: feedbackSubmissions.title,
      comment: feedbackSubmissions.comment,
      counselorName: feedbackSubmissions.counselorName,
      source: feedbackSubmissions.source,
      authorAvatarUrl: feedbackSubmissions.authorAvatarUrl,
      authorLocation: feedbackSubmissions.authorLocation,
      sourceUrl: feedbackSubmissions.sourceUrl,
      isFeatured: feedbackSubmissions.isFeatured,
      verifiedBuyer: feedbackSubmissions.verifiedBuyer,
      createdAt: feedbackSubmissions.createdAt,
    })
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.isPublicApproved, true))
    .orderBy(desc(feedbackSubmissions.isFeatured), desc(feedbackSubmissions.displayOrder), desc(feedbackSubmissions.createdAt));

  // Filter in memory for maximum flexibility & summary computation
  let filtered = raw;
  if (divisionQuery && divisionQuery !== 'all') {
    filtered = filtered.filter(r => r.division === divisionQuery || r.division === 'general');
  }
  if (sourceQuery && sourceQuery !== 'all') {
    filtered = filtered.filter(r => r.source === sourceQuery);
  }
  if (featuredOnly) {
    filtered = filtered.filter(r => r.isFeatured);
  }

  const paginated = filtered.slice(0, limit);

  // Mask client name for DPDP compliance e.g. "Rahul Sharma" -> "Rahul S." (unless already a public Google/Trustpilot reviewer)
  const reviews = paginated.map((r) => {
    let maskedName = r.clientName;
    if (r.source === 'native' || r.source === 'whatsapp') {
      const parts = r.clientName.trim().split(' ');
      maskedName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : r.clientName;
    }
    return {
      ...r,
      clientName: maskedName,
    };
  });

  // Calculate Aggregation Metrics
  const totalApproved = raw.length;
  const fiveStars = raw.filter(r => r.rating === 5).length;
  const fourStars = raw.filter(r => r.rating === 4).length;
  const threeStars = raw.filter(r => r.rating === 3).length;
  const sumRatings = raw.reduce((sum, r) => sum + r.rating, 0);
  const avgRating = totalApproved > 0 ? Number((sumRatings / totalApproved).toFixed(1)) : 4.9;

  const bySource = {
    google: raw.filter(r => r.source === 'google').length,
    trustpilot: raw.filter(r => r.source === 'trustpilot').length,
    native: raw.filter(r => r.source === 'native' || r.source === 'whatsapp').length,
  };

  // Google Schema.org JSON-LD AggregateRating payload for SEO rich snippets
  const schemaJsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "name": "Opus Overseas",
    "url": "https://opusoverseas.com",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": avgRating.toString(),
      "bestRating": "5",
      "worstRating": "1",
      "ratingCount": totalApproved > 0 ? totalApproved.toString() : "1",
    },
    "review": reviews.slice(0, 5).map(rev => ({
      "@type": "Review",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": rev.rating.toString(),
        "bestRating": "5"
      },
      "author": {
        "@type": "Person",
        "name": rev.clientName
      },
      "reviewBody": rev.comment,
      "datePublished": new Date(rev.createdAt * 1000).toISOString().split('T')[0]
    }))
  };

  return c.json({
    summary: {
      total: totalApproved,
      avgRating,
      fiveStars,
      fourStars,
      threeStars,
      bySource,
    },
    reviews,
    schemaJsonLd,
  });
});

// Alias: /api/public/reviews -> /api/public/feedback/approved
feedbackRouter.get('/api/public/reviews', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/api/public/feedback/approved';
  return feedbackRouter.fetch(new Request(url.toString(), c.req.raw), c.env, c.executionCtx);
});

// ── 3. SUPERADMIN & STAFF: GET ALL FEEDBACK + CSAT METRICS ──
feedbackRouter.get('/api/admin/feedback', async (c) => {
  const db = getDb(c.env.DB);
  
  const allSubmissions = await db
    .select()
    .from(feedbackSubmissions)
    .orderBy(desc(feedbackSubmissions.createdAt))
    .limit(150);

  // Compute metrics
  const total = allSubmissions.length;
  const fiveStars = allSubmissions.filter((f) => f.rating === 5).length;
  const fourStars = allSubmissions.filter((f) => f.rating === 4).length;
  const threeOrLess = allSubmissions.filter((f) => f.rating <= 3).length;
  const approved = allSubmissions.filter((f) => f.isPublicApproved).length;
  const featured = allSubmissions.filter((f) => f.isFeatured).length;
  const sumRating = allSubmissions.reduce((acc, f) => acc + f.rating, 0);
  const avgRating = total > 0 ? (sumRating / total).toFixed(1) : '5.0';

  const bySource = {
    google: allSubmissions.filter(f => f.source === 'google').length,
    trustpilot: allSubmissions.filter(f => f.source === 'trustpilot').length,
    native: allSubmissions.filter(f => f.source === 'native').length,
    whatsapp: allSubmissions.filter(f => f.source === 'whatsapp').length,
  };

  return c.json({
    metrics: {
      total,
      avgRating: Number(avgRating),
      fiveStars,
      fourStars,
      threeOrLess,
      approved,
      featured,
      bySource,
      csatPercent: total > 0 ? Math.round(((fiveStars + fourStars) / total) * 100) : 100,
    },
    submissions: allSubmissions,
  });
});

// ── 4. SUPERADMIN: SYNC EXTERNAL REVIEWS (GOOGLE PLACES & TRUSTPILOT) ──
feedbackRouter.post('/api/admin/reviews/sync', async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const parsed = syncExternalReviewsSchema.safeParse(body);
  const { minRating = 4, limit = 20 } = parsed.success ? parsed.data : { minRating: 4, limit: 20 };

  const results = {
    googleSynced: 0,
    trustpilotSynced: 0,
    skippedDuplicates: 0,
    errors: [] as string[],
  };

  const now = Math.floor(Date.now() / 1000);

  // 1. Google Places Reviews Sync
  if (c.env.GOOGLE_PLACES_API_KEY && c.env.GOOGLE_PLACE_ID) {
    try {
      const gUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(c.env.GOOGLE_PLACE_ID)}&fields=name,rating,reviews,user_ratings_total&key=${encodeURIComponent(c.env.GOOGLE_PLACES_API_KEY)}`;
      const gRes = await fetch(gUrl);
      if (gRes.ok) {
        const gData: any = await gRes.json();
        const gReviews: any[] = gData?.result?.reviews || [];

        for (const gr of gReviews.slice(0, limit)) {
          if (gr.rating < minRating) continue;
          const extId = `g_${gr.author_name}_${gr.time}`;
          
          // Check duplicate
          const existing = await db.query.feedbackSubmissions.findFirst({
            where: eq(feedbackSubmissions.externalId, extId),
          });

          if (existing) {
            results.skippedDuplicates++;
            continue;
          }

          await db.insert(feedbackSubmissions).values({
            id: `fb_g_${crypto.randomUUID().slice(0, 10)}`,
            clientName: gr.author_name || 'Verified Google Reviewer',
            division: 'general',
            rating: gr.rating,
            title: gr.relative_time_description || null,
            comment: gr.text || 'Excellent service and transparent guidance.',
            feedbackType: 'review',
            isPublicApproved: true, // Google reviews are already public
            displayOrder: 1,
            source: 'google',
            externalId: extId,
            authorAvatarUrl: gr.profile_photo_url || null,
            authorLocation: 'Google Maps Verified Reviewer',
            sourceUrl: gr.author_url || `https://search.google.com/local/reviews?placeid=${c.env.GOOGLE_PLACE_ID}`,
            isFeatured: gr.rating === 5,
            verifiedBuyer: true,
            createdAt: gr.time ? Number(gr.time) : now,
            updatedAt: now,
          });

          results.googleSynced++;
        }
      } else {
        results.errors.push(`Google API responded with status ${gRes.status}`);
      }
    } catch (e: any) {
      results.errors.push(`Google Sync Error: ${e.message}`);
    }
  } else {
    results.errors.push('GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID not configured in secrets.');
  }

  // 2. Trustpilot Reviews Sync
  if (c.env.TRUSTPILOT_API_KEY && c.env.TRUSTPILOT_BUSINESS_UNIT_ID) {
    try {
      const tpUrl = `https://api.trustpilot.com/v1/business-units/${encodeURIComponent(c.env.TRUSTPILOT_BUSINESS_UNIT_ID)}/reviews?perPage=${limit}`;
      const tpRes = await fetch(tpUrl, {
        headers: { 'apikey': c.env.TRUSTPILOT_API_KEY },
      });

      if (tpRes.ok) {
        const tpData: any = await tpRes.json();
        const tpReviews: any[] = tpData?.reviews || [];

        for (const tr of tpReviews) {
          if (tr.stars < minRating) continue;
          const extId = `tp_${tr.id}`;

          const existing = await db.query.feedbackSubmissions.findFirst({
            where: eq(feedbackSubmissions.externalId, extId),
          });

          if (existing) {
            results.skippedDuplicates++;
            continue;
          }

          await db.insert(feedbackSubmissions).values({
            id: `fb_tp_${crypto.randomUUID().slice(0, 10)}`,
            clientName: tr.consumer?.displayName || 'Verified Trustpilot Reviewer',
            division: 'study-abroad',
            rating: tr.stars,
            title: tr.title || null,
            comment: tr.text || '',
            feedbackType: 'review',
            isPublicApproved: true,
            displayOrder: 1,
            source: 'trustpilot',
            externalId: extId,
            authorAvatarUrl: null,
            authorLocation: tr.consumer?.countryCode || 'Trustpilot Verified',
            sourceUrl: `https://www.trustpilot.com/reviews/${tr.id}`,
            isFeatured: tr.stars === 5,
            verifiedBuyer: true,
            createdAt: tr.createdAt ? Math.floor(new Date(tr.createdAt).getTime() / 1000) : now,
            updatedAt: now,
          });

          results.trustpilotSynced++;
        }
      } else {
        results.errors.push(`Trustpilot API responded with status ${tpRes.status}`);
      }
    } catch (e: any) {
      results.errors.push(`Trustpilot Sync Error: ${e.message}`);
    }
  } else {
    results.errors.push('TRUSTPILOT_API_KEY or TRUSTPILOT_BUSINESS_UNIT_ID not configured in secrets.');
  }

  // Audit
  await auditEvent(c, {
    action: 'REVIEWS_SYNC_EXECUTED',
    entityName: 'feedback_submissions',
    entityId: 'sync',
    afterState: results,
  });

  return c.json({
    success: true,
    results,
    message: results.googleSynced + results.trustpilotSynced > 0
      ? `Successfully synced ${results.googleSynced} Google and ${results.trustpilotSynced} Trustpilot reviews.`
      : results.skippedDuplicates > 0
      ? `All latest reviews are already synchronized (${results.skippedDuplicates} existing duplicates skipped).`
      : 'Sync completed. Note: Configure Google / Trustpilot API secrets in Cloudflare for live fetching.',
  });
});

// ── 5. SUPERADMIN: TOGGLE FEATURED ON HOMEPAGE ──
feedbackRouter.patch('/api/admin/feedback/:id/feature', async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const isFeatured = Boolean(body.isFeatured);
  const now = Math.floor(Date.now() / 1000);

  await db
    .update(feedbackSubmissions)
    .set({
      isFeatured,
      updatedAt: now,
    })
    .where(eq(feedbackSubmissions.id, id));

  return c.json({ success: true, id, isFeatured });
});

// ── 6. SUPERADMIN: TOGGLE PUBLIC APPROVAL ──
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

// ── 7. SUPERADMIN: DELETE FEEDBACK ──
feedbackRouter.delete('/api/admin/feedback/:id', async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');

  await db.delete(feedbackSubmissions).where(eq(feedbackSubmissions.id, id));
  return c.json({ success: true, id });
});

