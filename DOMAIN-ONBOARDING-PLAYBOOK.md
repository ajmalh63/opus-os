# Domain Onboarding Playbook — Cloudflare DNS + Opus OS + Email Tools
Status: **PENDING** (blocked on F1 Cloudflare credentials). Owner: asimh.
Source of truth: research-verified 2026 gold standards (CF docs, RFC 7208, 2026
deliverability requirements). Execute in ORDER; every step verifiable.

## 0. Context
Your domain hosts: Opus OS (CF Workers/Pages, proxied), VPS tools (Stalwart
mailboxes, Listmonk, Mautic, Chatwoot, Umami, Uptime Kuma, n8n — all behind
Cloudflare Tunnel), and outbound email via SMTP2GO. One zone, one rule set.

## 1. The ONE rule (prevents 90% of outages)
**Proxy (orange) ONLY HTTP/HTTPS web surfaces. Every mail/service hostname
stays DNS-only (grey).** MX/NS/TXT can never proxy; SMTP/IMAP through the
orange cloud breaks silently because Cloudflare speaks HTTP to your origin.
Non-HTTP hostnames referenced by MX (mail.) MUST be grey + PTR-matched.

## 2. Zone architecture (copy-paste table → ops/dns/zone-template.md)

| Hostname | Type | Proxy | Purpose |
|---|---|---|---|
| @ (apex) | A (or CNAME-flatten) | PROXIED | Opus OS app |
| www | A/CNAME | PROXIED | canonical web (301 from non-canonical) |
| app. / api. | CNAME | PROXIED | Workers/API routes |
| mail. | A | DNS-ONLY | MX target → Stalwart; MUST match PTR |
| imap. / smtp. | A | DNS-ONLY | client endpoints (aliases of mail.) |
| mautic. listmonk. chatwoot. umami. kuma. n8n. | A | DNS-ONLY | VPS tools — public exposure ONLY via Cloudflare Tunnel (https) |

## 3. Email authentication records (2026 mandatory trio + extras)
- **SPF — exactly ONE record** (RFC 7208; a second = invalid = NO SPF):
  `v=spf1 mx include:senders.smtp2go.com ~all`  (~4 of 10 lookups; flatten if adding vendors)
- **DKIM — one selector per sender, 2048-bit, rotate 6–12 months (dual-selector):**
  `mail._domainkey` (Stalwart) · `default._domainkey` (Listmonk) · `mautic._domainkey` (Mautic)
  Rotation: publish new selector → sign with it → retire old after a transition window.
- **DMARC — staged ramp:**
  1) `_dmarc. TXT "v=DMARC1; p=none; rua=mailto:dmarc@<domain>; fo=1"` (monitor 2–4 wks)
  2) `p=quarantine`  →  3) `p=reject` (2026: enforcement is effectively required by Gmail/Yahoo for senders)
- **MTA-STS:** `_mta-sts. TXT "v=STSv1; id=20260801"` + policy at `https://mta-sts.<domain>/.well-known/mta-sts.txt`
- **Mailboxes (aliases in Stalwart):** postmaster@, abuse@, dmarc@, unsubscribe@ — where reports land
- **Subdomain isolation (pro, later):** dedicated `send.` subdomain for marketing volume so a sender incident never poisons the root's reputation

## 4. Security & hygiene records
- **DNSSEC:** enable in CF, sync DS at registrar (chain of trust)
- **CAA:** restrict issuance: `0 issue "letsencrypt.org"` (+ CF CA if used)
- **⚠ Email Routing conflict:** CF Email Routing sets MX to Cloudflare — it CANNOT
  coexist with Stalwart's MX on the same domain. Never enable it on the mail domain.

## 5. Migration process (never causes an outage if followed)
1. Export the FULL current zone — **never trust CF auto-scan blindly**
2. **Lower TTLs to 300–600s** on all records BEFORE switching NS
3. Recreate every record exactly in CF (values/hostnames/priorities)
4. Change nameservers at the registrar
5. Verify (step 6) → raise TTLs to 1–4h after 48h stable
6. Delete stale/dangling records (subdomain-takeover risk); document record ownership

## 6. Verification (ops/dns/check-dns.ps1 automates most of this)
- MXToolbox: MX · SPF · DKIM · DMARC · PTR all green
- DNSViz: DNSSEC chain valid
- mail-tester.com ≥ 9/10 from EACH sender class (Stalwart mailbox, Listmonk, Mautic)
- `dig +short A mail.<domain> @1.1.1.1` → origin IP (grey) vs `dig +short A <domain>` → CF anycast (proxied)

## 7. Monitoring (ongoing)
- DMARC aggregate reports parsed weekly (during ramp; then monthly)
- Blacklist checks (Spamhaus/SORBS) + SMTP2GO activity panel
- Monthly: DNS audit vs ops/dns/zone-template.md (drift detection)

## 8. Definition of done (flip PENDING → done in PENDING-CONFIGS.md)
- [ ] CF zone added; all records recreated per template; TTL discipline applied
- [ ] NS switched; MXToolbox + DNSViz + mail-tester green for all sender classes
- [ ] Tunnel routes live: mail./mautic./listmonk./chatwoot./umami./kuma./n8n.
- [ ] DNSSEC + CAA + MTA-STS + aliases in place; DMARC in quarantine (or reject after ramp)
- [ ] Drift-check automated in `ops/dns/check-dns.ps1` runbook entry