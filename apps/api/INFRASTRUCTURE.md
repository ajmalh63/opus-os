# Backend Infrastructure (Cloudflare) — OpusOS

This is the single source of truth for the Cloudflare backend services OpusOS uses.
Everything below mirrors **wrangler.toml**, **src/types.ts**, and the **plan Section 3/4**.

## Decision matrix (verified against 2026 free-tier limits)

| Service | Binding | Role | Plan | Free tier |
|---|---|---|---|---|
| **D1 (SQLite)** | `DB` | relational database — all business data (CRM, payments, agreements, tasks, consents, compliance) | §3.4 | 5 GB · 5M rows read/day · 100k writes/day |
| **R2** | `BUCKET` | document vault, signed PDFs, backups | §3.4 | 10 GB · zero egress |
| **KV** | `KV` | cache + feature flags **only** (sessions live in D1 — KV = 1k writes/day) | §18.4.2 | 1 GB · 100k reads/day |
| **Vectorize** | `VECTOR_INDEX` | **vector database** — semantic search + AI matching (university shortlist, resume matching, FAQ) | §3.4 / §3.9.2 | 30M queried dims/mo · 5M stored dims |
| **Queues** | `JOBS_QUEUE` | async email/PDF/AI (respects 10ms CPU) | §3.3 | 10k ops/day |
| **Workers AI** | `AI` | embeddings (`bge-base-en-v1.5`, 768-d) + text models | §3.4 | 10k neurons/day |
| **Real-time (chat/board)** | Durable Objects | Team Hub, Kanban live updates | §15/§16 | 100k req/day |

## Why Redis is NOT a Worker binding

The plan (§3.4/§3.10) deliberately puts **Redis on the Oracle VPC layer** (beside OpenWA /
Listmonk), not inside the Cloudflare Worker:

- Sessions are stored in **D1** (server-side revocable, auditable) — not KV, not Redis — because
  KV free tier allows only 1,000 writes/day.
- If a self-hosted cache is ever needed server-side, the recommended path is a **KV-backed TTL
  cache** (via `infra/kv.ts`) — no external process, still free tier.
- Real Redis would only exist on your VPC for OpenWA/Cal.diy, per Section 3.10.2.

## Creating the Vectorize index (one-time, before deploy)

```bash
# 768 dim = Workers AI @cf/baai/bge-base-en-v1.5
wrangler vectorize create opusos-embeddings --dimensions 768 --metric cosine

# then put the returned index_id into wrangler.json [[vectorize]] index_id
```

## Service usage in code

- `src/infra/vector.ts` — `embedText`, `upsertVector`, `queryVectors`, `semanticSearch`, `vectorHealth`
- `src/infra/kv.ts` — `kvGetJson`, `kvSetJson`, `flagEnabled`, `setFlag`
- `src/routes/infra.ts` — `GET /api/infrastructure/health` (owner-only) live status of every backend service

## Monitoring

- `GET /api/infrastructure/health` returns up/down per service — call it from Uptime Kuma on the VPC
  and from the `70% free-tier guardrail` cron (Section 18.3.2) to alert before any limit is hit.