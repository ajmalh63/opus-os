// Chatwoot & OpenWA Bi-Directional Bridge (Tool-First Architecture)
// Chatwoot acts as the Conversational Brain (recording timeline, contact state, counselor handoff)
// OpenWA acts as the Headless WhatsApp Delivery Engine.

import { sendWhatsApp, MessagingEnv } from './messaging.js';
import { WhatsAppTemplateKey, renderWhatsAppMessage } from './whatsappTemplates.js';

export interface DispatchWhatsAppOptions {
  phone: string;
  name?: string;
  email?: string;
  templateKey?: WhatsAppTemplateKey;
  variables?: Record<string, any>;
  customText?: string;
  division?: string;
  tags?: string[];
}

export interface DispatchWhatsAppResult {
  ok: boolean;
  messageId?: string;
  chatwootContactId?: number;
  chatwootConversationId?: number;
  error?: string;
}

export type ChatwootEnv = MessagingEnv & {
  CHATWOOT_BASE_URL?: string;       // e.g. http://100.87.71.38:3000
  CHATWOOT_API_TOKEN?: string;      // User / Agent Bot Token
  CHATWOOT_ACCOUNT_ID?: string;     // Default '1'
  CHATWOOT_INBOX_ID?: string;       // Default '1' (WhatsApp Inbox)
};

async function chatwootPost(base: string, token: string, path: string, body: any): Promise<any> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': token,
    },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
}

export async function dispatchUnifiedWhatsApp(
  env: ChatwootEnv,
  opts: DispatchWhatsAppOptions
): Promise<DispatchWhatsAppResult> {
  const messageText = opts.customText || (opts.templateKey ? renderWhatsAppMessage(opts.templateKey, opts.variables || {}) : '');
  if (!messageText || !opts.phone) {
    return { ok: false, error: 'Phone number and message content required.' };
  }

  const cleanPhone = opts.phone.replace(/[^\d+]/g, '');
  let chatwootContactId: number | undefined;
  let chatwootConversationId: number | undefined;

  // 1. Brain Layer: Record in Chatwoot Timeline (Fail-open)
  const cwBase = env.CHATWOOT_BASE_URL;
  const cwToken = env.CHATWOOT_API_TOKEN;
  const accountId = env.CHATWOOT_ACCOUNT_ID || '1';
  const inboxId = env.CHATWOOT_INBOX_ID || '1';

  if (cwBase && cwToken) {
    try {
      // Upsert contact in Chatwoot
      const contactRes = await chatwootPost(cwBase, cwToken, `/api/v1/accounts/${accountId}/contacts`, {
        name: opts.name || 'WhatsApp Client',
        phone_number: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`,
        email: opts.email || undefined,
        custom_attributes: {
          division: opts.division || 'general',
          lead_source: 'opus_os',
        },
      });
      chatwootContactId = contactRes?.payload?.contact?.id || contactRes?.id;

      // Find or create conversation in WhatsApp inbox
      if (chatwootContactId) {
        const convRes = await chatwootPost(cwBase, cwToken, `/api/v1/accounts/${accountId}/conversations`, {
          source_id: cleanPhone,
          inbox_id: parseInt(inboxId),
          contact_id: chatwootContactId,
          additional_attributes: {
            division: opts.division || 'general',
            template_sent: opts.templateKey || 'custom',
          },
        });
        chatwootConversationId = convRes?.id || convRes?.payload?.id;

        // Post outgoing message to Chatwoot conversation (marked as outgoing)
        if (chatwootConversationId) {
          await chatwootPost(cwBase, cwToken, `/api/v1/accounts/${accountId}/conversations/${chatwootConversationId}/messages`, {
            content: messageText,
            message_type: 'outgoing',
            private: false,
          });

          // Tag conversation
          if (opts.tags && opts.tags.length > 0) {
            await chatwootPost(cwBase, cwToken, `/api/v1/accounts/${accountId}/conversations/${chatwootConversationId}/labels`, {
              labels: opts.tags,
            }).catch(() => {});
          }
        }
      }
    } catch {
      // Chatwoot failure is non-blocking — proceed to delivery engine
    }
  }

  // 2. Delivery Engine: Dispatch via OpenWA Gateway
  const sendRes = await sendWhatsApp(env, cleanPhone, messageText);

  return {
    ok: sendRes.ok,
    messageId: sendRes.remoteId,
    chatwootContactId,
    chatwootConversationId,
    error: sendRes.ok ? undefined : sendRes.reason,
  };
}
