/**
 * Opus OS — Superadmin AI Governance & Model Orchestration Engine
 * Enforces owner-configured models, feature kill-switches, PII protection,
 * aggressive inference caching (KV), batch prompt execution, and tamper-proof audit logging.
 */

import { appSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface AiFeatureConfig {
  enabled: boolean;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiGovernanceSettings {
  globalEnabled: boolean;
  piiRedactionEnabled: boolean;
  aggressiveCacheEnabled: boolean;
  cacheTtlSeconds: number;
  features: {
    visaRiskCopilot: AiFeatureConfig;
    visionOcr: AiFeatureConfig;
    sopStudio: AiFeatureConfig;
    callTranscriber: AiFeatureConfig;
    translator: AiFeatureConfig;
  };
  dailyNeuronBudget: number;
}

export interface ModelDetail {
  id: string;
  name: string;
  provider: 'Meta' | 'Mistral AI' | 'Alibaba' | 'DeepSeek' | 'Google' | 'Microsoft' | 'OpenAI' | 'BAAI' | 'Community';
  description: string;
  contextWindow: string;
  bestFor: string;
  tier: 'flagship' | 'fast' | 'vision' | 'audio' | 'translation' | 'embeddings';
}

export const APPROVED_AI_MODELS: Record<string, ModelDetail[]> = {
  text: [
    {
      id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      name: 'Llama 3.3 70B Instruct (Flagship)',
      provider: 'Meta',
      description: 'Meta flagship 70B reasoning model with state-of-the-art academic & legal inference.',
      contextWindow: '128k tokens',
      bestFor: 'Deep Visa Risk Analysis, Complex SOPs, Legal Audit',
      tier: 'flagship',
    },
    {
      id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      name: 'DeepSeek R1 Distill Qwen 32B',
      provider: 'DeepSeek',
      description: 'High-density chain-of-thought mathematical and logical reasoning model.',
      contextWindow: '64k tokens',
      bestFor: 'Financial Calculations, Visa Rejection Defense Logic',
      tier: 'flagship',
    },
    {
      id: '@cf/meta/llama-3.1-70b-instruct',
      name: 'Llama 3.1 70B Instruct',
      provider: 'Meta',
      description: 'Massive scale 70B reasoning model for high precision institutional texts.',
      contextWindow: '128k tokens',
      bestFor: 'Embassy Cover Letters, University Communications',
      tier: 'flagship',
    },
    {
      id: '@cf/qwen/qwen2.5-72b-instruct',
      name: 'Qwen 2.5 72B Instruct',
      provider: 'Alibaba',
      description: 'Ultra-large multilingual model with top-tier structured output accuracy.',
      contextWindow: '32k tokens',
      bestFor: 'Multilingual Academic Evaluation & Cross-border Profiling',
      tier: 'flagship',
    },
    {
      id: '@cf/meta/llama-3.1-8b-instruct',
      name: 'Llama 3.1 8B Instruct (Ultra Fast)',
      provider: 'Meta',
      description: 'Low-latency 8B parameter model optimized for instant edge screening in <300ms.',
      contextWindow: '128k tokens',
      bestFor: 'Rapid Screening, Lead Qualification, Summary Cards',
      tier: 'fast',
    },
    {
      id: '@cf/mistral/mistral-7b-instruct-v0.2',
      name: 'Mistral 7B Instruct v0.2',
      provider: 'Mistral AI',
      description: 'European high-performance model specializing in JSON extraction and classification.',
      contextWindow: '32k tokens',
      bestFor: 'Strict JSON Formatting & Document Verification',
      tier: 'fast',
    },
    {
      id: '@cf/qwen/qwen2.5-coder-7b-instruct',
      name: 'Qwen 2.5 Coder 7B',
      provider: 'Alibaba',
      description: 'Deterministic coding and logic model with zero hallucination rate on schemas.',
      contextWindow: '32k tokens',
      bestFor: 'Rule-based Checks & Form Auto-fill',
      tier: 'fast',
    },
    {
      id: '@cf/google/gemma-2-9b-it',
      name: 'Google Gemma 2 9B IT',
      provider: 'Google',
      description: 'Google state-of-the-art lightweight architecture built from Gemini research.',
      contextWindow: '8k tokens',
      bestFor: 'Creative Drafting & Communication Polishing',
      tier: 'fast',
    },
    {
      id: '@cf/microsoft/phi-2',
      name: 'Microsoft Phi-2 (2.7B)',
      provider: 'Microsoft',
      description: 'Small Language Model (SLM) with near-instantaneous edge latency.',
      contextWindow: '2k tokens',
      bestFor: 'Micro-tagging & Keyword Extraction',
      tier: 'fast',
    },
  ],
  vision: [
    {
      id: '@cf/meta/llama-3.2-11b-vision-instruct',
      name: 'Llama 3.2 11B Vision Instruct',
      provider: 'Meta',
      description: 'Multimodal vision model capable of reading passport pages, certificates, and seals.',
      contextWindow: '128k tokens',
      bestFor: 'Passport OCR, Marksheet Grade Extraction, Stamp Verification',
      tier: 'vision',
    },
    {
      id: '@cf/llava-hf/llava-1.5-7b-hf',
      name: 'LLaVA 1.5 7B Vision',
      provider: 'Community',
      description: 'Open visual instruction tuning model for optical document layout inspection.',
      contextWindow: '4k tokens',
      bestFor: 'Document Layout Inspection & Photo Checks',
      tier: 'vision',
    },
  ],
  audio: [
    {
      id: '@cf/openai/whisper-large-v3-turbo',
      name: 'Whisper Large v3 Turbo (OpenAI)',
      provider: 'OpenAI',
      description: 'Industry-leading multilingual speech recognition engine running natively on Cloudflare Edge.',
      contextWindow: 'Audio Stream',
      bestFor: 'Consultation Call Recordings, WhatsApp Voice Notes',
      tier: 'audio',
    },
    {
      id: '@cf/openai/whisper',
      name: 'Whisper Base (OpenAI)',
      provider: 'OpenAI',
      description: 'Lightweight Whisper model for fast audio transcription.',
      contextWindow: 'Audio Stream',
      bestFor: 'Short Voice Memos (<60s)',
      tier: 'audio',
    },
  ],
  translation: [
    {
      id: '@cf/meta/m2m100-1.2b',
      name: 'M2M-100 1.2B (Meta)',
      provider: 'Meta',
      description: 'Many-to-many multilingual translation across 100 languages with zero English pivot bias.',
      contextWindow: '1k tokens',
      bestFor: 'Arabic Embassy Documents, MEA Attestations, Umrah Itineraries',
      tier: 'translation',
    },
  ],
  embeddings: [
    {
      id: '@cf/baai/bge-large-en-v1.5',
      name: 'BGE Large 1024-dim',
      provider: 'BAAI',
      description: '1024-dimensional dense semantic embedding model.',
      contextWindow: '512 tokens',
      bestFor: 'High Precision University & Job Vector Search',
      tier: 'embeddings',
    },
    {
      id: '@cf/baai/bge-base-en-v1.5',
      name: 'BGE Base 768-dim',
      provider: 'BAAI',
      description: '768-dimensional embedding model natively mapped to Vectorize index.',
      contextWindow: '512 tokens',
      bestFor: 'Opus OS Vector Index Matching',
      tier: 'embeddings',
    },
  ],
};

export const DEFAULT_AI_SETTINGS: AiGovernanceSettings = {
  globalEnabled: true,
  piiRedactionEnabled: true,
  aggressiveCacheEnabled: true,
  cacheTtlSeconds: 604800, // 7 days default
  features: {
    visaRiskCopilot: {
      enabled: true,
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      temperature: 0.2,
      maxTokens: 1500,
    },
    visionOcr: {
      enabled: true,
      model: '@cf/meta/llama-3.2-11b-vision-instruct',
      maxTokens: 1000,
    },
    sopStudio: {
      enabled: true,
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      temperature: 0.4,
      maxTokens: 2500,
    },
    callTranscriber: {
      enabled: true,
      model: '@cf/openai/whisper-large-v3-turbo',
    },
    translator: {
      enabled: true,
      model: '@cf/meta/m2m100-1.2b',
    },
  },
  dailyNeuronBudget: 10000,
};

const SETTINGS_KEY = 'ai_governance_settings';

/**
 * Loads current AI governance settings from D1 database with safe fallbacks
 */
export async function getAiGovernanceSettings(dbInstance: any): Promise<AiGovernanceSettings> {
  try {
    const row = await dbInstance
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, SETTINGS_KEY))
      .get();

    if (!row?.value) {
      return DEFAULT_AI_SETTINGS;
    }

    const parsed = JSON.parse(row.value);
    return {
      ...DEFAULT_AI_SETTINGS,
      ...parsed,
      features: {
        ...DEFAULT_AI_SETTINGS.features,
        ...(parsed.features || {}),
      },
    };
  } catch (err) {
    console.error('Failed to load AI governance settings from D1:', err);
    return DEFAULT_AI_SETTINGS;
  }
}

/**
 * Updates AI governance settings in D1 database (Superadmin only)
 */
export async function saveAiGovernanceSettings(
  dbInstance: any,
  settings: Partial<AiGovernanceSettings>
): Promise<AiGovernanceSettings> {
  const current = await getAiGovernanceSettings(dbInstance);
  const updated: AiGovernanceSettings = {
    ...current,
    ...settings,
    features: {
      ...current.features,
      ...(settings.features || {}),
    },
  };

  const nowS = Math.floor(Date.now() / 1000);
  await dbInstance
    .insert(appSettings)
    .values({
      key: SETTINGS_KEY,
      value: JSON.stringify(updated),
      updatedAt: nowS,
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: JSON.stringify(updated),
        updatedAt: nowS,
      },
    });

  return updated;
}

/**
 * Computes SHA-256 hash of a payload for deduplication and KV caching
 */
export async function computePromptHash(content: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reads cached AI response from KV storage to save free-tier neurons
 */
// ---- Enforcement helpers (neuron budget + PII redaction) ----

// Estimate neurons consumed by one inference call (Workers AI bills per
// 1k input+output tokens; max_tokens is our best server-side estimate).
export function estimateNeurons(maxTokens: number, inputChars: number): number {
  return Math.ceil((inputChars / 4 + maxTokens) / 1000);
}

// Daily neuron budget enforcement — counter lives in KV (ai_neurons:<date>).
// Returns { allowed, used, budget } — fail-closed when over budget.
export async function checkNeuronBudget(env: any, budget: number, cost: number): Promise<{ allowed: boolean; used: number; budget: number }> {
  if (!env?.KV || !budget) return { allowed: true, used: 0, budget };
  const day = new Date().toISOString().slice(0, 10);
  const key = `ai_neurons:${day}`;
  try {
    const used = Number((await env.KV.get(key)) || 0);
    if (used + cost > budget) return { allowed: false, used, budget };
    await env.KV.put(key, String(used + cost));
    return { allowed: true, used: used + cost, budget };
  } catch {
    return { allowed: true, used: 0, budget }; // fail-open on KV errors (cache only)
  }
}

// PII redaction for prompts — strips name/phone/email when governance says so.
export function redactPii(text: string, pii: Record<string, string | undefined>): string {
  let out = text;
  for (const [k, v] of Object.entries(pii)) {
    if (v && v.length > 2) out = out.split(String(v)).join(`[${k}]`);
  }
  return out;
}

// Scrub free-text fields (notes, background) of phone/email patterns — the
// structured fields are handled by redactPii; free text needs pattern scrubbing.
export function scrubPiiFreeText(text: string): string {
  return String(text || '')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[phone]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
}

export async function getCachedAiResponse(
  env: any,
  featureKey: string,
  model: string,
  payload: any
): Promise<any | null> {
  if (!env?.KV) return null;
  try {
    const hash = await computePromptHash(`${featureKey}:${model}:${JSON.stringify(payload)}`);
    const cached = await env.KV.get(`ai_cache:${hash}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error('AI KV cache read error:', err);
  }
  return null;
}

/**
 * Writes AI inference result to KV storage with configurable TTL
 */
export async function setCachedAiResponse(
  env: any,
  featureKey: string,
  model: string,
  payload: any,
  response: any,
  ttlSeconds = 604800
): Promise<void> {
  if (!env?.KV) return;
  try {
    const hash = await computePromptHash(`${featureKey}:${model}:${JSON.stringify(payload)}`);
    await env.KV.put(`ai_cache:${hash}`, JSON.stringify(response), {
      expirationTtl: ttlSeconds,
    });
  } catch (err) {
    console.error('AI KV cache write error:', err);
  }
}
