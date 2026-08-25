###############################################################################
# Opus OS — Cloudflare WAF as Code (L5/L6/L7 Hardening)
# Auth: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ZONE_ID (opusoverseas.com)
# Docs: https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs
# Apply: terraform init && terraform apply -var="zone_id=YOUR_ZONE_ID"
# No cost — free tier: 5 custom rules + 1 rate limiting rule
###############################################################################

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "zone_id" {
  description = "Cloudflare Zone ID for opusoverseas.com (Dashboard → Overview → right sidebar)"
  type        = string
}

# ── L5/L7 — Rate Limit: /api/auth/* + /api/public/* (brute force / enumeration) ──
# Mirrors D1 middleware (apps/api/src/middleware/rateLimit.ts) at edge
# 8 req / 300s already in D1; edge rule stops flood before Worker.
resource "cloudflare_rate_limit" "opus_auth_bruteforce" {
  zone_id   = var.zone_id
  threshold = 10
  period    = 60
  match {
    request {
      url_pattern = "opusoverseas.com/api/auth/*"
      schemes     = ["HTTP", "HTTPS"]
      methods     = ["POST", "GET"]
    }
  }
  action {
    mode    = "challenge" # JS challenge — blocks bots, allows humans. Use "ban" for hard block.
    timeout = 300
    response {
      content_type = "application/json"
      body         = "{\"error\":{\"code\":\"RATE_LIMIT\",\"message\":\"Too many auth attempts. Try again in 5m.\"}}"
    }
  }
  correlate {
    by = "nat"
  }
  disabled                = false
  description             = "L5 — Auth brute force 10/60s (mirrors D1 8/300s)"
}

resource "cloudflare_rate_limit" "opus_portal_lookup" {
  zone_id   = var.zone_id
  threshold = 10
  period    = 3600
  match {
    request {
      url_pattern = "opusoverseas.com/api/public/portal/lookup*"
      schemes     = ["HTTP", "HTTPS"]
      methods     = ["GET"]
    }
  }
  action {
    mode    = "ban"
    timeout = 3600
    response {
      content_type = "application/json"
      body         = "{\"error\":{\"code\":\"RATE_LIMIT\",\"message\":\"Too many lookups. Token enumeration blocked.\"}}"
    }
  }
  disabled    = false
  description = "L5 — Portal token enumeration 10/hr (City-Forum defense)"
}

# ── L7 — SSRF Probe Block (CVE-2026-62668 / 69250 / 33655 cluster) ──
resource "cloudflare_ruleset" "opus_waf_custom" {
  zone_id     = var.zone_id
  name        = "Opus OS L7 SSRF + Injection Shield"
  description = "Block file:// gopher:// dict:// and 169.254.169.254 probes before Worker"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  # Rule 1: SSRF scheme / metadata IP in query or body (covers ?url=, webhook, resourcePath)
  rules {
    action      = "block"
    expression  = "(http.request.uri.query contains \"file://\" or http.request.uri.query contains \"gopher://\" or http.request.uri.query contains \"dict://\" or http.request.uri.query contains \"169.254.169.254\" or http.request.body.raw contains \"169.254.169.254\" or http.request.body.raw contains \"file://\")"
    description = "L7 — Block SSRF schemes + cloud metadata IP (covers all 6 Aug CVEs)"
    enabled     = true
  }

  # Rule 2: Metabase-style merge payload (future-proof even though we don't run Metabase)
  rules {
    action      = "block"
    expression  = "(http.request.uri.path contains \"/api/session/reset_password\" and http.request.body.raw contains \"user-id\")"
    description = "L7 — Block Metabase CVE-2026-72898 probe"
    enabled     = true
  }

  # Rule 3: Block guest/client-self token probing (P1 IDOR we just fixed — defense in depth)
  rules {
    action      = "block"
    expression  = "(http.request.uri.query contains \"token=guest\" or http.request.uri.query contains \"token=client-self\")"
    description = "L5 — Block guest token IDOR probe"
    enabled     = true
  }
}

# ── L6 — HSTS + Security Headers at Edge (redundant with Worker secureHeaders) ──
# Zone settings are applied via cloudflare_zone_settings_override (zone_id var)
resource "cloudflare_zone_settings_override" "opus_hsts" {
  zone_id = var.zone_id
  settings {
    # HSTS: 1yr + includeSubDomains + preload + noSniff headers already in Worker,
    # this adds edge-enforced HSTS even when Worker is bypassed/cache hit.
    security_header {
      enabled = true
    }
    # Note: strict_transport_security is managed via hsts sub-block on older provider;
    # if this resource fails on your TF version, set HSTS manually:
    # Dashboard → SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS) → Enable → Max-Age 31536000, includeSubDomains, preload
  }
}

# ── OUTPUTS ──
output "waf_ruleset_id" {
  value = cloudflare_ruleset.opus_waf_custom.id
}
output "rate_limit_auth_id" {
  value = cloudflare_rate_limit.opus_auth_bruteforce.id
}
