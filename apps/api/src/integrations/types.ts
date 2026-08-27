// Tool-First Adapters — shared contracts (Wave 3 strategy, approved).
// Opus OS is the BRAIN (intent/consent/suppression/ledger) and the FACE
// (unified dashboard); operations live in best-of-breed tools (Listmonk,
// Mautic, Chatwoot, OpenWA). Each adapter speaks ONE contract:

export interface ToolEnv {
  LISTMONK_BASE_URL?: string;
  LISTMONK_API_USER?: string;
  LISTMONK_API_PASS?: string;
  MAUTIC_URL?: string;
  MAUTIC_BASE_URL?: string;
  MAUTIC_USER?: string;   // basic auth (verified path)
  MAUTIC_PASS?: string;
  MAUTIC_CLIENT_ID?: string;
  MAUTIC_CLIENT_SECRET?: string;
  CHATWOOT_BASE_URL?: string;
  CHATWOOT_API_TOKEN?: string;
  CHATWOOT_ACCOUNT_ID?: string;
  OPENWA_BASE_URL?: string;
  OPENWA_API_URL?: string;
}

export type ToolStatus =
  | { state: 'ok'; label: string; summary: string }
  | { state: 'unconfigured'; label: string; summary: string }
  | { state: 'error'; label: string; summary: string };

export interface ToolSnapshot {
  tool: string;
  label: string;
  status: ToolStatus;
  fetchedAt: number; // epoch seconds — "instantly" = near-real-time feed
  metrics: Record<string, number | string | null>;
  items: ToolFeedItem[];
}

export interface ToolFeedItem {
  tool: string;
  kind: string; // campaign | journey | bounce | conversation | event
  id: string;
  title: string;
  detail: string | null;
  at: number; // epoch seconds
}

export interface ToolAdapter {
  name: string;
  label: string;
  snapshot(env: ToolEnv): Promise<ToolSnapshot>;
}
