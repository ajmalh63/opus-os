# Opus OS — n8n Orchestration Blueprints

This directory contains production-ready JSON workflow blueprints for the **n8n Orchestration Core** (`https://n8n.opusoverseas.com`).

---

## 📦 Workflow Directory

| Workflow File | Event Trigger | Downstream Integrations |
| :--- | :--- | :--- |
| **[`OpusOS-Inbound-Lead-Orchestrator.json`](./OpusOS-Inbound-Lead-Orchestrator.json)** | `lead.created` | **Chatwoot** (contact + inbox) + **WhatsApp** (ticket dispatch) + **Listmonk** (drip segment) |
| **[`OpusOS-Attestation-Courier-Tracker.json`](./OpusOS-Attestation-Courier-Tracker.json)** | `attestation.status_updated` | **WhatsApp** (milestone alert) + **Chatwoot** (internal audit note) |
| **[`OpusOS-ERPNext-Invoice-Reconciliation.json`](./OpusOS-ERPNext-Invoice-Reconciliation.json)** | `payment.received` | **ERPNext** (Customer + Sales Invoice + GL credit) + **WhatsApp** (receipt) |
| **[`OpusOS-Social-Broadcast-Drip.json`](./OpusOS-Social-Broadcast-Drip.json)** | `campaign.broadcast` | **Postiz** (LinkedIn, FB, X, Instagram) + **Mautic** (behavioral drip) |
| **[`OpusOS-Health-Incident-Alerter.json`](./OpusOS-Health-Incident-Alerter.json)** | 5-Minute Cron Probe | `/api/infrastructure/health` $\rightarrow$ **WhatsApp Admin Incident Alert** |

---

## 🚀 How to Import into n8n

1. Open your self-hosted n8n dashboard: **`https://n8n.opusoverseas.com`**.
2. Click **Workflows** $\rightarrow$ **Import from File...** (or press `Ctrl + O` / `Cmd + O`).
3. Select any of the `.json` blueprint files from this folder.
4. Set the Webhook path or update the internal base URLs (default is `http://127.0.0.1:<PORT>` for private Docker networking on the VPS).
5. Toggle the workflow to **Active**.
