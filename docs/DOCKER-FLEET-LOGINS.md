# VPS Docker Fleet Topology & Service Configuration Reference

**Server Environment:** Private Enterprise Cloud (ARM Architecture)  
**Access Model:** Zero-Trust Bastion / SSH Key Authentication  
**Tunnel Ingress:** Cloudflare Named Tunnel (`6f1a97cc...`) → `https://*.opusoverseas.com`

---

## 1. Containerized Application Architecture

| # | Application | Ingress Hostname / Local Port | Service Account | Credential Management | Purpose & Integration Role |
|---|---|---|---|---|---|
| **1** | **Chatwoot** | `https://chat.opusoverseas.com`<br>`(Port 3200)` | `ops@opusoverseas.com` | Stored in Cloudflare Secret Store (`CHATWOOT_API_TOKEN`) | Customer live-chat, omnichannel messaging, and counselor help center. |
| **2** | **Mautic** | `https://mautic.opusoverseas.com`<br>`(Port 8085)` | `opusadmin` | Configured via environment (`MAUTIC_API_TOKEN`) | Marketing automation, nurture email sequences, and behavioral lead scoring. |
| **3** | **Listmonk** | `https://listmonk.opusoverseas.com`<br>`(Port 9009)` | `admin` | Configured in Worker secrets (`LISTMONK_API_TOKEN`) | High-deliverability transactional email dispatch and campaign broadcast. |
| **4** | **ERPNext / Frappe** | `https://erp.opusoverseas.com`<br>`(Port 8080)` | `ops@opusoverseas.com` | Secret Store (`ERPNEXT_API_KEY` / `ERPNEXT_API_SECRET`) | Double-entry ledger, 18% GST Sales Invoice issuance, and payment audit sync. |
| **5** | **Cal.com (Cal.diy)** | `https://cal.opusoverseas.com`<br>`(Port 3000 / API 3201)` | Counselor Accounts | Configured in D1 `app_settings` (`cal_api_key`) | 1-on-1 counselor appointment scheduling and Google/Outlook calendar sync. |
| **6** | **OpenWA** | `https://wa.opusoverseas.com`<br>`(Port 2785)` | Dedicated WhatsApp Instance | Worker secrets (`OPENWA_API_KEY` / `WA_WEBHOOK_SECRET`) | Autonomous WhatsApp messaging gateway with anti-ban jitter simulation. |
| **7** | **n8n** | `https://n8n.opusoverseas.com`<br>`(Port 5678)` | Operational Admin | Configured via Secrets Store (`N8N_WEBHOOK_SECRET`) | Enterprise asynchronous workflow orchestration and webhook router. |
| **8** | **Uptime Kuma** | `https://status.opusoverseas.com`<br>`(Port 3003)` | System Monitor | Push token binding (`KUMA_PUSH_URL`) | Edge health monitoring, heartbeat telemetry, and automated uptime alerts. |
| **9** | **Umami Analytics** | `https://analytics.opusoverseas.com`<br>`(Port 3002)` | Analytics Console | Public Website ID (`VITE_UMAMI_WEBSITE_ID`) | Privacy-first, GDPR/DPDP-compliant visitor traffic and conversion analytics. |
| **10** | **Twenty CRM** | `https://crm.opusoverseas.com`<br>`(Port 3001)` | Enterprise Admin | Internal Service Binding | Auxiliary customer relationship and sales pipeline store. |

---

## 2. Infrastructure Operations & Fleet Management

### Secure Terminal Access
```bash
# Connect via private SSH keypair over protected network
ssh -i ~/.ssh/<identity_key>.pem <service_user>@<internal_fleet_host>
```

### Operational Verification Commands
```bash
# Inspect active Docker container health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Stream container runtime logs
docker logs --tail 100 -f chatwoot_rails_1
docker logs --tail 100 -f erpnext_backend_1

# Verify Cloudflare Tunnel daemon health
sudo systemctl status cloudflared
```
