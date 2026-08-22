import { useEffect } from 'react';
import { track, EVENTS } from '../lib/umami';

// Chatwoot live-chat widget (official SDK contract).
// SDK (packs/js/sdk.js) boots by setting window.chatwootSDK = { run(...) } and
// reads window.chatwootSettings for appearance + window.$chatwoot for the
// banner config. Contract confirmed from the served sdk.js.

declare global {
  interface Window {
    chatwootSDK?: { run: (opts: { websiteToken: string; baseUrl: string }) => void };
    chatwootSettings?: Record<string, unknown>;
    $chatwoot?: { baseUrl: string; websiteToken: string };
  }
}

const CHATWOOT_BASE = import.meta.env.VITE_CHATWOOT_BASE_URL || 'https://chat.opusoverseas.com';
const CHATWOOT_TOKEN = import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN || 'f36574fb918873fbba2749b6a2f18ac6';

export default function ChatWidget() {
  useEffect(() => {
    track(EVENTS.chatOpen); // Wave 1: chat widget surfaced to the visitor
    if (document.getElementById('chatwoot-sdk')) return; // mounted once

    window.chatwootSettings = {
      position: 'right',
      type: 'standard',
      locale: 'en',
    };

    const script = document.createElement('script');
    script.id = 'chatwoot-sdk';
    script.src = `${CHATWOOT_BASE}/packs/js/sdk.js`;
    script.async = true;
    script.onload = () => {
      window.chatwootSDK?.run({ websiteToken: CHATWOOT_TOKEN, baseUrl: CHATWOOT_BASE });
    };
    document.body.appendChild(script);
  }, []);

  return null;
}