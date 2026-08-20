import { useState } from 'react';

export interface FaqItem {
  question: string;
  answer: string;
}

export interface GeoFaqSectionProps {
  badge?: string;
  title: string;
  subtitle?: string;
  summaryTitle?: string;
  summaryText?: string;
  faqs: FaqItem[];
}

export default function GeoFaqSection({
  badge = 'Knowledge & FAQ Hub',
  title,
  subtitle = 'Authoritative answers to common questions, compiled by our certified advisory desk.',
  summaryTitle,
  summaryText,
  faqs,
}: GeoFaqSectionProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section className="mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-20 border-t border-slate-200/80">
      <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-brand-gold border border-brand-gold/30">
          ✨ {badge}
        </span>
        <h2 className="font-display fluid-h2 font-bold text-brand-navy">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-brand-textLight leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {/* GEO Direct-Answer Executive Summary Card */}
      {summaryTitle && summaryText && (
        <div className="mb-10 max-w-4xl mx-auto rounded-2xl border border-brand-gold/30 bg-gradient-to-br from-amber-500/5 via-brand-gold/5 to-white p-6 sm:p-7 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="shrink-0 text-xl">💡</span>
            <div className="space-y-1.5">
              <h3 className="font-display font-bold text-sm text-brand-navy tracking-tight">
                {summaryTitle}
              </h3>
              <p className="text-xs text-brand-textLight leading-relaxed">
                {summaryText}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* AEO Interactive FAQ Accordion */}
      <div className="max-w-4xl mx-auto space-y-3.5">
        {faqs.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                isOpen
                  ? 'border-brand-gold/50 bg-white shadow-md ring-1 ring-brand-gold/20'
                  : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(idx)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between p-5 text-left transition-colors cursor-pointer"
              >
                <span className="font-display text-sm sm:text-base font-bold text-brand-navy pr-4">
                  {faq.question}
                </span>
                <span
                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-transform duration-200 ${
                    isOpen
                      ? 'bg-brand-navy text-white rotate-180'
                      : 'bg-slate-100 text-brand-navy'
                  }`}
                >
                  ↓
                </span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-brand-textLight leading-relaxed border-t border-slate-100 bg-slate-50/40">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
