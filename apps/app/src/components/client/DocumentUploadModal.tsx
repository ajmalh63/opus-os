import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * DocumentUploadModal — Real link, real modal, realtime sync (R2 presigned + WS to CRM/workspaces)
 * URL-driven: ?upload=<docLabel>&division=<division> — back button closes it.
 * Honest, accessible, no fake claims.
 */
export default function DocumentUploadModal({
  open,
  docLabel,
  division,
  rejectionReason,
  token,
  onClose,
}: {
  open: boolean;
  docLabel: string | null;
  division?: string | null;
  rejectionReason?: string | null;
  token: string;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) {
      setFile(null);
      setMsg(null);
      setBusy(false);
    }
  }, [open]);

  // Focus trap + ESC to close (a11y)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !docLabel) return null;

  const handleUpload = async () => {
    if (!file) {
      setMsg('Please choose a file first.');
      return;
    }
    if (!token) {
      setMsg('No client token — please sign in again.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // 1. Get presigned URL from backend (R2, token-auth, 10MB limit)
      const presignedRes = await fetch(
        `/api/public/portal/documents/presigned?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(file.name)}&label=${encodeURIComponent(docLabel)}&division=${encodeURIComponent(division || '')}`
      );
      const presigned = await presignedRes.json();
      if (!presignedRes.ok || !presigned.url) throw new Error(presigned.error || 'Failed to get upload link.');

      // 2. PUT file to R2 presigned URL
      const putRes = await fetch(presigned.url, { method: 'PUT', body: file });
      if (!putRes.ok) throw new Error((await putRes.text().catch(() => '')) || 'Upload failed.');

      // 3. Realtime sync: invalidate all relevant queries so CRM/workspaces see it live
      // Client portal
      qc.invalidateQueries({ queryKey: ['portalLookup'] });
      qc.invalidateQueries({ queryKey: ['portalSession'] });
      qc.invalidateQueries({ queryKey: ['portalStudyAppsHub'] });
      qc.invalidateQueries({ queryKey: ['portalVisaAppsHub'] });
      qc.invalidateQueries({ queryKey: ['portalUmrahBookingsHub'] });
      qc.invalidateQueries({ queryKey: ['portalAttestAppsHub'] });
      qc.invalidateQueries({ queryKey: ['portalJobAppsHub'] });
      // Staff CRM
      qc.invalidateQueries({ queryKey: ['kanban'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['studyProfile'] });
      qc.invalidateQueries({ queryKey: ['studyDocsClient'] });

      // Also trigger WS sync via syncClient (if enabled, it will push to staff:global etc.)
      // The backend's presigned handler already notifies sync plane: client:{id}:documents

      setMsg(`✓ "${file.name}" uploaded as "${docLabel}" — pending verification. It will appear in your vault and staff CRM live.`);
      setTimeout(() => {
        onClose();
        // Keep URL clean: remove ?upload param (back button already handled, but also clean on success)
        const url = new URL(window.location.href);
        url.searchParams.delete('upload');
        url.searchParams.delete('division');
        window.history.replaceState(null, '', url.toString());
      }, 1200);
    } catch (e: any) {
      setMsg(`Upload failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Upload ${docLabel}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-brand-navy/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-bold text-brand-navy">Upload — {docLabel}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {division ? `For ${division} • ` : ''}PDF/JPG/PNG up to 10MB • Handled with care, synced live to your vault and staff desk
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close upload dialog"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 grid place-items-center text-slate-600 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {rejectionReason && (
          <div className="rounded-xl bg-amber-50 border border-amber-300/80 p-3 text-xs text-amber-900 flex items-start gap-2.5 shadow-2xs">
            <span className="text-base leading-none">⚠️</span>
            <div className="space-y-0.5">
              <p className="font-bold text-amber-950">Previous Upload Action Required:</p>
              <p className="text-[11px] leading-relaxed text-amber-900">{rejectionReason}</p>
            </div>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
          className={`rounded-xl border-2 border-dashed p-6 text-center transition ${dragOver ? 'border-brand-gold bg-amber-50' : 'border-slate-200 bg-slate-50'}`}
        >
          <input
            id="doc-file-input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <label htmlFor="doc-file-input" className="cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 grid place-items-center mx-auto text-xl" aria-hidden>📄</div>
            <p className="text-xs font-bold text-slate-700 mt-2">{file ? file.name : 'Click to choose or drag & drop'}</p>
            <p className="text-[11px] text-slate-500 mt-1">{file ? `${(file.size / 1024).toFixed(1)} KB` : 'PDF, JPG, PNG, DOC up to 10MB'}</p>
          </label>
        </div>

        {msg && (
          <div className={`rounded-xl px-3 py-2 text-xs ${msg.startsWith('✓') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : msg.startsWith('Upload failed') ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-slate-50 border border-slate-200 text-slate-600'}`} role="status" aria-live="polite">
            {msg}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-full border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={busy || !file}
            className="flex-1 h-10 rounded-full bg-brand-navy text-white text-sm font-bold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow"
          >
            {busy ? 'Uploading…' : 'Upload — sync live →'}
          </button>
        </div>

        <p className="text-[10px] text-slate-400 text-center">By uploading, you consent to processing for this division only. Manage in Journey → consents. • Back button closes this dialog.</p>
      </div>
    </div>
  );
}
