// Division-specific testimonial strip — social proof near the conversion point.
// Static, curated quotes (client names masked per DPDP practice).
interface Quote {
  text: string;
  name: string;
  role: string;
}

export default function TestimonialStrip({ quotes, title = 'What our clients say' }: { quotes: Quote[]; title?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-5 sm:px-6 py-14 sm:py-16">
      <div className="mb-8 text-center">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Client Stories</span>
        <h2 className="mt-1 font-display text-xl sm:text-2xl font-extrabold text-brand-navy">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {quotes.map((q, i) => (
          <figure
            key={i}
            className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-xs hover:shadow-md hover:border-brand-gold/40 transition-all"
          >
            <div className="text-brand-gold text-sm tracking-widest">★★★★★</div>
            <blockquote className="mt-2 text-xs sm:text-sm leading-relaxed text-brand-navy/85">
              “{q.text}”
            </blockquote>
            <figcaption className="mt-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-navy text-[10px] font-black text-brand-gold">
                {q.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
              </span>
              <div>
                <p className="text-xs font-bold text-brand-navy">{q.name}</p>
                <p className="text-[10px] text-brand-navy/50">{q.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}