import { useEffect } from 'react';

// Chatwoot live-chat widget on the public site (official Chatwoot Web SDK).
// Loaded once; backend inbox "Opus Website Chat" (inbox 1, account 1).
// Config via window.chatwootSettings — language from the page.

declare global {
  interface Window {
    chatwootSDK?: any;
    chatwootSettings?: Record<string, unknown>;
    ChatwootSDK?: { run: (opts: { websiteToken: string; baseUrl: string }) => void };
  }
}

const CHATWOOT_BASE = import.meta.env.VITE_CHATWOOT_BASE_URL || 'http://100.87.71.38:3200';
const CHATWOOT_TOKEN = import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN || 'f36574fb918873fbba2749b6a2f18ac6';

export default function ChatWidget() {
  useEffect(() => {
    const sdk = document.getElementById('chatwoot-sdk') as HTMLScriptElement | null;
    if (sdk) return;

    const script = document.createElement('script');
    script.id = 'chatwoot-sdk';
    script.src = `${CHATWOOT_BASE}/packs/js/sdk.js`;
    script.defer = true;
    script.onload = () => {
      window.chatwootSDK = window.chatwootSDK || {};
      window.chatwootSettings = {
        position: 'right',
        type: 'expanded_bubble',
        launcherTitle: 'Chat with Opus Overseas',
      };
      (window as any).ChatwootSDK?.({ websiteToken: CHATWOOT_TOKEN, baseUrl: CHATWOOT_BASE });
    };
    document.body.appendChild(script);

    return () => {
      document.getElementById('chatwoot-sdk')?.remove();
    };
  }, []);

  return null;
}