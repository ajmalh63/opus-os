import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

// AI Document OCR — extracts text from passport/transcript/certificate scans
// via Workers AI vision model (governance-gated + neuron-budgeted server-side).
const DOC_TYPES = [
  { id: 'passport', label: 'Passport' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'generic', label: 'Generic document' },
] as const;

export default function AiOcrPanel({ clientId }: { clientId?: string }) {
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [docType, setDocType] = useState<'passport' | 'transcript' | 'certificate' | 'generic'>('passport');
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const ocrMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/staff/ai/ocr`, { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl, docType, clientId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'OCR failed');
      return d as { text: string; modelUsed: string };
    },
    onSuccess: (d) => { setResult(d.text); setError(''); },
    onError: (e: any) => { setError(e.message || 'OCR failed'); setResult(''); },
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setError('Image must be under 4 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      setImageDataUrl(url);
      setPreview(url);
      setResult('');
      setError('');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg bg-brand-navy px-3 py-2 text-sm font-bold text-white hover:bg-brand-navy/90">
          📎 Choose scan…
          <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as any)}
          className="rounded-lg border border-brand-navy/15 bg-white px-2 py-2 text-sm font-semibold text-brand-navy"
        >
          {DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <button
          onClick={() => ocrMutation.mutate()}
          disabled={!imageDataUrl || ocrMutation.isPending}
          className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white disabled:opacity-50 cursor-pointer"
        >
          {ocrMutation.isPending ? 'Extracting…' : 'Extract Text'}
        </button>
      </div>

      {preview && (
        <img src={preview} alt="Document scan" className="mt-3 max-h-40 rounded-lg border border-brand-navy/10 object-contain" />
      )}
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      {result && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold uppercase tracking-wider text-brand-gold">Extracted text</p>
            <button
              onClick={() => navigator.clipboard?.writeText(result)}
              className="text-[13px] font-bold text-brand-navy/50 hover:text-brand-gold"
            >
              Copy
            </button>
          </div>
          <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-brand-navy">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}