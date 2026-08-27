# VPS Docker Fleet Logins & Credentials Directory

**Server Host:** Oracle Cloud A1.Flex (`129.159.238.227`)  
**SSH Command:** `ssh -i ~/.ssh/cordial_claw.pem ubuntu@129.159.238.227`  
**Tunnel Network:** Cloudflare Named Tunnel (`6f1a97cc-8e9b-4340-a435`) → `https://*.opusoverseas.com`

---

## 1. External Docker Applications Login Matrix

| # | Application | Domain / Port | Username / Email | Password / API Token | Purpose & Notes |
|---|---|---|---|---|---|
| **1** | **Chatwoot** | `https://chat.opusoverseas.com`<br>`(Port 3200)` | **Superadmin:** `ops@opusoverseas.com`<br>**Agent:** `agent@opusoverseas.com` | `ChatwootOps2026!`<br>`AgentPass2026!`<br>*Account Token:* `Dgx11Tq7HXFoHFwcCk2ShZ2T`<br>*Platform Token:* `CWF9xBB6o6M2X1BKyWKRZZHX`<br>*Website Token:* `f36574fb918873fbba2749b6a2f18ac6` | Customer live-chat, omnichannel messaging, and Help Center articles. |
| **2** | **Mautic** | `https://mautic.opusoverseas.com`<br>`(Port 8085)` | `opusadmin` | `MauticOps2026!` | Marketing automation, nurture workflows, and lead scoring. |
| **3** | **Listmonk** | `https://listmonk.opusoverseas.com`<br>`(Port 9009)` | `admin` | `admin` | Bulk email campaigns, transactional email dispatch, and unsubscribes. |
| **4** | **ERPNext / Frappe** | `https://erp.opusoverseas.com`<br>`(Port 8080)` | **Admin:** `Administrator`<br>**API User:** `ops@opusoverseas.com` | `admin`<br>*API Key:* `14a5ec26e5dbcc8b`<br>*API Secret:* `592c2dac21507f482` | Accounting, 18% GST Sales Invoices, and back-office ledger. |
| **5** | **Cal.com (Cal.diy)** | `https://cal.opusoverseas.com`<br>`(Port 3000 / API 3201)` | `owner@opusoverseas.com`<br>*(Username: `opus-owner`)* | `CalDiyOwner2026!` | 1-on-1 counselor appointment scheduling and calendar sync. |
| **6** | **OpenWA** | `https://wa.opusoverseas.com`<br>`(Port 2785)` | *(Session: `main`)* | Configured in Worker secrets (`OPENWA_API_KEY`) | WhatsApp gateway for client updates and automated intake. |
| **7** | **n8n** | `https://n8n.opusoverseas.com`<br>`(Port 5678)` | Set up via `/setup` wizard | User-defined admin | Workflow automation, Telegram alerts, and webhook spine. |
| **8** | **Uptime Kuma** | `https://kuma.opusoverseas.com`<br>`(Port 3003)` | Set up via initial UI wizard | User-defined admin | Fleet health monitoring, push heartbeats, and downtime alerts. |
| **9** | **Umami Analytics** | `https://umami.opusoverseas.com`<br>`(Port 3002)` | `admin` | `umami` *(default)* | Privacy-focused website traffic and event analytics. |
| **10** | **Twenty CRM** | `https://crm.opusoverseas.com`<br>`(Port 3001)` | Configured on stack | Stack admin | Auxiliary CRM backend. |

---

## 2. Infrastructure & Fleet Access Commands

### SSH Access
```bash
ssh -i ~/.ssh/cordial_claw.pem ubuntu@129.159.238.227
```

### Docker Management Commands
```bash
# Check all running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Inspect Chatwoot logs
docker logs --tail 100 -f chatwoot_rails_1

# Inspect ERPNext logs
docker logs --tail 100 -f erpnext_backend_1

# Inspect Cloudflare Tunnel daemon
sudo systemctl status cloudflared
```
