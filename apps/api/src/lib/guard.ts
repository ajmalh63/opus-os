// Guard Contract — the OS send-verdict pillar (privacy-by-design: consent
// checked BEFORE every marketing delivery; fail-closed on missing evidence).
// Tools (Listmonk/Mautic workflows via n8n) ask "may I send to X?" and the OS
// answers allow|block with a reason + check trail. Only OS-known contacts are
// vetoed — tool-managed strangers pass informational, because the OS only
// guarantees what it knows (DPDP intent of record).

import { eq } from 'drizzle-orm';
import { clients, consents, listmonkSuppressions } from '../db/schema.js';
import { getDb } from '../db/client.js';

export type GuardChannel = 'email' | 'whatsapp';
export type GuardPurpose = 'marketing' | 'transactional';

export interface GuardInput {
  channel: GuardChannel;
  to: string;            // email or phone (as the tool knows it)
  clientId?: string;
  purpose?: GuardPurpose;
}

export interface GuardCheck { name: string; passed: boolean; detail?: string }
export interface GuardResult { verdict: 'allow' | 'block'; reason: string; checks: GuardCheck[] }

export type GuardDb = ReturnType<typeof getDb>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{8,19}$/;
const CONSENT_FOR: Record<GuardChannel, string> = { email: 'marketing-campaigns', whatsapp: 'whatsapp-updates' };

export async function runGuard(db: GuardDb, input: GuardInput): Promise<GuardResult> {
  const channel = input.channel;
  const to = input.to.trim().toLowerCase();
  const purpose = input.purpose || 'marketing';
  const checks: GuardCheck[] = [];

  // 1. Contact validity (allowlist-format; fail-closed on malformed input)
  const valid = channel === 'email' ? EMAIL_RE.test(to) : PHONE_RE.test(to);
  checks.push({ name: 'contact_valid', passed: valid });
  if (!valid) return { verdict: 'block', reason: 'invalid_contact', checks };

  // 2. Identity resolution — only OS-known contacts get the full gate
  let clientId = input.clientId;
  let identity: { id: string; name?: string | null } | undefined;
  if (clientId) {
    identity = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.id, clientId)).get().catch(() => undefined);
  } else {
    identity = channel === 'email'
      ? await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.email, to)).get().catch(() => undefined)
      : await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.phone, to)).get().catch(() => undefined);
  }
  checks.push({ name: 'os_profile', passed: !!identity, detail: identity ? undefined : 'no_os_profile' });
  if (!identity) {
    // Tool-owned contacts are outside OS knowledge — informational allow only.
    return { verdict: 'allow', reason: 'no_os_profile', checks };
  }
  clientId = identity.id;

  // 3. Suppression registry (hard bounce / 3× soft / unsubscribe / complaint) —
  //    vetoes BOTH marketing and transactional sends.
  if (channel === 'email') {
    const sup = await db.select().from(listmonkSuppressions).where(eq(listmonkSuppressions.email, to)).get().catch(() => undefined);
    const suppressed = !!sup?.suppressed;
    checks.push({ name: 'suppression', passed: !suppressed, detail: suppressed ? `suppressed: ${sup?.reason || 'registry'}` : undefined });
    if (suppressed) return { verdict: 'block', reason: `suppressed:${sup?.reason || 'registry'}`, checks };
  }

  // 4. Consent — privacy as default: marketing to an OS contact REQUIRES a
  //    live granted consent; missing/withdrawn blocks (purpose limitation).
  if (purpose === 'marketing') {
    const consentType = CONSENT_FOR[channel];
    const rows = await db.select().from(consents)
      .where(eq(consents.clientId, clientId)).all().catch(() => []);
    const match = rows
      .filter((r: any) => r.consentType === consentType)
      .sort((a: any, b: any) => Number(b.grantedAt || 0) - Number(a.grantedAt || 0));
    const latest = match[0];
    const granted = latest?.status === 'granted';
    checks.push({ name: 'consent', passed: granted, detail: granted ? undefined : `consent_missing_or_withdrawn:${consentType}` });
    if (!granted) return { verdict: 'block', reason: `consent_missing_or_withdrawn:${consentType}`, checks };
  } else {
    checks.push({ name: 'consent', passed: true, detail: 'transactional_purpose_bypass' });
  }

  return { verdict: 'allow', reason: 'ok', checks };
}