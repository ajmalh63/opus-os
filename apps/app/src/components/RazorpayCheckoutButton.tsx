import { useState, type FC } from "react";
import { openRazorpayCheckout, RazorpayCheckoutOptions } from "../lib/razorpay";

interface RazorpayCheckoutButtonProps extends Omit<RazorpayCheckoutOptions, "onSuccess" | "onFailure" | "onDismiss"> {
  label?: string;
  className?: string;
  onPaymentSuccess?: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  onPaymentError?: (error: any) => void;
  disabled?: boolean;
}

export const RazorpayCheckoutButton: FC<RazorpayCheckoutButtonProps> = ({
  amountPaise,
  currency = "INR",
  label,
  className,
  name = "Opus Overseas",
  description,
  receipt,
  prefill,
  notes,
  clientId,
  engagementId,
  milestoneName,
  onPaymentSuccess,
  onPaymentError,
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formattedAmount = (amountPaise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  });

  const handleCheckout = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      await openRazorpayCheckout({
        amountPaise,
        currency,
        name,
        description: description || `Payment for ${milestoneName || "Services"}`,
        receipt,
        prefill,
        notes,
        clientId,
        engagementId,
        milestoneName,
        onSuccess: (res) => {
          setLoading(false);
          if (onPaymentSuccess) onPaymentSuccess(res);
        },
        onFailure: (err) => {
          setLoading(false);
          const msg = err?.description || err?.message || "Payment could not be completed.";
          setErrorMessage(msg);
          if (onPaymentError) onPaymentError(err);
        },
        onDismiss: () => {
          setLoading(false);
        },
      });
    } catch (err: any) {
      setLoading(false);
      setErrorMessage(err?.message || "Failed to launch payment checkout.");
      if (onPaymentError) onPaymentError(err);
    }
  };

  return (
    <div className="inline-flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleCheckout}
        disabled={disabled || loading || amountPaise < 100}
        className={
          className ||
          "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-navy hover:bg-[#08223d] text-white font-semibold text-sm transition shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        }
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-brand-gold" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Processing...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-brand-gold" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-3.74-1.47-3.74-3.13 0-1.54 1.19-2.85 2.67-3.24V5h2.67v1.43c1.45.34 2.61 1.34 2.76 2.87h-1.96c-.13-.81-.74-1.46-2.14-1.46-1.39 0-2.16.63-2.16 1.43 0 .74.52 1.32 2.37 1.77 2.73.65 4.04 1.5 4.04 3.32 0 1.74-1.28 3.01-2.91 3.26z" />
            </svg>
            <span>{label || `Pay ${formattedAmount}`}</span>
          </>
        )}
      </button>
      {errorMessage && (
        <span className="text-xs text-rose-600 font-medium">
          {errorMessage}
        </span>
      )}
    </div>
  );
};
