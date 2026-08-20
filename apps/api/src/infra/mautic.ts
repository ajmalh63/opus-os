// Mautic Marketing Automation Client
// Synchronizes Opus OS leads, scoring events, and engagement tiers with Mautic.
// All calls are fail-open (never block user-facing requests).

export interface MauticEnv {
  MAUTIC_BASE_URL?: string;
  MAUTIC_CLIENT_ID?: string;
  MAUTIC_CLIENT_SECRET?: string;
}

export interface MauticSyncData {
  email: string;
  firstname?: string;
  phone?: string;
  points?: number;
  tags?: string[];
  division?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getMauticToken(env: MauticEnv): Promise<string | null> {
  if (!env.MAUTIC_BASE_URL || !env.MAUTIC_CLIENT_ID || !env.MAUTIC_CLIENT_SECRET) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  try {
    const params = new URLSearchParams({
      client_id: env.MAUTIC_CLIENT_ID,
      client_secret: env.MAUTIC_CLIENT_SECRET,
      grant_type: 'client_credentials',
    });
    const res = await fetch(`${env.MAUTIC_BASE_URL.replace(/\/$/, '')}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: params.toString(),
    });
    const json: any = await res.json().catch(() => null);
    if (json?.access_token) {
      cachedToken = {
        token: json.access_token,
        expiresAt: now + (json.expires_in || 3600),
      };
      return json.access_token;
    }
    return null;
  } catch (err) {
    console.error('Mautic OAuth error:', err);
    return null;
  }
}

/**
 * Synchronize lead details, points, and tags into Mautic.
 * Mautic automatically recalculates dynamic segments (Hot/Warm/Cold) based on points.
 */
export async function mauticSyncContact(
  env: MauticEnv,
  data: MauticSyncData
): Promise<{ ok: boolean; id?: number; reason?: string }> {
  if (!env.MAUTIC_BASE_URL) return { ok: true, reason: 'unconfigured' };
  const token = await getMauticToken(env);
  if (!token) return { ok: false, reason: 'auth_failed' };

  try {
    const baseUrl = env.MAUTIC_BASE_URL.replace(/\/$/, '');
    const payload: Record<string, any> = {
      email: data.email.toLowerCase(),
      firstname: data.firstname || undefined,
      phone: data.phone || undefined,
    };
    if (typeof data.points === 'number') {
      payload.points = data.points;
    }
    if (data.tags && data.tags.length > 0) {
      payload.tags = data.tags.join(',');
    }

    // Mautic contacts/new with email is an upsert
    const res = await fetch(`${baseUrl}/api/contacts/new`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json: any = await res.json().catch(() => null);
    return {
      ok: res.ok,
      id: json?.contact?.id,
      reason: res.ok ? undefined : json?.errors?.[0]?.message || `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return { ok: false, reason: err?.message };
  }
}

/**
 * Add / subtract points on a lead when an engagement event occurs.
 */
export async function mauticAddPoints(
  env: MauticEnv,
  contactId: number,
  delta: number
): Promise<{ ok: boolean; reason?: string }> {
  if (!env.MAUTIC_BASE_URL) return { ok: true, reason: 'unconfigured' };
  const token = await getMauticToken(env);
  if (!token) return { ok: false, reason: 'auth_failed' };

  try {
    const baseUrl = env.MAUTIC_BASE_URL.replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/api/contacts/${contactId}/points/plus/${delta}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    return { ok: res.ok };
  } catch (err: any) {
    return { ok: false, reason: err?.message };
  }
}
