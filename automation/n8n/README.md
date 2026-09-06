# n8n Spine — OpusOS Automation Workflows (Wave 2)

Import these into n8n (`http://127.0.0.1:5678`, wizard login first). They call the
scoped OS automation lane (`/api/automation/*`) — **not** the RBAC surfaces.

## Prerequisites (one-time)

1. **Complete n8n setup wizard** in browser (creates owner credentials).
2. **Create HTTP Header Auth credential** named `OpusOS Automation`:
   - Name: `X-Service-Token`
   - Value: the value of `AUTOMATION_TOKEN` (dev: `dev-automation-token-change-me`; prod: secret)
3. **Create Telegram credential** named `Ops Telegram` (Bot Token from @BotFather; user gives
   bot chat access, get chat id via `getUpdates`).
4. Set the OS base URL variable where used: `http://100.69.139.47:8787` (local dev worker on
   `--ip 0.0.0.0`).

## Workflows

| File | Trigger | Does |
|---|---|---|
| `01-lead-followup.json` | Schedule (every 5 min) | Checks `/api/automation/health` → if due nurture touches exist, pull `/nurture/due`, notify Telegram ops channel with count + oldest due. (Sending itself stays in OS; n8n is the canary.) |
| `02-nurture-due.json` | Schedule (every 15 min) | Polls `/api/automation/nurture/due?now=…`; for each due touch POST `/api/automation/nurture/:id/send` (idempotent) — hooks the real sender later (OpenWA/Listmonk). |
| `03-erp-sync-health.json` | Schedule (daily 09:00 IST) | GET `/api/automation/erp/sync-log` → if any `failed` rows: alert Telegram + POST `/api/automation/erp/sync/pending` retry; report pushed/failed counts. |
| `04-monthly-close.json` | Cron (1st of month 09:30 IST) | GET `/api/automation/erp/sync-log` → build summary of synced vs failed for the month → Telegram digest to owner. |
| `05-kuma-alerts.json` | Webhook `/opusos-kuma` | Receives Uptime Kuma notification JSON → normalizes → forwards critical alerts to Ops Telegram. |

## Rules (from TOOL-STRATEGIES §5.6)

- **Error handling on every workflow**: an `Error Trigger` sub-workflow notifies Telegram on
  any execution failure; set node-level "Retry On Fail" (1×, 2 s) on HTTP nodes.
- **Never write money math in n8n.** Only pass-through of OS-computed values.
- Keep `executionOrder: v1`, enable "Execution Data" pruning after 30 days.
- Activate workflows one at a time; first run in production mode is observed manually.

## Secrets hygiene

- All credentials are referenced (not embedded) in these JSONs: `OpusOS Automation` + `Ops Telegram`.
- `N8N_ENCRYPTION_KEY` must be set in the container env **before first workflow with creds**;
  keep it stable across restarts or all credentials are lost.
- Run `n8n audit` after import.