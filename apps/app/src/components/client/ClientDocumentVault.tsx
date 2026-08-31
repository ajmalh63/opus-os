import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const API = (import.meta as any).env?.VITE_API_URL || '';

export interface ClientDocumentVaultProps {
  token: string;
}

const REQUIRED_SLOTS = [
  {
    key: 'passport',
    label: 'Passport (Front & Back)',
    category: 'Identity',
    icon: '🪪',
    hint: 'Original valid passport scan with photo and address pages',
    division: 'general',
  },
  {
    key: 'academics',
    label: 'Highest Degree / Marksheet',
    category: 'Academics',
    icon: '🎓',
    hint: 'Degree certificate, provisional certificate, or consolidated marksheet',
    division: 'study-abroad',
  },
  {
    key: 'language',
    label: 'English / Language Test Score',
    category: 'Proficiency',
    icon: '📊',
    hint: 'IELTS, TOEFL, PTE, Duolingo, or German language certificate',
    division: 'study-abroad',
  },
  {
    key: 'resume',
    label: 'Professional Resume / CV',
    category: 'Employment',
    icon: '💼',
    hint: 'Updated standard CV with work history and skills summary',
    division: 'manpower',
  },
  {
    key: 'financials',
    label: 'Financial Proof / Bank Statement',
    category: 'Financials',
    icon: '🏦',
    hint: '6 months bank statement, sponsor letter, or solvency proof',
    division: 'visa',
  },
  {
    key: 'visa_stamp',
    label: 'Visa Stamping / Attestation Papers',
    category: 'Official Papers',
    icon: '📑',
    hint: 'Previous visas, apostille documents, or embassy stamp copies',
    division: 'attestation',
  },
];

const CUSTOM_CATEGORIES = [
  { value: 'Work Experience', label: '💼 Work Experience / Relieving Letter', defaultDivision: 'manpower' },
  { value: 'Police Clearance', label: '👮 Police Clearance Certificate (PCC)', defaultDivision: 'visa' },
  { value: 'Medical Certificate', label: '🩺 Medical / Fitness Certificate', defaultDivision: 'visa' },
  { value: 'Gap Year Affidavit', label: '📜 Gap Year / Notarized Affidavit', defaultDivision: 'study-abroad' },
  { value: 'Family Certificate', label: '👨‍👩‍👧 Marriage / Birth / Dependent Certificate', defaultDivision: 'visa' },
  { value: 'Financial Tax Return', label: '🏦 Tax Returns / Form 16 / ITR', defaultDivision: 'visa' },
  { value: 'Other Document', label: '📁 Other Document', defaultDivision: 'general' },
];

export const ClientDocumentVault: React.FC<ClientDocumentVaultProps> = ({ token }) => {
  const queryClient = useQueryClient();
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customCategory, setCustomCategory] = useState(CUSTOM_CATEGORIES[0].value);
  const [customTitle, setCustomTitle] = useState('');
  const [customDivision, setCustomDivision] = useState('general');
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [purging, setPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['portalVaultSummary', token],
    queryFn: async () => {
      const res = await fetch(`${API}/api/public/portal/vault`, {
        headers: { 'X-Portal-Token': token },
      });
      if (!res.ok) throw new Error('Failed to load document vault.');
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 15000,
  });

  const handleDownloadSingle = (docId: string, fileName: string) => {
    const downloadUrl = `${API}/api/public/portal/documents/${docId}/download?token=${encodeURIComponent(token)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloading ${fileName}...`);
  };

  const handleDownloadAll = async () => {
    if (!data?.documents || data.documents.length === 0) {
      showToast('No documents available to download.');
      return;
    }

    setDownloadingAll(true);
    showToast(`Initiating download for ${data.documents.length} files...`);

    for (const doc of data.documents) {
      if (!doc.isPurged) {
        handleDownloadSingle(doc.id, doc.fileName);
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    setDownloadingAll(false);
  };

  const handleDeleteDocument = async (docId: string, fileName: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${fileName}"? This will free your cloud storage space.`);
    if (!confirmed) return;

    try {
      const res = await fetch(`${API}/api/public/portal/documents/${docId}?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
        headers: { 'X-Portal-Token': token },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete document.');
      showToast(`✓ "${fileName}" deleted and space cleared.`);
      queryClient.invalidateQueries({ queryKey: ['portalVaultSummary', token] });
    } catch (err: any) {
      alert(err.message || 'Error deleting file.');
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    const finalLabel = customTitle.trim() || customCategory;
    setUploading(true);
    setUploadError(null);

    try {
      // 1. Fetch Presigned URL
      const presignedRes = await fetch(
        `${API}/api/public/portal/documents/presigned?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(
          customFile.name
        )}&label=${encodeURIComponent(finalLabel)}&division=${encodeURIComponent(customDivision)}`
      );
      const presigned = await presignedRes.json();
      if (!presignedRes.ok || !presigned.url) {
        throw new Error(presigned.error || 'Failed to generate upload ticket.');
      }

      // 2. Direct PUT to R2
      const putRes = await fetch(presigned.url, {
        method: 'PUT',
        body: customFile,
      });
      if (!putRes.ok) {
        throw new Error('Cloud storage upload failed. Please verify file format.');
      }

      showToast(`✓ "${customFile.name}" uploaded successfully.`);
      setIsCustomModalOpen(false);
      setCustomFile(null);
      setCustomTitle('');
      queryClient.invalidateQueries({ queryKey: ['portalVaultSummary', token] });
    } catch (err: any) {
      setUploadError(err.message || 'Upload error occurred.');
    } finally {
      setUploading(false);
    }
  };

  const handleVoluntaryPurge = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to permanently clear your document files from the cloud vault? Make sure you have downloaded them first. Cryptographic audit proof will be retained.'
    );
    if (!confirmed) return;

    setPurging(true);
    try {
      const res = await fetch(`${API}/api/public/portal/vault/purge-voluntary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Portal-Token': token,
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to release storage.');
      setPurgeSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['portalVaultSummary', token] });
      showToast('Vault storage successfully released.');
    } catch (err: any) {
      alert(err.message || 'Error releasing vault storage.');
    } finally {
      setPurging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center py-16">
        <svg className="animate-spin h-8 w-8 text-[#0a2d50] mx-auto mb-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm font-bold text-slate-700">Loading Secure Document Vault...</p>
        <p className="text-xs text-slate-400 mt-1">Verifying encrypted R2 object keys and DPDP retention status</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-red-200 text-center">
        <div className="text-3xl mb-2">⚠️</div>
        <h3 className="text-base font-bold text-red-800">Unable to load Document Vault</h3>
        <p className="text-xs text-slate-500 mt-1">Please ensure your client session is valid and refresh the page.</p>
      </div>
    );
  }

  const storage = data?.storage || { usedMb: 0, maxMb: 50, percentUsed: 0 };
  const lifecycle = data?.lifecycle || { retentionStatus: 'active_journey', graceDaysLeft: 30 };
  const isGracePeriod = lifecycle.retentionStatus === 'grace_period';
  const isExpired = lifecycle.retentionStatus === 'expired';
  const customDocs: any[] = data?.customDocuments || [];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0a2d50] text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl border border-brand-gold/30 flex items-center gap-2">
          <span>⚡</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Storage & 30-Day Lifecycle Retention Banner */}
      <div className="bg-gradient-to-r from-[#0a2d50] via-[#0d3b66] to-[#0a2d50] rounded-3xl p-6 text-white shadow-lg border border-brand-gold/20 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="bg-brand-gold/20 text-amber-300 border border-brand-gold/40 text-[11px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                🔒 Confidential Document Vault
              </span>
              <span className="text-white/60 text-xs font-mono">• 30-Day Lifecycle Retention</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-display text-white">
              Verified Candidate &amp; Student Document Repository
            </h2>
            <p className="text-white/80 text-xs sm:text-sm leading-relaxed">
              Encrypted Cloudflare R2 object vault for university admissions, embassy visa files, certificate attestation, and customized documents.
            </p>
          </div>

          {/* Storage Meter Widget */}
          <div className="w-full lg:w-72 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 space-y-2.5">
            <div className="flex justify-between items-center text-xs text-white/90">
              <span className="font-semibold">Vault Storage Allocation</span>
              <span className="font-mono font-bold text-amber-300">
                {storage.usedMb} MB / {storage.maxMb} MB
              </span>
            </div>
            <div className="h-2.5 w-full bg-black/20 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  storage.percentUsed > 80 ? 'bg-red-400' : 'bg-gradient-to-r from-amber-400 to-emerald-400'
                }`}
                style={{ width: `${Math.max(4, storage.percentUsed)}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-white/70">
              <span>{data?.documents?.length || 0} files stored</span>
              <span>{storage.percentUsed}% Quota Used</span>
            </div>
          </div>
        </div>

        {/* 30-Day Lifecycle Retention Status Alert Strip */}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-white/90">
            {isGracePeriod ? (
              <>
                <span className="px-2.5 py-1 bg-amber-400/20 text-amber-300 border border-amber-400/40 rounded-xl font-bold">
                  ⏳ 30-Day Auto-Purge: {lifecycle.graceDaysLeft} Days Remaining
                </span>
                <span className="text-white/80">
                  Your application is completed. Documents are scheduled for cloud cleanup in {lifecycle.graceDaysLeft} days.
                </span>
              </>
            ) : isExpired ? (
              <>
                <span className="px-2.5 py-1 bg-red-400/20 text-red-300 border border-red-400/40 rounded-xl font-bold">
                  🗑️ Storage Purged
                </span>
                <span className="text-white/80">
                  30-day post-completion grace period has concluded. Binary files have been cleared from cloud storage.
                </span>
              </>
            ) : (
              <>
                <span className="px-2.5 py-1 bg-emerald-400/20 text-emerald-300 border border-emerald-400/40 rounded-xl font-bold">
                  🟢 Active Application Phase
                </span>
                <span className="text-white/80">
                  Document storage is actively protected and accessible throughout your processing journey.
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={downloadingAll || !data?.documents?.length}
              onClick={handleDownloadAll}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-500 text-brand-navy shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>📦</span>
              <span>{downloadingAll ? 'Downloading All...' : 'Download Dossier (.ZIP)'}</span>
            </button>

            {data?.documents?.length > 0 && (
              <button
                type="button"
                disabled={purging}
                onClick={handleVoluntaryPurge}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer disabled:opacity-50"
                title="Voluntarily release cloud storage after downloading"
              >
                <span>{purging ? 'Purging...' : 'Release Storage'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {purgeSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center gap-3 shadow-xs">
          <span className="text-lg">✓</span>
          <div>
            <strong>Storage Released:</strong> All binary files have been permanently cleared from R2 cloud storage. Cryptographic hash receipts remain on record for legal compliance.
          </div>
        </div>
      )}

      {/* Purpose-Gated Document Slots Grid */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display font-black text-lg text-brand-navy">Required Core Document Slots</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Standard essential documents for admissions, visa, attestation, and jobs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCustomTitle('');
              setCustomFile(null);
              setUploadError(null);
              setIsCustomModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-brand-gold hover:bg-brand-gold/90 text-brand-navy shadow-sm transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>➕</span>
            <span>Upload Other / Custom Document</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {REQUIRED_SLOTS.map((slot) => {
            const uploadedFile = data?.slots?.[slot.key];
            const isVerified = uploadedFile?.status === 'verified';
            const isPending = uploadedFile?.status === 'pending';
            const isRejected = uploadedFile?.status === 'rejected';

            return (
              <div
                key={slot.key}
                className={`p-5 rounded-2xl border transition flex flex-col justify-between space-y-4 ${
                  uploadedFile
                    ? 'bg-gradient-to-br from-white to-slate-50 border-slate-200 shadow-xs'
                    : 'bg-slate-50/60 border-dashed border-slate-300 hover:border-brand-gold/60'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{slot.icon}</span>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          {slot.category}
                        </span>
                        <h4 className="text-xs font-bold text-brand-navy leading-tight">{slot.label}</h4>
                      </div>
                    </div>

                    {uploadedFile && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isVerified
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isPending
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : isRejected
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {isVerified ? '✓ Verified' : isPending ? '⏳ In Review' : '✕ Re-upload'}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">{slot.hint}</p>

                  {uploadedFile && (
                    <div className="p-3 bg-white border border-slate-200/80 rounded-xl space-y-1 text-xs">
                      <div className="font-mono font-bold text-slate-800 truncate" title={uploadedFile.fileName}>
                        📄 {uploadedFile.fileName}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{uploadedFile.sizeBytes ? `${(uploadedFile.sizeBytes / 1024).toFixed(0)} KB` : 'PDF'}</span>
                        <span>{uploadedFile.version || 'v1.0'}</span>
                        <span>
                          {uploadedFile.uploadedAt
                            ? new Date(uploadedFile.uploadedAt * 1000).toLocaleDateString()
                            : 'Recently'}
                        </span>
                      </div>
                      {uploadedFile.sha256 && (
                        <div className="text-[9px] font-mono text-slate-400 truncate" title={uploadedFile.sha256}>
                          SHA: {uploadedFile.sha256.slice(0, 16)}...
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {uploadedFile ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDownloadSingle(uploadedFile.id, uploadedFile.fileName)}
                        className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-[#0a2d50] hover:bg-[#0d3b66] text-white transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>⬇</span>
                        <span>Download</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomTitle(slot.label);
                          setCustomCategory(slot.category);
                          setCustomDivision(slot.division);
                          setCustomFile(null);
                          setUploadError(null);
                          setIsCustomModalOpen(true);
                        }}
                        className="py-2 px-3 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                      >
                        Replace
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomTitle(slot.label);
                        setCustomCategory(slot.category);
                        setCustomDivision(slot.division);
                        setCustomFile(null);
                        setUploadError(null);
                        setIsCustomModalOpen(true);
                      }}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-white border border-slate-300 hover:border-brand-gold text-brand-navy hover:bg-amber-50/50 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span>➕</span>
                      <span>Upload {slot.label}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Additional & Custom Uploaded Documents Grid */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display font-black text-lg text-brand-navy">Additional &amp; Custom Documents</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Experience letters, police clearance, medical reports, affidavits, or other counselor-requested files.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCustomTitle('');
              setCustomFile(null);
              setUploadError(null);
              setIsCustomModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>➕</span>
            <span>Add Another Document</span>
          </button>
        </div>

        {customDocs.length === 0 ? (
          <div className="p-8 text-center bg-slate-50/60 border border-dashed border-slate-200 rounded-2xl">
            <span className="text-3xl block mb-2">📁</span>
            <p className="text-xs font-bold text-slate-700">No additional documents uploaded yet</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Have extra experience certificates, police clearances, or sponsor tax returns? Click "Upload Other Document" above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customDocs.map((doc) => {
              const isVerified = doc.status === 'verified';
              const isPending = doc.status === 'pending';

              return (
                <div
                  key={doc.id}
                  className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-brand-navy truncate flex-1" title={doc.docLabel || doc.fileName}>
                        📄 {doc.docLabel || doc.fileName}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                          isVerified
                            ? 'bg-emerald-100 text-emerald-800'
                            : isPending
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {isVerified ? '✓ Verified' : isPending ? '⏳ Reviewing' : '✕ Re-upload'}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-xs">
                      <div className="text-[11px] font-mono text-slate-600 truncate" title={doc.fileName}>
                        {doc.fileName}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>{doc.sizeBytes ? `${(doc.sizeBytes / 1024).toFixed(0)} KB` : 'File'}</span>
                        <span>{doc.version || 'v1.0'}</span>
                        <span>{doc.uploadedAt ? new Date(doc.uploadedAt * 1000).toLocaleDateString() : 'Recently'}</span>
                      </div>
                      {doc.sha256 && (
                        <div className="text-[9px] font-mono text-slate-400 truncate">
                          SHA: {doc.sha256.slice(0, 16)}...
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadSingle(doc.id, doc.fileName)}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-[#0a2d50] hover:bg-[#0d3b66] text-white transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>⬇</span>
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc.id, doc.fileName)}
                      className="p-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 transition cursor-pointer"
                      title="Delete document and free storage"
                    >
                      <span>🗑️</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Document Upload Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto font-sans">
          <div className="bg-white rounded-3xl border border-brand-gold/30 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-gradient-to-r from-[#0a2d50] to-[#0d3b66] p-5 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Upload Other / Custom Document</h3>
                <p className="text-white/70 text-xs">Direct encrypted upload to Cloudflare R2 storage</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="text-white/70 hover:text-white p-1.5 rounded-full hover:bg-white/10 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              {uploadError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                  {uploadError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Document Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={customCategory}
                  onChange={(e) => {
                    setCustomCategory(e.target.value);
                    const found = CUSTOM_CATEGORIES.find((c) => c.value === e.target.value);
                    if (found) setCustomDivision(found.defaultDivision);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] bg-white"
                >
                  {CUSTOM_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Document Label / Title (Optional)
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. 3 Years Experience Letter - Infosys"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Associated Service Division
                </label>
                <select
                  value={customDivision}
                  onChange={(e) => setCustomDivision(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a2d50] bg-white"
                >
                  <option value="general">🌐 General / Multi-Service</option>
                  <option value="study-abroad">🎓 Study Abroad Admissions</option>
                  <option value="visa">🛂 Visa Processing Desk</option>
                  <option value="attestation">📑 Document Attestation</option>
                  <option value="manpower">💼 Overseas Job Placement</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Select File (PDF, JPG, PNG &lt; 5MB) <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (f && f.size > 5 * 1024 * 1024) {
                      setUploadError('File size exceeds 5MB limit. Please compress the file.');
                      setCustomFile(null);
                    } else {
                      setUploadError(null);
                      setCustomFile(f);
                    }
                  }}
                  className="w-full p-2 text-xs border border-slate-300 rounded-xl file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#0a2d50] file:text-white hover:file:bg-[#0d3b66] cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !customFile}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#0a2d50] hover:bg-[#0d3b66] text-white shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Encrypting &amp; Uploading...</span>
                    </>
                  ) : (
                    <span>Upload Document →</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DPDP Act 2023 & Security Policy Footnote */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 space-y-2">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <span>🛡️</span>
          <span>Digital Personal Data Protection (DPDP Act 2023) &amp; Storage Guarantee</span>
        </div>
        <p className="leading-relaxed">
          All client files uploaded to OpusOS are encrypted in Cloudflare R2 object storage with SHA-256 integrity hashing. In accordance with data minimization best practices, client document files are retained for <strong>30 days following service completion</strong>, after which binary objects are automatically purged. Cryptographic audit receipts remain intact for verifiable legal authentication.
        </p>
      </div>
    </div>
  );
};
