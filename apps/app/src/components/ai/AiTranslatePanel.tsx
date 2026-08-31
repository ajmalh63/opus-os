import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || '';

// AI Translator — multilingual translation via Workers AI m2m100
// (governance-gated + neuron-budgeted server-side).
const LANGS: Record<string, string> = {
  en: 'English', ar: 'Arabic', ur: 'Urdu', hi: 'Hindi', bn: 'Bengali',
  fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', ru: 'Russian',
  zh: 'Chinese', tr: 'Turkish', id: 'Indonesian', ms: 'Malay',
  ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', gu: 'Gujarati', pa: 'Punjabi',
};

export default function AiTranslatePanel({ clientId }: { clientId?: string }) {
  const [text, setText] = useState('');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const translateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/staff/ai/translate`, { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLang, targetLang, clientId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'Translation failed');
      return d as { translatedText: string; modelUsed: string; mode?: string };
    },
    onSuccess: (d) => { setResult(d.translatedText); setError(d.mode === 'fallback' ? 'Workers AI not configured — original text returned.' : ''); },
    onError: (e: any) => { setError(e.message || 'Translation failed'); setResult(''); },
  });

  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="rounded-lg border border-brand-navy/15 bg-white px-2 py-2 text-sm font-semibold text-brand-navy"
        >
          <option value="auto">Detect (auto)</option>
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="self-center text-center text-brand-gold">→</span>
        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="rounded-lg border border-brand-navy/15 bg-white px-2 py-2 text-sm font-semibold text-brand-navy"
        >
          {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste document text, notes or a client message to translate…"
        rows={4}
        className="mt-2 w-full rounded-lg border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2.5 text-xs text-brand-navy placeholder:text-brand-navy/35 focus:border-brand-gold focus:outline-none"
      />

      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => translateMutation.mutate()}
          disabled={!text.trim() || translateMutation.isPending}
          className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white disabled:opacity-50 cursor-pointer"
        >
          {translateMutation.isPending ? 'Translating…' : 'Translate'}
        </button>
        <span className="text-[13px] text-brand-navy/40">{text.length}/5000</span>
      </div>

      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      {result && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold uppercase tracking-wider text-brand-gold">Translation</p>
            <button onClick={() => navigator.clipboard?.writeText(result)} className="text-[13px] font-bold text-brand-navy/50 hover:text-brand-gold">
              Copy
            </button>
          </div>
          <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-brand-navy">
            {result}
          </p>
        </div>
      )}
    </div>
  );
}