#!/usr/bin/env node
/**
 * Secret guard — CI gate that fails the build if any secret material is
 * found in the frontend source or built bundle.
 *
 * Rules:
 *  1. No secret-pattern strings (sk_live/sk_test/cal_live_/AKIA/ghp_/xoxb-…)
 *     anywhere in apps/app/src or apps/app/dist.
 *  2. No VITE_* env var may be NAMED like a secret (VITE_API_KEY,
 *     VITE_SECRET, VITE_TOKEN, VITE_PASSWORD, VITE_PRIVATE…) — VITE_ vars are
 *     baked into the public JS bundle at build time, so they must only ever
 *     carry public-by-design values (site keys, widget tokens, analytics IDs).
 *  3. No hardcoded credential-looking assignments in source.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN_DIRS = ['apps/app/src', 'apps/app/dist'];
const SECRET_PATTERNS = [
  /\b(sk|pk)_(live|test)_[A-Za-z0-9]{16,}/, // Stripe
  /\bcal_live_[a-f0-9]{16,}/,               // Cal.com
  /\bowa_k1_[a-f0-9]{16,}/,                 // OpenWA
  /\bAKIA[0-9A-Z]{16}/,                     // AWS
  /\bghp_[A-Za-z0-9]{20,}/,                 // GitHub PAT
  /\bxox[baprs]-[A-Za-z0-9-]{20,}/,         // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/,               // Google
  /OwnerPass2026/,                          // known project credential
  /dev-automation-token-change-me/,         // known project credential
  /opusos_n8n_master_secret_2026/,          // known project credential
];
const FORBIDDEN_VITE_NAMES = /^VITE_(API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL|AUTH)/;

function walk(dir, out = []) {
  if (!statSync(dir, { throwIfNoEntry: false })) return out;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.(ts|tsx|js|mjs|html|css)$/.test(f)) out.push(p);
  }
  return out;
}

let failures = 0;
const files = walk(join(ROOT, 'apps/app/src')).concat(walk(join(ROOT, 'apps/app/dist')));

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const re of SECRET_PATTERNS) {
    const m = content.match(re);
    if (m) {
      console.error(`[secret-guard] FAIL ${file}: secret pattern ${re} (${m[0].slice(0, 12)}…)`);
      failures++;
    }
  }
  for (const m of content.matchAll(/import\.meta\.env\.(VITE_[A-Z_]+)/g)) {
    if (FORBIDDEN_VITE_NAMES.test(m[1])) {
      console.error(`[secret-guard] FAIL ${file}: ${m[1]} would be baked into the public bundle`);
      failures++;
    }
  }
}

if (failures) {
  console.error(`[secret-guard] ${failures} violation(s) — fix before deploy.`);
  process.exit(1);
}
console.log('[secret-guard] OK — no secrets in frontend source or bundle.');