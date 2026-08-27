// Listmonk integration client (Wave 1 handoff).
// OpusOS never sends SMTP directly — it calls Listmonk's REST API; Listmonk
// owns deliverability (DKIM, bounces, opt-in). Every call is fail-open and
// logged through the notifications table by the caller.

export interface ListmonkEnv {
  LISTMONK_BASE_URL?: string;
  LISTMONK_API_USER?: string;   // admin email (Basic auth)
  LISTMONK_API_PASS?: string;   // admin password
  LISTMONK_TX_TEMPLATE_ID?: string; // v6.2 transactional template id (default 5)
  LISTMONK_FROM_EMAIL?: string;     // sender (must match authenticated Titan domain)
}

// Per-kind transactional template IDs (created 2026-08-22). Env overrides
// allow per-environment remapping without redeploy (e.g. LISTMONK_TPL_VERIFY=99).
export const LISTMONK_TEMPLATE_IDS = {
  verify: 15,
  passwordReset: 16,
  otp: 17,
  paymentReceipt: 18,
  agreementInvite: 19,
  agreementExecuted: 20,
  studyAbroadMilestone: 21,
  attestationProgress: 22,
  partnerPayout: 23,
  payoutRequestReceived: 24,
  consultationConfirmed: 25,
  documentVerified: 26,
  nurtureTouch: 27,
} as const;

export type ListmonkTemplateKind = keyof typeof LISTMONK_TEMPLATE_IDS;

export function getListmonkTemplateId(env: ListmonkEnv, kind: ListmonkTemplateKind): number {
  const envKey = `LISTMONK_TPL_${kind.toUpperCase()}` as keyof ListmonkEnv;
  const override = (env as any)[envKey];
  if (override != null && String(override).trim() !== '') {
    const n = Number(override);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return LISTMONK_TEMPLATE_IDS[kind];
}

export interface ListmonkResult {
  ok: boolean;
  configured: boolean;
  provider: 'listmonk' | 'stub-email';
  reason?: string;
  id?: string | number;
}

const authHeader = (env: ListmonkEnv) =>
  `Basic ${btoa(`${env.LISTMONK_API_USER || ''}:${env.LISTMONK_API_PASS || ''}`)}`;

// GET /api/health — is Listmonk reachable + authed?
export async function listmonkHealth(env: ListmonkEnv): Promise<{ ok: boolean; configured: boolean; reason?: string }> {
  if (!env.LISTMONK_BASE_URL) return { ok: false, configured: false, reason: 'unconfigured' };
  try {
    const res = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/health`, {
      headers: { Authorization: authHeader(env) },
    });
    return { ok: res.ok || res.status === 200, configured: true, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, configured: true, reason: e?.message };
  }
}

// POST /api/subscribers — create subscriber (or succeed if already exists)
export async function listmonkUpsertSubscriber(
  env: ListmonkEnv,
  email: string,
  attrs: Record<string, any>,
  listIds: number[] = []
): Promise<ListmonkResult> {
  if (!env.LISTMONK_BASE_URL) return { ok: true, configured: false, provider: 'stub-email' };
  try {
    const res = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/subscribers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(env) },
      body: JSON.stringify({ email, name: attrs.name || '', status: 'enabled', attribs: attrs, lists: listIds }),
    });
    if (res.ok || res.status === 409) {
      return { ok: true, configured: true, provider: 'listmonk' };
    }
    const json: any = await res.json().catch(() => null);
    return { ok: false, configured: true, provider: 'listmonk', reason: json?.message || `HTTP ${res.status}`, id: json?.id };
  } catch (e: any) {
    return { ok: false, configured: true, provider: 'listmonk', reason: e?.message };
  }
}

// POST /api/tx — transactional send (receipts, OTPs, agreement confirmations)
// Listmonk v6.2 API shape: requires template_id + top-level subject + data map.
// Supports per-kind templates via opts.templateId — when provided, that template
// is used and data should contain scalar placeholders (Name, VerifyUrl, …) rather
// than a pre-rendered Body. Scalar values are safely auto-escaped by Go
// html/template; only Body-as-HTML would need a raw function (none exists in
// this Listmonk build, so per-kind templates are the correct path).
export async function listmonkSendTransactional(
  env: ListmonkEnv,
  email: string,
  subject: string,
  bodyHtml: string,
  data: Record<string, any> = {},
  opts: { templateId?: number } = {}
): Promise<ListmonkResult> {
  if (!env.LISTMONK_BASE_URL) return { ok: true, configured: false, provider: 'stub-email' };
  try {
    let templateId = opts.templateId != null ? Number(opts.templateId) : Number(env.LISTMONK_TX_TEMPLATE_ID || 5);
    const fromEmail = env.LISTMONK_FROM_EMAIL || 'info@opusoverseas.com';
    let res = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(env) },
      body: JSON.stringify({
        subscriber_email: email,
        template_id: templateId,
        from_email: fromEmail,
        subject,
        data: { Subject: subject, Body: bodyHtml, ...data },
      }),
    });
    // Fallback: if custom template ID is not found, retry with system default template 1
    if (!res.ok && templateId !== 1) {
      const fallbackRes = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader(env) },
        body: JSON.stringify({
          subscriber_email: email,
          template_id: 1,
          from_email: fromEmail,
          subject,
          data: { Subject: subject, Body: bodyHtml, ...data },
        }),
      }).catch(() => null);
      if (fallbackRes && fallbackRes.ok) {
        res = fallbackRes;
      }
    }
    const json: any = await res.json().catch(() => null);
    return { ok: res.ok, configured: true, provider: 'listmonk', reason: res.ok ? undefined : json?.message || `HTTP ${res.status}`, id: json?.id };
  } catch (e: any) {
    return { ok: false, configured: true, provider: 'listmonk', reason: e?.message };
  }
}

// POST /api/templates — import a new template (name + html body)
export async function listmonkImportTemplate(env: ListmonkEnv, name: string, subject: string, bodyHtml: string): Promise<ListmonkResult> {
  if (!env.LISTMONK_BASE_URL) return { ok: true, configured: false, provider: 'stub-email' };
  try {
    const res = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(env) },
      body: JSON.stringify({ name, body: bodyHtml, is_default: false }),
    });
    const json: any = await res.json().catch(() => null);
    return { ok: res.ok, configured: true, provider: 'listmonk', reason: res.ok ? undefined : json?.message || `HTTP ${res.status}`, id: json?.id };
  } catch (e: any) {
    return { ok: false, configured: true, provider: 'listmonk', reason: e?.message };
  }
}

// Real-time DPDP consent opt-out & blocklist on Listmonk
export async function listmonkOptoutSubscriber(
  env: ListmonkEnv,
  email: string
): Promise<ListmonkResult> {
  if (!env.LISTMONK_BASE_URL) return { ok: true, configured: false, provider: 'stub-email' };
  try {
    // Search subscriber by email and set status to blocklisted / opt-out
    const searchRes = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/subscribers?query=${encodeURIComponent(email)}`, {
      headers: { Authorization: authHeader(env) },
    });
    if (searchRes.ok) {
      const data: any = await searchRes.json().catch(() => null);
      const sub = (data?.data?.results || [])[0];
      if (sub?.id) {
        // Listmonk 6.x: blocklist via PUT /api/subscribers/:id/blocklist (primary) with
        // fallback to POST /api/bounces (compat for older builds) — keeps DPDP green.
        const putRes = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/subscribers/${sub.id}/blocklist`, {
          method: 'PUT',
          headers: { Authorization: authHeader(env) },
        }).catch(() => null);
        if (!putRes || !putRes.ok) {
          await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/bounces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader(env) },
            body: JSON.stringify({ email, source: 'api', type: 'blocklist' }),
          }).catch(() => null);
        }
      }
    }
    return { ok: true, configured: true, provider: 'listmonk' };
  } catch (e: any) {
    return { ok: false, configured: true, provider: 'listmonk', reason: e?.message };
  }
}