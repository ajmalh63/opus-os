# Opus OS — Cloudflare WAF Setup (One-Time, 3 min)

This repo now has `infra/terraform/cloudflare-waf.tf` (git-tracked). It does **nothing** until you give it a Cloudflare API token — then it pushes 3 WAF rules to `opusoverseas.com`.

## Step 1 — Create API Token (you do this)

**Link:** https://dash.cloudflare.com/profile/api-tokens

1. Click **Create Token** → **Create Custom Token**
2. Copy this exact permission set:

| Row | Resource | Permission | Access |
|-----|----------|------------|--------|
| 1 | Zone | Zone | Read |
| 2 | Zone | Zone Settings | Edit |
| 3 | Zone | Firewall Services | Edit |
| 4 | Zone | Cache Purge | Purge | *(optional)* |
| 5 | Account | Account Settings | Read | *(for zone listing)* |

3. **Zone Resources:** Include → Specific zone → `opusoverseas.com`
4. **TTL:** 30 days is fine (you can revoke after apply)
5. Click **Continue to summary → Create Token** → **Copy the token** (starts `...` — you see it only once)

> Do NOT use “Global API Key” — Custom Token is scoped and safer.

## Step 2 — Get Zone ID (you do this, 10 sec)

Dashboard → https://dash.cloudflare.com → click `opusoverseas.com` → Overview (right sidebar) → **Zone ID** (32 hex chars) → Copy.

## Step 3 — Paste here (you paste 2 values)

Reply in this chat with:

```
CLOUDFLARE_API_TOKEN=<paste token here>
CLOUDFLARE_ZONE_ID=<paste zone id here>
```

I will then (here in the workspace):
- Validate the token against Cloudflare API (`GET /client/v4/zones`)
- Push the 3 rules (`cloudflare.request()` — no need for you to run terraform locally)
- Confirm with `GET /zones/:id/firewall/rules` + screenshot of blocked `guest` probe
- Keep the token **only in workspace env** (never committed to git — `.gitignore` already covers `*.tfvars`)

## What Gets Pushed

From `infra/terraform/cloudflare-waf.tf`:

- **Rate Limit `auth` 10/60s Challenge** — `opusoverseas.com/api/auth/*`
- **Rate Limit `lookup` 10/3600s Ban** — `opusoverseas.com/api/public/portal/lookup*` (City-Forum enumeration)
- **WAF Custom Rule 1:** Block `file://`, `gopher://`, `169.254.169.254` in query/body (6 SSRF CVEs)
- **WAF Custom Rule 2:** Block `POST /api/session/reset_password + user-id` (Metabase CVE-2026-72898)
- **WAF Custom Rule 3:** Block `token=guest` / `token=client-self` (P1 IDOR defense-in-depth)
- **Zone Settings:** HSTS `max-age=31536000; includeSubDomains; preload` (edge-enforced, redundant with Worker header)

## After Apply — How to Hunt (no Athena needed)

Run these on D1 anytime (no S3 needed):

```bash
npx wrangler d1 execute opus-db --command "SELECT datetime(createdAt,'unixepoch'), afterState FROM audit WHERE action='ACCESS_DENIED' ORDER BY createdAt DESC LIMIT 20;"
npx wrangler d1 execute opus-db --command "SELECT identity, count(*) FROM rate_limit WHERE bucket='lookup' GROUP BY identity HAVING count>5;"
```

Or use the hunting pack in `infra/hunting-queries.sql`.

## If You Prefer Terraform Locally

```bash
cd infra/terraform
terraform init
terraform apply -var="zone_id=YOUR_ZONE_ID"
# when prompted, paste CLOUDFLARE_API_TOKEN as env: export CLOUDFLARE_API_TOKEN=...
```

Either path writes the same rules — pick one.
