// ERPNext integration client (Frappe REST API v2).
// Auth via api_key + api_secret (FrappeDoc Admin: /api/resource/Sales Invoice).
// One-way sync: OpusOS (front office) → ERPNext (official books/GST).

export type ErpEnv = {
  ERPNEXT_BASE_URL?: string;     // e.g. http://100.87.71.38:8000 (VPS bench)
  ERPNEXT_API_KEY?: string;      // generated in ERPNext user profile
  ERPNEXT_API_SECRET?: string;
};

export interface ErpResult<T = any> {
  ok: boolean;
  status?: number;
  data?: T;
  message?: string;
  // Frappe returns { data: {...} } on success
}

// Build an authenticated fetch header set for Frappe REST v1 (Resource endpoints).
function authHeaders(env: ErpEnv): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.ERPNEXT_API_KEY && env.ERPNEXT_API_SECRET) {
    h['Authorization'] = `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}`;
  }
  return h;
}

function base(env: ErpEnv): string {
  if (!env.ERPNEXT_BASE_URL) throw new Error('ERPNEXT_BASE_URL not configured');
  return env.ERPNEXT_BASE_URL.replace(/\/$/, '');
}

// Login-based auth (email + password → session cookie). Prefer api_key path in prod.
export async function erpLogin(env: ErpEnv, username: string, password: string): Promise<string | null> {
  const res = await fetch(`${base(env)}/api/method/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usr: username, pwd: password }),
    credentials: 'include' as any,
  })
  if (res.ok) return res.headers.get('set-cookie') || '';
  return null;
}

// Create or update a doctype doc via Resource API (idempotent: PUT when present, POST when absent).
export async function erpUpsert(env: ErpEnv, doctype: string, doc: Record<string, any>, docName?: string): Promise<ErpResult> {
  const name = docName || (doc as any).name || (doc as any).customer_name;
  if (!name) return erpCreateDoc(env, doctype, doc);

  // Existence check → PUT (update) or POST (create)
  const probe = await fetch(`${base(env)}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { headers: authHeaders(env) });
  const exists = probe.ok;
  const res = await fetch(`${base(env)}/api/resource/${exists ? encodeURIComponent(doctype) + '/' + encodeURIComponent(name) : doctype}`, {
    method: exists ? 'PUT' : 'POST',
    headers: authHeaders(env),
    body: JSON.stringify({ ...doc, doctype: doctype }),
  })
const body = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    const msg = extractErpError(body);
    return { ok: false, status: res.status, message: msg || `ERPNext [${res.status}]` };
  }
  return { ok: true, status: res.status, data: body.data };
}

async function erpCreateDoc(env: ErpEnv, doctype: string, doc: Record<string, any>): Promise<ErpResult> {
  const res = await fetch(`${base(env)}/api/resource/${encodeURIComponent(doctype)}`, {
    method: 'POST',
    headers: authHeaders(env),
    body: JSON.stringify({ ...doc, doctype: doctype }),
  })
  const body = await res.json().catch(() => ({})) as any;
  if (!res.ok) {
    const msg = extractErpError(body);
    return { ok: false, status: res.status, message: msg || `ERPNext [${res.status}]` };
  }
  return { ok: true, status: res.status, data: body.data };
}

// Prefer Frappe's detailed (_server_messages) error; fallback exc_type or raw body.
function extractErpError(body: any): string | null {
  try {
    const msgs = body?._server_messages;
    if (Array.isArray(msgs) && msgs.length > 0) {
      const parsed = JSON.parse(msgs[0]);
      return parsed?.message || msgs[0];
    }
  } catch { /* fallthrough */ }
  if (body?.exc_type) return body.exc_type as string;
  if (body?.exception) return String(body.exception).slice(0, 300);
  const raw = JSON.stringify(body);
  return raw && raw !== '{}' ? raw.slice(0, 300) : null;
}

// Health probe without side effects.
export async function erpHealth(env: ErpEnv): Promise<ErpResult> {
  try {
    const res = await fetch(`${base(env)}/api/method/frappe.utils.change_log.verify_js` , { headers: authHeaders(env) });
    const ok = res.ok || res.status === 405; // 405 still means server alive
    return { ok, status: res.status, message: ok ? 'ERPNext reachable' : `ERPNext HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, message: `ERPNext unreachable: ${e?.message}` };
  }
}

// Payment (receipt) → Sales Invoice / received payment in ERPNext books.
// cost_center + income_account are explicit so the doc validates even on a
// fresh ERP where the Item lacks defaults (values created during first-run).
export function buildInvoicePayload(payment: Record<string, any>, client: { name: string; email: string; phone?: string } | null) {
  return {
    company: 'Opus Overseas',
    customer: client?.name || 'Walk-in Customer',
    customer_email: client?.email,
    due_date: new Date().toISOString().slice(0, 10),
    currency: 'INR',
    posting_date: new Date().toISOString().slice(0, 10),
    items: [{
      item_code: 'CONSULTANCY-SV',
      qty: 1,
      rate: payment.amount / 100,
      description: payment.milestone_name || 'Service Fees',
      income_account: 'Sales - OO',
      cost_center: 'Main - OO',
    }],
    is_pos: 0,
  };
}