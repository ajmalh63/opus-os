import { useLocation } from 'wouter';
import { useSession } from '../../lib/session';
import { useRevealRoot } from '../../lib/reveal';

export default function DivisionsHub() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [, setLocation] = useLocation();
  const { me } = useSession();

  const divisions = [
    { key: 'study-abroad', label: 'Study Abroad', desc: 'Overseas admissions, timelines, and applications.', icon: '🎓', color: 'border-blue-200 bg-blue-50/40 text-blue-700' },
    { key: 'visa', label: 'Visa Preparation', desc: 'Embassy slot bookings, visa products, and mock interviews.', icon: '✈️', color: 'border-emerald-200 bg-emerald-50/40 text-emerald-700' },
    { key: 'attestation', label: 'Document Attestation', desc: 'Certificate legalization workflows and India Post bookings.', icon: '📜', color: 'border-amber-200 bg-amber-50/40 text-amber-700' },
    { key: 'umrah', label: 'Umrah & Travel', desc: 'Umrah group departures, package checklists, and hotel booking.', icon: '🕋', color: 'border-purple-200 bg-purple-50/40 text-purple-700' },
    { key: 'manpower', label: 'Manpower Sourcing', desc: 'Job postings (public & secret), candidate medicals, and deployment.', icon: '👷', color: 'border-sky-200 bg-sky-50/40 text-sky-700' }
  ];

  const visible = me?.role === 'super_admin' 
    ? divisions 
    : divisions.filter(d => me?.userDivisions?.includes(d.key));

  return (
    <div ref={rootRef} className="space-y-6">
      <div className="reveal">
        <h1 className="font-display text-2xl font-bold text-brand-navy">Business Division Portals</h1>
        <p className="text-xs text-brand-navy/40">Access specialized workflows and dashboards for each business department.</p>
      </div>

      <div className="reveal grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map((d) => (
          <button
            key={d.key}
            onClick={() => setLocation(`/divisions/${d.key}`)}
            className={`group text-left rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm hover:shadow-md hover:border-brand-gold/60 hover:bg-brand-navy/[0.04] hover:scale-[1.01] transition-all duration-300 cursor-pointer flex flex-col justify-between h-48`}
          >
            <div className="space-y-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-navy/[0.05] text-2xl border border-brand-navy/10 group-hover:scale-110 transition-transform">
                {d.icon}
              </span>
              <div>
                <h3 className="font-display font-bold text-brand-navy group-hover:text-brand-gold text-base transition-colors">{d.label}</h3>
                <p className="text-xs text-brand-navy/50 mt-1 line-clamp-2">{d.desc}</p>
              </div>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/50 group-hover:text-brand-gold flex items-center gap-1 mt-4">
              Open Portal ➔
            </div>
          </button>
        ))}

        {visible.length === 0 && (
          <div className="col-span-full py-12 text-center text-brand-navy/50 text-xs">
            You do not have access to any business divisions. Please contact the superadmin.
          </div>
        )}
      </div>
    </div>
  );
}
