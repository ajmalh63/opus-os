import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || '';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  contextWindow: string;
  bestFor: string;
  tier: string;
  taskType?: string;
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
  const [customModelMode, setCustomModelMode] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);

  // Catalog Explorer & Filter State
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

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
      const res = await fetch(`${API}/api/admin/ai/config`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load AI config');
      return res.json() as Promise<{
        success: boolean;
        settings: AiSettings;
        models: {
          text: ModelInfo[];
          vision: ModelInfo[];
          imageGen?: ModelInfo[];
          audio: ModelInfo[];
          translation: ModelInfo[];
          embeddings: ModelInfo[];
          rerank?: ModelInfo[];
          classification?: ModelInfo[];
          summarization?: ModelInfo[];
          objectDetection?: ModelInfo[];
        };
        bound: boolean;
      }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (updatedSettings: AiSettings) => {
      const res = await fetch(`${API}/api/admin/ai/config`, { credentials: 'include', method: 'PUT',
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
      const res = await fetch(`${API}/api/admin/ai/test`, { credentials: 'include', method: 'POST',
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
      .filter((p) => p.length > 0);

    if (prompts.length === 0) {
      setBatchResult({ success: false, error: 'Please provide at least 1 prompt per line.' });
      setBatchTesting(false);
      return;
    }

    try {
      const res = await fetch(`${API}/api/admin/ai/batch-test`, { credentials: 'include', method: 'POST',
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedModelId(text);
    setTimeout(() => setCopiedModelId(null), 2000);
  };

  const allModelsList = useMemo(() => {
    if (!data?.models) return [];
    const text = data.models.text || [];
    const vision = data.models.vision || [];
    const imageGen = data.models.imageGen || [];
    const audio = data.models.audio || [];
    const translation = data.models.translation || [];
    const embeddings = data.models.embeddings || [];
    const rerank = data.models.rerank || [];
    const classification = data.models.classification || [];
    const summarization = data.models.summarization || [];
    const objectDetection = data.models.objectDetection || [];
    return [
      ...text,
      ...vision,
      ...imageGen,
      ...audio,
      ...translation,
      ...embeddings,
      ...rerank,
      ...classification,
      ...summarization,
      ...objectDetection,
    ];
  }, [data]);

  const uniqueProviders = useMemo(() => {
    const set = new Set<string>();
    allModelsList.forEach((m) => {
      if (m.provider) set.add(m.provider);
    });
    return ['All', ...Array.from(set).sort()];
  }, [allModelsList]);

  const filteredCatalogModels = useMemo(() => {
    return allModelsList.filter((m) => {
      if (selectedProvider !== 'All' && m.provider !== selectedProvider) return false;
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'text' && !['flagship', 'fast', 'slm', 'coder'].includes(m.tier)) return false;
        if (selectedCategory === 'vision' && m.tier !== 'vision') return false;
        if (selectedCategory === 'imageGen' && m.tier !== 'imageGen') return false;
        if (selectedCategory === 'audio' && m.tier !== 'audio') return false;
        if (selectedCategory === 'translation' && m.tier !== 'translation') return false;
        if (selectedCategory === 'embeddings' && m.tier !== 'embeddings') return false;
        if (selectedCategory === 'rerank' && m.tier !== 'rerank') return false;
        if (selectedCategory === 'classification' && m.tier !== 'classification') return false;
        if (selectedCategory === 'summarization' && m.tier !== 'summarization') return false;
        if (selectedCategory === 'objectDetection' && !['objectDetection', 'imageClassification'].includes(m.tier)) return false;
      }
      if (catalogSearch.trim()) {
        const q = catalogSearch.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.bestFor.toLowerCase().includes(q) ||
          (m.taskType && m.taskType.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [allModelsList, selectedProvider, selectedCategory, catalogSearch]);

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400 font-mono text-xs">Loading Cloudflare AI Governance Engine...</div>;
  }

  const settings = data?.settings;
  const models = data?.models;

  if (!settings || !models) {
    return <div className="p-8 text-center text-rose-400 font-mono text-xs">Failed to load AI Governance config.</div>;
  }

  const renderTextModelOptgroups = () => {
    const textModels = models.text || [];
    const flagship = textModels.filter((m) => m.tier === 'flagship');
    const fast = textModels.filter((m) => m.tier === 'fast');
    const slm = textModels.filter((m) => m.tier === 'slm');
    const coder = textModels.filter((m) => m.tier === 'coder');

    return (
      <>
        <optgroup label="🌟 Flagship Reasoning & Large Models (30B - 72B)">
          {flagship.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · [{m.provider}] ({m.contextWindow})
            </option>
          ))}
        </optgroup>
        <optgroup label="⚡ Fast & High-Throughput (7B - 14B)">
          {fast.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · [{m.provider}] ({m.contextWindow})
            </option>
          ))}
        </optgroup>
        <optgroup label="📱 Edge SLMs (< 4B)">
          {slm.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · [{m.provider}] ({m.contextWindow})
            </option>
          ))}
        </optgroup>
        <optgroup label="💻 Code & Structured Form Generators">
          {coder.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · [{m.provider}] ({m.contextWindow})
            </option>
          ))}
        </optgroup>
      </>
    );
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto text-slate-100 font-sans">
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Cloudflare Workers AI Governance & Model Orchestration
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[13px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {allModelsList.length} Models Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Live serverless GPU inference engine powered by Cloudflare Workers AI with 0% provider markup and native neuron budgeting.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Global AI Switch
            </span>
            <button
              type="button"
              onClick={() => saveMutation.mutate({ ...settings, globalEnabled: !settings.globalEnabled })}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.globalEnabled ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.globalEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-2">
            <div className="text-[13px] uppercase font-bold text-slate-400 tracking-wider">
              Daily Neuron Budget
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xl font-extrabold text-white font-mono">
                {settings.dailyNeuronBudget.toLocaleString()} <span className="text-xs text-slate-400 font-sans">neurons/day</span>
              </span>
            </div>
            <p className="text-[13px] text-slate-400">
              Approx. ${(settings.dailyNeuronBudget * 0.000011).toFixed(2)} USD serverless GPU ceiling.
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-2">
            <div className="text-[13px] uppercase font-bold text-slate-400 tracking-wider">
              Automatic PII Redaction
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">
                {settings.piiRedactionEnabled ? '🛡️ Active (Aadhaar/Passports Redacted)' : '⚠️ Direct Pass-through'}
              </span>
              <input
                type="checkbox"
                checked={settings.piiRedactionEnabled}
                onChange={(e) => saveMutation.mutate({ ...settings, piiRedactionEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
              />
            </div>
            <p className="text-[13px] text-slate-400">
              Redacts sensitive client identifiers before passing untrusted context to models.
            </p>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-2">
            <div className="text-[13px] uppercase font-bold text-slate-400 tracking-wider">
              Edge KV Caching
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">
                {settings.aggressiveCacheEnabled ? '⚡ Active (0ms Latency on Repeats)' : 'Disabled'}
              </span>
              <input
                type="checkbox"
                checked={settings.aggressiveCacheEnabled}
                onChange={(e) => saveMutation.mutate({ ...settings, aggressiveCacheEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
              />
            </div>
            <p className="text-[13px] text-slate-400">
              Caches identical prompts at Cloudflare Edge to eliminate duplicate neuron costs.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 text-lg">
                🛡️
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">AI Visa Risk Copilot</h3>
                <p className="text-xs text-slate-400">Used inside Visa Processing Desk to evaluate refusal risk</p>
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
              className="w-5 h-5 rounded text-indigo-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Active Reasoning Model
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
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {renderTextModelOptgroups()}
            </select>
          </div>

          {(() => {
            const current = allModelsList.find((m) => m.id === settings.features.visaRiskCopilot.model);
            return current ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between items-center text-[13px] text-slate-400 font-mono">
                  <span>Provider: {current.provider}</span>
                  <span className="text-indigo-400">{current.contextWindow}</span>
                </div>
                <p className="text-sm text-slate-300">{current.description}</p>
                <div className="text-[13px] text-emerald-400 font-semibold">Best for: {current.bestFor}</div>
              </div>
            ) : null;
          })()}
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-lg">
                👁️
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Vision Document OCR</h3>
                <p className="text-xs text-slate-400">Extracts passport numbers, certificates & MEA stamps in Attestation Desk</p>
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
              className="w-5 h-5 rounded text-indigo-600 cursor-pointer"
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
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 cursor-pointer"
            >
              {models.vision.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · [{m.provider}] · ({m.contextWindow})
                </option>
              ))}
            </select>
          </div>

          {(() => {
            const current = allModelsList.find((m) => m.id === settings.features.visionOcr.model);
            return current ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between items-center text-[13px] text-slate-400 font-mono">
                  <span>Provider: {current.provider}</span>
                  <span className="text-purple-400">{current.contextWindow}</span>
                </div>
                <p className="text-sm text-slate-300">{current.description}</p>
                <div className="text-[13px] text-emerald-400 font-semibold">Best for: {current.bestFor}</div>
              </div>
            ) : null;
          })()}
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
                ✍️
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">AI SOP & LOR Studio</h3>
                <p className="text-xs text-slate-400">Generates tailored university admissions essays in Study Abroad Desk</p>
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
              className="w-5 h-5 rounded text-indigo-600 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              SOP Writing & Polishing Model
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
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 cursor-pointer"
            >
              {renderTextModelOptgroups()}
            </select>
          </div>

          {(() => {
            const current = allModelsList.find((m) => m.id === settings.features.sopStudio.model);
            return current ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between items-center text-[13px] text-slate-400 font-mono">
                  <span>Provider: {current.provider}</span>
                  <span className="text-emerald-400">{current.contextWindow}</span>
                </div>
                <p className="text-sm text-slate-300">{current.description}</p>
                <div className="text-[13px] text-emerald-400 font-semibold">Best for: {current.bestFor}</div>
              </div>
            ) : null;
          })()}
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-lg">
                🌐
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">AI Multilingual Translator</h3>
                <p className="text-xs text-slate-400">Translates foreign language client inquiries in Unified Inbox</p>
              </div>
            </div>
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
              className="w-5 h-5 rounded text-indigo-600 cursor-pointer"
            />
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
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 cursor-pointer"
            >
              {(models.translation || []).map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.name} · [{m.provider}]
                </option>
              ))}
            </select>
          </div>

          {(() => {
            const current = allModelsList.find((m) => m.id === settings.features.translator.model);
            return current ? (
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between items-center text-[13px] text-slate-400 font-mono">
                  <span>Provider: {current.provider}</span>
                  <span className="text-cyan-400">{current.contextWindow}</span>
                </div>
                <p className="text-sm text-slate-300">{current.description}</p>
                <div className="text-[13px] text-emerald-400 font-semibold">Best for: {current.bestFor}</div>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>📚</span> Cloudflare Workers AI Model Catalog Explorer
            </h3>
            <p className="text-xs text-slate-400">
              Browse {allModelsList.length} verified AI models deployed on Cloudflare serverless GPUs.
            </p>
          </div>

          <input
            type="text"
            placeholder="🔍 Search model by name, provider or task..."
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            className="w-72 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap gap-1.5 bg-slate-950/60 p-1.5 rounded-2xl border border-slate-800">
            {[
              { key: 'all', label: 'All Task Types' },
              { key: 'text', label: '💬 Text & Reasoning' },
              { key: 'vision', label: '👁️ Multimodal Vision' },
              { key: 'imageGen', label: '🎨 Text-to-Image' },
              { key: 'audio', label: '🎙️ Speech (ASR)' },
              { key: 'translation', label: '🌐 Translation' },
              { key: 'embeddings', label: '🧬 Embeddings' },
              { key: 'rerank', label: '🎯 Reranking' },
              { key: 'classification', label: '🏷️ Classification' },
              { key: 'summarization', label: '📝 Summarization' },
              { key: 'objectDetection', label: '🔍 Vision Detection' },
            ].map((cat) => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  selectedCategory === cat.key ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-xs">Provider:</span>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none cursor-pointer"
            >
              {uniqueProviders.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[520px] overflow-y-auto pr-1">
          {filteredCatalogModels.map((m) => {
            const isCopied = copiedModelId === m.id;
            const getTaskBadgeStyle = (task?: string) => {
              if (!task) return 'bg-slate-800 text-slate-300 border-slate-700';
              if (task.includes('Reasoning')) return 'bg-purple-950/80 text-purple-300 border-purple-800/60';
              if (task.includes('Text Generation')) return 'bg-blue-950/80 text-blue-300 border-blue-800/60';
              if (task.includes('Vision') || task.includes('Multimodal')) return 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60';
              if (task.includes('Image') || task.includes('Inpainting')) return 'bg-amber-950/80 text-amber-300 border-amber-800/60';
              if (task.includes('Speech')) return 'bg-rose-950/80 text-rose-300 border-rose-800/60';
              if (task.includes('Translation')) return 'bg-teal-950/80 text-teal-300 border-teal-800/60';
              if (task.includes('Embeddings')) return 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60';
              if (task.includes('Rerank')) return 'bg-orange-950/80 text-orange-300 border-orange-800/60';
              if (task.includes('Classification')) return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
              if (task.includes('Summarization')) return 'bg-yellow-950/80 text-yellow-300 border-yellow-800/60';
              return 'bg-slate-800 text-slate-300 border-slate-700';
            };

            return (
              <div
                key={m.id}
                className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition duration-150"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-[13px] font-bold uppercase tracking-wider bg-slate-800 text-indigo-400 border border-slate-700 font-mono">
                        {m.provider}
                      </span>
                      {m.taskType && (
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold tracking-tight border ${getTaskBadgeStyle(m.taskType)}`}>
                          {m.taskType}
                        </span>
                      )}
                    </div>
                    <span className="text-[13px] font-mono text-slate-500">{m.contextWindow}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white line-clamp-1">{m.name}</h4>
                  <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">{m.description}</p>
                </div>

                <div className="space-y-2 border-t border-slate-800/60 pt-2.5 text-[13px]">
                  <div className="text-emerald-400 font-semibold truncate">🎯 {m.bestFor}</div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(m.id)}
                      title="Click to copy model ID"
                      className="font-mono text-slate-400 hover:text-indigo-300 transition truncate max-w-[180px] text-left cursor-pointer flex items-center gap-1"
                    >
                      <span>{isCopied ? '✓' : '📋'}</span>
                      <span className="truncate">{m.id}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTestModel(m.id);
                        setCustomModelMode(false);
                        const el = document.getElementById('model-probe-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-[13px] cursor-pointer transition whitespace-nowrap shrink-0"
                    >
                      Test in Shell
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredCatalogModels.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500 text-xs italic">
              No models match the current search filter.
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🚀</span> Batch Prompts Parallel Execution Studio
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Execute multiple candidate evaluation prompts simultaneously in parallel on Cloudflare Edge GPUs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Batch Model:</span>
            <select
              value={batchModel}
              onChange={(e) => setBatchModel(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 cursor-pointer"
            >
              {renderTextModelOptgroups()}
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
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 leading-relaxed outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleBatchProbe}
            disabled={batchTesting}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shadow-lg"
          >
            {batchTesting ? 'Executing Batch on Cloudflare GPUs...' : '⚡ Run Batch Execution'}
          </button>
        </div>

        {batchResult && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-indigo-400 font-semibold">
                Batch Complete: {batchResult.total} Prompts Processed
              </span>
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-mono">Total Latency: {batchResult.latencyMs}ms</span>
                <span className="text-slate-400 font-mono">Avg: {batchResult.avgLatencyPerPromptMs}ms/req</span>
              </div>
            </div>

            <div className="space-y-2">
              {batchResult.results?.map((r: any) => (
                <div key={r.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-[13px] text-slate-400 font-mono mb-1">Query #{r.id}: {r.prompt}</div>
                  <div className="text-slate-200 text-xs leading-relaxed">{r.output}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div id="model-probe-section" className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>🎯</span> AI Model Shell & Real-Time Edge Probe
            </h3>
            <p className="text-xs text-slate-400">
              Directly probe any Cloudflare Workers AI model with custom payloads to benchmark token generation and GPU latency.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCustomModelMode(!customModelMode)}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline"
          >
            {customModelMode ? '← Choose from Catalog' : '✎ Enter Custom Model ID'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Model Target</label>
            {customModelMode ? (
              <input
                type="text"
                value={testModel}
                onChange={(e) => setTestModel(e.target.value)}
                placeholder="@cf/vendor/model-name"
                className="w-full bg-slate-950 border border-indigo-500 text-slate-200 text-xs font-mono rounded-xl px-3 py-2.5 outline-none"
              />
            ) : (
              <select
                value={testModel}
                onChange={(e) => setTestModel(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 cursor-pointer"
              >
                {allModelsList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · [{m.provider}]
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Prompt / Input Query</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={handleTestProbe}
                disabled={testing}
                className="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-lg"
              >
                {testing ? 'Probing Edge...' : 'Run Probe'}
              </button>
            </div>
          </div>
        </div>

        {testResult && (
          <div className="mt-4 p-5 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-indigo-400 font-semibold">{testResult.model}</span>
              {testResult.latencyMs && (
                <span className="text-emerald-400 font-bold">⚡ Latency: {testResult.latencyMs}ms</span>
              )}
            </div>
            <pre className="text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">
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
