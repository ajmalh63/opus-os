import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computePromptHash,
  getCachedAiResponse,
  setCachedAiResponse,
  APPROVED_AI_MODELS,
  DEFAULT_AI_SETTINGS,
} from '../src/lib/aiGovernance.js';
import { staffAiRouter } from '../src/routes/staffAi.js';
import { adminAiRouter } from '../src/routes/adminAi.js';
import { publicSeoRouter } from '../src/routes/visibility.js';
import { MockD1Database } from './mockDb.js';

describe('AI Governance, Aggressive Caching & Edge Features Suite', () => {
  let mockKvStore: Map<string, string>;
  let mockEnv: any;

  beforeEach(() => {
    mockKvStore = new Map();
    mockEnv = {
      KV: {
        get: vi.fn(async (key: string) => mockKvStore.get(key) || null),
        put: vi.fn(async (key: string, value: string) => {
          mockKvStore.set(key, value);
        }),
      },
      AI: {
        run: vi.fn(async (model: string, options: any) => {
          if (options.messages) {
            return {
              response: JSON.stringify({
                score: 85,
                riskLevel: 'low',
                keyObservations: ['Strong academic foundation in CS', 'Clean immigration history'],
                redFlags: [],
                mitigationSteps: ['Submit 28-day liquid funds bank certificate'],
                recommendedFinancialProofINR: 28,
              }),
            };
          }
          return { response: 'MOCK AI RESPONSE FOR OPUS OVERSEAS' };
        }),
      },
      DB: new MockD1Database(),
    };
  });

  describe('1. SHA-256 Prompt Hashing & KV Cache Engine', () => {
    it('generates deterministic SHA-256 hashes for identical prompt payloads', async () => {
      const payload = { country: 'UK', gpa: '75%', gap: 1 };
      const hash1 = await computePromptHash(`visa_risk:modelA:${JSON.stringify(payload)}`);
      const hash2 = await computePromptHash(`visa_risk:modelA:${JSON.stringify(payload)}`);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('returns null on cache miss and retrieves stored response on cache hit', async () => {
      const payload = { target: 'Germany', degree: 'MSc' };
      const miss = await getCachedAiResponse(mockEnv, 'visa_risk', 'llama-3.3-70b', payload);
      expect(miss).toBeNull();

      const sampleResponse = { score: 92, riskLevel: 'low' };
      await setCachedAiResponse(mockEnv, 'visa_risk', 'llama-3.3-70b', payload, sampleResponse);

      const hit = await getCachedAiResponse(mockEnv, 'visa_risk', 'llama-3.3-70b', payload);
      expect(hit).toEqual(sampleResponse);
      expect(mockEnv.KV.put).toHaveBeenCalled();
    });
  });

  describe('2. Model Catalog Matrix & Visibility', () => {
    it('exposes full catalog of approved models across all 5 operational tiers', () => {
      expect(APPROVED_AI_MODELS.text.length).toBeGreaterThanOrEqual(5);
      expect(APPROVED_AI_MODELS.vision.length).toBeGreaterThanOrEqual(2);
      expect(APPROVED_AI_MODELS.audio.length).toBeGreaterThanOrEqual(2);
      expect(APPROVED_AI_MODELS.translation.length).toBeGreaterThanOrEqual(1);
      expect(APPROVED_AI_MODELS.embeddings.length).toBeGreaterThanOrEqual(2);

      // Verify Flagship Reasoning models exist
      const hasLlama70B = APPROVED_AI_MODELS.text.some(m => m.id.includes('llama-3.3-70b'));
      const hasDeepSeek = APPROVED_AI_MODELS.text.some(m => m.id.includes('deepseek-r1'));
      expect(hasLlama70B).toBe(true);
      expect(hasDeepSeek).toBe(true);
    });
  });

  describe('3. Staff AI Visa Risk & SOP Copilot', () => {
    const candidate = {
      targetCountry: 'United Kingdom',
      degreeLevel: 'Masters',
      academicGpaOrPercent: '72%',
      gapYears: 1,
      workExperienceYears: 1,
      ieltsOverall: '6.5',
      budgetInrLakhs: 25,
      priorVisaRefusals: false,
    };

    it('evaluates candidate profile and caches result on first run', async () => {
      const req = new Request('http://localhost/visa-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });

      const res = await staffAiRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.cached).toBe(false);
      expect(json.assessment.score).toBe(85);
      expect(json.assessment.riskLevel).toBe('low');
      expect(mockEnv.AI.run).toHaveBeenCalledTimes(1);
    });

    it('retrieves cached assessment with 0 neurons burned on identical second run', async () => {
      // First run to populate cache
      const req1 = new Request('http://localhost/visa-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      await staffAiRouter.fetch(req1, mockEnv);

      // Second run
      const req2 = new Request('http://localhost/visa-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      const res2 = await staffAiRouter.fetch(req2, mockEnv);
      const json2 = (await res2.json()) as any;

      expect(json2.success).toBe(true);
      expect(json2.cached).toBe(true);
      expect(json2.neuronsConsumed).toBe(0);
      expect(json2.assessment.score).toBe(85);
    });

    it('executes batch visa risk evaluations concurrently in parallel', async () => {
      const req = new Request('http://localhost/batch-visa-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicants: [
            { ...candidate, clientId: 'C1', targetCountry: 'UK' },
            { ...candidate, clientId: 'C2', targetCountry: 'Germany', gapYears: 3 },
            { ...candidate, clientId: 'C3', targetCountry: 'USA' },
          ],
        }),
      });

      const res = await staffAiRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.totalProcessed).toBe(3);
      expect(json.results).toHaveLength(3);
    });

    it('generates structured Statement of Purpose (SOP) via SOP studio', async () => {
      const req = new Request('http://localhost/generate-sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: 'Aditi Nair',
          targetUniversity: 'University of Edinburgh',
          targetCourse: 'MSc Data Science',
          targetCountry: 'UK',
          educationalBackground: 'B.Tech CS 75%',
          careerGoals: 'AI Engineer',
        }),
      });

      const res = await staffAiRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.sop).toBeDefined();
    });
  });

  describe('4. Superadmin AI Governance & Batch Test Bench', () => {
    it('returns settings, models, and binding health on GET /config', async () => {
      const req = new Request('http://localhost/config');
      const res = await adminAiRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.settings).toBeDefined();
      expect(json.models.text.length).toBeGreaterThan(0);
      expect(json.bound).toBe(true);
    });

    it('benchmarks parallel batch prompt execution with latency metrics', async () => {
      const req = new Request('http://localhost/batch-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: '@cf/meta/llama-3.1-8b-instruct',
          prompts: ['Prompt 1', 'Prompt 2'],
        }),
      });

      const res = await adminAiRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);

      const json = (await res.json()) as any;
      expect(json.success).toBe(true);
      expect(json.total).toBe(2);
      expect(json.latencyMs).toBeGreaterThanOrEqual(0);
      expect(json.results).toHaveLength(2);
    });
  });

  describe('5. Public Edge Caching & SEO Governance', () => {
    it('serves sitemap.xml with canonical domain and stale-while-revalidate caching headers', async () => {
      const req = new Request('http://localhost/sitemap.xml');
      const res = await publicSeoRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);

      const cacheHeader = res.headers.get('Cache-Control');
      expect(cacheHeader).toContain('stale-while-revalidate');
      expect(cacheHeader).toContain('s-maxage=86400');

      const xml = await res.text();
      expect(xml).toContain('https://opusoverseas.com');
    });

    it('serves robots.txt with 24-hour cache header and AI search crawler directives', async () => {
      const req = new Request('http://localhost/robots.txt');
      const res = await publicSeoRouter.fetch(req, mockEnv);
      expect(res.status).toBe(200);

      const cacheHeader = res.headers.get('Cache-Control');
      expect(cacheHeader).toContain('max-age=86400');

      const txt = await res.text();
      expect(txt).toContain('User-agent: GPTBot');
      expect(txt).toContain('Sitemap: https://opusoverseas.com/sitemap.xml');
    });
  });
});

describe('AI governance enforcement (neuron budget + PII redaction)', () => {
  const mkEnv = (over: any = {}) => {
    const store = new Map<string, string>();
    return {
      KV: { get: async (k: string) => store.get(k) || null, put: async (k: string, v: string) => { store.set(k, v); } },
      AI: { run: async () => ({ response: JSON.stringify({ score: 80, riskLevel: 'low', keyObservations: [], redFlags: [], mitigationSteps: [], recommendedFinancialProofINR: 25 }) }) },
      DB: (() => {
        const m = new MockD1Database();
        m.tables.app_settings.push({ key: 'ai_governance_settings', value: JSON.stringify({
          globalEnabled: true, piiRedactionEnabled: true, aggressiveCacheEnabled: false, cacheTtlSeconds: 3600,
          features: { visaRiskCopilot: { enabled: true, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0.2, maxTokens: 1500 },
            visionOcr: { enabled: false, model: '' }, sopStudio: { enabled: true, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0.4, maxTokens: 2500 },
            callTranscriber: { enabled: false, model: '' }, translator: { enabled: false, model: '' } },
          dailyNeuronBudget: 100,
        }), updated_at: 1 });
        return m;
      })(),
      ...over,
    };
  };
  const body = JSON.stringify({ targetCountry: 'UK', degreeLevel: 'Masters', academicGpaOrPercent: '70%' });

  it('rejects with 429 when the daily neuron budget is exhausted (KV counter)', async () => {
    const env = mkEnv();
    env.KV.put(`ai_neurons:${new Date().toISOString().slice(0, 10)}`, '99');
    const res = await staffAiRouter.request('/visa-risk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, env);
    expect(res.status).toBe(429);
    const j = await res.json() as any;
    expect(j.error).toContain('neuron budget');
  });

  it('allows inference within budget and increments the counter', async () => {
    const env = mkEnv();
    const res = await staffAiRouter.request('/visa-risk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, env);
    expect(res.status).toBe(200);
    const day = new Date().toISOString().slice(0, 10);
    expect(Number(await env.KV.get(`ai_neurons:${day}`) || 0)).toBeGreaterThan(0);
  });

  it('strips PII (phone) from the model input when piiRedactionEnabled', async () => {
    const sent: string[] = [];
    const env = mkEnv({ AI: { run: async (_m: string, opts: any) => { sent.push(JSON.stringify(opts)); return { response: JSON.stringify({ score: 80, riskLevel: 'low', keyObservations: [], redFlags: [], mitigationSteps: [], recommendedFinancialProofINR: 25 }) }; } } });
    const res = await staffAiRouter.request('/visa-risk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetCountry: 'UK', degreeLevel: 'Masters', academicGpaOrPercent: '70%', notes: 'Client phone +91 98765 43210' }),
    }, env);
    expect(res.status).toBe(200);
    expect(sent[0]).not.toContain('98765');
  });
});

describe('Staff AI hardening (rate limit + batch budget)', () => {
  let mockD1: MockD1Database;
  const mkEnv = () => {
    const store = new Map<string, string>();
    return {
      KV: { get: async (k: string) => store.get(k) || null, put: async (k: string, v: string) => { store.set(k, v); } },
      AI: { run: async () => ({ response: JSON.stringify({ score: 80, riskLevel: 'low', keyObservations: [], redFlags: [], mitigationSteps: [], recommendedFinancialProofINR: 25 }) }) },
      DB: (() => {
        const m = new MockD1Database();
        m.tables.app_settings.push({ key: 'ai_governance_settings', value: JSON.stringify({
          globalEnabled: true, piiRedactionEnabled: true, aggressiveCacheEnabled: false, cacheTtlSeconds: 3600,
          features: { visaRiskCopilot: { enabled: true, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0.2, maxTokens: 1500 },
            visionOcr: { enabled: false, model: '' }, sopStudio: { enabled: true, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0.4, maxTokens: 2500 },
            callTranscriber: { enabled: false, model: '' }, translator: { enabled: false, model: '' } },
          dailyNeuronBudget: 100,
        }), updated_at: 1 });
        return m;
      })(),
    };
  };

  it('batch-visa-risk is rejected 429 when the batch cost exceeds the remaining budget', async () => {
    const env = mkEnv();
    env.KV.put(`ai_neurons:${new Date().toISOString().slice(0, 10)}`, '99');
    const applicants = Array.from({ length: 10 }, () => ({ targetCountry: 'UK', degreeLevel: 'Masters', academicGpaOrPercent: '70%' }));
    const res = await staffAiRouter.request('/batch-visa-risk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicants }),
    }, env);
    expect(res.status).toBe(429);
    const j = await res.json() as any;
    expect(j.error).toContain('neuron budget');
  });

  it('batch-visa-risk succeeds within budget', async () => {
    const env = mkEnv();
    const applicants = Array.from({ length: 2 }, () => ({ targetCountry: 'UK', degreeLevel: 'Masters', academicGpaOrPercent: '70%' }));
    const res = await staffAiRouter.request('/batch-visa-risk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicants }),
    }, env);
    expect(res.status).toBe(200);
  });
});

describe('AI OCR + Translator endpoints', () => {
  const mkEnv = (over: any = {}) => {
    const store = new Map<string, string>();
    return {
      KV: { get: async (k: string) => store.get(k) || null, put: async (k: string, v: string) => { store.set(k, v); } },
      AI: { run: async (_m: string, opts: any) => {
        if (opts?.text !== undefined) return { translated_text: 'مرحبا بالعالم' };
        return { response: 'NAME: John Doe\nPASSPORT: AB1234567\nDOB: 1990-01-01' };
      } },
      DB: (() => {
        const m = new MockD1Database();
        m.tables.app_settings.push({ key: 'ai_governance_settings', value: JSON.stringify({
          globalEnabled: true, piiRedactionEnabled: true, aggressiveCacheEnabled: false, cacheTtlSeconds: 3600,
          features: { visaRiskCopilot: { enabled: true, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0.2, maxTokens: 1500 },
            visionOcr: { enabled: true, model: '@cf/meta/llama-3.2-11b-vision-instruct', maxTokens: 1000 },
            sopStudio: { enabled: true, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0.4, maxTokens: 2500 },
            callTranscriber: { enabled: false, model: '' }, translator: { enabled: true, model: '@cf/meta/m2m100-1.2b' } },
          dailyNeuronBudget: 10000,
        }), updated_at: 1 });
        return m;
      })(),
      ...over,
    };
  };

  it('OCR extracts text from an image via the vision model', async () => {
    const env = mkEnv();
    const res = await staffAiRouter.request('/ocr', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=', docType: 'passport', clientId: 'OP-2026-9001' }),
    }, env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.text).toContain('PASSPORT');
    expect(j.modelUsed).toContain('llama-3.2-11b-vision-instruct');
  });

  it('OCR returns 503 when the AI binding is missing (no rule-based fallback for vision)', async () => {
    const env = mkEnv({ AI: undefined });
    const res = await staffAiRouter.request('/ocr', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=', docType: 'generic' }),
    }, env);
    expect(res.status).toBe(503);
  });

  it('OCR is governance-gated (disabled → 403)', async () => {
    const env = mkEnv();
    const row = env.DB.tables.app_settings.find((r: any) => r.key === 'ai_governance_settings');
    const s = JSON.parse(row.value);
    s.features.visionOcr.enabled = false;
    row.value = JSON.stringify(s);
    const res = await staffAiRouter.request('/ocr', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }),
    }, env);
    expect(res.status).toBe(403);
  });

  it('translator translates text via m2m100', async () => {
    const env = mkEnv();
    const res = await staffAiRouter.request('/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello world', sourceLang: 'en', targetLang: 'ar' }),
    }, env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.translatedText).toBeTruthy();
    expect(j.modelUsed).toContain('m2m100');
  });

  it('translator rejects unsupported languages (400)', async () => {
    const env = mkEnv();
    const res = await staffAiRouter.request('/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello', sourceLang: 'en', targetLang: 'xx' }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('translator falls back to echo when the AI binding is missing', async () => {
    const env = mkEnv({ AI: undefined });
    const res = await staffAiRouter.request('/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello world', sourceLang: 'en', targetLang: 'ar' }),
    }, env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.mode).toBe('fallback');
    expect(j.translatedText).toBe('Hello world');
  });
});

describe('Aggressive caching on translate + OCR', () => {
  const mkEnv = (over: any = {}) => {
    const store = new Map<string, string>();
    return {
      KV: { get: async (k: string) => store.get(k) || null, put: async (k: string, v: string) => { store.set(k, v); } },
      AI: { run: async (_m: string, opts: any) => {
        if (opts?.text !== undefined) return { translated_text: 'مرحبا بالعالم' };
        return { response: 'NAME: John Doe\nPASSPORT: AB1234567' };
      } },
      DB: (() => {
        const m = new MockD1Database();
        m.tables.app_settings.push({ key: 'ai_governance_settings', value: JSON.stringify({
          globalEnabled: true, piiRedactionEnabled: true, aggressiveCacheEnabled: true, cacheTtlSeconds: 3600,
          features: { visaRiskCopilot: { enabled: true, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0.2, maxTokens: 1500 },
            visionOcr: { enabled: true, model: '@cf/meta/llama-3.2-11b-vision-instruct', maxTokens: 1000 },
            sopStudio: { enabled: true, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', temperature: 0.4, maxTokens: 2500 },
            callTranscriber: { enabled: false, model: '' }, translator: { enabled: true, model: '@cf/meta/m2m100-1.2b' } },
          dailyNeuronBudget: 10000,
        }), updated_at: 1 });
        return m;
      })(),
      ...over,
    };
  };

  it('translate: second identical call hits the KV cache (0 neurons)', async () => {
    let runs = 0;
    const env = mkEnv({ AI: { run: async () => { runs++; return { translated_text: 'مرحبا بالعالم' }; } } });
    const body = JSON.stringify({ text: 'Hello world', sourceLang: 'en', targetLang: 'ar' });
    const r1 = await staffAiRouter.request('/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, env);
    const j1 = await r1.json() as any;
    expect(j1.cached).toBe(false);
    const r2 = await staffAiRouter.request('/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, env);
    const j2 = await r2.json() as any;
    expect(j2.cached).toBe(true);
    expect(j2.neuronsConsumed).toBe(0);
    expect(runs).toBe(1); // model called exactly once
  });

  it('OCR: identical scan hits the cache; large images skip caching', async () => {
    let runs = 0;
    const env = mkEnv({ AI: { run: async () => { runs++; return { response: 'NAME: John Doe' }; } } });
    const small = 'data:image/png;base64,iVBORw0KGgo=';
    const body = JSON.stringify({ imageDataUrl: small, docType: 'passport' });
    const r1 = await staffAiRouter.request('/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, env);
    expect(((await r1.json()) as any).cached).toBe(false);
    const r2 = await staffAiRouter.request('/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, env);
    expect(((await r2.json()) as any).cached).toBe(true);
    expect(runs).toBe(1);

    // Large image (>500KB) → cache skipped, model runs again
    const big = 'data:image/png;base64,' + 'A'.repeat(600_000);
    const bigBody = JSON.stringify({ imageDataUrl: big, docType: 'generic' });
    const rb = await staffAiRouter.request('/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bigBody }, env);
    expect(((await rb.json()) as any).cached).toBe(false);
    expect(runs).toBe(2);
  });
});
