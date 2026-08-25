# Opus OS — Blog Module Gold Standard (SEO + AEO + GEO + AIO)
*Industry synthesis: Google Search AI Optimization Guide May 15 2026 + Writer GEO 80/20 + Frase mythbusting + GEO Compass schema tier + HubSpot AEO vs SEO + Princeton citation lift study*

---

## 1. Executive Verdict: SEO Is Still GEO

Google: *"AEO and GEO are still SEO"* — AI Overviews/Mode are **rooted in core Search ranking & quality systems** (same index, same crawler). No llms.txt, no chunking, no schema hack needed for AI Overviews. What wins everywhere: **valuable non-commodity content + clean technical structure + fresh business details**.

What actually lifts citations (measured):
- FAQ Q&A blocks: **81% highest citation probability** (any format)
- Lists/tables/step guides: **2.5x** higher citation vs paragraph-only
- Inline source hyperlinks: **+30%** citation lift (Princeton GEO)
- Statistics with sources: **+40%** citation lift
- Content updated <30d: **3.2x** more AI citations; quarterly minimum or **3x** citation loss (Perplexity 90d decay)
- 85% of AI references come from **third-party** platforms — but owned blog that follows first-party discipline captures the 15% you control + earns third-party pickups.

**Implication for Opus OS:** Don't chase llms.txt hack — ship a blog that satisfies *both* engines: classic SEO (indexable, fast, linked) + GEO extractability (answer-first blocks, Q&A, tables).

---

## 2. Gold Standard Checklist (8 Pillars)

### Pillar 1 — Technical Clarity (must index with snippet)
- [ ] SSR or static HTML for `/blog` and `/blog/:slug` — AI crawlers **don't execute JS** (GEO 20% technical)
- [ ] `crawlable: allow GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot` in `robots.txt`; block `CCBot` (training) if desired
- [ ] `sitemap.xml` includes **every published blog `loc` + `lastmod` + `changefreq=weekly`**, paginated if >50k
- [ ] Canonical per post `https://opusoverseas.com/blog/:slug`, no `?utm` canonical
- [ ] Core Web Vitals: LCP <2.5s, INP <200ms, CLS <0.1 (image `width/height`, no layout shift on TOC)
- [ ] `llms.txt` at `/llms.txt` is **optional** (Google says not needed) — we ship a minimal site-level index anyway because Perplexity/ChatGPT show directional lift in CTAIO 30d experiment

### Pillar 2 — Answer-First Structure (AEO entry, GEO lift)
Every post **must** pass the extractor test: first 40-60 words answer the H1 question without needing context.
- [ ] **TL;DR block** (blockquote, 2-3 sentences) immediately after H1 — direct answer to `primaryKeyword` question
- [ ] **Definition sentence** as opening line of first H2 `What is X?` — `X is ...` / `X refers to ...` pattern, one clean sentence
- [ ] H1 → H2 (4-6, question-based) → H3 hierarchy, no duplicate H2
- [ ] Each H2 opens with **40-60 word self-contained answer capsule** (extractable, 134-167 words optimal per passage)
- [ ] Short paragraphs (2-4 sentences), at least **1 comparison table** if topic compares options, at least **1 list/step block**

### Pillar 3 — E-E-A-T + Non-Commodity
Google: non-commodity content *"most likely to influence AI presence long-run"*
- [ ] Author byline with **Person @id** (`https://opusoverseas.com/#person-{slug}`) → `name, jobTitle, sameAs[LinkedIn,X,Wikipedia]`
- [ ] Publisher **Organization @id** (`https://opusoverseas.com/#organization`) → `name, logo, url, sameAs[Wikipedia,Wikidata,LinkedIn,YT]`
- [ ] `datePublished` + `dateModified` kept current via build (not manual) — 30d freshness = 3.2x lift
- [ ] At least **2 first-hand elements** per post: original stat, case note, quote from counselor, or Opus process screenshot
- [ ] Every numeric claim hyperlinked to primary source (lift +30%)

### Pillar 4 — Q&A & Procedural Extractability
- [ ] **FAQ: exactly 5 entries**, each Q = long-tail/secondary keyword, each A **<50 words**, self-contained (no "as mentioned above"), readable standalone
- [ ] Procedural content uses **HowTo** steps only if genuinely stepwise — otherwise use ordered list + HowTo schema omitted (avoid stuffed schema)

### Pillar 5 — Schema (per-engine lever, not AI cheat)
Priority order (GEO Compass + WTF 2026):
1. **Tier 1 (entity graph):** `Article/BlogPosting` + `Person (author)` + `Organization (publisher)` with `sameAs` — clean `@id` refs so engines don't fragment you into N persons
2. **Tier 2 (extractive):** `FAQPage` only where real Q&A exists + `BreadcrumbList` + `HowTo` only where procedural
3. **Tier 3 (situational):** `ItemList` for listicles ("Top 10 MBBS colleges"), `DefinedTermSet` for glossary
- [ ] **JSON-LD only**, one `<script>` per type, all absolute `https://` URLs, validates in Rich Results Test + schema.org validator
- [ ] No Microdata/RDFa, no stuffed types (Article+Product mismatch), no placeholder text

### Pillar 6 — Content Cluster & Internal Linking (Topical Authority)
- [ ] Pillar page per division (e.g., `/study-abroad`, `/study-abroad/mbbs-abroad-guide` is pillar) → cluster articles link **back to pillar**, no orphan
- [ ] Every post stores `primaryKeyword` (unique across posts — cannibalization check), `secondaryKeywords[]`, `pillarSlug`
- [ ] Internal link map auto-suggested: TF-IDF match to 2-3 related posts + pillar; rendered as `Related reading` block at bottom
- [ ] Tag `noindex` on `?page=` pagination beyond first? No — paginated index is followed but not indexed with canonical to page 1 + rel next/prev

### Pillar 7 — GEO Strategic 80% (outside owned blog)
Built into controls even though this doc is for owned blog:
- [ ] Superadmin shows **Brand Mention Checklist** reminder: encourage Reddit threads, YouTube explainer pairing, Wikipedia/LinkedIn author presence — these drive **brand mention → citation 3x > backlinks** (Ahrefs 75k brands)

### Pillar 8 — Governance & Freshness
- [ ] Status `draft | scheduled | published | archived`; `publishedAt` + `scheduledAt`; quarterly `stale` flag if `dateModified >90d`
- [ ] Superadmin **Content Score** dual SEO (keyword, H-structure, word count, internal links) + AEO (TL;DR, definition, FAQ 5, table, extractable) + Readability (passive, transitions, wall-of-text) — projected score after fixes, same as `seo-aeo-content-quality-auditor`
- [ ] Revision history kept (audit table), `updatedAt` bumps `dateModified` automatically

---

## 3. Brainstormed Ideas (for Implementation)

**Idea A — TL;DR Studio:** Editor has a pinned TL;DR textarea (char 200-350) with live check: "Does this answer the H1 question in isolation?" — turns green when 2-3 sentences + contains primary keyword. AI-suggest button via Workers AI `llama-3.3`.

**Idea B — Definition Sentence Guard:** First H2 must be `What is ...?`; its first line is linted to start `X is` / `X refers to` — borrowed from blog-writer skill.

**Idea C — Extractability Preview:** Superadmin side panel shows the 4 passages AI engines will actually lift (H2 capsules + FAQ answers) in a phone-width preview — so editor sees what Perplexity sees.

**Idea D — Citation Needle:** Inline toolbar button `Cite source` wraps selection with `<a href>` and stores `sourceUrl` in block meta — ensures every stat is hyperlinked (lift).

**Idea E — Freshness Nudge:** Dashboard card "Stale 90d+ posts losing citations" with one-click `Mark as reviewed → bump dateModified` (Writer quarterly rule).

**Idea F — Cluster Map Visual:** Superadmin graph view: pillar center, cluster spokes, orphan red, thickness = internal link count. Powered by already-present `Vectorize` embeddings for semantic related suggestions.

---

## 4. Implementation Architecture (Opus OS)

**DB (D1, no new infra):**
- `blogPosts` — id, slug (unique, `/blog/:slug`), title (H1), tldr (TL;DR block), excerpt (160c metaDescription), contentJson (TipTap JSON blocks: heading, paragraph, table, faq, image), htmlCache (SSR), authorId → users.id, authorNameOverride, division (enum study-abroad|visa|attestation|umrah|manpower|general), primaryKeyword (unique), secondaryKeywords (JSON), pillarSlug, metaTitle, metaDescription, ogImage, canonical, status, featured, readingMinutes, publishedAt, scheduledAt, dateModified, createdAt, updatedAt
- `blogCategories` — id, slug, name, division
- Reuse `appSettings` for `blog:defaultAuthorId`

**API (rbac `super_admin,manager` for writes, public for reads):**
- `GET /api/blog/posts?division=&status=published&search=&page=` — public, paginated, SSR sitemap needs it too
- `GET /api/blog/posts/:slug` — public, increments `gaEvents`? no, just returns post + related (3 by TF-IDF/division)
- `POST /api/blog/posts` — superadmin, zod `slug ^[a-z0-9-]+$`, unique primaryKeyword check (cannibalization), auto `readingMinutes = words/200`
- `PATCH /api/blog/posts/:id`, `DELETE`, `POST /:id/publish`, `POST /:id/unpublish`
- `GET /api/blog/audit/:id` — runs SEO+AEO+readability scoring (same thresholds as auditor skill) → returns `{overall, seo, aeo, readability, critical[], important[], polish[], projected}`
- `GET /api/visibility/blog/stats` — reuse gaEvents filtered by `page LIKE /blog%`

**Public SSR:**
- `GET /blog` — index (filter by division chip, search, `featured` hero, pagination). SSR HTML with `dataLayer page_view: /blog`
- `GET /blog/:slug` — article page. SSR renders `tldr` blockquote, H2 capsules, FAQ `<section>` + `FAQPage` JSON-LD, table, `BreadcrumbList`, `BlogPosting` with `author Person @id` + `publisher Org @id`, `dateModified`, TOC sticky (anchors on H2), progress bar, related posts, CTA → Lead Form (`trackLeadFormSubmit`)
- `GET /sitemap.xml` Extended: now includes blogPublished `loc`s
- `GET /llms.txt` Minimal: `# Opus Overseas — ... ## Blog — - Post Title -> /blog/slug: excerpt`
- `robots.txt` already allows `GPTBot, PerplexityBot, ClaudeBot` — verify

**Superadmin Workspace:**
- New top-level `Blog Studio` tab (or inside Visibility Hub → `Blog` tab) — `BlogManager` component: table (slug, title, division, primaryKeyword, status, score badge, dateModified freshness dot), search, division filter, bulk publish, `+ New Post` modal.
- Editor: title (H1), slug auto-from-title (editable), tldr (pinned), metaTitle/metaDescription/ogImage, division + pillarSlug + primaryKeyword + secondaryKeywords chips, category, content blocks (TipTap/Markdown with table + FAQ block type that enforces 5 entries <50w + table insertion), author select, featured toggle, excerpt, schedule picker.
- Right rail: **Content Score** live (overall/SEO/AEO/readability) + `Fix all critical` button + Extractability Preview (4 capsules) + Internal Link Suggestions (2-3 related)
- Preview: `/blog/:slug?preview=1` with same SSR shell but `noindex`

**Tracking:**
- `visibilityTracking.ts` already fires `page_view` on `useVisibilityTracking('/blog/...')`; blog adds `blog_post_view` extra event for `gaEvents byPage`

---

## 5. Content Templates (for first articles)

Cluster for `/study-abroad` pillar (use keyword-research + content-cluster skills to generate more):
1. Pillar: `Complete Guide to Study Abroad from Telangana` (2500w) — `study abroad from telangana`
2. Cluster P1: `What is the MBBS Abroad Admission Process?` → What-Is explainer (800w) → AEO priority ★
3. Cluster P1: `Study Abroad Cost Comparison: MBBS vs MS` → comparison table → ★
4. Cluster P2: `How to Write an SOP for Germany in 5 Steps` → HowTo

First 3 blog seeds should be: MBBS Abroad guide (from `docs/study-abroad-mbbs.md`), Visa Document Checklist, Attestation Chain Explained — all already have tables + FAQs in docs.

---

## 6. Validation & QA
- Rich Results Test + schema.org validator on every publish
- `pnpm --filter @opusos/api typecheck` + `pnpm --filter @opusos/app build` must pass
- AI citation probe prompt after 2 weeks: ask ChatGPT/Perplexity "What is MBBS abroad process at Opus Overseas?" → cite contains our URL

---

*Decision: Implementation proceeds in 5 slices as per TODOs below. No TikTok.*
