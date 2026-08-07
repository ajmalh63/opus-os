import { Hono } from 'hono';
import { getAuth } from '../auth.js';

export const authRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string } }>();

authRouter.all('/*', (c) => {
  const auth = getAuth(c.env);
  return auth.handler(c.req.raw);
});
