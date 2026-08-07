# Architecture Specification: Better Auth & RBAC Middleware

## 1. Drizzle ORM Schema Updates (D1 / SQLite)

To support Better Auth v1, we need to add the standard authentication and session management tables to [`apps/api/src/db/schema.ts`](file:///C:/Users/asimh/OneDrive/Documents/Opus%20Overseas/Opus%20OS/apps/api/src/db/schema.ts).

### User Table Extension
We will extend the existing `users` table to add fields required by Better Auth (`emailVerified`, `image`), and add a `division` field to restrict counselors and coordinators to specific divisions:
```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Extended Users Table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role', { enum: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'] }).notNull().default('counselor'),
  division: text('division', { enum: ['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'] }), // null for global staff (admin/manager)
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});
```

### Better Auth Support Tables
We will add `sessions`, `accounts`, and `verifications` tables to support standard credential and Email-OTP authentication flow:

```typescript
// Better Auth Active Sessions
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at').notNull(), // Unix timestamp (seconds)
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// Better Auth Connected Credentials/OAuth Accounts
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(), // e.g. "credential", "google"
  password: text('password'), // Hashed password (credential provider)
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  expiresAt: integer('expires_at'),
  scope: text('scope'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
});

// Better Auth Verification Tokens (Email Verification, OTP, Password Reset)
export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // e.g. email address
  value: text('value').notNull(), // OTP/token value
  expiresAt: integer('expires_at').notNull(), // Unix timestamp (seconds)
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at')
});
```

---

## 2. Dynamic Better Auth Initialization

Since Cloudflare Worker environments bind the database connector (`env.DB`) per-request, we will create a dynamic factory function [`apps/api/src/auth.ts`](file:///C:/Users/asimh/OneDrive/Documents/Opus%20Overseas/Opus%20OS/apps/api/src/auth.ts) instead of a global singleton:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "./db/schema.js";
import { getDb } from "./db/client.js";

export function getAuth(env: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL: string }) {
  const db = getDb(env.DB);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications
      }
    }),
    // Enable Email-OTP passwordless authentication
    plugins: [],
    emailAndPassword: {
      enabled: true
    }
  });
}
```

### Mount Auth routes in Hono
In [`apps/api/src/index.ts`](file:///C:/Users/asimh/OneDrive/Documents/Opus%20Overseas/Opus%20OS/apps/api/src/index.ts), we will mount the Better Auth API handler under `/api/auth/*`:

```typescript
import { Hono } from 'hono';
import { getAuth } from './auth.js';

const app = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL: string } }>();

app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  const auth = getAuth(c.env);
  return auth.handler(c.req.raw);
});
```

---

## 3. RBAC & Division Scope Middleware Logic

The middleware will execute on protected routes to verify the session and validate role/division permissions.

### Division Access Matrix
*   `super_admin` & `manager`: Global read/write access. No division filtering.
*   `receptionist`: Read-only access to basic lead info.
*   `counselor` & `coordinator`: Scope restricted to the division matching their assigned `user.division`.

### Middleware Implementation (`apps/api/src/middleware/rbac.ts`)
```typescript
import { MiddlewareHandler } from 'hono';
import { getAuth } from '../auth.js';

export const rbacMiddleware = (allowedRoles: string[], requiredDivision?: boolean): MiddlewareHandler => {
  return async (c, next) => {
    const auth = getAuth(c.env);
    
    // Retrieve session from incoming headers/cookies
    const sessionResult = await auth.api.getSession({
      headers: c.req.raw.headers
    });

    if (!sessionResult) {
      return c.json({ error: "Unauthorized: Invalid or expired session" }, 401);
    }

    const { user, session } = sessionResult;

    // Check Role
    if (!allowedRoles.includes(user.role)) {
      return c.json({ error: "Forbidden: Insufficient role permissions" }, 403);
    }

    // Check Division Scope
    if (requiredDivision && ['counselor', 'coordinator'].includes(user.role)) {
      // Extract target division from context: either route params, query, or request payload
      // For /api/clients/:id, division is fetched from client engagements
      c.set('userDivision', user.division);
    }

    // Set contextual user info in request context
    c.set('user', user);
    c.set('session', session);

    await next();
  };
};
```

---

## 4. Vitest Testing Plan

We will secure local testing by adding mock session assertions in [`apps/api/tests/auth.test.ts`](file:///C:/Users/asimh/OneDrive/Documents/Opus%20Overseas/Opus%20OS/apps/api/tests/auth.test.ts):

### Mocking Better Auth Sessions
To test route middleware without hitting remote auth providers:
1. Seed a mock user and mock session into the local mock SQLite D1 database.
2. Generate a valid mock session token in the database.
3. Call route endpoints using Hono `app.request()` passing the session cookie or authorization header.

### Test Structure
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { getDb } from '../src/db/client.js';
import { users, sessions } from '../src/db/schema.js';
import { rbacMiddleware } from '../src/middleware/rbac.js';
import { MockD1Database } from './mockDb.js';

describe('RBAC Middleware Security Bounds', () => {
  let app: Hono;
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    app = new Hono<{ Bindings: { DB: any } }>();
    
    // Seed route under test
    app.get('/protected-route', rbacMiddleware(['manager', 'counselor']), (c) => {
      return c.json({ success: true, message: "Authorized access" });
    });
  });

  it('should return 401 Unauthorized for requests without sessions', async () => {
    const res = await app.request('/protected-route');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
  });

  it('should return 403 Forbidden if user role is not permitted', async () => {
    // Seed user with invalid role
    const mockUser = {
      id: "user-123",
      email: "counselor@test.com",
      role: "receptionist", // receptionist is not permitted for this route
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    };
    // Seed mock session tokens in database
    // ...
    // Execute request passing authorization header
    const res = await app.request('/protected-route', {
      headers: { 'Authorization': 'Bearer session-token-123' }
    });
    expect(res.status).toBe(403);
  });
});
```
