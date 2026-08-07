import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "./db/schema.js";
import { getDb } from "./db/client.js";

export function getAuth(env: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string }) {
  const db = getDb(env.DB);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || "http://localhost:8787",
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications
      }
    }),
    user: {
      additionalFields: {
        role: { type: "string" },
        userDivisions: { type: "string" }
      }
    },
    emailAndPassword: {
      enabled: true
    }
  });
}
