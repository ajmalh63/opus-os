import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  isRevoked: boolean;
  createdAt: number;
}

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastDeliveryAt: number | null;
  lastDeliveryStatus: number | null;
  createdAt: number;
}

const ALL_SCOPES = [
  { key: 'leads:read', label: 'Leads: Read', desc: 'Query and list incoming leads' },
  { key: 'leads:write', label: 'Leads: Write', desc: 'Create leads via external scripts' },
  { key: 'clients:read', label: 'Clients: Read', desc: 'View client 360 profile & history' },
  { key: 'clients:write', label: 'Clients: Write', desc: 'Update pipeline stages and notes' },
  { key: 'study-abroad:read', label: 'Study Abroad: Read', desc: 'Calculate matches & list apps' },
  { key: 'study-abroad:write', label: 'Study Abroad: Write', desc: 'Submit application snapshots' },
  { key: 'visa:read', label: 'Visa: Read', desc: 'List visa applications & status' },
  { key: 'visa:write', label: 'Visa: Write', desc: 'Update consular checklist status' },
  { key: 'umrah:read', label: 'Umrah: Read', desc: 'Browse packages & group departures' },
  { key: 'umrah:write', label: 'Umrah: Write', desc: 'Create party bookings & hold seats' },
  { key: 'attestation:read', label: 'Attestation: Read', desc: 'Query rate cards & chain SLAs' },
  { key: 'attestation:write', label: 'Attestation: Write', desc: 'Place document attestation orders' },
  { key: 'webhooks:manage', label: 'Webhooks: Manage', desc: 'Create & delete webhook subscribers' },
  { key: '*', label: 'Super Admin (*)', desc: 'Full unrestricted master access' },
];

export default function DeveloperApiSettingsTab() {
  const queryClient = useQueryClient();

  // Modals & New Key State
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyEnv, setKeyEnv] = useState<'live' | 'test'>('live');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['*']);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Webhook Modal State
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['*']);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);

  // Fetch API Keys
  const { data: keysData } = useQuery<{ data: ApiKeyItem[] }>({
    queryKey: ['adminApiKeys'],
    queryFn: async () => {
      const res = await fetch('/api/v1/keys', {
        headers: { Authorization: `Bearer ${localStorage.getItem('opus_master_key') || ''}` },
      });
      if (!res.ok) {
        // Fallback for cookie session
        const fallbackRes = await fetch('/api/admin/api-keys').catch(() => null);
        if (fallbackRes && fallbackRes.ok) return fallbackRes.json();
      }
      return res.json();
    },
  });

  // Fetch Webhooks
  const { data: webhooksData } = useQuery<{ data: WebhookItem[] }>({
    queryKey: ['adminWebhooks'],
    queryFn: async () => {
      const res = await fetch('/api/v1/webhooks', {
        headers: { Authorization: `Bearer ${localStorage.getItem('opus_master_key') || ''}` },
      });
      return res.ok ? res.json() : { data: [] };
    },
  });

  const handleCopyKey = () => {
    if (newKeyPlaintext) {
      navigator.clipboard.writeText(newKeyPlaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.2s_ease-out]">
      {/* Header Banner */}
      <div className="rounded-2xl border border-brand-navy/10 bg-gradient-to-br from-brand-navy/5 via-white to-brand-gold/10 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌐</span>
              <h2 className="font-display text-xl font-bold text-brand-navy">
                Developer & Remote REST API Platform
              </h2>
            </div>
            <p className="mt-1 text-xs text-brand-navy/70 max-w-xl">
              Connect to Opus OS from anywhere in the world. Authenticate mobile apps, remote scripts, Zapier, Make, and automated bots via high-entropy Scoped API Keys and HMAC-SHA256 Outbound Webhooks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/v1/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-sm"
            >
              <span>📖 Interactive API Docs</span>
              <span>↗</span>
            </a>
            <a
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-xs font-bold text-brand-navy hover:bg-slate-50 transition-all"
            >
              <span>OpenAPI 3.1 JSON</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      </div>

      {/* SECTION 1: API KEYS */}
      <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-base font-bold text-brand-navy flex items-center gap-2">
              <span>🔑</span> Scoped Personal & Service Access Tokens
            </h3>
            <p className="text-xs text-brand-navy/60">
              Keys are hashed at rest via SHA-256. Plaintext credentials are shown only once upon creation.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowKeyModal(true)}
            className="rounded-xl bg-brand-gold px-4 py-2 text-xs font-bold text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-sm cursor-pointer"
          >
            + Create New API Key
          </button>
        </div>

        {/* Newly Created Key Alert Box */}
        {newKeyPlaintext && (
          <div className="mb-6 rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                  <span>✅</span> API Key Created Successfully
                </span>
                <p className="mt-0.5 text-[11px] text-emerald-800">
                  Please copy and store this API key safely. <strong>You will not be able to see it again!</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewKeyPlaintext(null)}
                className="text-xs text-emerald-700 hover:text-emerald-900 font-bold"
              >
                Dismiss ✕
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-2.5 border border-emerald-300">
              <code className="flex-1 font-mono text-xs font-bold text-brand-navy select-all break-all">
                {newKeyPlaintext}
              </code>
              <button
                type="button"
                onClick={handleCopyKey}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
              >
                {copied ? '✓ Copied!' : 'Copy Key'}
              </button>
            </div>
          </div>
        )}

        {/* Keys Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-brand-navy/10 text-[10px] font-bold uppercase tracking-wider text-brand-navy/50">
                <th className="py-2.5">Name</th>
                <th className="py-2.5">Key Prefix</th>
                <th className="py-2.5">Granted Scopes</th>
                <th className="py-2.5">Rate Limit</th>
                <th className="py-2.5">Last Used</th>
                <th className="py-2.5">Status</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy/5">
              {(keysData?.data || []).map((k) => (
                <tr key={k.id} className="hover:bg-slate-50/50">
                  <td className="py-3 font-semibold text-brand-navy">{k.name}</td>
                  <td className="py-3 font-mono text-slate-500">{k.keyPrefix}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <span
                          key={s}
                          className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                            s === '*'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 text-slate-600">{k.rateLimitPerMinute} req/min</td>
                  <td className="py-3 text-slate-500">
                    {k.lastUsedAt ? new Date(k.lastUsedAt * 1000).toLocaleString() : 'Never'}
                  </td>
                  <td className="py-3">
                    {k.isRevoked ? (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-800">
                        Revoked
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {!k.isRevoked && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm(`Revoke API key "${k.name}"? This cannot be undone.`)) {
                            await fetch(`/api/v1/keys/${k.id}`, { method: 'DELETE' });
                            queryClient.invalidateQueries({ queryKey: ['adminApiKeys'] });
                          }
                        }}
                        className="text-rose-600 hover:text-rose-800 font-semibold"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {(!keysData?.data || keysData.data.length === 0) && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No API keys created yet. Generate one above to begin external integrations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: OUTBOUND WEBHOOKS */}
      <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-base font-bold text-brand-navy flex items-center gap-2">
              <span>📤</span> Outbound Webhook Subscriptions (HMAC-SHA256)
            </h3>
            <p className="text-xs text-brand-navy/60">
              Receive live notifications in external systems (Zapier, n8n, custom webhooks) whenever events occur in Opus OS.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowWebhookModal(true)}
            className="rounded-xl border border-brand-navy/20 bg-white px-4 py-2 text-xs font-bold text-brand-navy hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
          >
            + Register Webhook URL
          </button>
        </div>

        {/* Webhooks Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-brand-navy/10 text-[10px] font-bold uppercase tracking-wider text-brand-navy/50">
                <th className="py-2.5">Listener Name</th>
                <th className="py-2.5">Target Endpoint URL</th>
                <th className="py-2.5">Subscribed Events</th>
                <th className="py-2.5">Health</th>
                <th className="py-2.5">Last Delivery</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-navy/5">
              {(webhooksData?.data || []).map((w) => (
                <tr key={w.id} className="hover:bg-slate-50/50">
                  <td className="py-3 font-semibold text-brand-navy">{w.name}</td>
                  <td className="py-3 font-mono text-slate-600 truncate max-w-xs">{w.url}</td>
                  <td className="py-3">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-700">
                      {w.events.join(', ')}
                    </span>
                  </td>
                  <td className="py-3">
                    {w.failureCount === 0 ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                        100% Healthy
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                        {w.failureCount} Failures
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-slate-500">
                    {w.lastDeliveryAt
                      ? `${new Date(w.lastDeliveryAt * 1000).toLocaleTimeString()} (HTTP ${w.lastDeliveryStatus})`
                      : 'Pending'}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm(`Delete webhook "${w.name}"?`)) {
                          await fetch(`/api/v1/webhooks/${w.id}`, { method: 'DELETE' });
                          queryClient.invalidateQueries({ queryKey: ['adminWebhooks'] });
                        }
                      }}
                      className="text-rose-600 hover:text-rose-800 font-semibold"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {(!webhooksData?.data || webhooksData.data.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No webhooks subscribed yet. Register an endpoint above to receive live event payloads.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-[scaleIn_0.2s_ease-out]">
            <h3 className="font-display text-lg font-bold text-brand-navy">Generate New API Key</h3>
            <p className="text-xs text-brand-navy/60 mt-0.5">
              Select granular scopes according to the principle of least privilege.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await fetch('/api/v1/keys', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: keyName,
                    environment: keyEnv,
                    scopes: selectedScopes,
                  }),
                });
                const data = await res.json();
                if (data.success) {
                  setNewKeyPlaintext(data.data.apiKey);
                  setShowKeyModal(false);
                  setKeyName('');
                  queryClient.invalidateQueries({ queryKey: ['adminApiKeys'] });
                }
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                  Key Name / Description *
                </label>
                <input
                  type="text"
                  required
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. Zapier Lead Intake, Mobile App, Partner Sync"
                  className="w-full rounded-xl border border-brand-navy/15 p-2.5 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                  Environment
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setKeyEnv('live')}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                      keyEnv === 'live' ? 'bg-brand-navy text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Live (opus_live_sk_...)
                  </button>
                  <button
                    type="button"
                    onClick={() => setKeyEnv('test')}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                      keyEnv === 'test' ? 'bg-brand-navy text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Test / Sandbox (opus_test_sk_...)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                  Granted Scopes
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {ALL_SCOPES.map((s) => (
                    <label
                      key={s.key}
                      className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(s.key)}
                        onChange={(e) => {
                          if (s.key === '*') {
                            setSelectedScopes(e.target.checked ? ['*'] : []);
                          } else {
                            const without = selectedScopes.filter((x) => x !== '*' && x !== s.key);
                            setSelectedScopes(e.target.checked ? [...without, s.key] : without);
                          }
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-mono text-[10px] font-bold text-brand-navy">{s.label}</div>
                        <div className="text-[9px] text-slate-500">{s.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-gold px-5 py-2 text-xs font-bold text-brand-navy hover:bg-brand-gold-hover hover:text-white"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Webhook Modal */}
      {showWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-[scaleIn_0.2s_ease-out]">
            <h3 className="font-display text-lg font-bold text-brand-navy">Register Outbound Webhook Endpoint</h3>
            <p className="text-xs text-brand-navy/60 mt-0.5">
              Opus OS will deliver real-time HMAC-SHA256 signed payloads to this URL when events occur.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await fetch('/api/v1/webhooks', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: webhookName,
                    url: webhookUrl,
                    events: webhookEvents,
                  }),
                });
                const data = await res.json();
                if (data.success) {
                  setNewWebhookSecret(data.data.secret);
                  setShowWebhookModal(false);
                  setWebhookName('');
                  setWebhookUrl('');
                  queryClient.invalidateQueries({ queryKey: ['adminWebhooks'] });
                }
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                  Listener Name / Service *
                </label>
                <input
                  type="text"
                  required
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  placeholder="e.g. Zapier Lead Listener, n8n Automation, Custom Server"
                  className="w-full rounded-xl border border-brand-navy/15 p-2.5 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                  Target Endpoint URL (HTTPS) *
                </label>
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-server.com/api/opus-webhook"
                  className="w-full rounded-xl border border-brand-navy/15 p-2.5 text-xs text-brand-navy font-mono focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                  Subscribed Events
                </label>
                <div className="flex flex-wrap gap-2">
                  {['*', 'lead.created', 'client.stage_changed', 'study_abroad.application_created', 'visa.status_changed', 'umrah.booking_created', 'attestation.order_created'].map((ev) => (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => {
                        if (ev === '*') {
                          setWebhookEvents(['*']);
                        } else {
                          const without = webhookEvents.filter((x) => x !== '*' && x !== ev);
                          setWebhookEvents(webhookEvents.includes(ev) ? without : [...without, ev]);
                        }
                      }}
                      className={`rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold transition cursor-pointer ${
                        webhookEvents.includes(ev)
                          ? 'bg-brand-navy text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWebhookModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-gold px-5 py-2 text-xs font-bold text-brand-navy hover:bg-brand-gold-hover hover:text-white cursor-pointer"
                >
                  Save Webhook
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Newly Created Webhook Secret Notification */}
      {newWebhookSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-display text-base font-bold text-brand-navy flex items-center gap-2">
              <span>🔐</span> Webhook HMAC Secret Generated
            </h3>
            <p className="text-xs text-brand-navy/70 mt-1">
              Use this signing secret to verify incoming payloads in your receiving server:
            </p>
            <div className="mt-3 rounded-xl bg-slate-100 p-3 font-mono text-xs font-bold text-brand-navy select-all break-all border border-slate-300">
              {newWebhookSecret}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setNewWebhookSecret(null)}
                className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white hover:bg-brand-gold hover:text-brand-navy"
              >
                I have saved this secret
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
