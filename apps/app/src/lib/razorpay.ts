/**
 * Razorpay Standard Web Checkout Client
 * 
 * Supports standard web modal checkout via checkout.js, order creation,
 * signature verification, payment failure handler, and modal dismiss handler.
 */

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const API = (import.meta as any).env?.VITE_API_URL || '';

export interface RazorpayCheckoutOptions {
  amountPaise: number; // Minimum 100 paise (₹1)
  currency?: string; // Default: "INR"
  receipt?: string;
  name?: string;
  description?: string;
  image?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  clientId?: string;
  engagementId?: string;
  milestoneName?: string;
  onSuccess?: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onFailure?: (error: any) => void;
  onDismiss?: () => void;
}

export async function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.Razorpay) return true;

  return new Promise((resolve) => {
    const existing = document.querySelector("script[src=\"https://checkout.razorpay.com/v1/checkout.js\"]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function openRazorpayCheckout(opts: RazorpayCheckoutOptions): Promise<void> {
  if (opts.amountPaise < 100) {
    throw new Error("Minimum checkout amount is 100 paise (₹1).");
  }

  // 1. Ensure Razorpay script is loaded
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    throw new Error("Failed to load Razorpay SDK. Please check your network connection.");
  }

  // 2. Create Order on Backend (STEP 1)
  const orderRes = await fetch(`${API}/api/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: opts.amountPaise,
      currency: opts.currency || "INR",
      receipt: opts.receipt || `rcpt_${Date.now().toString(36)}`,
      notes: opts.notes || {},
    }),
  });

  const orderData = await orderRes.json();
  if (!orderRes.ok || !orderData.order_id) {
    throw new Error(orderData.error || orderData.details || "Order creation failed.");
  }

  const keyId =
    orderData.key_id ||
    (import.meta.env.VITE_RAZORPAY_KEY_ID as string);

  if (!keyId) {
    throw new Error("Razorpay Key ID is not configured on the server.");
  }

  // 3. Configure Razorpay Standard Checkout Modal (STEP 2)
  const rzpOptions = {
    key: keyId,
    amount: orderData.amount,
    currency: orderData.currency || "INR",
    name: opts.name || "Opus Overseas",
    description: opts.description || "Advisory & Processing Services",
    image: opts.image || "https://opusoverseas.com/logo.svg",
    order_id: orderData.order_id,
    prefill: opts.prefill || {},
    notes: opts.notes || {},
    theme: {
      color: "#0a2d50", // OpusOS Brand Navy
    },
    handler: async function (response: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }) {
      // 4. Verify Signature on Backend (STEP 3)
      try {
        const verifyRes = await fetch(`${API}/api/verify-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            clientId: opts.clientId,
            engagementId: opts.engagementId,
            milestoneName: opts.milestoneName,
          }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.success) {
          throw new Error(verifyData.error || "Signature verification failed.");
        }

        if (opts.onSuccess) {
          opts.onSuccess(response);
        }
      } catch (err: any) {
        if (opts.onFailure) {
          opts.onFailure(err);
        }
      }
    },
    modal: {
      ondismiss: function () {
        if (opts.onDismiss) {
          opts.onDismiss();
        }
      },
    },
  };

  const rzp = new window.Razorpay(rzpOptions);

  rzp.on("payment.failed", function (response: any) {
    if (opts.onFailure) {
      opts.onFailure(response.error);
    }
  });

  rzp.open();
}
