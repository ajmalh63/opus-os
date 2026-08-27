import { useVisibilityTracking } from '../lib/visibilityTracking';
import { useSearch } from 'wouter';

// Public payment callback page — where Razorpay redirects the customer after
// paying a payment link (set CALLBACK_URL on the API, e.g.
// https://<app>/payment-confirmed). Reads the raw query params Razorpay appends:
// razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_status,
// razorpay_signature. Never trusts the page alone — the ledger updates only via
// the verified payment_link.paid webhook; this is UX confirmation only.
export default function PaymentConfirmed() {
  useVisibilityTracking('/payment-confirmed');
  const q = new URLSearchParams(useSearch());
  const status = q.get('razorpay_payment_link_status') || 'unknown';
  const paymentId = q.get('razorpay_payment_id') || '';
  const linkId = q.get('razorpay_payment_link_id') || '';

  const paid = status === 'paid';
  const partial = status === 'partially_paid';

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${paid ? 'bg-emerald-100 text-emerald-600' : partial ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
          {paid ? '✓' : partial ? '◐' : '…'}
        </div>
        <h1 className="mt-4 font-display text-xl font-extrabold tracking-tight text-brand-navy">
          {paid ? 'Payment received' : partial ? 'Partial payment received' : 'Payment in progress'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {paid
            ? 'Thank you — your payment has been recorded. A receipt will be sent to you shortly.'
            : partial
              ? 'We received part of the amount. We will update your balance shortly.'
              : 'Your payment is being processed. You will see a confirmation here and by email once it completes.'}
        </p>
        {(paymentId || linkId) && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-500">
            {paymentId && <div>payment: {paymentId}</div>}
            {linkId && <div>link: {linkId}</div>}
          </div>
        )}
        <a href="/" className="mt-6 inline-block rounded-full bg-brand-gold px-6 py-2.5 text-sm font-extrabold uppercase tracking-wide text-brand-navy transition hover:bg-brand-1 hover:text-white">
          Back to Opus Overseas
        </a>
      </div>
    </div>
  );
}