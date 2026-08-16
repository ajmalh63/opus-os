import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { leadsRouter } from './routes/leads.js';
import { clientsRouter } from './routes/clients.js';
import { kanbanRouter } from './routes/kanban.js';
import { authRouter } from './routes/auth.js';
import { rbacMiddleware } from './middleware/rbac.js';
import { logError } from './infra/runtimeLog.js';
import { serviceTokenMiddleware } from './middleware/serviceToken.js';
import { turnstileVerify } from './middleware/turnstile.js';
import { rateLimit, rateLimitGroup } from './middleware/rateLimit.js';
import { agreementsRouter } from './routes/agreements.js';
import { paymentsRouter } from './routes/payments.js';
import { transactionsRouter } from './routes/transactions.js';
import { umrahRouter } from './routes/umrah.js';
import { transitRouter } from './routes/transit.js';
import { manpowerRouter } from './routes/manpower.js';
import { portalRouter } from './routes/portal.js';
import { portalVisaRouter } from './routes/portalVisa.js';
import { portalManpowerRouter } from './routes/portalManpower.js';
import { portalUmrahRouter } from './routes/portalUmrah.js';
import { partnerRouter } from './routes/partner.js';
import { publicThriveRouter } from './routes/partnerThrive.js';
import { goRouter } from './routes/goRedirect.js';
import { seedPartnerTiers } from './services/partnerLoyalty.js';
import { tasksRouter } from './routes/tasks.js';
import { boardRouter } from './routes/board.js';
import { rbacRouter } from './routes/rbac.js';
import { razorpayRouter, razorpayWebhookRouter } from './routes/razorpay.js';
import { marketingRouter } from './routes/marketing.js';
import { nurtureRouter } from './routes/nurture.js';
import { campaignsRouter } from './routes/campaigns.js';
import { notificationsRouter } from './routes/notifications.js';
import { partnerAdminRouter } from './routes/partnerAdmin.js';
import { importRouter } from './routes/import.js';
import { automationRouter } from './routes/automation.js';
import { incentivesRouter, staffIncentivesRouter } from './routes/incentives.js';
import { staffAlertsRouter } from './routes/staffAlerts.js';
import { complianceRouter } from './routes/compliance.js';
import { complianceExtrasRouter } from './routes/complianceExtras.js';
import { infraRouter } from './routes/infra.js';
import { publicRouter } from './routes/public.js';
import { publicResumeRouter } from './routes/publicResume.js';
import { OpusEnv } from './types.js';
import { adminRouter } from './routes/admin.js';
import { waWebhookRouter, chatwootWebhookRouter } from './routes/messagingWebhooks.js';
import { listmonkWebhookRouter } from './routes/listmonkWebhooks.js';
import { inboxRouter } from './routes/inbox.js';
import { teamHubRouter } from './routes/teamHub.js';
import { erpnextRouter } from './routes/erpnext.js';
import { studyAbroadRouter } from './routes/studyAbroad.js';
import { studyAbroadAppsRouter, portalStudyAbroadRouter } from './routes/studyAbroadApps.js';
import { visaRouter } from './routes/visa.js';
import { attestationAppsRouter, portalAttestationRouter } from './routes/attestationApps.js';

const app = new Hono<{ Bindings: OpusEnv }>();

// Security headers (Hono secure-header middleware) — CSP, nosniff, referrer
// policy, HSTS. Damage-control layer, never a substitute for auth/RBAC.
app.use('*', secureHeaders());

// Global Error Handler — gold-standard shape:
//   - never leak stack traces to clients
//   - structured { error: { code, message } }
//   - full details only server-side
app.onError((err, c) => {
  const status = (err as any)?.status || 500;
  const code = status >= 400 && status < 600 ? 'HTTP_ERROR' : 'INTERNAL_ERROR';
  console.error(`[error] ${c.req.method} ${c.req.path} -> ${err?.name}: ${err?.message}`);
  logError(c.env, 'error.handler', `${c.req.method} ${c.req.path} -> ${err?.name}: ${err?.message}`, { status });
  return c.json(
    {
      error: {
        code,
        message: status >= 500 ? 'An unexpected error occurred' : (err?.message || 'Request failed'),
      },
    },
    status as any
  );
});

// JSON 404 handler — default Hono is plain text; gold standard is JSON.
app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }, 404));

// ===== PUBLIC (no session) =====
app.route('/api/auth', authRouter);

// Bot protection (plan §18.2.2 / §6.3): real Turnstile on every public write.
// Dev uses the mocked 1x secret (always-pass); prod uses wrangler secret.
app.use('/api/public/leads', turnstileVerify);
app.use('/api/public/partners', turnstileVerify);
app.use('/api/public/match', turnstileVerify);
app.use('/api/public/manpower', turnstileVerify);

app.route('/api/public/leads', leadsRouter);
// Client journey lookup /api/public/portal/lookup (Section 25) — public, token-based
app.route('/api/public/portal', portalRouter);
// Client-portal Visa services (Phase 1): products, applications, draft wizard, submit
app.route('/api/public/portal/visa', portalVisaRouter);
// Client-portal Manpower services (Phase 2): public jobs, apply, application tracker
app.route('/api/public/portal/manpower', portalManpowerRouter);
// Client-portal Umrah services (Phase 3): package inventory, calendar, ₹500 advance booking
app.use('/api/public/portal/umrah/departures/*/book', turnstileVerify);
app.route('/api/public/portal/umrah', portalUmrahRouter);
// Hero live artifacts (Section 24.1.1): jobs ticker, umrah departures, attestation chains, eligibility
app.route('/api/public', publicRouter);
// Public resume intake â†’ R2 vault (Manpower division, §14.6)
app.route('/api/public/manpower/resume', publicResumeRouter);
// Partner KYC registration + partnerId-scoped referrals/commissions (Section 39) — public signup form
app.route('/api/public/partners', partnerRouter);
// Zoho Thrive-style partner workspace (catalog, links, tiers, /go redirects)
app.route('/api/public/partners', publicThriveRouter);
app.route('/api/public', publicThriveRouter); // /api/public/catalog (public inventory browse)
// Public /go/:ref/:type/:id affiliate redirect (clean share URL, click-tracked)
app.route('/go', goRouter);
// Unified messaging webhooks (PENDING-CONFIGS #1) — WhatsApp + Chatwoot inbound
app.route('/api/webhooks/wa', waWebhookRouter);
app.route('/api/webhooks/chatwoot', chatwootWebhookRouter);
// Listmonk webhooks (Wave 3 email hygiene) — bounce/unsubscribe/subscribe
app.route('/api/webhooks/listmonk', listmonkWebhookRouter);
// Razorpay webhook (Section 44) - gateway POSTs here with HMAC; no session auth
app.route('/api/public/payments/razorpay/webhook', razorpayWebhookRouter);
// Cal.com webhook (consultation scheduling) - public, secret-verified
app.route('/api/webhooks', calWebhookRouter);

// ===== PROTECTED (session + RBAC) =====
app.use('/api/clients', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/clients/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));

app.use('/api/kanban', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/kanban/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
// Flow analytics — manager+/owner only (forecasting tooling).
app.use('/api/kanban/analytics', rbacMiddleware(['super_admin', 'manager'], true));

app.use('/api/agreements', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/agreements/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));

app.use('/api/payments', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/payments/*', rbacMiddleware(['super_admin', 'manager'], true, ['payments:enter']));

app.use('/api/umrah', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/umrah/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));

app.use('/api/transit', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/transit/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));

app.use('/api/manpower', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/manpower/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));

app.use('/api/tasks', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/tasks/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));

app.use('/api/marketing', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/marketing/*', rbacMiddleware(['super_admin', 'manager'], true, ['marketing:run']));

app.use('/api/incentives', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/incentives/*', rbacMiddleware(['super_admin', 'manager'], true, ['incentives:config']));

app.use('/api/compliance', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/compliance/*', rbacMiddleware(['super_admin', 'manager'], true, ['compliance:view']));

app.use('/api/infrastructure', rbacMiddleware(['super_admin'], true));
app.use('/api/infrastructure/*', rbacMiddleware(['super_admin'], true));
// Staff self-view of their own incentive accrual (Section 29.2#8 transparency)
app.use('/api/staff/incentives', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator', 'receptionist'], true));
app.use('/api/staff/incentives/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator', 'receptionist'], true));
app.use('/api/staff/alerts', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator', 'receptionist'], true));
app.use('/api/staff/alerts/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator', 'receptionist'], true));

app.use('/api/admin', rbacMiddleware(['super_admin'], true));
app.use('/api/admin/*', rbacMiddleware(['super_admin'], true));

// Unified staff inbox (OpenWA + Chatwoot surface) — all staff roles can answer
app.use('/api/inbox', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/inbox/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));

// Team Hub (§5.5) — staff chat rooms + R2 team file drive (all staff roles)
app.use('/api/teamhub', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/teamhub/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));

// ERPNext books integration — owner only (sensitive financial target)
app.use('/api/erpnext', rbacMiddleware(['super_admin'], true));
app.use('/api/erpnext/*', rbacMiddleware(['super_admin'], true));

// RBAC suite (Section 33) - owner-only role/permission management
app.use('/api/admin/rbac', rbacMiddleware(['super_admin'], true));

// Mount protected routers
app.route('/api/clients', clientsRouter);
app.route('/api/kanban', kanbanRouter);
app.route('/api/agreements', agreementsRouter);
app.route('/api/payments', paymentsRouter);
app.route('/api/payments/razorpay', razorpayRouter);
// Transactions module — unified billing surface for ALL internal accounts.
// Entries are drafts; confirming/voiding stays owner/manager (payments router).
app.use('/api/transactions', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/transactions/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true, ['billing:enter']));
app.route('/api/transactions', transactionsRouter);
app.route('/api/umrah', umrahRouter);
app.route('/api/transit', transitRouter);
app.route('/api/manpower', manpowerRouter);

app.use('/api/study-abroad', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/study-abroad/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.route('/api/study-abroad', studyAbroadRouter);
app.route('/api/study-abroad/applications', studyAbroadAppsRouter);
app.route('/api/public/portal/study-abroad', portalStudyAbroadRouter);

app.use('/api/visa', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/visa/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.route('/api/visa', visaRouter);

app.use('/api/attestation', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/attestation/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.route('/api/attestation', attestationAppsRouter);
app.route('/api/public/portal/attestation', portalAttestationRouter);

app.route('/api/tasks', tasksRouter);
app.route('/api/tasks', boardRouter);
app.route('/api/marketing', marketingRouter);
app.route('/api/marketing/nurture', nurtureRouter);
app.route('/api/incentives', incentivesRouter);
app.route('/api/staff/incentives', staffIncentivesRouter);
app.route('/api/staff/alerts', staffAlertsRouter);
app.route('/api/compliance', complianceRouter);
app.route('/api/compliance', complianceExtrasRouter);
app.route('/api/infrastructure', infraRouter);
app.route('/api/admin', adminRouter);
app.route('/api/admin/rbac', rbacRouter);
// Campaign catalog — SUPER_ADMIN ONLY. Picks up the /api/admin owner ceiling.
app.route('/api/admin/campaigns', campaignsRouter);
// Notification delivery log — owner ceiling (same mount family).
app.route('/api/admin/notifications', notificationsRouter);
// Partner management (approve/block) — owner ceiling.
app.route('/api/admin/partners', partnerAdminRouter);
// Business data import (CSV) — owner ceiling.
app.route('/api/admin/import', importRouter);
app.route('/api/inbox', inboxRouter);
// Team Hub chat + file drive
app.route('/api/teamhub', teamHubRouter);
app.route('/api/erpnext', erpnextRouter);

// Automation lane (n8n spine, Wave 2) — scoped, fail-closed service token.
// Deliberately NOT under RBAC: it is a machine lane with its own auth.
app.use('/api/automation', serviceTokenMiddleware);
app.use('/api/automation/*', serviceTokenMiddleware);
app.route('/api/automation', automationRouter);

// Health check endpoint (also self-heals the partner VIP tier ladder — idempotent)
app.get('/api/health', async (c) => {
  try { await seedPartnerTiers(c.env); } catch { /* non-fatal */ }
  return c.json({ status: 'healthy', timestamp: Date.now() });
});

export default app;
export type AppType = typeof app;
// Durable Object for Team Hub chat rooms (A5.5) — must be exported for wrangler
// to route DO traffic to the class.
export { TeamHubRoom } from './routes/teamHub.js';

// Wave 1 — Uptime Kuma push heartbeat producer (cron trigger, see wrangler.toml).
// Attached to the Hono app so the default export keeps `app.request` working for
// tests while wrangler sees both fetch and scheduled on the same object.
import { runHeartbeat } from './cron/heartbeat.js';
import { performanceRouter } from './routes/performance.js';
import { analyticsRouter } from './routes/analytics.js';
import { visibilityRouter, publicSeoRouter } from './routes/visibility.js';
import { calRouter, calWebhookRouter, calPublicRouter } from './routes/cal.js';
import { indiaPostRouter } from './routes/indiaPost.js';
import { integrationsRouter } from './routes/integrations.js';

// Staff performance & team operations scorecard (manager+; balanced metric set)
app.use('/api/performance', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/performance/*', rbacMiddleware(['super_admin', 'manager'], true));
app.route('/api/performance', performanceRouter);
app.use('/api/analytics', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/analytics/*', rbacMiddleware(['super_admin', 'manager'], true));
app.route('/api/analytics', analyticsRouter);

// Rate-limited public endpoints (anti-abuse): UTM capture + GA events
app.use('/api/visibility/utm', rateLimit({ bucket: 'utm-capture', windowSeconds: 3600, limit: 60 }));
app.use('/api/visibility/ga4/events', rateLimit({ bucket: 'ga-events', windowSeconds: 3600, limit: 120 }));
// Cal.com webhook — rate-limited (anti-flood) + HMAC-verified
app.use('/api/webhooks/cal', rateLimit({ bucket: 'cal-webhook', windowSeconds: 3600, limit: 120 }));

// Public SEO endpoints (no auth): sitemap.xml + robots.txt + public meta
// MUST be mounted before the visibility RBAC middleware so /api/visibility/public/meta stays open.
app.route('/', publicSeoRouter);

// Visibility Hub (manager+): SEO / AEO-GEO / GA4 / GBP / Search Console / Reviews / Attribution / Reports
app.use('/api/visibility', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/visibility/*', rbacMiddleware(['super_admin', 'manager'], true));
app.route('/api/visibility', visibilityRouter);

// Cal.com public booking links (no auth) — MUST precede the RBAC mount
app.route('/api/cal/public', calPublicRouter);

// India Post shipping (staff — attestation document dispatch)
app.use('/api/india-post', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/india-post/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.route('/api/india-post', indiaPostRouter);

// Cal.com bookings (staff, division-scoped) + config (manager+)
app.use('/api/cal', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/cal/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.route('/api/cal', calRouter);

// Tool-First adapters (manager+): unified status + live feed for Listmonk /
// Mautic / Chatwoot / OpenWA — the OS campaigns dashboard is INFORMATIONAL.
app.use('/api/integrations', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/integrations/*', rbacMiddleware(['super_admin', 'manager'], true));
app.route('/api/integrations', integrationsRouter);

(app as any).scheduled = async (_controller: unknown, env: HeartbeatEnvLike, _ctx: unknown) => {
  try {
    await runHeartbeat(env);
  } catch {
    /* fail-open: heartbeat must never crash the scheduled run */
  }
};
type HeartbeatEnvLike = Parameters<typeof runHeartbeat>[0];

