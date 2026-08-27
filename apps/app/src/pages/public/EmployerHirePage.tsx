import { useState } from 'react';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import SEOHead from '../../components/SEOHead';
import DomainBackdrop from '../../components/DomainBackdrop';
import TurnstileWidget from '../../components/TurnstileWidget';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema } from '../../lib/schemas';

export default function EmployerHirePage() {
  const [form, setForm] = useState({ company: '', contact: '', email: '', phone: '', industry: '', positions: '', urgency: '', engagement: '', payRange: '', description: '' });
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setFeedback(null);
    if (!form.company || !form.contact || !form.email || !form.phone || !form.industry || !form.positions || !form.urgency || !form.engagement || !form.payRange || !form.description) {
      setFeedback('Please fill all required fields.');
      return;
    }
    if (!turnstileToken) {
      setFeedback('Please complete the security check.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/public/employer-demands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}) },
        body: JSON.stringify({
          companyName: form.company,
          contactName: form.contact,
          workEmail: form.email,
          phone: form.phone,
          industry: form.industry,
          positionType: form.positions,
          numberOfPositions: 1,
          urgency: form.urgency === 'Immediate (1 week)' ? 'immediate' : form.urgency === 'Soon (2–4 weeks)' ? 'soon' : form.urgency === '1–3 months' ? 'moderate' : 'planning',
          engagementType: form.engagement === 'Direct Hire' ? 'direct_hire' : form.engagement === 'Contract' ? 'contract' : form.engagement === 'Temp-to-Hire' ? 'temp_to_hire' : 'open',
          payRange: form.payRange,
          jobDescription: form.description,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSent(true);
        setFeedback(null);
      } else {
        setFeedback(data.error || data.message || 'Submission failed. Please try again.');
      }
    } catch (e: any) {
      setFeedback(`Network error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy">
      <SEOHead
        title="Hire Verified Talent — For Employers | Opus Overseas"
        description="Hire vetted Indian talent in 21 days — POE/GAMCA compliant, trade-tested, zero advance from candidates. Submit your manpower demand and get a shortlist in 7 days."
        canonicalPath="/manpower/hire"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getBreadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Manpower', path: '/manpower' }, { name: 'Hire Talent', path: '/manpower/hire' }]),
        ]}
      />
      <Nav />
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#0d2644] to-[#0a2d50] pb-16 pt-36 text-white border-b border-brand-gold/20">
        <DomainBackdrop theme="manpower" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">For Employers — Hire Talent</span>
          <h1 className="mt-4 font-display fluid-h1 font-black leading-tight">Hire Verified Indian Talent in <span className="text-brand-gold">21 Days</span></h1>
          <p className="mt-3 max-w-2xl text-white/80">POE/GAMCA compliant • Trade-tested • Zero advance from candidates • Dedicated sector recruiter • Time-to-shortlist 7 days</p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="text-sm font-bold text-white">7 Days</div><div className="text-xs text-white/60">Shortlist delivery</div></div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="text-sm font-bold text-white">40+ GCC Clients</div><div className="text-xs text-white/60">Retention 12mo</div></div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4"><div className="text-sm font-bold text-white">POE Licensed</div><div className="text-xs text-white/60">MEA Approved</div></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7">
          <div className="clay-card p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-brand-navy">Submit Your Manpower Demand</h2>
            <p className="text-xs text-brand-navy/60 mt-1">Structured intake — your dedicated recruiter gets a qualified brief in minutes, not a vague contact message.</p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Company Name *</label><input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Al Faris Construction LLC" className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Contact Person *</label><input value={form.contact} onChange={e => set('contact', e.target.value)} placeholder="Hiring Manager" className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Work Email *</label><input value={form.email} onChange={e => set('email', e.target.value)} placeholder="hr@company.com" className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Phone *</label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+971 ..." className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Industry *</label><select value={form.industry} onChange={e => set('industry', e.target.value)} className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm"><option value="">— Select —</option><option>IT & Software</option><option>Healthcare</option><option>Engineering & Construction</option><option>Oil & Gas / Energy</option><option>Finance & Business</option><option>Hospitality & Aviation</option><option>Other</option></select></div>
              <div><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Positions (type)</label><input value={form.positions} onChange={e => set('positions', e.target.value)} placeholder="e.g. 5x React Devs, 3x Nurses" className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm" /></div>
              <div><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Urgency *</label><select value={form.urgency} onChange={e => set('urgency', e.target.value)} className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm"><option value="">— Select —</option><option>Immediate (1 week)</option><option>Soon (2–4 weeks)</option><option>1–3 months</option><option>Planning (3m+)</option></select></div>
              <div><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Engagement *</label><select value={form.engagement} onChange={e => set('engagement', e.target.value)} className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm"><option value="">— Select —</option><option>Direct Hire</option><option>Contract</option><option>Temp-to-Hire</option><option>Open to Recommendation</option></select></div>
              <div className="sm:col-span-2"><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Pay/Salary Range *</label><select value={form.payRange} onChange={e => set('payRange', e.target.value)} className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm"><option value="">— Select —</option><option>Open / TBD</option><option>$30–50/hr</option><option>$50+/hr</option><option>$40–60k</option><option>$60–90k</option><option>$90–130k</option></select></div>
              <div className="sm:col-span-2"><label className="block text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-1">Job Description *</label><textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe the roles in your own words — must-haves, nice-to-haves, location, start date..." rows={4} className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm" /></div>
            </div>
            <TurnstileWidget onToken={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
            {feedback && <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700 text-center">{feedback}</p>}
            <button onClick={handleSubmit} disabled={submitting} className="mt-6 w-full rounded-full bg-brand-navy px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all disabled:opacity-50">
              {submitting ? 'Submitting…' : sent ? '✓ Demand Captured — Our BD team will call today' : 'Submit Demand — Get Shortlist in 7 Days →'}
            </button>
            {sent && <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">✓ Demand received — our BD team will call today. Time-to-shortlist: 7 days. Check your email for confirmation.</p>}
          </div>
        </div>
        <div className="lg:col-span-5 space-y-4">
          <div className="clay-card p-6">
            <h3 className="font-display font-bold text-brand-navy">How we work</h3>
            <ol className="mt-3 space-y-2 text-sm text-brand-navy/70 list-decimal list-inside">
              <li>Trade Test → Interview → POE clearance</li>
              <li>Shortlist of 3–5 vetted candidates per role</li>
              <li>Feedback SLA 48h, replacement guarantee</li>
            </ol>
            <div className="mt-4 rounded-xl bg-brand-gold/10 border border-brand-gold/20 p-3 text-xs">Sector pages • Salary guides • Consultant profiles • Live `Manpower` jobs filtered per sector — all on `/manpower`.</div>
          </div>
          <div className="clay-card p-6">
            <h3 className="font-display font-bold text-brand-navy">Why employers choose Opus</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-brand-navy/70 list-disc list-inside">
              <li>MEA Licensed, POE compliant</li>
              <li>Zero advance from candidates — ethical sourcing</li>
              <li>40+ GCC clients, retention 12mo</li>
            </ul>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
