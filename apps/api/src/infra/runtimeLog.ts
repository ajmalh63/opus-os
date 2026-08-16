import { getDb } from '../db/client.js';
import { runtimeLogs } from '../db/schema.js';

// In-OS runtime log capture (D1). FAIL-OPEN: logging must never break the
// business call. Mirrors console output into runtime_logs so the OS can show
// searchable runtime logs (Security Logs → Runtime). Production also ships
// console output to Cloudflare Workers Logs (dashboard / wrangler tail).

export async function logRuntime(
  env: { DB: D1Database } | undefined,
  level: 'info' | 'warn' | 'error',
  source: string,
  message: string,
  detail?: unknown
) {
  if (!env?.DB) return;
  try {
    const db = getDb(env.DB);
    await db.insert(runtimeLogs).values({
      id: crypto.randomUUID(),
      level,
      source,
      message: String(message).slice(0, 500),
      detail: detail !== undefined ? JSON.stringify(detail).slice(0, 2000) : null,
      createdAt: Math.floor(Date.now() / 1000),
    });
  } catch {
    /* fail-open: never break the caller */
  }
}

// Convenience wrappers
export const logInfo = (env: any, source: string, message: string, detail?: unknown) => logRuntime(env, 'info', source, message, detail);
export const logWarn = (env: any, source: string, message: string, detail?: unknown) => logRuntime(env, 'warn', source, message, detail);
export const logError = (env: any, source: string, message: string, detail?: unknown) => logRuntime(env, 'error', source, message, detail);