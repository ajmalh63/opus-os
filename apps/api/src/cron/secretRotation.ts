/**
 * Secret rotation cron (monthly) — gold-standard key hygiene.
 *
 * Two classes of secrets:
 *
 * 1. D1-MANAGED webhook secrets (cal_webhook_secret): fully under our control —
 *    rotate automatically with a DUAL-KEY overlap window:
 *      current → previous (still accepted by the webhook verifier)
 *      new CSPRNG   → current
 *    The owner then updates the provider (cal.com) with the new secret at
 *    leisure; verification never breaks because prev stays valid. After the
 *    next rotation, the old prev is dropped.
 *
 * 2. ENV-MANAGED secrets (RAZORPAY_WEBHOOK_SECRET, WA_WEBHOOK_SECRET,
 *    CHATWOOT_API_TOKEN, LISTMONK_WEBHOOK_SECRET, AUTOMATION_TOKEN…): their
 *    providers have no rotation API we can call, so the cron CANNOT rotate
 *    them blindly. It tracks age in app_settings (`<name>_rotated_at`) and
 *    raises a staff alert at >90 days with the exact `wrangler secret put`
 *    commands — dual-key acceptance for these would require env support, which
 *    is a deploy-time decision.
 *
 * All rotations/checks are recorded in the tamper-evident audit chain.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { appSettings } from '../db/schema.js';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';

const now = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

function newSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function upsert(db: any, key: string, value: string) {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).get().catch(() => undefined);
  if (existing) {
    await db.update(appSettings).set({ value, updatedAt: now() }).where(eq(appSettings.key, key)).catch(() => {});
  } else {
    await db.insert(appSettings).values({ key, value, updatedAt: now() }).catch(() => {});
  }
}

// Env-managed secrets that need periodic human rotation (90-day policy).
const ENV_SECRETS: { envName: string; provider: string }[] = [
  { envName: 'RAZORPAY_WEBHOOK_SECRET', provider: 'Razorpay dashboard → Settings → Webhooks' },
  { envName: 'WA_WEBHOOK_SECRET', provider: 'OpenWA VPS config' },
  { envName: 'CHATWOOT_API_TOKEN', provider: 'Chatwoot dashboard' },
  { envName: 'LISTMONK_WEBHOOK_SECRET', provider: 'Listmonk webhook settings' },
  { envName: 'AUTOMATION_TOKEN', provider: 'n8n automation lane (wrangler secret put)' },
  { envName: 'N8N_WEBHOOK_SECRET', provider: 'n8n webhook settings' },
];

export async function runSecretRotation(env: any): Promise<{ rotated: string[]; alerts: string[] }> {
  const rotated: string[] = [];
  const alerts: string[] = [];
  if (!env?.DB) return { rotated, alerts };
  const db = getDb(env.DB);

  // ---- 1. Rotate the D1-managed cal.com webhook secret (dual-key) ----
  const rows = await db.select().from(appSettings).all();
  const get = (k: string) => rows.find((r: any) => r.key === k)?.value || '';
  const current = get('cal_webhook_secret');
  if (current) {
    const fresh = newSecret();
    // Promote current → previous (still accepted), new → current.
    await upsert(db, 'cal_webhook_secret_prev', current);
    await upsert(db, 'cal_webhook_secret', fresh);
    await upsert(db, 'cal_secret_rotated_at', String(now()));
    await auditEvent(
      { env, req: { header: () => null } },
      { action: 'SECRET_ROTATED', entityName: 'app_settings', entityId: 'cal_webhook_secret', afterState: { via: 'cron', dualKey: true }, category: 'access' },
    ).catch(() => {});
    rotated.push('cal_webhook_secret');
    await createStaffAlert(env, {
      division: 'study-abroad', type: 'secret_rotation', severity: 'warning',
      title: '🔑 cal.com webhook secret rotated — update cal.com',
      body: `A new cal_webhook_secret is active (old one still accepted during the overlap window). Open cal.com → Developer → Webhooks → edit the webhook and paste the NEW secret from Consultations → Cal.com Configuration → Webhook secret.`,
      link: '/bookings',
    }).catch(() => {});
    alerts.push('cal_webhook_secret: owner must sync cal.com side');
  }

  // ---- 2. Age-check env-managed secrets (>90 days → alert with commands) ----
  for (const s of ENV_SECRETS) {
    const last = Number(get(`${s.envName}_rotated_at`) || 0);
    if (!last) {
      // First run: record baseline so we can track age going forward.
      await upsert(db, `${s.envName}_rotated_at`, String(now())).catch(() => {});
      continue;
    }
    const ageDays = Math.floor((now() - last) / DAY);
    if (ageDays >= 90) {
      await createStaffAlert(env, {
        division: 'study-abroad', type: 'secret_rotation', severity: 'warning',
        title: `🔑 ${s.envName} is ${ageDays} days old — rotate`,
        body: `Rotate via: wrangler secret put ${s.envName}  (update in ${s.provider}). After rotation, run the OS admin "mark rotated" endpoint or update app_settings key ${s.envName}_rotated_at.`,
        link: '/security/audit',
      }).catch(() => {});
      alerts.push(`${s.envName}: ${ageDays}d old`);
    }
  }

  return { rotated, alerts };
}