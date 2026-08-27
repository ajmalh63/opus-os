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

  // Sync Fabric v2 — Durable Objects (SyncHub) + TeamHub
  SYNC_HUB?: DurableObjectNamespace;
  TEAM_HUB?: DurableObjectNamespace;

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
  OPENWA_API_KEY?: string;
  OPENWA_SESSION_ID?: string;
  META_WHATSAPP_PHONE_ID?: string;
  META_WHATSAPP_TOKEN?: string;
  WA_WEBHOOK_SECRET?: string;

  // ERPNext back-office integration (Frappe REST)
  ERPNEXT_BASE_URL?: string;
  ERPNEXT_API_KEY?: string;
  ERPNEXT_API_SECRET?: string;

  // Multi-Source Review Aggregator (Google Places & Trustpilot)
  GOOGLE_PLACES_API_KEY?: string;
  GOOGLE_PLACE_ID?: string;
  TRUSTPILOT_API_KEY?: string;
  TRUSTPILOT_BUSINESS_UNIT_ID?: string;
}
