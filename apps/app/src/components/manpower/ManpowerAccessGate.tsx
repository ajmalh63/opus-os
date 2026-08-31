import React, { useState } from 'react';
import { loadRazorpayScript } from '../../lib/razorpay';
import { apiFetch, ApiError } from '../../lib/apiClient';

export interface ManpowerAccessGateProps {
  clientToken: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  isModal?: boolean;
}

export const ManpowerAccessGate: React.FC<ManpowerAccessGateProps> = ({
  clientToken,
  clientName,
  clientEmail,
  clientPhone,
  onSuccess,
  onCancel,
  isModal = true,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Ensure Razorpay checkout.js script is loaded
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Could not load secure payment gateway. Please check your internet connection.');
      }

      // 2. Create Razorpay order for candidate-pass (₹100 = 10,000 paise).
      // P2-6: routed through apiFetch — 429/Retry-After aware, normalized errors.
      let orderData: any;
      try {
        orderData = await apiFetch('/api/public/portal/manpower/membership/order', {
          method: 'POST',
          body: JSON.stringify({ token: clientToken, planKey: 'candidate-pass' }),
        });
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 409 && err.payload?.code === 'ALREADY_VERIFIED') {
          // Trust: already lifetime verified — no further payment, just unlock
          if (onSuccess) onSuccess();
          setLoading(false);
          return;
        }
        throw err; // outer catch surfaces the server's message
      }
      if (!orderData?.order_id) {
        throw new Error(orderData?.error || 'Failed to initialize verification order.');
      }

      // 3. Launch Razorpay Standard Checkout Modal
      const options = {
        key: orderData.key,
        amount: orderData.amount_paise,
        currency: orderData.currency || 'INR',
        name: 'Opus Overseas',
        description: 'Lifetime Candidate Verification Pass',
        image: '/brand-icon.png',
        order_id: orderData.order_id,
        prefill: {
          name: clientName || '',
          email: clientEmail || '',
          contact: clientPhone || '',
        },
        theme: {
          color: '#0a2d50', // Brand Navy
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            // 4. Verify payment signature on backend (P2-6: apiFetch)
            const verifyData = await apiFetch('/api/public/portal/manpower/membership/verify', {
              method: 'POST',
              body: JSON.stringify({
                token: clientToken,
                planKey: 'candidate-pass',
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            if (!verifyData?.success) {
              throw new Error('Payment verification failed.');
            }

            // Success! Trigger callback
            if (onSuccess) onSuccess();
          } catch (err: any) {
            setError(err?.message || 'Verification confirmation failed.');
          } finally {
            setLoading(false);
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        setError(resp.error?.description || 'Payment was declined. Please try another method.');
        setLoading(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err?.message || 'Failed to start payment.');
      setLoading(false);
    }
  };

  const content = (
    <div className="bg-white rounded-3xl border border-amber-500/20 shadow-2xl overflow-hidden max-w-xl w-full mx-auto relative font-sans text-slate-800">
      {/* Brand Header Banner */}
      <div className="bg-gradient-to-r from-[#0a2d50] via-[#0d3b66] to-[#0a2d50] p-6 sm:p-8 text-white relative">
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        
        {isModal && onCancel && (
          <button
            onClick={onCancel}
            aria-label="Close modal"
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <div className="flex items-center gap-3 mb-2">
          <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
            🛡️ Candidate Authenticity Pass
          </span>
          <span className="text-white/60 text-xs font-medium">One-Time Fee</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
          Unlock Overseas Jobs Desk
        </h2>
        <p className="text-white/80 text-sm mt-1">
          One-time ₹100 verification pass for lifetime access & unlimited job applications.
        </p>

        {/* Pricing Badge */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-extrabold text-amber-400">₹100</span>
          <span className="text-xs text-white/70">inclusive of 18% GST • Lifetime Validity</span>
        </div>
      </div>

      {/* Main Body & Points */}
      <div className="p-6 sm:p-8 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-start gap-3">
            <span className="text-red-500 font-bold">✕</span>
            <div>{error}</div>
          </div>
        )}

        {/* Reason for the Pass */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 text-sm text-slate-700">
          <div className="font-semibold text-slate-900 flex items-center gap-2 mb-1">
            <span className="text-amber-500">ℹ️</span> Why is there a ₹100 verification fee?
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            To eliminate automated spam bots and ensure international employers receive applications from 
            <strong> authentic, genuine candidates</strong>, a nominal one-time verification pass is required.
          </p>
        </div>

        {/* Strict Merit-Based Disclaimer Card */}
        <div className="bg-amber-50/80 border border-amber-300/80 rounded-2xl p-4 sm:p-5 text-xs sm:text-sm text-amber-950">
          <div className="font-bold text-amber-900 flex items-center gap-2 mb-1">
            <span>⚠️</span> Transparent Hiring & Merit Policy
          </div>
          <ul className="space-y-1.5 list-disc list-inside text-xs text-amber-900/90 leading-relaxed">
            <li>This payment is strictly an <strong>anti-spam verification pass</strong>.</li>
            <li>It does <strong>NOT guarantee job selection or interview priority</strong>.</li>
            <li>All hiring decisions are <strong>100% merit-based</strong> and evaluated solely by overseas employers.</li>
          </ul>
        </div>

        {/* What You Get Highlights */}
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            What’s included in your Lifetime Pass:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700">
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Unlimited Job Applications</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Secure Cloudflare R2 Resume Vault</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Global Recruiter Matching</span>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>WhatsApp & Email Interview Alerts</span>
            </div>
          </div>
        </div>

        {/* CTA Unlock Button */}
        <button
          onClick={handleUnlock}
          disabled={loading}
          className="w-full py-4 px-6 rounded-2xl font-bold text-base bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-[0.99] transition flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-slate-950" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Connecting to Secure Gateway...</span>
            </>
          ) : (
            <>
              <span>🔒 Unlock Lifetime Candidate Access • ₹100</span>
              <span className="text-xs bg-slate-950/10 py-1 px-2 rounded-lg font-mono">UPI / Card</span>
            </>
          )}
        </button>

        {/* Trust Badges Footer */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
          <span className="flex items-center gap-1">
            <span className="text-emerald-600">🛡️</span> 256-Bit SSL Razorpay Security
          </span>
          <span className="flex items-center gap-1">
            <span>🧾</span> Instant GST Statutory Invoice
          </span>
          <span className="flex items-center gap-1">
            <span>🏛️</span> Opus Overseas Verified
          </span>
        </div>
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      {content}
    </div>
  );
};
