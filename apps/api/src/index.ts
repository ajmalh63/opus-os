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
import { adminRouter } from './routes/admin.js';

const app = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string } }>();

// Global Error Handler
app.onError((err, c) => {
  return c.json({
    error: err.message || "Internal Server Error",
    details: err.stack
  }, 500);
});

// Mount Public & Auth Routes
app.route('/api/auth', authRouter);
app.route('/api/public/leads', leadsRouter);

// Enforce RBAC Middleware on Protected Routes
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

app.use('/api/partners', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));
app.use('/api/partners/*', rbacMiddleware(['super_admin', 'manager', 'counselor', 'coordinator'], true));

app.use('/api/admin', rbacMiddleware(['super_admin'], true));
app.use('/api/admin/*', rbacMiddleware(['super_admin'], true));

// Mount Protected Routers
app.route('/api/clients', clientsRouter);
app.route('/api/kanban', kanbanRouter);
app.route('/api/agreements', agreementsRouter);
app.route('/api/payments', paymentsRouter);
app.route('/api/umrah', umrahRouter);
app.route('/api/transit', transitRouter);
app.route('/api/manpower', manpowerRouter);
app.route('/api/admin', adminRouter);
app.route('/api', portalRouter);

// Health check endpoint
app.get('/api/health', (c) => c.json({ status: 'healthy', timestamp: Date.now() }));

export default app;
export type AppType = typeof app;
