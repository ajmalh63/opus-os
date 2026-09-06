# Sync Apps Verification — 2026-08-22

All 15 Docker apps now on https://*.opusoverseas.com, zero local IPs in runtime.

## Domains vs Tunnel
- n8n: https://n8n.opusoverseas.com → localhost:5678 ✓
- erp: https://erp.opusoverseas.com → localhost:8080 ✓
- erpnext: https://erpnext.opusoverseas.com → localhost:8080 (alias) ✓
- chat: https://chat.opusoverseas.com → localhost:3200 ✓
- crm: https://crm.opusoverseas.com → localhost:3001 (new) ✓
- status: https://status.opusoverseas.com → localhost:3003 ✓
- analytics: https://analytics.opusoverseas.com → localhost:3002 ✓
- nocodb: https://nocodb.opusoverseas.com → localhost:3004 (new) ✓
- social/postiz: https://social.opusoverseas.com / https://postiz.opusoverseas.com → localhost:3000 (new) ✓
- listmonk: https://listmonk.opusoverseas.com → localhost:9009 ✓
- mautic: https://mautic.opusoverseas.com → localhost:8085 ✓
- openreply: https://openreply.opusoverseas.com → localhost:3005 (new) ✓
- wa: https://wa.opusoverseas.com → localhost:2785 ✓
- india-post: https://india-post.opusoverseas.com → localhost:9888 (new) ✓

## Wrangler .dev.vars
All BASE_URLs now domain, no <internal-ip> for external apps. Verified via grep.
TSC: 0 errors (filtered), Tests: 647/647

## BetterAuth
No separate domain needed. Keep BETTER_AUTH_URL=https://app.opusoverseas.com (frontend). Auth cookies sameSite:lax secure. If you want dedicated, create https://auth.opusoverseas.com → add to tunnel localhost:8787 and set wrangler secret BETTER_AUTH_URL + trustedOrigins.
