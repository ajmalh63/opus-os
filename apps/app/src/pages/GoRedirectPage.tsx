import { useEffect, useState } from 'react';
import { useLocation, useRoute, useSearch } from 'wouter';

/**
 * /go/:ref/:type/:id — partner deep-link resolver.
 *
 * Partner "Copy link" CTAs (PartnerDashboard, PartnerThrive) generate
 * /go/<refCode>/<type>/<id> URLs. The backend /go router records the click
 * on the partner's link and 302s to the public division page with ?ref= so
 * the lead form attributes the inquiry. This page bridges the gap: it calls
 * the backend (manual redirect so we can read the Location header) and then
 * performs an SPA navigation to the target — no full page reload, ref intact.
 */
export default function GoRedirectPage() {
  const [, params] = useRoute('/go/:ref/:type/:id');
  const [, navigate] = useLocation();
  const search = useSearch();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!params) return;
    const { ref, type, id } = params;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/go/${encodeURIComponent(ref)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, {
          redirect: 'manual',
        });
        if (cancelled) return;
        if (res.status === 302 || res.status === 301) {
          const location = res.headers.get('location');
          if (location) {
            // Preserve any existing query params (e.g. ?utm_source=...) on the target.
            const sep = location.includes('?') ? '&' : '?';
            navigate(`${location}${search ? `${sep}${search}` : ''}`);
            return;
          }
        }
        // No redirect (bad link type / unknown ref) — land on the lead form.
        navigate(`/lead-form${ref ? `?ref=${ref}` : ''}`);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, navigate, search]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-white px-6 text-center">
        <p className="font-display text-lg font-bold text-brand-navy">Link could not be resolved</p>
        <a href="/lead-form" className="mt-4 rounded-full bg-brand-gold px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy">
          Continue to Inquiry Form
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-white px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
      <p className="mt-4 text-xs font-semibold text-brand-navy/60">Resolving your link…</p>
    </div>
  );
}