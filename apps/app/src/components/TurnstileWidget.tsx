import { useEffect, useRef } from 'react';

// Cloudflare Turnstile widget (plan §6.5 / §18.2.2). Loads the official script,
// renders the checkbox widget, and reports the one-time token upward.
// Site key comes from VITE_TURNSTILE_SITE_KEY (dev: Cloudflare test key
// 1x00000000000000000000AA which always passes locally; real key in prod).
declare global {
  interface Window {
    turnstile?: any;
  }
}

let scriptLoaded = false;
function loadScript(onReady: () => void) {
  if (window.turnstile) { onReady(); return; }
  if (scriptLoaded) {
    window.addEventListener('turnstile-ready', onReady, { once: true });
    return;
  }
  scriptLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.defer = true;
  s.onload = () => { window.dispatchEvent(new Event('turnstile-ready')); onReady(); };
  document.head.appendChild(s);
}

export default function TurnstileWidget({ onToken, onExpire }: { onToken: (token: string | null) => void; onExpire?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
    if (!siteKey) {
      // No key configured — local dev without mock key: auto-pass with null token.
      onTokenRef.current(null);
      return;
    }
    const render = () => {
      if (!window.turnstile || !ref.current) return;
      try {
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme: 'light',
          callback: (token: string) => onTokenRef.current(token),
          'expired-callback': () => { onTokenRef.current(null); onExpire?.(); },
          'error-callback': () => { onTokenRef.current(null); onExpire?.(); },
        });
      } catch {
        onTokenRef.current(null);
      }
    };
    loadScript(render);
    return () => {
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="turnstile-wrap" />;
}