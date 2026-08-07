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

  // Aadhaar eSign provider (Section 11 — CCA/IT-Act-2000 compliant ASP).
  // Provider-agnostic: any CCA-licensed ESP (surepass | protean | emudhra | veri5).
  // Pattern: hash-signed token request -> redirect user to provider -> provider
  // POSTs signed result to ESIGN_CALLBACK_URL -> we verify hash -> finalize.
  ESIGN_PROVIDER?: string;
  ESIGN_BASE_URL?: string;
  ESIGN_API_KEY?: string;
  ESIGN_SALT?: string;
  ESIGN_CALLBACK_URL?: string;

  // Turnstile
  TURNSTILE_SECRET_KEY?: string;

  // Environment
  ENVIRONMENT?: string;
}
