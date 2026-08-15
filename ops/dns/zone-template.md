# Zone Template — copy-paste records (placeholders: <DOMAIN>, <VPS_PUBLIC_IP>)
# Paired with DOMAIN-ONBOARDING-PLAYBOOK.md — proxy column: P=proxied, D=DNS-only.

## A — web (proxied)
| Name | Type | Content | Proxy |
|---|---|---|---|
| @ | A | (CF Pages/Workers or <VPS_PUBLIC_IP>) | P |
| www | CNAME | <DOMAIN> | P |
| app | CNAME | <DOMAIN> | P |
| api | CNAME | <DOMAIN> | P |

## A — mail (DNS-only; MX target + PTR must match)
| Name | Type | Content | Proxy |
|---|---|---|---|
| mail | A | <VPS_PUBLIC_IP> | D |
| imap | CNAME | mail.<DOMAIN> | D |
| smtp | CNAME | mail.<DOMAIN> | D |

## A — VPS tool subdomains (DNS-only; exposed ONLY via Cloudflare Tunnel)
| Name | Type | Content | Proxy |
|---|---|---|---|
| mautic | A | <VPS_PUBLIC_IP> | D |
| listmonk | A | <VPS_PUBLIC_IP> | D |
| chatwoot | A | <VPS_PUBLIC_IP> | D |
| umami | A | <VPS_PUBLIC_IP> | D |
| kuma | A | <VPS_PUBLIC_IP> | D |
| n8n | A | <VPS_PUBLIC_IP> | D |

## MX
| Name | Priority | Host |
|---|---|---|
| @ | 10 | mail.<DOMAIN>. |

## TXT — email authentication (ONE SPF; selectors per sender)
| Name | Value |
|---|---|
| @ | `v=spf1 mx include:senders.smtp2go.com ~all` |
| mail._domainkey | `v=DKIM1; k=rsa; p=<STALWART_PUBLIC_KEY>` |
| default._domainkey | `v=DKIM1; k=rsa; p=<LISTMONK_PUBLIC_KEY>` |
| mautic._domainkey | `v=DKIM1; k=rsa; p=<MAUTIC_PUBLIC_KEY>` (if signing) |
| _dmarc | `v=DMARC1; p=none; rua=mailto:dmarc@<DOMAIN>; fo=1` → quarantine → reject |
| _mta-sts | `v=STSv1; id=20260801` |

## TXT — security
| Name | Value |
|---|---|
| @ CAA | `0 issue "letsencrypt.org"` |

## PTR (set at Oracle, not CF)
`<VPS_PUBLIC_IP>` reverse → `mail.<DOMAIN>`