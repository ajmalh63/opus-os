# Production Deployment Guide — Opus OS on Cloudflare

Researched against current Cloudflare/Wrangler/Better-Auth/Cal.com docs (Aug 2026).
Follow in order. Estimated time: 30–45 min.

---

## Step 0 — Pre-flight (one-time)

```bash
wrangler login                       # browser auth to your CF account
wrangler whoami                      # confirm account
cd apps/api && npx wrangler deploy --dry-run   # config parses, dry-run OK
```

> `wrangler deploy --dry-run` validates `wrangler.toml` without publishing.

---

## Step 1 — Set the 12 secrets (wrangler secret bulk)

**Key fact from the docs:** `wrangler secret bulk` is atomic and non-interactive
(never loop `secret put` in scripts — it hangs). Use one JSON file.

```bash
cd apps/api
# Create secrets.json (KEEP IT OUT OF GIT — it's in .gitignore via .env.* pattern;
# better: write it, run, delete it, or keep it in a password manager)
nano secrets.json
```

```json
{
  "BETTER_AUTH_SECRET": "openssl rand -hex 32",
  "ADMIN_PASSWORD": "openssl rand -base64 18",
  "ADMIN_EMAIL": "owner@opusoverseas.com",
  "TURNSTILE_SECRET_KEY": "<real CF Turnstile secret — NOT the 1x mock>",
  "AUTOMATION_TOKEN": "openssl rand -hex 32",
  "OPENWA_API_KEY": "<VPS dashboard key>",
  "OPENWA_BASE_URL": "http://100.87.71.38:2785",
  "WA_WEBHOOK_SECRET": "openssl rand -hex 32",
  "N8N_WEBHOOK_URL": "https://n8n.yourdomain.com/webhook/opusos-events",
  "N8N_WEBHOOK_SECRET": "openssl rand -hex 32",
  "RAZORPAY_KEY_ID": "rzp_live_...",
  "RAZORPAY_KEY_SECRET": "<from Razorpay dashboard>",
  "ERPNEXT_API_KEY": "<api key>",
  "ERPNEXT_API_SECRET": "<api secret>",
  "BETTER_AUTH_URL": "https://app.opusoverseas.com"
}
```

Generate values: `openssl rand -hex 32` for each. Then:

```bash
# First deploy carries secrets inline (avoids the chicken-and-egg:
# secret bulk needs a deployed worker, deploy needs secrets)
npx wrangler deploy --env production --secrets-file secrets.json

# Later updates (no code change needed):
npx wrangler secret bulk --env production secrets.json

# Verify (names only — values are encrypted/write-only):
npx wrangler secret list --env production
```

**Do NOT put any of these in `wrangler.toml [vars]`** — vars are plaintext and
ship with the config.

---

## Step 2 — Production environment + no workers.dev

Already prepared in `wrangler.toml`:

```toml
[env.production]
workers_dev = false
  [env.production.vars]
  ENVIRONMENT = "production"   # → Secure cookies, Turnstile fail-closed, no OTP logging
```

`ENVIRONMENT=production` switches (all verified in code):
- `auth.ts` → session cookies `Secure: true`, origin check ENABLED
- `turnstile.ts` → missing secret = fail-closed 503 (never permissive)
- `auth.ts` logging → OTPs/reset URLs NOT logged

**After your domain is on Cloudflare**, uncomment the `routes` block in
`wrangler.toml` (apex + www + app subdomain), then:

```bash
npx wrangler deploy --env production
```

> ⚠️ **Both `opusoverseas.com` AND `www.opusoverseas.com` must route to the
> worker** — cal.com webhooks POST to the exact URL you registered
> (`https://opusoverseas.com/api/webhooks/cal` — apex). A www-only route means
> webhooks 404 silently.

Domain checklist:
1. Add `opusoverseas.com` to Cloudflare (DNS onboarding)
2. Uncomment routes in `wrangler.toml` → deploy
3. In Cloudflare dashboard: **Rules → URL Normalization** → enable
   "Normalize incoming URLs" (collapses `//path` → `/path` — mitigates the
   better-auth rou3 double-slash advisory as defense-in-depth)
4. Optionally: Workers → your worker → Settings → disable `workers.dev` route

---

## Step 3 — Better-auth origin check

Already production-ready in `src/auth.ts`:
- `disableOriginCheck: ENVIRONMENT !== 'production'` → **ON in prod** (CSRF +
  URL/redirect validation active)
- `trustedOrigins` includes `https://opusoverseas.com`, `https://www.opusoverseas.com`,
  `https://app.opusoverseas.com` + `BETTER_AUTH_URL` (set as a secret above)

**Post-deploy smoke test:**
1. Visit `https://app.opusoverseas.com` → login as owner → should work
2. Open DevTools → Application → Cookies → confirm `Secure; HttpOnly; SameSite=Lax`
3. Try `https://app.opusoverseas.com/login?callbackURL=https://evil.com`
   → should be **blocked** (origin check active)

---

## Step 4 — Cal.com availability (fixes the 0-slots issue)

The API key + event types are configured; **no availability schedule exists** —
that's why the booking modal shows "no slots". In cal.com (UI — 5 min):

1. **cal.com → Availability** (sidebar) → **New** → name it "Opus Working Hours"
   → defaults 9:00–17:00; set your real hours per day (enable/disable days,
   multiple slots, timezone **Asia/Kolkata**)
2. **cal.com → Event Types** → open each of the three
   (`study-abroad-consultation`, `visa-consultation`, `manpower-screening`)
   → **Availability** tab → select "Opus Working Hours" → Save
3. Optional hardening per event type (recommended):
   - **Requires confirmation** → bookings land as `pending` → you approve
   - **Buffer time** 5–10 min before/after
   - **Booking limits** → "Limit future bookings" e.g. 3/day
4. Verify with our API:
   ```bash
   curl -s "https://api.cal.com/v2/slots?eventTypeId=6684819&start=$(date -u -d '+1 day' +%Y-%m-%dT00:00:00Z)&end=$(date -u -d '+3 days' +%Y-%m-%dT00:00:00Z)&timeZone=Asia/Kolkata" \
     -H "Authorization: Bearer <cal_api_key>" -H "cal-api-version: 2024-09-04"
   ```
   → non-empty `slots` = done. (Or check the OS booking modal after restart.)

---

## Post-deploy verification checklist

- [ ] `wrangler secret list --env production` shows all 12 (names)
- [ ] `https://app.opusoverseas.com/api/health` → 200
- [ ] Login works + cookie is `Secure; HttpOnly`
- [ ] `/finance/infra` → External Integrations: Cal.com **live**, others per config
- [ ] cal.com test booking → appears in OS Consultations tab (webhook HMAC OK)
- [ ] Cal.com availability returns slots
- [ ] `https://opusoverseas.com/api/webhooks/cal` (apex) reaches the worker (not 404)
- [ ] Monthly cron `30 3 1 * *` shows in Workers → Cron Triggers
