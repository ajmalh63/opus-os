-- Opus OS — Hunting Queries (L5/L6/L7) — D1 + Cloudflare/Athena variants
-- Run D1 variant via: npx wrangler d1 execute opus-db --command "SELECT ..."
-- Run Athena variant against S3 bucket where WAF Logpush lands (parquet)

-- ═══════════════════════════════════════════════════════════════════
-- 1) L5 — City-Forum / Guest IDOR Probe (guest → 404)
-- D1 audit table (already live via auditDenied)
-- ═══════════════════════════════════════════════════════════════════

-- D1: Any guest/client-self probe in last 7 days (should be blocked at WAF now)
SELECT datetime(createdAt, 'unixepoch') as ts, actorType, entityName, afterState
FROM audit
WHERE action = 'ACCESS_DENIED'
  AND afterState LIKE '%guest%'
ORDER BY createdAt DESC LIMIT 20;

-- D1: Top blocked identities (potential enumeration)
SELECT identity, count(*) as hits
FROM rate_limit
WHERE bucket = 'lookup'
GROUP BY identity HAVING hits > 5
ORDER BY hits DESC LIMIT 20;

-- Cloudflare/Athena (WAF logs parquet, if shipped to S3):
-- SELECT RayID, ClientIP, ClientRequestURI, RuleId, Action
-- FROM cloudflare_waf_logs
-- WHERE Action = 'block' AND RuleId = 'guest-idor' -- our Rule 3
--   AND timestamp > now() - interval '7' day
-- ORDER BY timestamp DESC LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════
-- 2) L5 — PortalToken Query-String Fallback Rate (should trend → 0)
-- We audit query-fallback usage inside getPortalToken comment; this hunts via rate_limit.
-- ═══════════════════════════════════════════════════════════════════
SELECT datetime(createdAt, 'unixepoch') as ts, clientId, fileName
FROM documents
WHERE uploadedBy = 'client'
ORDER BY uploadedAt DESC LIMIT 5;

-- D1: Hunt repeated portal lookups from same IP with different tokens (enumeration)
SELECT identity, count(DISTINCT key) as unique_tokens
FROM rate_limit
WHERE bucket IN ('lookup', 'portal-lookup')
GROUP BY identity HAVING unique_tokens > 3
ORDER BY unique_tokens DESC;

-- Athena:
-- SELECT ClientIP, count(DISTINCT parse_qs(ClientRequestURI)['token']) as tokens, count(*) as reqs
-- FROM cloudflare_waf_logs
-- WHERE ClientRequestURI LIKE '%/api/public/portal/lookup%'
-- GROUP BY ClientIP HAVING tokens > 5;

-- ═══════════════════════════════════════════════════════════════════
-- 3) L7 — SSRF Probe (file:// / 169.254.169.254 / gopher://)
-- D1 has no SSRF (no fetch(userUrl)), but audit catches blocked uploads;
-- Real hunt is WAF block log.
-- ═══════════════════════════════════════════════════════════════════
SELECT datetime(createdAt, 'unixepoch') as ts, action, entityId, afterState
FROM audit
WHERE afterState LIKE '%169.254.169.254%' OR afterState LIKE '%file://%' OR afterState LIKE '%gopher://%'
ORDER BY createdAt DESC LIMIT 20;

-- Athena:
-- SELECT timestamp, ClientIP, ClientRequestURI, ClientRequestBody, Action, RuleId
-- FROM cloudflare_waf_logs
-- WHERE Action='block' AND RuleId LIKE '%ssrf%'
-- ORDER BY timestamp DESC LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════
-- 4) L7 — Metabase probe (defense-in-depth even though we don't run Metabase)
-- ═══════════════════════════════════════════════════════════════════
-- Athena:
-- SELECT timestamp, ClientIP, ClientRequestURI, HttpMethod, UserAgent
-- FROM cloudflare_waf_logs
-- WHERE ClientRequestURI LIKE '%/api/session/reset_password%'
-- ORDER BY timestamp DESC;

-- ═══════════════════════════════════════════════════════════════════
-- 5) L5 — Session Hijack / Token Replay (impossible travel)
-- Requires joining audit session table: look for same user with 2 IPs far apart < 10m
-- ═══════════════════════════════════════════════════════════════════
SELECT userId, datetime(createdAt, 'unixepoch') as ts, afterState
FROM audit
WHERE action = 'ACCESS_DENIED'
  AND category = 'access'
ORDER BY createdAt DESC LIMIT 50;

-- Athena (if you ship CF Access logs):
-- SELECT ClientIP, UserAgent, count(*) FROM cloudflare_waf_logs
-- WHERE Action='challenge' AND timestamp > now() - interval '1' day
-- GROUP BY ClientIP, UserAgent HAVING count(*) > 50;
