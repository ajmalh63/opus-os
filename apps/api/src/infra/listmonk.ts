// Listmonk integration client (Wave 1 handoff).
// OpusOS never sends SMTP directly — it calls Listmonk's REST API; Listmonk
// owns deliverability (DKIM, bounces, opt-in). Every call is fail-open and
// logged through the notifications table by the caller.

export interface ListmonkEnv {
  LISTMONK_BASE_URL?: string;
  LISTMONK_API_USER?: string;   // admin email (Basic auth)
  LISTMONK_API_PASS?: string;   // admin password
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

// PUT /api/subscribers — idempotent create/update (keyed by email)
export async function listmonkUpsertSubscriber(
  env: ListmonkEnv,
  email: string,
  attrs: Record<string, any>,
  listIds: number[] = []
): Promise<ListmonkResult> {
  if (!env.LISTMONK_BASE_URL) return { ok: true, configured: false, provider: 'stub-email' };
  try {
    const res = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/subscribers`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(env) },
      body: JSON.stringify({ email, name: attrs.name || '', status: 'enabled', attribs: attrs, lists: listIds }),
    });
    const json: any = await res.json().catch(() => null);
    return { ok: res.ok, configured: true, provider: 'listmonk', reason: res.ok ? undefined : json?.message || `HTTP ${res.status}`, id: json?.id };
  } catch (e: any) {
    return { ok: false, configured: true, provider: 'listmonk', reason: e?.message };
  }
}

// POST /api/tx — transactional send (receipts, OTPs, agreement confirmations)
export async function listmonkSendTransactional(
  env: ListmonkEnv,
  email: string,
  subject: string,
  bodyHtml: string,
  data: Record<string, any> = {}
): Promise<ListmonkResult> {
  if (!env.LISTMONK_BASE_URL) return { ok: true, configured: false, provider: 'stub-email' };
  try {
    const res = await fetch(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/api/tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader(env) },
      body: JSON.stringify({
        subscriber_email: email,
        template_body: bodyHtml, // direct HTML body (or use template_id for branded ones)
        data,
        headers: { subject },
      }),
    });
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