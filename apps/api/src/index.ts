import { Hono } from 'hono';
import { leadsRouter } from './routes/leads.js';
import { clientsRouter } from './routes/clients.js';
import { kanbanRouter } from './routes/kanban.js';
import { authRouter } from './routes/auth.js';
import { rbacMiddleware } from './middleware/rbac.js';
import { agreementsRouter } from './routes/agreements.js';
import { paymentsRouter } from './routes/payments.js';
import { umrahRouter } from './routes/umrah.js';
import { transitRouter } from './routes/transit.js';
import { manpowerRouter } from './routes/manpower.js';
import { portalRouter } from './routes/portal.js';
import { partnerRouter } from './routes/partner.js';
import { tasksRouter } from './routes/tasks.js';
import { rbacRouter } from './routes/rbac.js';
import { razorpayRouter, razorpayWebhookRouter } from './routes/razorpay.js';
import { marketingRouter } from './routes/marketing.js';
import { nurtureRouter } from './routes/nurture.js';
import { incentivesRouter, staffIncentivesRouter } from './routes/incentives.js';
import { complianceRouter } from './routes/compliance.js';
import { infraRouter } from './routes/infra.js';
import { OpusEnv } from './types.js';
import { adminRouter } from './routes/admin.js';

const app = new Hono<{ Bindings: OpusEnv }>();

// Global Error Handler
app.onError((err, c) => {
  return c.json({
    error: err.message || "Internal Server Error",
    details: err.stack
  }, 500);
});

// ===== PUBLIC (no session) =====
app.route('/api/auth', authRouter);
app.route('/api/public/leads', leadsRouter);
// Client journey lookup /api/public/portal/lookup (Section 25) — public, token-based
app.route('/api/public/portal', portalRouter);
// Partner KYC registration + partnerId-scoped referrals/commissions (Section 39) — public signup form
app.route('/api/public/partners', partnerRouter);
// Razorpay webhook (Section 44) - gateway POSTs here with HMAC; no session auth
app.route('/api/public/payments/razorpay/webhook', razorpayWebhookRouter);

// ===== PROTECTED (session + RBAC) =====
app.use('/api/clients', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/clients/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));

app.use('/api/kanban', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/kanban/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));

app.use('/api/agreements', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/agreements/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));

app.use('/api/payments', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/payments/*', rbacMiddleware(['super_admin', 'manager'], true));

app.use('/api/umrah', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/umrah/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));

app.use('/api/transit', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/transit/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));

app.use('/api/manpower', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/manpower/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));

app.use('/api/tasks', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));
app.use('/api/tasks/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], true));

app.use('/api/marketing', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/marketing/*', rbacMiddleware(['super_admin', 'manager'], true));

app.use('/api/incentives', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/incentives/*', rbacMiddleware(['super_admin', 'manager'], true));

app.use('/api/compliance', rbacMiddleware(['super_admin', 'manager'], true));
app.use('/api/compliance/*', rbacMiddleware(['super_admin', 'manager'], true));

app.use('/api/infrastructure', rbacMiddleware(['super_admin'], true));
app.use('/api/infrastructure/*', rbacMiddleware(['super_admin'], true));
// Staff self-view of their own incentive accrual (Section 29.2#8 transparency)
app.use('/api/staff/incentives', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator', 'receptionist'], true));
app.use('/api/staff/incentives/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator', 'receptionist'], true));

app.use('/api/admin', rbacMiddleware(['super_admin'], true));
app.use('/api/admin/*', rbacMiddleware(['super_admin'], true));

// RBAC suite (Section 33) - owner-only role/permission management
app.use('/api/admin/rbac', rbacMiddleware(['super_admin'], true));

// Mount protected routers
app.route('/api/clients', clientsRouter);
app.route('/api/kanban', kanbanRouter);
app.route('/api/agreements', agreementsRouter);
app.route('/api/payments', paymentsRouter);
app.route('/api/payments/razorpay', razorpayRouter);
app.route('/api/umrah', umrahRouter);
app.route('/api/transit', transitRouter);
app.route('/api/manpower', manpowerRouter);
app.route('/api/tasks', tasksRouter);
app.route('/api/marketing', marketingRouter);
app.route('/api/marketing/nurture', nurtureRouter);
app.route('/api/incentives', incentivesRouter);
app.route('/api/staff/incentives', staffIncentivesRouter);
app.route('/api/compliance', complianceRouter);
app.route('/api/infrastructure', infraRouter);
app.route('/api/admin', adminRouter);
app.route('/api/admin/rbac', rbacRouter);

// Health check endpoint
app.get('/api/health', (c) => c.json({ status: 'healthy', timestamp: Date.now() }));

export default app;
export type AppType = typeof app;