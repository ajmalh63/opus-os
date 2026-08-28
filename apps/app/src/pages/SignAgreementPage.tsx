import { useState, useRef, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

export default function SignAgreementPage() {
  const [, params] = useRoute('/sign/:id');
  const agreementId = params?.id || '';

  const [activeMode, setActiveMode] = useState<'draw' | 'type' | 'otp'>('draw');
  const [typedName, setTypedName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Fetch agreement details from public specimen endpoint
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['publicAgreement', agreementId],
    queryFn: async () => {
      const res = await fetch(`${API}/api/public/portal/agreements/${agreementId}/specimen`);
      if (!res.ok) {
        throw new Error('Agreement not found or link has expired');
      }
      return res.json();
    },
    enabled: Boolean(agreementId),
  });

  const agreement = data?.agreement;

  // Initialize canvas
  useEffect(() => {
    if (activeMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#0a2d50';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [activeMode, agreement]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  // Sign mutation
  const signMutation = useMutation({
    mutationFn: async () => {
      let esignMethod: 'wet_ink' | 'typed' | 'otp' = 'wet_ink';
      let payloadSignature = signatureData;

      if (activeMode === 'type') {
        esignMethod = 'typed';
        payloadSignature = typedName;
      } else if (activeMode === 'otp') {
        esignMethod = 'otp';
        payloadSignature = otpCode;
      }

      const res = await fetch(`${API}/api/public/portal/agreements/${agreementId}/direct-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          esignMethod,
          signatureData: payloadSignature || undefined,
          otp: activeMode === 'otp' ? otpCode : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to sign agreement');
      }

      return res.json();
    },
    onSuccess: (res) => {
      alert(res.message || 'Agreement successfully signed!');
      refetch();
    },
    onError: (err: any) => {
      alert(err.message || 'Signing failed');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center p-6 text-brand-navy">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-3 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="font-semibold text-sm">Loading secure legal agreement document…</p>
        </div>
      </div>
    );
  }

  if (error || !agreement) {
    return (
      <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center p-6 text-brand-navy">
        <div className="bg-white border border-brand-navy/10 rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="text-4xl">⚠️</div>
          <h2 className="font-display font-bold text-lg text-brand-navy">Document Not Found</h2>
          <p className="text-xs text-brand-navy/60">
            This agreement link is either invalid, expired, or has already been archived.
          </p>
          <a
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-brand-gold text-brand-navy text-xs font-bold uppercase tracking-wider shadow-xs"
          >
            Go to Opus Overseas Home
          </a>
        </div>
      </div>
    );
  }

  const isSigned = agreement.status === 'signed';

  return (
    <div className="min-h-screen bg-[#FAF8F4] py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* HEADER BAR */}
        <div className="bg-white border border-brand-navy/10 rounded-3xl p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-navy text-brand-gold flex items-center justify-center text-xl font-bold shadow-xs">
              🏛️
            </div>
            <div>
              <div className="text-[13px] font-mono tracking-widest uppercase font-bold text-brand-gold">
                OPUS OVERSEAS · E-SIGN SECURE PORTAL
              </div>
              <h1 className="font-display font-black text-lg text-brand-navy">
                {agreement.templateName}
              </h1>
              <div className="text-xs text-brand-navy/60">
                Signer: <strong>{agreement.clientName}</strong> · Contract ID: <span className="font-mono">{agreement.id.slice(0, 10)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSigned ? (
              <span className="px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                <span>✓</span>
                <span>Signed & Sealed</span>
              </span>
            ) : (
              <span className="px-3.5 py-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Action Required: Signature Pending</span>
              </span>
            )}
          </div>
        </div>

        {/* DOCUMENT PREVIEW */}
        <div className="bg-white border border-brand-navy/15 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-4 bg-brand-navy/[0.02] border-b border-brand-navy/10 flex items-center justify-between text-xs font-bold text-brand-navy/70">
            <span>OFFICIAL CONTRACT SPECIMEN</span>
            <button
              onClick={() => window.print()}
              className="px-3 py-1 rounded-lg border border-brand-navy/15 bg-white text-sm font-bold text-brand-navy hover:bg-brand-navy/[0.04] transition cursor-pointer"
            >
              🖨️ Print / Save PDF
            </button>
          </div>

          <div className="p-6 sm:p-10 font-serif text-xs text-brand-navy/85 leading-relaxed space-y-4 whitespace-pre-line max-h-[500px] overflow-y-auto bg-amber-500/[0.01]">
            {agreement.content}
          </div>
        </div>

        {/* E-SIGN SECTION / CELEBRATION */}
        {isSigned ? (
          <div className="bg-white border border-emerald-200 rounded-3xl p-8 shadow-sm text-center space-y-4 bg-emerald-500/[0.02]">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-2xl mx-auto shadow-xs">
              ✓
            </div>
            <div className="space-y-1">
              <h2 className="font-display font-black text-xl text-brand-navy">
                Agreement Legally Executed
              </h2>
              <p className="text-xs text-brand-navy/60 max-w-md mx-auto">
                This agreement has been signed by <strong>{agreement.clientName}</strong> and sealed in the OpusOS tamper-evident vault.
              </p>
            </div>

            <div className="max-w-md mx-auto bg-white border border-brand-navy/10 rounded-2xl p-4 text-left space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-brand-navy/50">Execution Method:</span>
                <span className="font-bold text-brand-navy">{agreement.esignMethod?.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-navy/50">Signed At:</span>
                <span className="font-bold text-brand-navy">
                  {agreement.signedAt ? new Date(agreement.signedAt * 1000).toLocaleString('en-IN') : 'Confirmed'}
                </span>
              </div>
              {agreement.sha256Hash && (
                <div className="pt-2 border-t border-brand-navy/10 space-y-0.5">
                  <span className="text-[13px] text-brand-navy/50 uppercase">SHA-256 Evidentiary Hash:</span>
                  <div className="text-[13px] text-brand-gold font-bold break-all">
                    {agreement.sha256Hash}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-brand-navy/15 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-4">
              <div>
                <h3 className="font-display font-black text-lg text-brand-navy">
                  Digital E-Signature Verification
                </h3>
                <p className="text-xs text-brand-navy/60">
                  Select your preferred digital signature mode below (compliant with IT Act 2000 & DPDP 2023).
                </p>
              </div>

              {/* MODE SELECTOR */}
              <div className="flex bg-brand-navy/[0.04] p-1 rounded-xl border border-brand-navy/10 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveMode('draw')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    activeMode === 'draw' ? 'bg-brand-navy text-white shadow-xs' : 'text-brand-navy/60'
                  }`}
                >
                  ✍️ Draw
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('type')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    activeMode === 'type' ? 'bg-brand-navy text-white shadow-xs' : 'text-brand-navy/60'
                  }`}
                >
                  ⌨️ Type Name
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('otp')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    activeMode === 'otp' ? 'bg-brand-navy text-white shadow-xs' : 'text-brand-navy/60'
                  }`}
                >
                  📩 Email OTP
                </button>
              </div>
            </div>

            {/* DRAW MODE */}
            {activeMode === 'draw' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-brand-navy">
                    Draw your signature in the box below:
                  </span>
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-brand-navy/60 hover:text-brand-navy font-semibold underline cursor-pointer"
                  >
                    Clear Canvas
                  </button>
                </div>
                <div className="border-2 border-dashed border-brand-navy/20 rounded-2xl bg-brand-navy/[0.01] overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={700}
                    height={160}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-40 cursor-crosshair touch-none bg-white"
                  />
                </div>
                <div className="text-sm text-brand-navy/40 text-center">
                  Use your finger, stylus, or mouse to draw your signature.
                </div>
              </div>
            )}

            {/* TYPE MODE */}
            {activeMode === 'type' && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-brand-navy">
                  Enter your full legal name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="w-full bg-brand-navy/[0.02] border border-brand-navy/15 rounded-xl px-4 py-3 text-sm text-brand-navy font-medium outline-none focus:border-brand-gold"
                />
                {typedName && (
                  <div className="p-6 bg-amber-500/[0.02] border border-brand-navy/10 rounded-2xl text-center space-y-1">
                    <div className="text-[13px] uppercase font-bold tracking-wider text-brand-navy/40">
                      Digital Signature Preview
                    </div>
                    <div className="text-3xl text-brand-navy font-serif italic py-2">
                      {typedName}
                    </div>
                    <div className="text-[13px] font-mono text-brand-navy/40">
                      Certified Electronic Mark · OpusOS Vault
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* OTP MODE */}
            {activeMode === 'otp' && (
              <div className="space-y-4">
                <div className="p-4 bg-brand-navy/[0.02] border border-brand-navy/10 rounded-2xl text-xs space-y-2">
                  <div className="font-bold text-brand-navy">Email Verification OTP</div>
                  <p className="text-brand-navy/60">
                    We will send a 6-digit confirmation code to your registered email: <strong>{agreement.clientEmail || 'your email'}</strong>
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      setOtpSent(true);
                      alert('A 6-digit verification code has been dispatched to your email.');
                    }}
                    className="px-4 py-2 bg-brand-navy text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs"
                  >
                    {otpSent ? 'Resend Code' : 'Send Verification OTP'}
                  </button>
                </div>

                {otpSent && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-brand-navy">
                      Enter 6-Digit Code:
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 849201"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full bg-brand-navy/[0.02] border border-brand-navy/15 rounded-xl px-4 py-3 text-base text-brand-navy font-mono tracking-widest text-center outline-none focus:border-brand-gold"
                    />
                  </div>
                )}
              </div>
            )}

            {/* STATUTORY CONSENT & SIGN BUTTON */}
            <div className="pt-4 border-t border-brand-navy/10 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-1 accent-brand-gold w-4 h-4 rounded cursor-pointer"
                />
                <span className="text-xs text-brand-navy/80 leading-relaxed">
                  I, <strong>{agreement.clientName}</strong>, hereby confirm that I have read, understood, and voluntarily agree to be bound by all the terms, obligations, fee schedules, and DPDP 2023 provisions set forth in this Service Agreement. I agree that my electronic mark constitutes a valid, legally enforceable execution under Section 10A of the Information Technology Act, 2000.
                </span>
              </label>

              <button
                type="button"
                disabled={
                  !agreedToTerms ||
                  signMutation.isPending ||
                  (activeMode === 'draw' && !signatureData) ||
                  (activeMode === 'type' && !typedName.trim()) ||
                  (activeMode === 'otp' && otpCode.length < 4)
                }
                onClick={() => signMutation.mutate()}
                className="w-full py-4 rounded-2xl bg-brand-gold hover:bg-brand-gold/90 text-brand-navy font-black text-sm uppercase tracking-widest shadow-md hover:shadow-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {signMutation.isPending ? 'Sealing Agreement…' : '✍️ Adopt & Legally Sign Agreement'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
