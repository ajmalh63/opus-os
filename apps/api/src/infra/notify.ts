// Notification engine (§7.6) — channel-abstraction layer over every outbound
// message. Every send is persisted to the `notifications` log for end-to-end
// tracking (status queued→sent/failed, provider, remoteId, error).
// Channels: whatsapp (OpenWA/Meta via sendWhatsApp) · email (Cloudflare Email
// Workers binding EMAIL, or log-and-ok stub when unbound) · sms (reserved) ·
// telegram (ops alerting — Uptime Kuma/n8n/OS alerts, Wave 1).

import { notifications } from '../db/schema.js';
import { sendWhatsApp, type MessagingEnv, type SendResult } from './messaging.js';
import { listmonkSendTransactional, listmonkUpsertSubscriber, type ListmonkEnv } from './listmonk.js';

export type NotifyChannel = 'whatsapp' | 'email' | 'sms' | 'telegram';

export interface SendNotificationInput {
  channel: NotifyChannel;
  to: string;
  subject?: string;
  body: string;
  clientId?: string | null;
  // Optional Listmonk per-kind template routing. When set, Listmonk renders
  // that template with `data` scalars (Name, VerifyUrl, …) instead of
  // interpolating a pre-rendered Body. This avoids Go html/template escaping
  // of HTML bodies (no raw function exists in this Listmonk build).
  templateId?: number;
  data?: Record<string, any>;
}

export type NotifyEnv = MessagingEnv & ListmonkEnv & {
  EMAIL?: any; // Cloudflare Email Workers binding (legacy fallback)
  TELEGRAM_BOT_TOKEN?: string;
  OPS_TELEGRAM_CHAT_ID?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

export type NotifyDb = { insert(table: any): any };

// Resend HTTP API fallback (port 25 independent — Cloudflare Worker → https://api.resend.com → Gmail)
async function sendResend(env: NotifyEnv, to: string, subject: string, html: string): Promise<SendResult | null> {
  if (!env.RESEND_API_KEY) return null;
  try {
    const from = env.RESEND_FROM_EMAIL || 'Opus Overseas <info@opusoverseas.com>';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, provider: 'resend', remoteId: json?.id };
    return { ok: false, provider: 'resend', reason: json?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, provider: 'resend', reason: e?.message };
  }
}

// Low-level per-channel senders (never throw → SendResult).
async function sendEmail(
  env: NotifyEnv,
  to: string,
  subject: string,
  body: string,
  opts: { templateId?: number; data?: Record<string, any> } = {}
): Promise<SendResult> {
  console.log(`[sendEmail] Target: ${to}, BaseURL: ${env.LISTMONK_BASE_URL || 'NONE'}`);
  // Wave 1: Listmonk is the email engine when configured (owns DKIM/bounce).
  if (env.LISTMONK_BASE_URL) {
    const mk = await listmonkUpsertSubscriber(env, to, { name: '', channel: 'os-email' });
    console.log(`[sendEmail] listmonkUpsertSubscriber result:`, JSON.stringify(mk));
    let htmlContent: string;
    if (body.trim().startsWith('<')) {
      htmlContent = body;
    } else {
      const safe = body.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(https?:\/\/[^\s<"'>]+)/g, (u) => `<a href="${u}" style="color:#d7a019;font-weight:bold;text-decoration:underline;">${u}</a>`);
      htmlContent = `<p style="margin:0 0 16px 0;font-size:15px;color:#4a5568;line-height:1.6;">${safe}</p>`;
    }
    const txOpts = opts.templateId != null ? { templateId: opts.templateId } : {};
    const res = await listmonkSendTransactional(env, to, subject, htmlContent, opts.data || {}, txOpts);
    console.log(`[sendEmail] listmonkSendTransactional result:`, JSON.stringify(res));
    if (res.ok) return { ok: true, provider: 'listmonk', remoteId: res.id != null ? String(res.id) : undefined };
    // Fallback to Resend HTTP (bypasses Oracle port 25 block entirely — edge → api.resend.com:443)
    const fallback = await sendResend(env, to, subject, htmlContent);
    if (fallback) {
      console.log(`[sendEmail] Resend fallback result:`, JSON.stringify(fallback));
      if (fallback.ok) return fallback;
      return { ok: false, provider: 'listmonk+resend', reason: `Listmonk: ${res.reason} | Resend: ${fallback.reason}` };
    }
    return { ok: false, provider: 'listmonk', reason: res.reason || (mk.ok ? undefined : 'subscriber+send failed') };
  }
  // No Listmonk → try Resend direct (port-25-free)
  const directResend = await sendResend(env, to, subject, body.trim().startsWith('<') ? body : `<p>${body}</p>`);
  if (directResend) return directResend;
  if (env.EMAIL) {
    try {
      const isHtml = body.trim().startsWith('<');
      const htmlContent = isHtml
        ? body
        : `<p style="margin:0 0 16px 0;font-family:'IBM Plex Sans',-apple-system,sans-serif;font-size:15px;color:#4a5568;line-height:1.6;">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/(https?:\/\/[^\s<"'>]+)/g, (u) => `<a href="${u}" style="color:#d7a019;font-weight:bold;text-decoration:underline;">${u}</a>`)}</p>`;
      const res = await env.EMAIL.send({
        from: env.EMAIL.from_email || 'no-reply@opusoverseas.com',
        to: [to],
        subject,
        html: htmlContent,
      });
      return { ok: true, provider: 'cf-email-workers', remoteId: String(res?.MessageId || res?.Status || '') };
    } catch (e: any) {
      return { ok: false, provider: 'cf-email-workers', reason: e?.message };
    }
  }
  // Unbound in dev/test: "delivered" stub (§7.6 fallback).
  return { ok: true, provider: 'stub-email' };
}

// Telegram ops-alert channel (Wave 1): Bot API sendMessage; chat id from env.
// Unconfigured → stub-ok so alerting never breaks the calling flow.
async function sendTelegram(env: NotifyEnv, body: string): Promise<SendResult> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.OPS_TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: true, provider: 'stub-telegram' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId), text: body.slice(0, 3800), disable_web_page_preview: true }),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.ok !== true) {
      return { ok: false, provider: 'telegram', reason: json?.description || `HTTP ${res.status}` };
    }
    return { ok: true, provider: 'telegram', remoteId: String(json?.result?.message_id || '') };
  } catch (e: any) {
    return { ok: false, provider: 'telegram', reason: e?.message };
  }
}

async function sendSms(_env: NotifyEnv, _to: string, _body: string): Promise<SendResult> {
  // §7.6: SMS adapter reserved (MSG91 default + TRAI DLT). Not yet provisioned.
  return { ok: false, provider: 'sms-unprovisioned', reason: 'SMS adapter not configured (§7.6 pending)' };
}

// Unified entry: routes to the right provider, logs every attempt.
export async function sendNotification(env: NotifyEnv, db: NotifyDb, input: SendNotificationInput): Promise<SendResult & { notificationId: string }> {
  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  let result: SendResult;
  switch (input.channel) {
    case 'whatsapp':
      result = await sendWhatsApp(env, input.to, input.body);
      break;
    case 'email':
      result = await sendEmail(env, input.to, input.subject || 'OpusOS update', input.body, { templateId: input.templateId, data: input.data });
      break;
    case 'sms':
      result = await sendSms(env, input.to, input.body);
      break;
    case 'telegram':
      result = await sendTelegram(env, input.body);
      break;
    default:
      result = { ok: false, provider: 'unknown', reason: 'Unknown channel' };
  }

  // Persist the log row (fail-open: never break the send flow on write failure).
  try {
    await db.insert(notifications).values({
      id, channel: input.channel, to: input.to,
      subject: input.subject ?? null, body: input.body,
      status: result.ok ? 'sent' : 'failed',
      provider: result.provider ?? null,
      remoteId: result.remoteId ?? null,
      error: !result.ok ? (result.reason ?? null) : null,
      clientId: input.clientId ?? null,
      createdAt: now,
      sentAt: result.ok ? now : null,
    }).run();
  } catch (e: any) {
    console.error('notification log insert failed', e?.message);
  }

  return { notificationId: id, ...result };
}