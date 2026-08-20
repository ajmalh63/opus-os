# Zone Template — Opus Overseas Production DNS Records (`opusoverseas.com`)
# Paired with DOMAIN-ONBOARDING-PLAYBOOK.md & ops/tunnel/config.yml
# Proxy column: P = Proxied (Orange cloud), D = DNS-only (Grey cloud).

## 1. Core Web & API (Cloudflare Pages & Workers)
| Name | Type | Content | Proxy | Purpose |
|---|---|---|---|---|
| `@` | A | Cloudflare IP / Pages | P | Main Website (`opusoverseas.com`) |
| `www` | CNAME | `opusoverseas.com` | P | WWW redirect to apex |
| `app` | CNAME | `opusoverseas.com` | P | Client / Staff Portal SPA |
| `api` | CNAME | `opusoverseas.com` | P | Cloudflare Worker Hono API |

## 2. Active Microservices (Cloudflare Tunnel: `opusos-tunnel`)
| Name | Type | Content | Proxy | Target Service & Port |
|---|---|---|---|---|
| `chat` | CNAME | `<TUNNEL_ID>.cfargotunnel.com` | P | Chatwoot Support Desk (`:3200`) |
| `mautic` | CNAME | `<TUNNEL_ID>.cfargotunnel.com` | P | Mautic Marketing (`:8085`) |
| `newsletter` | CNAME | `<TUNNEL_ID>.cfargotunnel.com` | P | Listmonk Campaigns (`:9009`) |
| `wa` | CNAME | `<TUNNEL_ID>.cfargotunnel.com` | P | OpenWA Gateway (`:2785`) |
| `analytics` | CNAME | `<TUNNEL_ID>.cfargotunnel.com` | P | Umami Analytics (`:3002`) |
| `status` | CNAME | `<TUNNEL_ID>.cfargotunnel.com` | P | Uptime Kuma Monitor (`:3003`) |
| `n8n` | CNAME | `<TUNNEL_ID>.cfargotunnel.com` | P | n8n Automation Spine (`:5678`) |
| `erp` | CNAME | `<TUNNEL_ID>.cfargotunnel.com` | P | ERPNext Back-Office (`:8080`) |

## 3. Email Authentication (Titan Relay via `smtpout.secureserver.net`)
| Name | Type | Content |
|---|---|---|
| `@` | TXT | `v=spf1 include:secureserver.net ~all` |
| `default._domainkey` | TXT | `v=DKIM1; k=rsa; p=<TITAN_DKIM_PUBLIC_KEY>` |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:dmarc@opusoverseas.com; fo=1` |
| `_mta-sts` | TXT | `v=STSv1; id=20260819` |

## 4. Security & Certificates
| Name | Type | Content |
|---|---|---|
| `@` | CAA | `0 issue "letsencrypt.org"` |
| `@` | CAA | `0 issue "comodoca.com"` |
