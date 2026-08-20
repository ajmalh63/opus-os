/**
 * Opus OS — Chatwoot AI Copilot & Real-Time Auto-Triage Engine
 * Integrates Cloudflare Workers AI into Chatwoot:
 * 1. AI Smart Reply & Counselor Private Note Copilot
 * 2. Multi-lingual Auto-Translation (Arabic, Urdu, Hindi, German <-> English)
 * 3. Automatic Division & Intent Classification (Labels & Priority)
 * 4. Executive Consultation Summarization on Conversation Resolution
 */

import { runAiModel } from './ai.js';
import { getAiGovernanceSettings } from '../lib/aiGovernance.js';
import { getDb } from '../db/client.js';

export interface ChatwootWebhookEvent {
  event: string;
  id?: number;
  content?: string;
  message_type?: 'incoming' | 'outgoing' | 'activity' | 'template';
  private?: boolean;
  conversation?: {
    id: number;
    account_id: number;
    status: string;
    labels?: string[];
    meta?: {
      sender?: {
        name?: string;
        email?: string;
        phone_number?: string;
      };
    };
    messages?: Array<{
      content: string;
      message_type: number | string;
      created_at: number | string;
      sender?: { name?: string; type?: string };
    }>;
  };
  account?: { id: number; name: string };
  sender?: { name?: string; type?: string; id?: number };
}

async function chatwootApiPost(baseUrl: string, token: string, path: string, body: any): Promise<any> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: token,
      },
      body: JSON.stringify(body),
    });
    return res.json().catch(() => ({}));
  } catch (err) {
    return { error: String(err) };
  }
}

/**
 * Evaluates an incoming Chatwoot client message with Cloudflare Workers AI
 * and posts a Smart Reply & Triage Private Note for human counselors.
 */
export async function processChatwootMessageWithAI(
  env: any,
  event: ChatwootWebhookEvent
): Promise<void> {
  try {
    const cwBase = env?.CHATWOOT_BASE_URL;
    const cwToken = env?.CHATWOOT_API_TOKEN;
    const conversationId = event.conversation?.id || (event as any)?.conversation_id || event.id;
    const accountId = event.account?.id || event.conversation?.account_id || 2;
    const clientText = (event.content || (event as any)?.message?.content || '').trim();

    if (!cwBase || !cwToken || !conversationId || !clientText) return;

    // Check if AI is enabled in governance
    let activeModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    if (env?.DB) {
      try {
        const db = getDb(env.DB);
        const settings = await getAiGovernanceSettings(db);
        if (!settings.globalEnabled) return;
        activeModel = settings.features?.sopStudio?.model || activeModel;
      } catch {
        // default model fallback
      }
    }

    const clientName = event.sender?.name || event.conversation?.meta?.sender?.name || (event as any)?.sender?.name || 'Client';

    const systemPrompt = `You are the Opus Overseas AI Staff Copilot.
Opus Overseas is a premier consultancy for:
1. Study Abroad (UK, Germany public universities, US, Canada, Australia)
2. Visa Processing & Refusal Defense (Student, Work, Tourist)
3. Umrah Pilgrimage (All-inclusive flights, Makkah/Madinah hotels, ₹500/seat advance hold)
4. Certificate Attestation (HRD, SDM, MEA Apostille, Embassy Legalisation)
5. Overseas Manpower & Placements (Gulf & Europe trades, GAMCA medicals)

Analyze the following incoming client message. Produce a concise JSON object with:
- "division": One of ["Study Abroad", "Visa Processing", "Umrah Packages", "Document Attestation", "Overseas Manpower", "General Inquiry"]
- "detectedLanguage": The language of the client's message (e.g., "English", "Arabic", "Urdu", "Hindi", "German", etc.)
- "englishTranslation": If the client message is not English, translate it to English. Otherwise null.
- "priority": "High" (ready to pay/apply/urgent) or "Normal"
- "suggestedReply": A warm, expert, concise reply written directly to the client (use the client's language if not English, otherwise English). Mention relevant Opus policy or offer to help.
- "cannedShortcuts": Suggested shortcuts to tell staff (e.g., "/studyabroad", "/uk", "/germany", "/umrah", "/umrahhold", "/attestation", "/visa")`;

    const aiResponse = await runAiModel(env, activeModel, {
      prompt: `${systemPrompt}\n\nClient Name: ${clientName}\nClient Message: "${clientText}"\n\nRespond with valid JSON only:`,
      max_tokens: 450,
      temperature: 0.2,
    });

    let rawOutput = (aiResponse as any)?.response || (aiResponse as any)?.output || '';
    if (typeof aiResponse === 'string') rawOutput = aiResponse;

    // Parse JSON
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);

    // Build markdown private note for staff
    let noteContent = `🤖 **Opus AI Counselor Copilot**\n━━━━━━━━━━━━━━━━━━━━━\n`;
    noteContent += `🎯 **Division**: \`${parsed.division || 'General'}\`\n`;
    if (parsed.detectedLanguage && parsed.detectedLanguage.toLowerCase() !== 'english') {
      noteContent += `🌐 **Language**: \`${parsed.detectedLanguage}\`\n`;
      if (parsed.englishTranslation) {
        noteContent += `📝 **English Translation**: _"${parsed.englishTranslation}"_\n`;
      }
    }
    noteContent += `⚡ **Priority**: **${parsed.priority || 'Normal'}**\n\n`;
    noteContent += `💡 **Suggested Reply Draft**:\n> ${parsed.suggestedReply}\n\n`;
    if (parsed.cannedShortcuts && parsed.cannedShortcuts.length > 0) {
      const shortcuts = Array.isArray(parsed.cannedShortcuts) ? parsed.cannedShortcuts.join(', ') : parsed.cannedShortcuts;
      noteContent += `⚡ *Quick Shortcut: ${shortcuts}*`;
    }

    // 1. Post Private Note to Chatwoot Conversation
    await chatwootApiPost(cwBase, cwToken, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      content: noteContent,
      message_type: 'outgoing',
      private: true,
    });

    // 2. Add Category Labels to Conversation
    const labelSlug = (parsed.division || 'inquiry').toLowerCase().replace(/\s+/g, '-');
    await chatwootApiPost(cwBase, cwToken, `/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`, {
      labels: [labelSlug, 'ai-copilot-assisted'],
    });
  } catch (err) {
    // Non-blocking fail-open
    console.error('Chatwoot AI Copilot error:', err);
  }
}

/**
 * When a conversation is resolved in Chatwoot, summarizes the interaction
 * and posts an Executive Summary private note.
 */
export async function summarizeResolvedConversation(
  env: any,
  event: ChatwootWebhookEvent
): Promise<void> {
  try {
    const cwBase = env?.CHATWOOT_BASE_URL || 'http://100.87.71.38:3200';
    const cwToken = env?.CHATWOOT_API_TOKEN;
    const conversationId = event.conversation?.id || event.id;
    const accountId = event.account?.id || event.conversation?.account_id || 2;

    if (!cwBase || !cwToken || !conversationId) return;

    const messages = event.conversation?.messages || [];
    if (messages.length < 2) return;

    const transcript = messages
      .map((m) => `${m.sender?.name || 'User'}: ${m.content}`)
      .slice(-10)
      .join('\n');

    const summaryRes = await runAiModel(env, '@cf/meta/llama-3.1-8b-instruct', {
      prompt: `Summarize the following customer consultation into 3 concise bullet points (Inquiry, Key Information Provided, Next Action Required):\n\n${transcript}\n\nSummary:`,
      max_tokens: 200,
    });

    const summaryText = (summaryRes as any)?.response || (summaryRes as any)?.output || String(summaryRes);

    const summaryNote = `📋 **AI Executive Consultation Summary (Resolved)**\n━━━━━━━━━━━━━━━━━━━━━\n${summaryText.trim()}`;

    await chatwootApiPost(cwBase, cwToken, `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
      content: summaryNote,
      message_type: 'outgoing',
      private: true,
    });
  } catch {
    // Fail-open
  }
}
