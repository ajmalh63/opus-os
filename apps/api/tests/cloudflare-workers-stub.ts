// Vitest stub for `cloudflare:workers` — the Durable Object runtime is never
// exercised under vitest (DO traffic only flows through real workerd). This
// keeps the worker's top-level import graph loadable in node.
export class DurableObject {
  constructor(_ctx: any, _env: any) {}
}
