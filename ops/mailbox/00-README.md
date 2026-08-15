# Stalwart Mailbox Server — Deployment Order (VPS + SMTP2GO, zero-cost)

Steps are ordered so you never test against broken DNS. Replace
`<YOUR_DOMAIN>` (e.g. opusoverseas.com) everywhere.

## Prerequisites (confirm before starting)
- [ ] VPS: ≥350 MB free RAM, ≥5–10 GB free disk (Maildir grows with usage)
- [ ] Oracle: **inbound port 25 open** in the OCI security list
  (outbound 25 stays BLOCKED — that's why we use the smarthost)
- [ ] Domain: ability to add MX/TXT records; public IP of the VPS reserved
- [ ] SMTP2GO free account created (https://app.smtp2go.com) — no card

## 1. DNS baseline (BEFORE install)
- [ ] PTR/rDNS on the VPS public IP → `mail.<YOUR_DOMAIN>` (Oracle: reserved IP →
      rDNS via OCI console)
- [ ] A record `mail.<YOUR_DOMAIN>` → VPS public IP
- [ ] MX `<YOUR_DOMAIN>` → `mail.<YOUR_DOMAIN>.` (priority 10)
- [ ] SPF TXT: `v=spf1 ip4:<VPS_PUBLIC_IP> include:senders.smtp2go.com ~all`
      (include SMTP2GO so both lanes authenticate)
- [ ] DMARC TXT: `v=DMARC1; p=none; rua=mailto:dmarc@<YOUR_DOMAIN>` (p=none → monitor)

## 2. SMTP2GO sender verification (before any test send)
- [ ] Verified Senders → verify domain `<YOUR_DOMAIN>` with their TXT record
- [ ] Create SMTP user/API key (`api/<KEY>`) → used as smarthost credentials
- [ ] Their SPF value is already covered by the include above

## 3. Install Stalwart (choose one)
- Binary: download from GitHub releases → extract → `stalwart install`
- Docker: official image, mounts `/var/lib/stalwart/data` (use `stalwart.toml`
  this kit) — keep data on disk, not container layer
- Apply `stalwart.toml` → replace `<PLACEHOLDER>`s → set data dir perms

## 4. Keys & certificates
- [ ] TLS cert: Let's Encrypt via ACME (direct) — or trusted cert via Cloudflare
      Tunnel if webmail is tunneled only
- [ ] DKIM: `stalwart-cli dkim key <data>/dkim "<YOUR_DOMAIN>" mail`
      → add TXT `mail._domainkey.<YOUR_DOMAIN>` = public key
- [ ] Restart Stalwart; check `/var/log/` or `stalwart-cli` for clean start

## 5. Verify (MXToolbox + real mail)
- [ ] MXToolbox: MX, SPF, DKIM, DMARC, PTR all green
- [ ] Inbound: mail-tester.com (send TO your mailbox → score mgmt)
- [ ] Outbound: create a mailbox → send to a Gmail test address (via smarthost)
      → expect: lands in INBOX (SMTP2GO's reputation, not Oracle's)
- [ ] IMAP: connect mail app/webmail on 465/993 from inside the tunnel/Tailnet

## 6. Webmail access
- Stalwart ships webmail on 443 (ACME) — or expose `https://mail.<YOUR_DOMAIN>`
  through Cloudflare Tunnel (needs domain on CF, F1). Staff log in with their
  mailbox credentials.

## 7. OS integration (next, buildable once mailboxes exist)
- Mailboxes adapter: Stalwart management API → auto-provision
  `firstname@<YOUR_DOMAIN>` per staff user (join/handoff), quotas, status +
  usage surfaced in the OS control panel; inbound linked to clients.
  (Adapter ships in the Opus OS repo; the SMTP2GO lane is already wired for
  Listmonk + transactional sends.)

## Warm-up note (only relevant if you EVER leave the smarthost)
With the smarthost, no warm-up needed (SMTP2GO's accredited IPs deliver).
If you later enable direct sending: PTR → SPF ip4 → DKIM → ramp 3–6 weeks.