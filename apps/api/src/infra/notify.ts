// Notification engine (§7.6) — channel-abstraction layer over every outbound
// message. Every send is persisted to the `notifications` log for end-to-end
// tracking (status queued→sent/failed, provider, remoteId, error).
// Channels: whatsapp (OpenWA/Meta via sendWhatsApp) · email (Cloudflare Email
// Workers binding EMAIL, or log-and-ok stub when unbound) · sms (reserved) ·
// telegram (ops alerting — Uptime Kuma/n8n/OS alerts, Wave 1).

import { notifications } from '../db/schema.js';
import { sendWhatsApp, type MessagingEnv, type SendResult } from './messaging.js';

export type NotifyChannel = 'whatsapp' | 'email' | 'sms' | 'telegram';

export interface SendNotificationInput {
  channel: NotifyChannel;
  to: string;
  subject?: string;
  body: string;
  clientId?: string | null;
}

export type NotifyEnv = MessagingEnv & {
  EMAIL?: any; // Cloudflare Email Workers binding (from_email + send)
  TELEGRAM_BOT_TOKEN?: string;
  OPS_TELEGRAM_CHAT_ID?: string;
};

export type NotifyDb = { insert(table: any): any };

// Low-level per-channel senders (never throw → SendResult).
async function sendEmail(env: NotifyEnv, to: string, subject: string, body: string): Promise<SendResult> {
  if (env.EMAIL) {
    try {
      const res = await env.EMAIL.send({
        from: env.EMAIL.from_email || 'no-reply@opusoverseas.com',
        to: [to],
        subject,
        html: `<p style="font-family:sans-serif">${body.replace(/</g, '&lt;')}</p>`,
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
      result = await sendEmail(env, input.to, input.subject || 'OpusOS update', input.body);
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