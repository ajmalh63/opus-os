// Cloudflare infrastructure bindings used across OpusOS (Sections 3, 4, 18).
// Keep in sync with apps/api/wrangler.toml.
// NOTE: VectorizeIndex binding type only exists in @cloudflare/workers-types >= 4.20250509.
// If the package is older, cast via `as any` at the binding site (see infra/vector.ts).

export interface OpusEnv {
  // D1 - relational database (all business data). Primary system of record.
  DB: D1Database;

  // Better Auth
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;

  // R2 - document vault + backups
  BUCKET: R2Bucket;

  // KV - cache + feature flags ONLY (Section 18.4.2). Sessions are in D1.
  KV: KVNamespace;

  // Vectorize - vector database (semantic search, AI matching). Section 3.4.
  VECTOR_INDEX: any;

  // Queues - async jobs (email, PDF, AI) to respect the 10ms CPU budget.
  JOBS_QUEUE: any;

  // Razorpay gateway (Section 44)
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  // Razorpay webhook uses its OWN dashboard secret (never the API key secret).
  // Required for the public webhook to operate; fails closed (503) when unset.
  RAZORPAY_WEBHOOK_SECRET?: string;

  // Turnstile
  TURNSTILE_SECRET_KEY?: string;

  // Unified messaging (PENDING-CONFIGS #1/#2): WhatsApp + inbox webhooks.
  // WA_PROVIDER: 'openwa' (VPS Baileys sidecar) | 'meta' (Meta Cloud API — no VPS).
  WA_PROVIDER?: string;
  OPENWA_BASE_URL?: string;
  OPENWA_SESSION_TOKEN?: string;
  META_WHATSAPP_PHONE_ID?: string;
  META_WHATSAPP_TOKEN?: string;
  WA_WEBHOOK_SECRET?: string;

  // Environment
  ENVIRONMENT?: string;

  // Resume parser mode (B-3). 'mock' = explicitly labeled demo data only;
  // 'real' = Workers AI parsing (must be implemented; fails loud 501 if not).
  MANPOWER_AI?: 'mock' | 'real';
}
