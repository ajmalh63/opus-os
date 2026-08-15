import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import {
  seoPages, seoKeywords, gbpProfile, gbpReviews, gbpPosts,
  aeoChecks, aeoPassages, utmEvents, gaEvents, reportSchedules,
  appSettings, clients, payments, engagements,
} from '../db/schema.js';
import { eq, gte, lte, desc } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';

// ============================================================
// VISIBILITY HUB — one module roof for SEO / AEO-GEO / GA4 /
// Google Business Profile / Search Console / Reviews / Attribution
// + Scheduled Reports (E7). Mounted at /api/visibility (manager+).
// Public endpoints: /sitemap.xml, /robots.txt, POST /api/visibility/utm,
// POST /api/visibility/ga4/events (rate-limited).
// ============================================================

export const visibilityRouter = new Hono<{ Bindings: { DB: D1Database; AI?: any } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `V-${now()}-${Math.random().toString(36).slice(2, 8)}`;

// ---- Static public routes (the SPA pages) ----
const STATIC_ROUTES = [
  { route: '/', label: 'Home' },
  { route: '/study-abroad', label: 'Study Abroad' },
  { route: '/visa-services', label: 'Visa Services' },
  { route: '/umrah-travel', label: 'Umrah Travel' },
  { route: '/attestation', label: 'Attestation' },
  { route: '/recruitment', label: 'Manpower Recruitment' },
  { route: '/lead-form', label: 'Lead Form' },
];

// ============================================================
// V1 — SEO HUB
// ============================================================

// GET /api/visibility/seo/pages — all pages with meta status
visibilityRouter.get('/seo/pages', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const saved = await db.select().from(seoPages).all();
  const savedMap = new Map(saved.map(p => [p.route, p]));
  const pages = STATIC_ROUTES.map(r => {
    const s = savedMap.get(r.route);
    return {
      route: r.route, label: r.label,
      title: s?.title || '', metaDescription: s?.metaDescription || '',
      ogTitle: s?.ogTitle || '', ogImage: s?.ogImage || '',
      schemaJson: s?.schemaJson || '',
      hasMeta: !!(s?.title && s?.metaDescription),
      hasSchema: !!s?.schemaJson,
      updatedAt: s?.updatedAt || null,
    };
  });
  return c.json({ success: true, pages });
});

const seoPageSchema = z.object({
  route: z.string(),
  title: z.string().max(70).optional(),
  metaDescription: z.string().max(165).optional(),
  ogTitle: z.string().max(70).optional(),
  ogImage: z.string().optional(),
  schemaJson: z.string().optional(),
});

// POST /api/visibility/seo/pages — upsert page meta
visibilityRouter.post('/seo/pages', zValidator('json', seoPageSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const existing = await db.select().from(seoPages).where(eq(seoPages.route, body.route)).get();
  const { route, ...rest } = body;
  const values = { ...rest, updatedAt: now() };
  if (existing) await db.update(seoPages).set(values).where(eq(seoPages.route, route));
  else await db.insert(seoPages).values({ route, ...values });
  await auditEvent(c as any, { action: 'SEO_PAGE_SAVED', entityName: 'seo_page', entityId: body.route, afterState: { title: body.title } });
  return c.json({ success: true, message: `Saved SEO for ${body.route}` });
});

// GET /api/visibility/seo/audit — gold-standard page audit (title/meta/schema/OG)
visibilityRouter.get('/seo/audit', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const saved = await db.select().from(seoPages).all();
  const savedMap = new Map(saved.map(p => [p.route, p]));
  const audit = STATIC_ROUTES.map(r => {
    const s = savedMap.get(r.route);
    const issues: { level: 'critical' | 'high' | 'medium'; label: string }[] = [];
    if (!s?.title) issues.push({ level: 'critical', label: 'Missing title tag' });
    else if (s.title.length > 70) issues.push({ level: 'medium', label: `Title ${s.title.length} chars (>70)` });
    if (!s?.metaDescription) issues.push({ level: 'high', label: 'Missing meta description' });
    else if (s.metaDescription.length > 165) issues.push({ level: 'medium', label: `Meta ${s.metaDescription.length} chars (>165)` });
    if (!s?.ogTitle) issues.push({ level: 'medium', label: 'Missing Open Graph title' });
    if (!s?.schemaJson) issues.push({ level: 'high', label: 'Missing JSON-LD structured data' });
    else {
      try { JSON.parse(s.schemaJson); } catch { issues.push({ level: 'critical', label: 'Invalid JSON-LD (parse error)' }); }
    }
    const score = Math.max(0, 100 - issues.reduce((acc, i) => acc + (i.level === 'critical' ? 30 : i.level === 'high' ? 15 : 5), 0));
    return { route: r.route, label: r.label, score, issues };
  });
  const avg = Math.round(audit.reduce((a, p) => a + p.score, 0) / Math.max(1, audit.length));
  return c.json({ success: true, avgScore: avg, pages: audit });
});

// GET/POST /api/visibility/seo/keywords — keyword tracker
visibilityRouter.get('/seo/keywords', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(seoKeywords).all();
  return c.json({ success: true, keywords: rows.sort((a, b) => (a.position || 999) - (b.position || 999)) });
});

const seoKeywordSchema = z.object({
  keyword: z.string().min(1),
  targetUrl: z.string().optional(),
  volume: z.number().optional(),
  position: z.number().optional(),
  impressions: z.number().optional(),
  clicks: z.number().optional(),
});

visibilityRouter.post('/seo/keywords', zValidator('json', seoKeywordSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const id = uid();
  await db.insert(seoKeywords).values({ id, ...body, updatedAt: now() });
  return c.json({ success: true, message: 'Keyword tracked', id });
});

// ============================================================
// V2 — GOOGLE ANALYTICS (GA4)
// ============================================================

// GET /api/visibility/ga4/config
visibilityRouter.get('/ga4/config', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const row = await db.select().from(appSettings).where(eq(appSettings.key, 'ga4_measurement_id')).get();
  return c.json({ success: true, measurementId: row?.value || '' });
});

// POST /api/visibility/ga4/config
visibilityRouter.post('/ga4/config', zValidator('json', z.object({ measurementId: z.string().optional() })), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const { measurementId } = c.req.valid('json');
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, 'ga4_measurement_id')).get();
  if (existing) await db.update(appSettings).set({ value: measurementId || '', updatedAt: now() }).where(eq(appSettings.key, 'ga4_measurement_id'));
  else await db.insert(appSettings).values({ key: 'ga4_measurement_id', value: measurementId || '', updatedAt: now() });
  return c.json({ success: true, message: 'GA4 config saved' });
});

// POST /api/visibility/ga4/events — public event capture (rate-limited by IP via rateLimit table)
visibilityRouter.post('/ga4/events', zValidator('json', z.object({ eventName: z.string(), page: z.string().optional(), source: z.string().optional(), medium: z.string().optional() })), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  await db.insert(gaEvents).values({ id: uid(), eventName: body.eventName, page: body.page, source: body.source, medium: body.medium, createdAt: now() });
  return c.json({ success: true });
});

// GET /api/visibility/ga4/events — dashboard (last 30 days)
visibilityRouter.get('/ga4/events', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const since = now() - 30 * 86400;
  const rows = await db.select().from(gaEvents).where(gte(gaEvents.createdAt, since)).all();
  const byEvent: Record<string, number> = {};
  const byPage: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  rows.forEach(r => {
    byEvent[r.eventName] = (byEvent[r.eventName] || 0) + 1;
    byPage[r.page || '(none)'] = (byPage[r.page || '(none)'] || 0) + 1;
    bySource[r.source || 'direct'] = (bySource[r.source || 'direct'] || 0) + 1;
  });
  return c.json({ success: true, total: rows.length, byEvent, byPage, bySource });
});

// ============================================================
// V3 — GOOGLE BUSINESS PROFILE
// ============================================================

// GET /api/visibility/gbp/profile — with completeness score (the #1 AI Overviews signal)
visibilityRouter.get('/gbp/profile', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const p = await db.select().from(gbpProfile).where(eq(gbpProfile.id, 'main')).get();
  const fields = [
    { key: 'name', label: 'Business name', weight: 20 },
    { key: 'category', label: 'Primary category', weight: 15 },
    { key: 'address', label: 'Address', weight: 15 },
    { key: 'phone', label: 'Phone', weight: 15 },
    { key: 'website', label: 'Website', weight: 15 },
    { key: 'hoursJson', label: 'Hours', weight: 10 },
    { key: 'attributesJson', label: 'Attributes', weight: 10 },
  ];
  const checks = fields.map(f => ({ ...f, filled: !!(p as any)?.[f.key] }));
  const score = checks.reduce((a, ch) => a + (ch.filled ? ch.weight : 0), 0);
  return c.json({ success: true, profile: p || null, completeness: score, checks });
});

const gbpProfileSchema = z.object({
  name: z.string().optional(), category: z.string().optional(), address: z.string().optional(),
  phone: z.string().optional(), website: z.string().optional(),
  hoursJson: z.string().optional(), attributesJson: z.string().optional(),
});

// POST /api/visibility/gbp/profile
visibilityRouter.post('/gbp/profile', zValidator('json', gbpProfileSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const existing = await db.select().from(gbpProfile).where(eq(gbpProfile.id, 'main')).get();
  const values = { ...body, updatedAt: now() };
  if (existing) await db.update(gbpProfile).set(values).where(eq(gbpProfile.id, 'main'));
  else await db.insert(gbpProfile).values({ id: 'main', ...values });
  return c.json({ success: true, message: 'GBP profile saved' });
});

// GET/POST /api/visibility/gbp/reviews — review intake (V6 reuses this)
visibilityRouter.get('/gbp/reviews', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(gbpReviews).orderBy(desc(gbpReviews.createdAt)).all();
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.rating, 0) / rows.length * 10) / 10 : 0;
  const negative = rows.filter(r => r.rating <= 2).length;
  return c.json({ success: true, reviews: rows, avgRating: avg, total: rows.length, negative });
});

const reviewSchema = z.object({
  source: z.enum(['google', 'trustpilot', 'justdial', 'other']).default('google'),
  rating: z.number().min(1).max(5),
  author: z.string().optional(),
  text: z.string().optional(),
});

visibilityRouter.post('/gbp/reviews', zValidator('json', reviewSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const id = uid();
  await db.insert(gbpReviews).values({ id, ...body, createdAt: now() });
  // Negative review → staff alert (reputation risk)
  if (body.rating <= 2) {
    await createStaffAlert(c.env as any, { division: 'visibility', type: 'negative_review', title: `⭐ ${body.rating}/5 review on ${body.source}`, body: `${body.author || 'Anonymous'}: ${(body.text || '').slice(0, 120)}`, severity: 'warning', link: '/visibility' });
  }
  return c.json({ success: true, message: 'Review recorded', id });
});

// POST /api/visibility/gbp/reviews/:id/respond — save response draft
visibilityRouter.post('/gbp/reviews/:id/respond', zValidator('json', z.object({ responseDraft: z.string() })), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const { responseDraft } = c.req.valid('json');
  await db.update(gbpReviews).set({ responseDraft, responded: true }).where(eq(gbpReviews.id, id));
  return c.json({ success: true, message: 'Response draft saved' });
});

// GET/POST /api/visibility/gbp/posts — posts scheduler
visibilityRouter.get('/gbp/posts', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(gbpPosts).orderBy(desc(gbpPosts.createdAt)).all();
  return c.json({ success: true, posts: rows });
});

const gbpPostSchema = z.object({
  title: z.string().min(1), body: z.string().min(1),
  scheduledAt: z.number().optional(), status: z.enum(['draft', 'scheduled', 'published']).default('draft'),
});

visibilityRouter.post('/gbp/posts', zValidator('json', gbpPostSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  await db.insert(gbpPosts).values({ id: uid(), ...body, createdAt: now() });
  return c.json({ success: true, message: 'Post saved' });
});

// ============================================================
// V4 — AEO / ANSWER ENGINE MONITOR (Workers AI, graceful degradation)
// ============================================================

// POST /api/visibility/aeo/check — run a citation check for a query
visibilityRouter.post('/aeo/check', zValidator('json', z.object({ query: z.string().min(3), engine: z.string().default('ai_overviews') })), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const { query, engine } = c.req.valid('json');
  const ai = (c.env as any)?.AI as any;
  const id = uid();

  if (!ai) {
    // Graceful degradation: record an unverified check
    await db.insert(aeoChecks).values({ id, engine, query, mentioned: false, snippet: 'AI binding not configured — check manually', checkedAt: now() });
    return c.json({ success: true, degraded: true, message: 'Workers AI not configured; recorded for manual check', id });
  }

  try {
    const res = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{
        role: 'user',
        content: `You are an AEO citation auditor for "Opus Overseas" (opusoverseas.in) — a study abroad, visa, attestation, umrah and manpower consultancy in India.
Answer engine: ${engine}. Query: "${query}".
Would an answer engine cite or mention Opus Overseas for this query? Reply STRICT JSON only:
{"mentioned":true|false,"snippet":"short 1-2 sentence likely answer or why not"}`,
      }],
      response_format: { type: 'json_object' },
    });
    const content = String((res as any)?.response || (res as any)?.output || '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(content);
    await db.insert(aeoChecks).values({
      id, engine, query,
      mentioned: !!parsed.mentioned,
      snippet: String(parsed.snippet || '').slice(0, 300),
      checkedAt: now(),
    });
    return c.json({ success: true, result: { mentioned: !!parsed.mentioned, snippet: parsed.snippet }, id });
  } catch (e: any) {
    await db.insert(aeoChecks).values({ id, engine, query, mentioned: false, snippet: `Check failed: ${e?.message?.slice(0, 120)}`, checkedAt: now() });
    return c.json({ success: false, error: 'AEO check failed', details: e?.message }, 500);
  }
});

// GET /api/visibility/aeo/checks — history
visibilityRouter.get('/aeo/checks', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(aeoChecks).orderBy(desc(aeoChecks.checkedAt)).all();
  const mentioned = rows.filter(r => r.mentioned).length;
  const mentionRate = rows.length ? Math.round((mentioned / rows.length) * 100) : 0;
  return c.json({ success: true, checks: rows, total: rows.length, mentioned, mentionRate });
});

// GET/POST /api/visibility/aeo/passages — answer-first content library (134-167 word gold standard)
visibilityRouter.get('/aeo/passages', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(aeoPassages).all();
  return c.json({ success: true, passages: rows });
});

const passageSchema = z.object({
  title: z.string().min(1), targetQuery: z.string().min(1),
  passage: z.string().min(50), stats: z.string().optional(),
});

visibilityRouter.post('/aeo/passages', zValidator('json', passageSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const words = body.passage.split(/\s+/).length;
  await db.insert(aeoPassages).values({ id: uid(), ...body, updatedAt: now() });
  return c.json({ success: true, message: `Passage saved (${words} words — gold standard 134-167)`, words });
});

// ============================================================
// V5 — SEARCH CONSOLE (manual query tracking; reuses seo_keywords)
// ============================================================
visibilityRouter.get('/search-console/queries', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(seoKeywords).all();
  const withData = rows.filter(r => r.impressions || r.clicks);
  const totalImpressions = withData.reduce((a, r) => a + (r.impressions || 0), 0);
  const totalClicks = withData.reduce((a, r) => a + (r.clicks || 0), 0);
  const ctr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0;
  return c.json({ success: true, queries: withData.sort((a, b) => (b.impressions || 0) - (a.impressions || 0)), totalImpressions, totalClicks, ctr });
});

// ============================================================
// V7 — ATTRIBUTION (UTM capture + channel ROI)
// ============================================================

// POST /api/visibility/utm — public capture from the site
visibilityRouter.post('/utm', zValidator('json', z.object({ source: z.string().optional(), medium: z.string().optional(), campaign: z.string().optional() })), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  await db.insert(utmEvents).values({ id: uid(), ...body, landedAt: now() });
  return c.json({ success: true });
});

// GET /api/visibility/attribution — channel ROI from leadSource + payments
visibilityRouter.get('/attribution', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const [allClients, allPayments, allEngs] = await Promise.all([
    db.select().from(clients).all(),
    db.select().from(payments).all(),
    db.select().from(engagements).all(),
  ]);
  const engMap = new Map(allEngs.map(e => [e.id, e]));
  const channels: Record<string, { leads: number; converted: number; revenue: number }> = {};
  allClients.forEach(cl => {
    const ch = cl.leadSource || 'direct';
    if (!channels[ch]) channels[ch] = { leads: 0, converted: 0, revenue: 0 };
    channels[ch].leads++;
  });
  allPayments.forEach(p => {
    if (p.status !== 'paid') return;
    const cl = allClients.find(x => x.id === p.clientId);
    const ch = cl?.leadSource || 'direct';
    if (!channels[ch]) channels[ch] = { leads: 0, converted: 0, revenue: 0 };
    channels[ch].revenue += p.type === 'refund' ? -p.amount : p.amount;
  });
  allEngs.forEach(e => {
    const cl = allClients.find(x => x.id === e.clientId);
    const ch = cl?.leadSource || 'direct';
    if (!channels[ch]) channels[ch] = { leads: 0, converted: 0, revenue: 0 };
    channels[ch].converted++;
  });
  const list = Object.entries(channels).map(([channel, v]) => ({
    channel,
    leads: v.leads,
    converted: v.converted,
    conversionPct: v.leads > 0 ? Math.round((v.converted / v.leads) * 100) : 0,
    revenue: v.revenue,
    arpu: v.converted > 0 ? Math.round(v.revenue / v.converted) : 0,
  })).sort((a, b) => b.revenue - a.revenue);
  return c.json({ success: true, channels: list });
});

// ============================================================
// E7 — SCHEDULED REPORTS
// ============================================================
visibilityRouter.get('/reports/schedules', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(reportSchedules).orderBy(desc(reportSchedules.createdAt)).all();
  return c.json({ success: true, schedules: rows });
});

const scheduleSchema = z.object({
  name: z.string().min(1),
  reportType: z.enum(['revenue', 'growth', 'funnels', 'compliance', 'visibility']),
  period: z.string().default('monthly'),
  recipients: z.string().optional(),
  enabled: z.boolean().default(true),
});

visibilityRouter.post('/reports/schedules', zValidator('json', scheduleSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  await db.insert(reportSchedules).values({ id: uid(), ...body, createdAt: now() });
  await auditEvent(c as any, { action: 'REPORT_SCHEDULED', entityName: 'report_schedule', entityId: body.name, afterState: { type: body.reportType, period: body.period } });
  return c.json({ success: true, message: 'Report schedule created' });
});

// POST /api/visibility/reports/schedules/:id/run — run now (audit-logged)
visibilityRouter.post('/reports/schedules/:id/run', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const s = await db.select().from(reportSchedules).where(eq(reportSchedules.id, id)).get();
  if (!s) return c.json({ error: 'Schedule not found' }, 404);
  await db.update(reportSchedules).set({ lastRunAt: now() }).where(eq(reportSchedules.id, id));
  await auditEvent(c as any, { action: 'REPORT_RUN', entityName: 'report_schedule', entityId: s.name, afterState: { type: s.reportType, period: s.period } });
  return c.json({ success: true, message: `Report "${s.name}" queued — delivery requires SMTP config (TODO)` });
});

// ============================================================
// PUBLIC: /sitemap.xml + /robots.txt (served from the API)
// ============================================================
export const publicSeoRouter = new Hono<{ Bindings: { DB: D1Database } }>();

publicSeoRouter.get('/sitemap.xml', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const saved = await db.select().from(seoPages).all();
  const savedMap = new Map(saved.map(p => [p.route, p]));
  const base = 'https://opusoverseas.in';
  const urls = STATIC_ROUTES.map(r => {
    const s = savedMap.get(r.route);
    return `  <url><loc>${base}${r.route === '/' ? '' : r.route}</loc><lastmod>${s?.updatedAt ? new Date(s.updatedAt * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>${r.route === '/' ? '1.0' : '0.8'}</priority></url>`;
  }).join('\n');
  c.header('Content-Type', 'application/xml');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
});

// GET /api/visibility/public/meta?route=/study-abroad — public meta for SPA injection
publicSeoRouter.get('/api/visibility/public/meta', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const route = c.req.query('route') || '/';
  const row = await db.select().from(seoPages).where(eq(seoPages.route, route)).get();
  return c.json({
    success: true,
    meta: row ? { title: row.title, metaDescription: row.metaDescription, ogTitle: row.ogTitle, ogImage: row.ogImage, schemaJson: row.schemaJson } : null,
  });
});

publicSeoRouter.get('/robots.txt', (c) => {
  // Gold standard: allow search + AI search crawlers; block training crawlers
  c.header('Content-Type', 'text/plain');
  return c.body(`# Opus Overseas — robots.txt (RFC 9309)
# Allow search engines + AI search crawlers (visibility strategy)
User-agent: *
Allow: /

# AI search / answer engines — ALLOWED (we want citations)
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

# Training crawlers — BLOCKED (protect proprietary content)
User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

Sitemap: https://opusoverseas.in/sitemap.xml
`);
});