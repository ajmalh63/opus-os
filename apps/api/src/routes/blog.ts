import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { blogPosts, blogCategories, users, appSettings } from '../db/schema.js';
import { eq, desc, and, like, or, sql, lte } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { publishSyncEvent } from './sync.js';

// ============================================================
// BLOG ENGINE — Public + Superadmin (Visibility Hub)
// Gold Standard: TL;DR + definition + FAQ 5 + table + author Person + fresh date
// Public: GET /api/blog/posts, GET /api/blog/posts/:slug
// Superadmin: POST/PATCH/DELETE under /api/blog/admin (manager+)
// ============================================================

export const publicBlogRouter = new Hono<{ Bindings: { DB: D1Database } }>();
export const adminBlogRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `b-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}`;

// ---------- Helpers ----------
function calcReadingMinutes(md: string): number {
  const words = md.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}
function slugOk(s: string) { return /^[a-z0-9-]+$/.test(s); }

// Dual SEO+AEO audit (lightweight, mirrors seo-aeo-content-quality-auditor)
// Returns {overall, seo, aeo, readability, critical[], important[], polish[], projected}
function auditPost(p: any) {
  const critical: string[] = [];
  const important: string[] = [];
  const polish: string[] = [];
  let seo = 100, aeo = 100, readability = 100;

  // SEO checks
  if (!p.metaTitle || p.metaTitle.length < 45) { critical.push('SEO: metaTitle <45c (or missing) — add 50-60c with primaryKeyword'); seo -= 20; }
  if (!p.metaDescription || p.metaDescription.length < 120) { critical.push('SEO: metaDescription <120c — add 155c with keyword'); seo -= 20; }
  if (!p.primaryKeyword) { critical.push('SEO: primaryKeyword missing — breaks cannibalization guard'); seo -= 15; }
  if (!p.ogImage) { important.push('SEO: ogImage missing — add 1200x630'); seo -= 10; }
  if (!p.canonical) { polish.push('SEO: canonical not set — defaults to /blog/:slug'); seo -= 5; }
  const wordCount = (p.contentMarkdown || '').split(/\s+/).length;
  if (wordCount < 800) { important.push(`SEO: ${wordCount} words — aim 800-3000 for topical authority`); seo -= 10; }
  if (!p.pillarSlug) { important.push('SEO: pillarSlug not set — cluster orphan risk'); seo -= 10; }

  // AEO checks (from blog-writer skill)
  if (!p.tldr || p.tldr.split(/\s+/).length < 15) { critical.push('AEO: TL;DR block missing or <15 words — add 2-3 sentence direct answer after H1'); aeo -= 25; }
  const hasWhatIs = /##\s+What is/i.test(p.contentMarkdown || '');
  if (!hasWhatIs) { critical.push('AEO: No "What Is" H2 — first H2 must be "What is X?" with definition sentence "X is..."'); aeo -= 20; }
  // FAQ: expect 5 in content
  const faqMatches = (p.contentMarkdown.match(/\?\s*$/gm) || []).length; // crude: lines ending with ?
  // better: look for FAQ section marker
  const faqSection = (p.contentMarkdown.match(/## FAQ/i) || []).length;
  if (!faqSection) { important.push('AEO: FAQ section missing — need 5 Q/A <50w each'); aeo -= 15; }
  else {
    const qaCount = (p.contentMarkdown.split('## FAQ')[1] || '').split('### ').length - 1;
    if (qaCount < 5) { important.push(`AEO: FAQ has ${qaCount} entries — minimum 5 required`); aeo -= 10; }
  }
  if (!/\|.*\|/.test(p.contentMarkdown || '')) { important.push('AEO: No comparison table — add 1 markdown table for lift'); aeo -= 10; }
  if (!p.authorId && !p.authorName) { polish.push('AEO: Author missing — add Person @id for E-E-A-T'); aeo -= 5; }

  // Readability
  if (wordCount > 0) {
    const longParas = (p.contentMarkdown.match(/\n\n[^\n]{600,}/g) || []).length;
    if (longParas > 0) { important.push(`Readability: ${longParas} wall-of-text paragraphs >600c — split to 2-4 sentences`); readability -= 15; }
  }

  seo = Math.max(0, seo); aeo = Math.max(0, aeo); readability = Math.max(0, readability);
  const overall = Math.round((seo * 0.35 + aeo * 0.45 + readability * 0.2));
  const projected = Math.min(100, overall + critical.length * 8 + important.length * 4);
  return { overall, seo, aeo, readability, critical, important, polish, projected, wordCount };
}

// Flush scheduled posts whose time has come (called on every public read — lightweight, realtime without cron)
async function flushScheduled(db: any, env: any, ctx?: any) {
  const ts = now();
  const due = await db.select().from(blogPosts).where(and(eq(blogPosts.status, 'scheduled'), lte(blogPosts.scheduledAt, ts))).all();
  for (const p of due as any[]) {
    await db.update(blogPosts).set({ status: 'published', publishedAt: ts, dateModified: ts, updatedAt: ts } as any).where(eq(blogPosts.id, p.id));
    await auditEvent({ env } as any, { action: 'BLOG_AUTO_PUBLISHED', entityName: 'blog_posts', entityId: p.id, afterState: { slug: p.slug } } as any).catch(()=>{});
    try { await publishSyncEvent(env as any, { channel: 'public:blog', type: 'BLOG_PUBLISHED', payload: { id: p.id, slug: p.slug } }, ctx); } catch {}
    try { await publishSyncEvent(env as any, { channel: 'staff:global:blog', type: 'BLOG_PUBLISHED', payload: { id: p.id, slug: p.slug } }, ctx); } catch {}
  }
  return due.length;
}

async function publishBlogSync(env: any, ctx: any, type: string, post: any) {
  try { await publishSyncEvent(env, { channel: 'public:blog', type, payload: { id: post.id, slug: post.slug, title: post.title } }, ctx); } catch {}
  try { await publishSyncEvent(env, { channel: 'staff:global:blog', type, payload: { id: post.id, slug: post.slug, title: post.title } }, ctx); } catch {}
}

// ---------- Public: list + single ----------

// GET /api/blog/posts — public, paginated, published only unless ?status=draft (but public forces published)
publicBlogRouter.get('/posts', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  // Realtime: auto-publish scheduled posts whose time has come
  await flushScheduled(db, c.env, (c as any).executionCtx).catch(()=>{});
  const q = c.req.query('q') || '';
  const division = c.req.query('division') || '';
  const category = c.req.query('category') || '';
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(24, Math.max(6, parseInt(c.req.query('limit') || '9')));
  const offset = (page - 1) * limit;

  // Public only sees published, but preview?preview=1 allows draft if caller knows slug (public single does viewCount guard)
  const conditions: any[] = [eq(blogPosts.status, 'published')];
  if (q) conditions.push(or(like(blogPosts.title, `%${q}%`), like(blogPosts.excerpt, `%${q}%`), like(blogPosts.primaryKeyword, `%${q}%`)) as any);
  if (division) conditions.push(eq(blogPosts.division, division as any));
  if (category) conditions.push(eq(blogPosts.category, category));

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);
  const rows = await db.select().from(blogPosts).where(where).orderBy(desc(blogPosts.publishedAt)).limit(limit).offset(offset).all();
  const totalRow = await db.select({ count: sql<number>`count(*)`.as('count') }).from(blogPosts).where(where).get();
  const total = Number((totalRow as any)?.count || rows.length);
  return c.json({ success: true, posts: rows, total, page, totalPages: Math.ceil(total / limit) });
});

// GET /api/blog/posts/:slug — public single (increments viewCount best-effort)
publicBlogRouter.get('/posts/:slug', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  await flushScheduled(db, c.env, (c as any).executionCtx).catch(()=>{});
  const slug = c.req.param('slug');
  const row = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).get();
  if (!row || (row as any).status !== 'published') {
    // Allow ?preview=1 to see draft/scheduled (still need to know slug — not enumerable)
    if (c.req.query('preview') !== '1') return c.json({ error: 'Post not found' }, 404);
    if (!row) return c.json({ error: 'Post not found' }, 404);
  }
  // Best-effort viewCount bump (fail-open)
  try { await db.update(blogPosts).set({ viewCount: ((row as any).viewCount || 0) + 1 }).where(eq(blogPosts.id, (row as any).id)); } catch {}
  // Related: 3 by same division + pillar or category
  const related = await db.select().from(blogPosts)
    .where(and(eq(blogPosts.status, 'published'), eq(blogPosts.division, (row as any).division)))
    .orderBy(desc(blogPosts.publishedAt)).limit(4).all()
    .then(rs => rs.filter(r => r.slug !== slug).slice(0, 3));
  return c.json({ success: true, post: row, related });
});

// GET /api/blog/categories — public
publicBlogRouter.get('/categories', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(blogCategories).orderBy(blogCategories.name).all();
  return c.json({ success: true, categories: rows });
});

// ---------- Superadmin CRUD (manager+) ----------

const createSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(80),
  title: z.string().min(8).max(160),
  tldr: z.string().min(30).max(600).optional(),
  excerpt: z.string().max(320).optional(),
  contentMarkdown: z.string().min(200),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  division: z.enum(['study-abroad', 'visa-services', 'attestation', 'umrah-travel', 'manpower', 'general']).default('general'),
  category: z.string().optional(),
  primaryKeyword: z.string().min(3).max(80).optional(),
  secondaryKeywords: z.array(z.string()).optional(),
  pillarSlug: z.string().optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(170).optional(),
  ogImage: z.string().url().optional().or(z.literal('')),
  canonical: z.string().url().optional().or(z.literal('')),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).default('draft'),
  featured: z.boolean().optional(),
  scheduledAt: z.number().optional(),
});

adminBlogRouter.post('/posts', zValidator('json', createSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json') as any;
  if (!slugOk(body.slug)) return c.json({ error: 'Slug must be ^[a-z0-9-]+$' }, 400);
  // Cannibalization guard: primaryKeyword unique across published
  if (body.primaryKeyword) {
    const dup = await db.select().from(blogPosts).where(eq(blogPosts.primaryKeyword, body.primaryKeyword.toLowerCase().trim())).get();
    if (dup && dup.slug !== body.slug) return c.json({ error: `primaryKeyword "${body.primaryKeyword}" already used by /blog/${dup.slug} — cannibalization blocked` }, 409);
  }
  const exists = await db.select().from(blogPosts).where(eq(blogPosts.slug, body.slug)).get();
  if (exists) return c.json({ error: 'Slug already exists' }, 409);
  const id = uid();
  const ts = now();
  const readingMinutes = calcReadingMinutes(body.contentMarkdown);
  await db.insert(blogPosts).values({
    id,
    slug: body.slug,
    title: body.title,
    tldr: body.tldr || '',
    excerpt: body.excerpt || body.tldr?.slice(0, 160) || '',
    contentMarkdown: body.contentMarkdown,
    authorId: body.authorId || null,
    authorName: body.authorName || null,
    division: body.division,
    category: body.category || null,
    primaryKeyword: body.primaryKeyword ? body.primaryKeyword.toLowerCase().trim() : null,
    secondaryKeywords: body.secondaryKeywords ? JSON.stringify(body.secondaryKeywords) : null,
    pillarSlug: body.pillarSlug || null,
    metaTitle: body.metaTitle || body.title.slice(0, 60),
    metaDescription: body.metaDescription || body.excerpt?.slice(0, 155) || body.tldr?.slice(0, 155) || '',
    ogImage: body.ogImage || null,
    canonical: body.canonical || `https://opusoverseas.com/blog/${body.slug}`,
    status: body.status,
    featured: body.featured ? 1 as any : 0 as any,
    readingMinutes,
    publishedAt: body.status === 'published' ? ts : null,
    scheduledAt: body.scheduledAt || null,
    dateModified: ts,
    createdAt: ts,
    updatedAt: ts,
  } as any);
  await auditEvent(c as any, { action: 'BLOG_CREATED', entityName: 'blog_posts', entityId: id, afterState: { slug: body.slug, title: body.title } });
  await publishBlogSync(c.env, (c as any).executionCtx, body.status === 'published' ? 'BLOG_PUBLISHED' : 'BLOG_CREATED', { id, slug: body.slug, title: body.title });
  return c.json({ success: true, id, slug: body.slug });
});

adminBlogRouter.get('/posts', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  // Superadmin sees scheduled → published flip in realtime too
  await flushScheduled(db, c.env, (c as any).executionCtx).catch(()=>{});
  const q = c.req.query('q') || '';
  const status = c.req.query('status') || '';
  const division = c.req.query('division') || '';
  const conditions: any[] = [];
  if (q) conditions.push(or(like(blogPosts.title, `%${q}%`), like(blogPosts.slug, `%${q}%`), like(blogPosts.primaryKeyword, `%${q}%`)) as any);
  if (status) conditions.push(eq(blogPosts.status, status as any));
  if (division) conditions.push(eq(blogPosts.division, division as any));
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(blogPosts).where(where as any).orderBy(desc(blogPosts.updatedAt)).all();
  // Attach audit preview
  const withScore = rows.map(r => ({ ...r, _audit: auditPost(r) }));
  return c.json({ success: true, posts: withScore, total: rows.length });
});

adminBlogRouter.get('/posts/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const row = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true, post: row, audit: auditPost(row) });
});

adminBlogRouter.patch('/posts/:id', zValidator('json', createSchema.partial()), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = c.req.valid('json') as any;
  const existing = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).get();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (body.primaryKeyword && body.primaryKeyword.toLowerCase().trim() !== (existing as any).primaryKeyword) {
    const dup = await db.select().from(blogPosts).where(eq(blogPosts.primaryKeyword, body.primaryKeyword.toLowerCase().trim())).get();
    if (dup && dup.id !== id) return c.json({ error: `primaryKeyword already used by /blog/${dup.slug}` }, 409);
  }
  const patch: any = { ...body };
  if (body.contentMarkdown) patch.readingMinutes = calcReadingMinutes(body.contentMarkdown);
  if (body.primaryKeyword) patch.primaryKeyword = body.primaryKeyword.toLowerCase().trim();
  if (body.secondaryKeywords) patch.secondaryKeywords = JSON.stringify(body.secondaryKeywords);
  patch.updatedAt = now();
  patch.dateModified = now();
  if (body.status === 'published' && (existing as any).status !== 'published') patch.publishedAt = now();
  await db.update(blogPosts).set(patch).where(eq(blogPosts.id, id));
  await auditEvent(c as any, { action: 'BLOG_UPDATED', entityName: 'blog_posts', entityId: id, afterState: { slug: (existing as any).slug } });
  await publishBlogSync(c.env, (c as any).executionCtx, 'BLOG_UPDATED', { id, slug: (existing as any).slug, title: (existing as any).title });
  return c.json({ success: true });
});

adminBlogRouter.delete('/posts/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const row = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).get();
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
  await auditEvent(c as any, { action: 'BLOG_DELETED', entityName: 'blog_posts', entityId: id });
  await publishBlogSync(c.env, (c as any).executionCtx, 'BLOG_DELETED', { id, slug: (row as any)?.slug || id });
  return c.json({ success: true });
});

adminBlogRouter.post('/posts/:id/publish', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const row = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const audit = auditPost(row);
  if (audit.critical.length > 0) return c.json({ error: `Fix critical before publishing: ${audit.critical.join(' | ')}`, audit }, 422);
  await db.update(blogPosts).set({ status: 'published', publishedAt: now(), dateModified: now(), updatedAt: now() } as any).where(eq(blogPosts.id, id));
  await auditEvent(c as any, { action: 'BLOG_PUBLISHED', entityName: 'blog_posts', entityId: id, afterState: { slug: (row as any).slug } });
  await publishBlogSync(c.env, (c as any).executionCtx, 'BLOG_PUBLISHED', { id, slug: (row as any).slug, title: (row as any).title });
  return c.json({ success: true });
});

adminBlogRouter.post('/posts/:id/unpublish', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const row2 = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).get();
  await db.update(blogPosts).set({ status: 'draft', updatedAt: now() } as any).where(eq(blogPosts.id, id));
  if (row2) await publishBlogSync(c.env, (c as any).executionCtx, 'BLOG_UNPUBLISHED', { id, slug: (row2 as any).slug });
  return c.json({ success: true });
});

// GET /api/blog/admin/audit/:id — on-demand SEO+AEO score
adminBlogRouter.get('/audit/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const row = await db.select().from(blogPosts).where(eq(blogPosts.id, id)).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ success: true, audit: auditPost(row) });
});

// Categories admin
adminBlogRouter.get('/categories', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(blogCategories).orderBy(blogCategories.name).all();
  return c.json({ success: true, categories: rows });
});
adminBlogRouter.post('/categories', zValidator('json', z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2), division: z.string().optional() })), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const id = uid();
  await db.insert(blogCategories).values({ id, slug: body.slug, name: body.name, division: body.division || null, createdAt: now() } as any);
  return c.json({ success: true, id });
});
