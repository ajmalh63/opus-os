import { Hono } from 'hono';
import { getAuth } from '../auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const authRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string } }>();

// Brute-force protection on OTP + password sign-in (Section 18.2.1).
authRouter.use('/sign-in/*', rateLimit({ bucket: 'login', windowSeconds: 300, limit: 8 }));
authRouter.use('/sign-up/*', rateLimit({ bucket: 'signup', windowSeconds: 300, limit: 8 }));
authRouter.use('/email-otp/*', rateLimit({ bucket: 'otp', windowSeconds: 300, limit: 5 }));
authRouter.use('/otp/*', rateLimit({ bucket: 'otp', windowSeconds: 300, limit: 5 }));

authRouter.all('/*', (c) => {
  const auth = getAuth(c.env);
  return auth.handler(c.req.raw);
});
