import { useEffect } from 'react';
import { track, EVENTS } from '../lib/umami';

// Chatwoot live-chat widget (official SDK contract).
// SDK (packs/js/sdk.js) boots by setting window.chatwootSDK = { run(...) } and
// exposes window.$chatwoot for identity tracking (setUser) and custom dossier attributes.

export interface ChatUserContext {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  division?: string;
  stageKey?: string;
  counselorName?: string;
}

declare global {
  interface Window {
    chatwootSDK?: {
      run: (opts: { websiteToken: string; baseUrl: string }) => void;
    };
    chatwootSettings?: Record<string, unknown>;
    $chatwoot?: {
      baseUrl: string;
      websiteToken: string;
      setUser: (identifier: string, user: { name?: string; email?: string; phone_number?: string; avatar_url?: string }) => void;
      setCustomAttributes: (attributes: Record<string, string | number | boolean>) => void;
      deleteCustomAttribute: (key: string) => void;
      reset: () => void;
    };
  }
}

const CHATWOOT_BASE = import.meta.env.VITE_CHATWOOT_BASE_URL || 'https://chat.opusoverseas.com';
const CHATWOOT_TOKEN = import.meta.env.VITE_CHATWOOT_WEBSITE_TOKEN || 'f36574fb918873fbba2749b6a2f18ac6';

export default function ChatWidget({ user }: { user?: ChatUserContext }) {
  useEffect(() => {
    track(EVENTS.chatOpen);

    const applyUserContext = () => {
      if (window.$chatwoot && user?.id) {
        window.$chatwoot.setUser(user.id, {
          name: user.name,
          email: user.email,
          phone_number: user.phone,
        });
        window.$chatwoot.setCustomAttributes({
          division: user.division || 'general',
          stage: user.stageKey || 'documents',
          counselor: user.counselorName || 'Opus Counseling Desk',
          lastActive: new Date().toISOString(),
        });
      }
    };

    if (document.getElementById('chatwoot-sdk')) {
      applyUserContext();
      return;
    }

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
      // Listen for chatwoot:ready to inject identity
      window.addEventListener('chatwoot:ready', () => {
        applyUserContext();
      });
    };
    document.body.appendChild(script);
  }, [user]);

  return null;
}
