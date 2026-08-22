// syncHubAuth.ts — HMAC auth for Worker → SyncHub (mirrors teamHub.ts:77-82 doVerify)
import type { OpusEnv } from '../types.js';

export async function syncHubAuthHeaders(env: OpusEnv, atom: string): Promise<Record<string,string>> {
  const secret = (env as any).BETTER_AUTH_SECRET || '';
  if (!secret) throw new Error('BETTER_AUTH_SECRET missing — SyncHub HMAC fail-closed');
  const data = new TextEncoder().encode(`sync:${secret}:${atom}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return { 'X-SyncHub-Auth': hex };
}

export async function verifySyncHubAuth(env: OpusEnv, atom: string, provided: string): Promise<boolean> {
  const secret = (env as any).BETTER_AUTH_SECRET || '';
  if (!secret || !provided) return false;
  const data = new TextEncoder().encode(`sync:${secret}:${atom}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const expected = [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if (expected.length !== provided.length) return false;
  // timing-safe compare (upgrade to crypto.subtle.timingSafeEqual when available in workerd)
  let diff=0; for(let i=0;i<expected.length;i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff===0;
}

// Channel ACL — derived from handshake identity, never from wire payload
export function allowedChannelsFor(identity: { plane:'staff'|'client'|'partner', id:string, role?:string, divisions?:string[] }): Set<string> {
  const s = new Set<string>();
  if (identity.plane==='staff') {
    s.add('staff:global:alerts');
    for (const d of (identity.divisions||[])) s.add(`staff:division:${d}:pipeline`);
    s.add(`staff:division:umrah:pipeline`);
    s.add(`staff:division:visa:pipeline`);
    // staff can watch any departure inventory (cross-plane read) — narrow to viewed deps via SUBSCRIBE check
    s.add('departure:*:inventory'); // wildcard — checked via prefix match in SUBSCRIBE handler
    s.add('public:catalog:*');
  }
  if (identity.plane==='client') {
    s.add(`client:${identity.id}:bookings`);
    s.add(`client:${identity.id}:documents`);
    s.add(`client:${identity.id}:applications`);
    s.add(`client:${identity.id}:ledger`);
    s.add('departure:*:inventory'); // client may SUBSCRIBE to departures they browsed — bounded to 5
    s.add('public:catalog:*');
  }
  if (identity.plane==='partner') {
    s.add(`partner:${identity.id}:referrals`);
    s.add(`partner:${identity.id}:commissions`);
    s.add('departure:*:inventory');
    s.add('public:catalog:*');
  }
  return s;
}

export function isChannelAllowed(allowed: Set<string>, requested: string): boolean {
  if (allowed.has(requested)) return true;
  // wildcard support for departure:*:inventory and public:catalog:*
  for (const a of allowed) {
    if (a.includes('*')) {
      const re = new RegExp('^' + a.replace(/\*/g,'[^:]+') + '$');
      if (re.test(requested)) return true;
    }
  }
  return false;
}
