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
  provider: 'Meta' | 'Mistral AI' | 'Alibaba' | 'DeepSeek' | 'Google' | 'Microsoft' | 'OpenAI' | 'BAAI' | 'Stability AI' | 'Black Forest Labs' | 'ByteDance' | 'Community';
  description: string;
  contextWindow: string;
  bestFor: string;
  tier: 'flagship' | 'fast' | 'slm' | 'coder' | 'vision' | 'imageGen' | 'audio' | 'translation' | 'embeddings';
}

export const APPROVED_AI_MODELS: Record<string, ModelDetail[]> = {
  text: [
    // ── Flagship Reasoning & Large Models (30B - 72B) ──
    {
      id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      name: 'Llama 3.3 70B Instruct FP8 Fast',
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
      id: '@cf/qwen/qwq-32b-preview',
      name: 'Qwen QwQ 32B Reasoning Preview',
      provider: 'Alibaba',
      description: 'Advanced reasoning model with deep self-reflection for analytical tasks.',
      contextWindow: '32k tokens',
      bestFor: 'Complex Rule Engines & Eligibility Reasoning',
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
      id: '@cf/meta/llama-3.1-70b-instruct',
      name: 'Llama 3.1 70B Instruct',
      provider: 'Meta',
      description: 'Massive scale 70B reasoning model for high precision institutional texts.',
      contextWindow: '128k tokens',
      bestFor: 'Embassy Cover Letters, University Communications',
      tier: 'flagship',
    },
    {
      id: '@cf/meta/llama-3-70b-instruct',
      name: 'Llama 3 70B Instruct',
      provider: 'Meta',
      description: 'First generation Llama 3 70B parameter general reasoning model.',
      contextWindow: '8k tokens',
      bestFor: 'General Purpose Comprehensive Inferences',
      tier: 'flagship',
    },
    {
      id: '@cf/google/gemma-2-27b-it',
      name: 'Google Gemma 2 27B IT',
      provider: 'Google',
      description: 'High-parameter Google open model with exceptional knowledge density.',
      contextWindow: '8k tokens',
      bestFor: 'Academic Essay Polishing & High-standard Writing',
      tier: 'flagship',
    },

    // ── Fast & High-Throughput Models (7B - 14B) ──
    {
      id: '@cf/meta/llama-3.1-8b-instruct',
      name: 'Llama 3.1 8B Instruct',
      provider: 'Meta',
      description: 'Low-latency 8B parameter model optimized for instant edge screening in <300ms.',
      contextWindow: '128k tokens',
      bestFor: 'Rapid Screening, Lead Qualification, Summary Cards',
      tier: 'fast',
    },
    {
      id: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
      name: 'Llama 3.1 8B Instruct FP8 Fast',
      provider: 'Meta',
      description: 'FP8 accelerated quantization of Llama 3.1 8B with ultra-high token throughput.',
      contextWindow: '128k tokens',
      bestFor: 'Real-time Chat Streams & Fast Form Autocomplete',
      tier: 'fast',
    },
    {
      id: '@cf/meta/llama-3-8b-instruct',
      name: 'Llama 3 8B Instruct',
      provider: 'Meta',
      description: 'Standard 8B instruction tuned foundation model.',
      contextWindow: '8k tokens',
      bestFor: 'General Lead Intake & Profile Scrubbing',
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
      id: '@cf/mistral/mistral-7b-instruct-v0.1',
      name: 'Mistral 7B Instruct v0.1',
      provider: 'Mistral AI',
      description: 'Original Mistral 7B base instruction model.',
      contextWindow: '8k tokens',
      bestFor: 'General Text Classification',
      tier: 'fast',
    },
    {
      id: '@cf/qwen/qwen2.5-14b-instruct',
      name: 'Qwen 2.5 14B Instruct',
      provider: 'Alibaba',
      description: 'Balanced 14B model offering 70B-grade logic with 8B-tier speed.',
      contextWindow: '32k tokens',
      bestFor: 'Country Comparison & Course Alignment',
      tier: 'fast',
    },
    {
      id: '@cf/qwen/qwen2.5-7b-instruct',
      name: 'Qwen 2.5 7B Instruct',
      provider: 'Alibaba',
      description: 'Fast 7B multilingual instruction model.',
      contextWindow: '32k tokens',
      bestFor: 'Profile Intake & Intake Context Parsing',
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
      id: '@cf/google/gemma-7b-it',
      name: 'Google Gemma 7B IT',
      provider: 'Google',
      description: 'First generation 7B Gemma instruction model.',
      contextWindow: '8k tokens',
      bestFor: 'Text Summarization & Formatting',
      tier: 'fast',
    },
    {
      id: '@cf/openchat/openchat-3.5-0106',
      name: 'OpenChat 3.5 7B',
      provider: 'Community',
      description: 'Community fine-tuned 7B conversational model.',
      contextWindow: '8k tokens',
      bestFor: 'Casual Client Q&A & WhatsApp Auto-reply',
      tier: 'fast',
    },
    {
      id: '@cf/tiiuae/falcon-7b-instruct',
      name: 'Falcon 7B Instruct',
      provider: 'Community',
      description: 'TII UAE open model trained on RefinedWeb.',
      contextWindow: '2k tokens',
      bestFor: 'Middle East & Gulf Context General Chat',
      tier: 'fast',
    },

    // ── Small & Edge Language Models (SLMs < 4B) ──
    {
      id: '@cf/meta/llama-3.2-3b-instruct',
      name: 'Llama 3.2 3B Instruct',
      provider: 'Meta',
      description: 'Compact 3B parameter model with remarkable reasoning-to-size ratio.',
      contextWindow: '128k tokens',
      bestFor: 'Edge Screening, Instant Auto-tagging, Sub-second Classifiers',
      tier: 'slm',
    },
    {
      id: '@cf/meta/llama-3.2-1b-instruct',
      name: 'Llama 3.2 1B Instruct',
      provider: 'Meta',
      description: 'Sub-1B parameter ultra-light model executing in <80ms at Cloudflare edge.',
      contextWindow: '128k tokens',
      bestFor: 'Micro-tasks, Lead Entity Extraction, Intent Detection',
      tier: 'slm',
    },
    {
      id: '@cf/google/gemma-2-2b-it',
      name: 'Google Gemma 2 2B IT',
      provider: 'Google',
      description: 'Google 2B parameter compact model.',
      contextWindow: '8k tokens',
      bestFor: 'Mobile & Fast Edge Response Generation',
      tier: 'slm',
    },
    {
      id: '@cf/qwen/qwen2.5-3b-instruct',
      name: 'Qwen 2.5 3B Instruct',
      provider: 'Alibaba',
      description: 'Alibaba 3B high density multilingual model.',
      contextWindow: '32k tokens',
      bestFor: 'Fast Foreign Language Field Parsing',
      tier: 'slm',
    },
    {
      id: '@cf/qwen/qwen2.5-1.5b-instruct',
      name: 'Qwen 2.5 1.5B Instruct',
      provider: 'Alibaba',
      description: '1.5B ultra-compact parser.',
      contextWindow: '32k tokens',
      bestFor: 'Address & Name Normalization',
      tier: 'slm',
    },
    {
      id: '@cf/qwen/qwen2.5-0.5b-instruct',
      name: 'Qwen 2.5 0.5B Instruct',
      provider: 'Alibaba',
      description: 'Smallest 500M parameter model for sub-50ms token extraction.',
      contextWindow: '32k tokens',
      bestFor: 'Pincode & Tracking Number Extraction',
      tier: 'slm',
    },
    {
      id: '@cf/microsoft/phi-2',
      name: 'Microsoft Phi-2 (2.7B)',
      provider: 'Microsoft',
      description: 'Small Language Model (SLM) with high synthetic textbook training.',
      contextWindow: '2k tokens',
      bestFor: 'Micro-tagging & Keyword Extraction',
      tier: 'slm',
    },
    {
      id: '@cf/tinyllama/tinyllama-1.1b-chat-v1.0',
      name: 'TinyLlama 1.1B Chat',
      provider: 'Community',
      description: '1.1B model pre-trained on 3 trillion tokens.',
      contextWindow: '2k tokens',
      bestFor: 'Basic Keyword Disambiguation',
      tier: 'slm',
    },

    // ── Code & Deterministic Form Generation ──
    {
      id: '@cf/qwen/qwen2.5-coder-7b-instruct',
      name: 'Qwen 2.5 Coder 7B',
      provider: 'Alibaba',
      description: 'Deterministic coding and logic model with zero hallucination rate on schemas.',
      contextWindow: '32k tokens',
      bestFor: 'Rule-based Checks, Form Auto-fill & JSON Schemas',
      tier: 'coder',
    },
    {
      id: '@cf/qwen/qwen2.5-coder-32b-instruct',
      name: 'Qwen 2.5 Coder 32B',
      provider: 'Alibaba',
      description: 'Flagship 32B code and structured reasoning model.',
      contextWindow: '32k tokens',
      bestFor: 'Complex Multi-step JSON Schema Generation',
      tier: 'coder',
    },
    {
      id: '@cf/deepseek-ai/deepseek-coder-6.7b-instruct',
      name: 'DeepSeek Coder 6.7B Instruct',
      provider: 'DeepSeek',
      description: 'Code-specialized model with high logical precision.',
      contextWindow: '16k tokens',
      bestFor: 'Database Mapping & Migration Verification',
      tier: 'coder',
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
      id: '@cf/meta/llama-3.2-90b-vision-instruct',
      name: 'Llama 3.2 90B Vision Instruct',
      provider: 'Meta',
      description: 'Ultra-large 90B multimodal vision model with state-of-the-art visual comprehension.',
      contextWindow: '128k tokens',
      bestFor: 'Complex Multipage Transcripts, High-density Apostille Chains',
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
    {
      id: '@cf/unum/uform-gen2-qwen-500m',
      name: 'uForm Gen2 Qwen 500M',
      provider: 'Community',
      description: 'Compact 500M multimodal model for rapid image classification.',
      contextWindow: '2k tokens',
      bestFor: 'Document Type Verification (Passport vs Degree vs ID)',
      tier: 'vision',
    },
  ],
  imageGen: [
    {
      id: '@cf/black-forest-labs/flux-1-schnell',
      name: 'FLUX.1 Schnell (Black Forest Labs)',
      provider: 'Black Forest Labs',
      description: '12B parameter rectified flow transformer for ultra-high fidelity image generation in 1-4 steps.',
      contextWindow: 'Image Generation',
      bestFor: 'Marketing Creatives, Campaign Banners, Hero Visuals',
      tier: 'imageGen',
    },
    {
      id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      name: 'Stable Diffusion XL Base 1.0',
      provider: 'Stability AI',
      description: 'High-resolution latent diffusion model for photorealistic assets.',
      contextWindow: 'Image Generation',
      bestFor: 'Event Postcards, Social Media Campaign Graphics',
      tier: 'imageGen',
    },
    {
      id: '@cf/stabilityai/stable-diffusion-xl-lightning',
      name: 'SDXL Lightning (Stability AI)',
      provider: 'Stability AI',
      description: 'Fast distilled diffusion model generating 1024x1024 images in under 1 second.',
      contextWindow: 'Image Generation',
      bestFor: 'Real-time Campaign Asset Prototyping',
      tier: 'imageGen',
    },
    {
      id: '@cf/bytedance/stable-diffusion-xl-lightning',
      name: 'ByteDance SDXL Lightning',
      provider: 'ByteDance',
      description: 'ByteDance optimized SDXL model for instant asset generation.',
      contextWindow: 'Image Generation',
      bestFor: 'Rapid Social Media Visuals',
      tier: 'imageGen',
    },
    {
      id: '@cf/lykon/dreamshaper-8-lcm',
      name: 'DreamShaper 8 LCM',
      provider: 'Community',
      description: 'Latent Consistency Model for photorealistic marketing illustrations.',
      contextWindow: 'Image Generation',
      bestFor: 'Stylized Marketing Artwork',
      tier: 'imageGen',
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
      description: 'Standard Whisper model for balanced transcription speed.',
      contextWindow: 'Audio Stream',
      bestFor: 'Short Voice Memos (<60s)',
      tier: 'audio',
    },
    {
      id: '@cf/openai/whisper-tiny-en',
      name: 'Whisper Tiny English',
      provider: 'OpenAI',
      description: 'Ultra-fast English transcription model with minimal resource footprint.',
      contextWindow: 'Audio Stream',
      bestFor: 'Real-time Live Audio Dictation',
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
    {
      id: '@cf/baai/bge-small-en-v1.5',
      name: 'BGE Small 384-dim',
      provider: 'BAAI',
      description: '384-dimensional compact semantic embeddings for high-speed indexing.',
      contextWindow: '512 tokens',
      bestFor: 'Fast Candidate Search & Real-time Auto-complete',
      tier: 'embeddings',
    },
    {
      id: '@cf/baai/bge-m3',
      name: 'BGE-M3 Multilingual Multi-Granularity',
      provider: 'BAAI',
      description: 'Multi-lingual, multi-functionality, multi-granularity (dense + sparse) embedding engine.',
      contextWindow: '8192 tokens',
      bestFor: 'Long-document Semantic Search & Cross-lingual Retrieval',
      tier: 'embeddings',
    },
    {
      id: '@cf/mistral/mistral-embed',
      name: 'Mistral Embed 1024-dim',
      provider: 'Mistral AI',
      description: 'High performance 1024-dimensional text embeddings.',
      contextWindow: '8192 tokens',
      bestFor: 'Document Corpus Vector Search',
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
