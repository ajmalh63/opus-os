# Opus OS — Cloudflare Zero Trust Access Setup Guide

> **Cost:** 100% Free for up to 50 users (Cloudflare Zero Trust Free Tier)  
> **Target:** Protect all 16 internal VPS admin tools (`n8n`, `nocodb`, `erp`, `twenty`, etc.) with Google Single Sign-On (`ajmalsn63@gmail.com`).

---

## 1. Architecture & Policy Model

```
                    Internet Request (Browser / User)
                                  │
                                  ▼
                   ┌─────────────────────────────┐
                   │   Cloudflare Zero Trust     │
                   │   Access Gateway (Edge)     │
                   └──────────────┬──────────────┘
                                  │
                  Is User Authenticated via Google?
                                  │
                 ┌────────────────┴────────────────┐
                 ▼ (YES: ajmalsn63@gmail.com)       ▼ (NO / Anonymous)
   ┌───────────────────────────┐         ┌───────────────────────────┐
   │ Permanent Cloudflare      │         │ 403 Forbidden /           │
   │ Tunnel to Private VPS     │         │ Google One-Tap Login Page │
   └─────────────┬─────────────┘         └───────────────────────────┘
                 │
                 ▼
      Internal VPS Application
     (n8n, ERPNext, NocoDB, etc.)
```

---

## 2. Step-by-Step Activation (5 Minutes)

### Step 1: Access Zero Trust Dashboard
1. Log into your Cloudflare dashboard: **[dash.cloudflare.com](https://dash.cloudflare.com/)**.
2. On the left navigation bar, click **Zero Trust**.
3. Select your team name (e.g. `opusoverseas`). Choose the **Free Plan ($0/month)**.

### Step 2: Connect Google Login Provider (IdP)
1. In Zero Trust Dashboard, navigate to **Settings** $\rightarrow$ **Authentication**.
2. Under **Login methods**, click **Add new**.
3. Select **Google** (or One-Time PIN / Email).
4. Save. (Now any approved Google email can log in with one tap).

### Step 3: Create Access Application for Internal Tools
1. Navigate to **Access** $\rightarrow$ **Applications** $\rightarrow$ **Add an application**.
2. Select **Self-hosted**.
3. Configure the Application:
   * **Application name**: `Opus OS Admin Suite`
   * **Application domain**:
     * Subdomain: `*` (or individual subdomains: `n8n`, `nocodb`, `erp`, `social`)
     * Domain: `opusoverseas.com`
4. Click **Next** to define Policies:
   * **Policy Name**: `Allow Ajmal & Authorized Staff`
   * **Action**: `Allow`
   * **Configure Rules**:
     * Include $\rightarrow$ **Emails** $\rightarrow$ `ajmalsn63@gmail.com`
     * (Optional) Include $\rightarrow$ **Emails Ending In** $\rightarrow `@opusoverseas.com`
5. Click **Next** $\rightarrow$ Under **Advanced Settings**:
   * Add a **Bypass Policy** for webhook paths:
     * **Policy Name**: `Bypass Webhooks`
     * **Action**: `Bypass`
     * Include $\rightarrow$ **Path starts with** $\rightarrow$ `/webhook`
6. Click **Save Application**.

---

## 3. Benefits & Security Guarantees
* **Zero Public Attack Surface**: Nobody on the public internet can see login pages for n8n or ERPNext without authenticating with your Google account first.
* **100% Free**: No licensing fees, no subscription.
* **Audit Trail**: Every access attempt and session is logged in Cloudflare Access logs.
