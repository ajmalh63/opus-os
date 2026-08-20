import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: string;
  bestFor: string;
  tier: string;
}

interface AiSettings {
  globalEnabled: boolean;
  piiRedactionEnabled: boolean;
  aggressiveCacheEnabled: boolean;
  cacheTtlSeconds: number;
  dailyNeuronBudget: number;
  features: {
    visaRiskCopilot: { enabled: boolean; model: string; temperature?: number; maxTokens?: number };
    visionOcr: { enabled: boolean; model: string; maxTokens?: number };
    sopStudio: { enabled: boolean; model: string; temperature?: number; maxTokens?: number };
    callTranscriber: { enabled: boolean; model: string };
    translator: { enabled: boolean; model: string };
  };
}

export default function AiGovernanceTab() {
  const queryClient = useQueryClient();
  const [testPrompt, setTestPrompt] = useState('Evaluate approval likelihood for a student with 72% in B.Tech applying for MS in Computer Science at University of Birmingham, UK.');
  const [testModel, setTestModel] = useState('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // Batch Studio State
  const [batchModel, setBatchModel] = useState('@cf/meta/llama-3.1-8b-instruct');
  const [batchPromptsText, setBatchPromptsText] = useState(
    `Evaluate admission chances for UK MSc Data Science with 70% in B.Tech.\nEvaluate admission chances for Germany MS Informatics with 80% and A2 German.\nEvaluate admission chances for US MS Computer Science with 3.4 GPA and 315 GRE.`
  );
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-ai-config'],
    queryFn: async () => {
      const res = await fetch('/api/admin/ai/config', { credentials: 'include', });
      if (!res.ok) throw new Error('Failed to load AI config');
      return res.json() as Promise<{
        success: boolean;
        settings: AiSettings;
        models: {
          text: ModelInfo[];
          vision: ModelInfo[];
          audio: ModelInfo[];
          translation: ModelInfo[];
          embeddings: ModelInfo[];
        };
        bound: boolean;
      }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (updatedSettings: AiSettings) => {
      const res = await fetch('/api/admin/ai/config', { credentials: 'include', method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });
      if (!res.ok) throw new Error('Failed to save AI config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ai-config'] });
      alert('AI Governance & Caching settings updated successfully!');
    },
  });

  const handleTestProbe = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/ai/test', { credentials: 'include', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: testModel, prompt: testPrompt }),
      });
      const json = await res.json();
      setTestResult(json);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleBatchProbe = async () => {
    setBatchTesting(true);
    setBatchResult(null);
    const prompts = batchPromptsText
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/admin/ai/batch-test', { credentials: 'include', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: batchModel, prompts }),
      });
      const json = await res.json();
      setBatchResult(json);
    } catch (err: any) {
      setBatchResult({ success: false, error: err.message });
    } finally {
      setBatchTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p>Loading AI Governance engine & full model matrix...</p>
      </div>
    );
  }

  const settings = data?.settings;
  const models = data?.models;

  if (!settings || !models) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-slate-900/40 border border-indigo-500/30 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Superadmin AI Control
              </span>
              <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Cloudflare Workers AI Active (Zero-Cost Free Tier)
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-2">AI Governance, Caching & Model Orchestration Hub</h2>
            <p className="text-sm text-slate-400 mt-1">
              Govern models across features, enable aggressive KV response caching, and execute batch prompts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700">
              <span className="text-xs font-semibold text-slate-200">Global AI Master Switch</span>
              <input
                type="checkbox"
                checked={settings.globalEnabled}
                onChange={(e) =>
                  saveMutation.mutate({
                    ...settings,
                    globalEnabled: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Performance & Caching Control Strip */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Aggressive Edge Prompt & Inference Caching (KV)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Quota Saver
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Caches identical prompts and profile evaluations in Cloudflare KV edge cache for instantaneous &lt;5ms responses with 0 neuron burn.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Cache TTL:</span>
              <select
                value={settings.cacheTtlSeconds}
                onChange={(e) =>
                  saveMutation.mutate({
                    ...settings,
                    cacheTtlSeconds: Number(e.target.value),
                  })
                }
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none"
              >
                <option value={86400}>24 Hours</option>
                <option value={604800}>7 Days (Recommended)</option>
                <option value={2592000}>30 Days</option>
              </select>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-700">
              <span className="text-xs font-semibold text-slate-200">Enable KV Caching</span>
              <input
                type="checkbox"
                checked={settings.aggressiveCacheEnabled}
                onChange={(e) =>
                  saveMutation.mutate({
                    ...settings,
                    aggressiveCacheEnabled: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Feature Configuration Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Feature 1: Visa Risk Copilot */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-lg">
                🛡️
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">AI Visa Risk Copilot</h3>
                <p className="text-xs text-slate-400">Used inside Client 360° to assess refusal probabilities</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.features.visaRiskCopilot.enabled}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    visaRiskCopilot: { ...settings.features.visaRiskCopilot, enabled: e.target.checked },
                  },
                })
              }
              className="w-5 h-5 rounded text-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Active Reasoning Model ({models.text.length} models available)
            </label>
            <select
              value={settings.features.visaRiskCopilot.model}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    visaRiskCopilot: { ...settings.features.visaRiskCopilot, model: e.target.value },
                  },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
            >
              {models.text.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · [{m.provider}] · {m.contextWindow}
                </option>
              ))}
            </select>
          </div>

          {/* Model Spec Badge */}
          {(() => {
            const current = models.text.find((m) => m.id === settings.features.visaRiskCopilot.model);
            return current ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                  <span>Provider: {current.provider}</span>
                  <span className="text-indigo-400">{current.contextWindow}</span>
                </div>
                <p className="text-[11px] text-slate-300">{current.description}</p>
                <div className="text-[10px] text-emerald-400 font-semibold">Best for: {current.bestFor}</div>
              </div>
            ) : null;
          })()}
        </div>

        {/* Feature 2: Vision OCR */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-lg">
                👁️
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">1-Click Vision Document OCR</h3>
                <p className="text-xs text-slate-400">Extracts passport numbers, DOB & grades from uploads</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.features.visionOcr.enabled}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    visionOcr: { ...settings.features.visionOcr, enabled: e.target.checked },
                  },
                })
              }
              className="w-5 h-5 rounded text-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Vision Model ({models.vision.length} available)
            </label>
            <select
              value={settings.features.visionOcr.model}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    visionOcr: { ...settings.features.visionOcr, model: e.target.value },
                  },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5"
            >
              {models.vision.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · [{m.provider}]
                </option>
              ))}
            </select>
          </div>

          {(() => {
            const current = models.vision.find((m) => m.id === settings.features.visionOcr.model);
            return current ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                  <span>Provider: {current.provider}</span>
                  <span className="text-purple-400">{current.contextWindow}</span>
                </div>
                <p className="text-[11px] text-slate-300">{current.description}</p>
                <div className="text-[10px] text-emerald-400 font-semibold">Best for: {current.bestFor}</div>
              </div>
            ) : null;
          })()}
        </div>

        {/* Feature 3: SOP Studio */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
                ✍️
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">AI SOP & Embassy Cover Studio</h3>
                <p className="text-xs text-slate-400">Generates academic SOPs and visa filing cover letters</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.features.sopStudio.enabled}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    sopStudio: { ...settings.features.sopStudio, enabled: e.target.checked },
                  },
                })
              }
              className="w-5 h-5 rounded text-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Writing & Drafting Model
            </label>
            <select
              value={settings.features.sopStudio.model}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    sopStudio: { ...settings.features.sopStudio, model: e.target.value },
                  },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5"
            >
              {models.text.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · [{m.provider}]
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feature 4: Audio Meeting Transcriber */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
                🎙️
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Consultation Audio Transcriber</h3>
                <p className="text-xs text-slate-400">Converts counseling recordings into action items</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.features.callTranscriber.enabled}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    callTranscriber: { ...settings.features.callTranscriber, enabled: e.target.checked },
                  },
                })
              }
              className="w-5 h-5 rounded text-indigo-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Speech-to-Text Model
            </label>
            <select
              value={settings.features.callTranscriber.model}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    callTranscriber: { ...settings.features.callTranscriber, model: e.target.value },
                  },
                })
              }
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5"
            >
              {models.audio.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · [{m.provider}]
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Translator Feature */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🌐</span> AI Translator
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Multilingual client document & note translation (m2m100 · 100 languages).
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <span>Enabled</span>
            <input
              type="checkbox"
              checked={settings.features.translator.enabled}
              onChange={(e) =>
                saveMutation.mutate({
                  ...settings,
                  features: {
                    ...settings.features,
                    translator: { ...settings.features.translator, enabled: e.target.checked },
                  },
                })
              }
              className="w-5 h-5 rounded text-indigo-600"
            />
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Translation Model
          </label>
          <select
            value={settings.features.translator.model}
            onChange={(e) =>
              saveMutation.mutate({
                ...settings,
                features: {
                  ...settings.features,
                  translator: { ...settings.features.translator, model: e.target.value },
                },
              })
            }
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5"
          >
            {(models.translation || []).map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name} · [{m.provider}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Batch Prompts Benchmark & Execution Studio */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🚀</span> Batch Prompts Execution Studio
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Execute multiple student evaluation prompts simultaneously in parallel on Cloudflare Edge.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Batch Model:</span>
            <select
              value={batchModel}
              onChange={(e) => setBatchModel(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5"
            >
              {models.text.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">
            Input Prompts (1 query per line)
          </label>
          <textarea
            rows={3}
            value={batchPromptsText}
            onChange={(e) => setBatchPromptsText(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 leading-relaxed"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleBatchProbe}
            disabled={batchTesting}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
          >
            {batchTesting ? 'Executing Batch in Parallel...' : '⚡ Run Batch Execution'}
          </button>
        </div>

        {batchResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-indigo-400 font-semibold">
                Batch Complete: {batchResult.total} Prompts Processed
              </span>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400">Total Latency: {batchResult.latencyMs}ms</span>
                <span className="text-slate-400 font-mono">Avg: {batchResult.avgLatencyPerPromptMs}ms/req</span>
              </div>
            </div>

            <div className="space-y-2">
              {batchResult.results?.map((r: any) => (
                <div key={r.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-mono mb-1">Query #{r.id}: {r.prompt}</div>
                  <div className="text-slate-200 text-xs">{r.output}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Single Model Latency Probe */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>🎯</span> Single Model Edge Benchmark Probe
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Select Model</label>
            <select
              value={testModel}
              onChange={(e) => setTestModel(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5"
            >
              {models.text.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Test Prompt</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2"
              />
              <button
                type="button"
                onClick={handleTestProbe}
                disabled={testing}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {testing ? 'Probing...' : 'Run Probe'}
              </button>
            </div>
          </div>
        </div>

        {testResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <span className="text-indigo-400 font-semibold">{testResult.model}</span>
              {testResult.latencyMs && (
                <span className="text-emerald-400">Latency: {testResult.latencyMs}ms</span>
              )}
            </div>
            <pre className="text-slate-300 whitespace-pre-wrap">
              {typeof testResult.output === 'string'
                ? testResult.output
                : JSON.stringify(testResult.output || testResult.error, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
