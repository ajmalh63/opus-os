import { useState } from "react";
import { RazorpayCheckoutButton } from "../components/RazorpayCheckoutButton";

export default function TestPaymentPage() {
  const [amountRupees, setAmountRupees] = useState(500);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const amountPaise = Math.max(100, Math.round(amountRupees * 100));

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#0a2d50] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0a2d50]/5 text-[#0a2d50] text-xs font-semibold uppercase tracking-wider mb-3">
            Razorpay Sandbox Verification
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0a2d50] sm:text-4xl">
            Complete Razorpay Test Payment
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Use this checkout page to perform a test transaction so Razorpay verifies your integration.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 space-y-6">
          {/* Test Instruments Helper */}
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2 flex items-center gap-1.5">
              <span>💳</span> Razorpay Test Credentials (Click to Copy)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div
                onClick={() => copyToClipboard("4100280000001007", "Card Number")}
                className="bg-white p-2.5 rounded-lg border border-amber-200 cursor-pointer hover:border-amber-400 transition"
              >
                <div className="text-gray-500 font-medium">Test Visa Card:</div>
                <div className="font-mono font-bold text-gray-900 mt-0.5">4100 2800 0000 1007</div>
                <div className="text-sm text-gray-500 mt-0.5">Expiry: 12/26 · CVV: 123</div>
              </div>
              <div
                onClick={() => copyToClipboard("test@razorpay", "UPI VPA")}
                className="bg-white p-2.5 rounded-lg border border-amber-200 cursor-pointer hover:border-amber-400 transition"
              >
                <div className="text-gray-500 font-medium">Test UPI ID:</div>
                <div className="font-mono font-bold text-gray-900 mt-0.5">test@razorpay</div>
                <div className="text-sm text-gray-500 mt-0.5">Instant simulation</div>
              </div>
            </div>
            {copiedText && (
              <div className="text-xs text-amber-800 font-semibold mt-2">
                ✓ Copied {copiedText} to clipboard!
              </div>
            )}
          </div>

          {/* Amount Selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Select Test Amount (INR)
            </label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[100, 500, 1000, 5000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setAmountRupees(amt)}
                  className={`py-2 px-3 text-sm font-semibold rounded-lg border transition ${
                    amountRupees === amt
                      ? "bg-[#0a2d50] text-white border-[#0a2d50]"
                      : "bg-white text-gray-700 border-gray-200 hover:border-[#0a2d50]"
                  }`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-sm font-medium">
                ₹
              </span>
              <input
                type="number"
                min="1"
                value={amountRupees}
                onChange={(e) => setAmountRupees(Number(e.target.value))}
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#0a2d50] focus:border-[#0a2d50]"
                placeholder="Custom amount"
              />
            </div>
          </div>

          {/* Checkout Button */}
          <div className="pt-2 flex flex-col items-center">
            <RazorpayCheckoutButton
              amountPaise={amountPaise}
              label={`Launch Razorpay Checkout (₹${amountRupees})`}
              className="w-full py-3.5 px-6 rounded-xl bg-[#0a2d50] hover:bg-[#08223d] text-white font-bold text-base transition shadow-lg hover:shadow-xl cursor-pointer flex items-center justify-center gap-2"
              prefill={{
                name: "Ajmal Hussain",
                email: "contact@opusoverseas.com",
                contact: "+919398848376",
              }}
              notes={{
                reason: "Merchant Onboarding Test Transaction",
              }}
              onPaymentSuccess={(res) => {
                setPaymentResult({ success: true, ...res });
              }}
              onPaymentError={(err) => {
                setPaymentResult({ success: false, error: err });
              }}
            />
            <p className="text-xs text-gray-500 mt-2">
              🔒 Standard Razorpay Checkout Popup · Test Mode
            </p>
          </div>

          {/* Success Banner */}
          {paymentResult?.success && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-900 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                <span>🎉</span> Payment Captured & Verified Successfully!
              </div>
              <div className="mt-2 text-xs font-mono bg-white p-2.5 rounded border border-emerald-200 space-y-1">
                <div><strong>Payment ID:</strong> {paymentResult.razorpay_payment_id}</div>
                <div><strong>Order ID:</strong> {paymentResult.razorpay_order_id}</div>
                <div><strong>Status:</strong> Verified with HMAC-SHA256 ✓</div>
              </div>
              <p className="text-xs text-emerald-700 mt-2">
                This transaction is now recorded in your Razorpay Sandbox Dashboard!
              </p>
            </div>
          )}

          {/* Error Banner */}
          {paymentResult?.success === false && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-900">
              <div className="font-bold text-sm text-rose-800">Payment Unsuccessful</div>
              <div className="text-xs mt-1 text-rose-700">
                {paymentResult.error?.description || paymentResult.error?.message || JSON.stringify(paymentResult.error)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
