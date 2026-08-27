import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';

// ── Marketing & Communications Studio ─────────────────────────────────────────
// Simplified, human-friendly workspace for sending WhatsApp messages, emails,
// and sharing marketing lead magnets across Study Abroad, Umrah, and Attestation.

const getJson = async (url: string) => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

function asArray(d: any): any[] {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    if (Array.isArray(d.data)) return d.data;
    if (d.data && Array.isArray(d.data.results)) return d.data.results;
    if (Array.isArray(d.results)) return d.results;
    if (Array.isArray(d.campaigns)) return d.campaigns;
    if (Array.isArray(d.templates)) return d.templates;
    if (Array.isArray(d.emails)) return d.emails;
    if (Array.isArray(d.lists)) return d.lists;
    if (Array.isArray(d.bounces)) return d.bounces;
    if (Array.isArray(d.assets)) return d.assets;
    if (Array.isArray(d.forms)) return d.forms;
    if (Array.isArray(d.pages)) return d.pages;
    if (Array.isArray(d.dynamicContent)) return d.dynamicContent;
    if (Array.isArray(d.dynamiccontent)) return d.dynamiccontent;
  }
  return [];
}

export default function MarketingTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [activeTab, setActiveTab] = useState<'whatsapp' | 'emails' | 'assets' | 'advanced'>('whatsapp');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');

  // Leads for quick sender
  const { data: leadsData } = useQuery<any>({
    queryKey: ['marketing-leads-picker'],
    queryFn: () => getJson('/api/leads').catch(() => ({ leads: [] })),
  });
  const realLeads: any[] = leadsData?.leads || [];

  // WhatsApp Templates
  const { data: waData, isLoading: waLoading } = useQuery<any>({
    queryKey: ['wa-templates'],
    queryFn: () => getJson('/api/marketing/whatsapp/templates'),
  });
  const waTemplates: any[] = waData?.templates || [];

  // Email Templates
  const { data: emailsData, isLoading: emailsLoading } = useQuery<any>({
    queryKey: ['mautic-emails'],
    queryFn: () => getJson('/api/integrations/mautic/emails?limit=30'),
  });
  const emailTemplates: any[] = emailsData?.emails ? Object.values(emailsData.emails) : [];

  // Assets & Guides
  const { data: assetsData } = useQuery<any>({
    queryKey: ['mautic-assets'],
    queryFn: () => getJson('/api/integrations/mautic/assets'),
  });
  const assets: any[] = asArray(assetsData);

  // Quick WhatsApp Dispatch state
  const [selectedWaTemplate, setSelectedWaTemplate] = useState<any | null>(null);
  const [targetPhone, setTargetPhone] = useState('');
  const [targetName, setTargetName] = useState('Valued Client');
  const [customNote, setCustomNote] = useState('');
  const [isSendingWa, setIsSendingWa] = useState(false);
  const [waSendResult, setWaSendResult] = useState<any | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Email Send Modal state
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [previewEmailModal, setPreviewEmailModal] = useState<any | null>(null);
  const [targetEmail, setTargetEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSendStatus, setEmailSendStatus] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleOpenWaModal = (t: any) => {
    setSelectedWaTemplate(t);
    setWaSendResult(null);
    if (realLeads.length > 0 && !targetPhone) {
      setTargetPhone(realLeads[0].phone || '+91 ');
      setTargetName(realLeads[0].name || 'Applicant');
    }
  };

  const handleSelectLeadForWa = (leadId: string) => {
    const lead = realLeads.find((l) => l.id === leadId);
    if (lead) {
      setTargetPhone(lead.phone || '');
      setTargetName(lead.name || '');
    }
  };

  const handleDispatchWa = async () => {
    if (!targetPhone || !selectedWaTemplate) return;
    setIsSendingWa(true);
    setWaSendResult(null);
    try {
      const res = await fetch('/api/marketing/whatsapp/test-send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: targetPhone,
          name: targetName || 'Valued Client',
          templateKey: selectedWaTemplate.key,
          variables: { ...selectedWaTemplate.sampleVariables, name: targetName },
          customText: customNote ? `${selectedWaTemplate.renderedSample}\n\n*Counselor Note:* ${customNote}` : undefined,
          division: selectedWaTemplate.division,
        }),
      });
      const json = await res.json();
      setWaSendResult(json);
    } catch (e: any) {
      setWaSendResult({ success: false, error: e.message });
    } finally {
      setIsSendingWa(false);
    }
  };

  const handleOpenEmailModal = (e: any) => {
    setSelectedEmail(e);
    setEmailSubject(e.subject || 'Opus Overseas Advisory');
    setEmailSendStatus(null);
    if (realLeads.length > 0 && realLeads[0].email) {
      setTargetEmail(realLeads[0].email);
    } else {
      setTargetEmail('client@example.com');
    }
  };

  const handleSendEmail = async () => {
    if (!targetEmail || !selectedEmail) return;
    setIsSendingEmail(true);
    setEmailSendStatus(null);
    try {
      const res = await fetch('/api/marketing/send-email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetEmail,
          subject: emailSubject,
          html: selectedEmail.customHtml,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEmailSendStatus('✅ Email dispatched successfully!');
      } else {
        setEmailSendStatus(`❌ Send failed: ${json.error || 'Check SMTP'}`);
      }
    } catch (e: any) {
      setEmailSendStatus(`❌ Error: ${e.message}`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const filteredWa = selectedDivision === 'all'
    ? waTemplates
    : waTemplates.filter((t: any) => (t.division || '').toLowerCase().includes(selectedDivision.toLowerCase()) || t.division === 'all');

  return (
    <div ref={rootRef} className="space-y-6 p-6">
      {/* 1. Header & What This Tab Is */}
      <div className="reveal flex flex-wrap items-start justify-between gap-4 border-b border-brand-navy/10 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-brand-gold">Content & Outreach Studio</p>
          </div>
          <h2 className="mt-1 font-display text-xl font-extrabold text-brand-navy">Marketing Materials & 1-Click Client Messaging</h2>
          <p className="mt-1 text-xs text-brand-navy/60">
            Pick any verified brochure, WhatsApp template, or email and send it directly to your clients or share it on social media.
          </p>
        </div>

        {/* 3 Main Mode Tabs */}
        <div className="flex rounded-xl bg-brand-navy/[0.06] p-1 text-xs font-bold">
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`rounded-lg px-4 py-2 transition ${activeTab === 'whatsapp' ? 'bg-brand-navy text-white shadow-xs' : 'text-brand-navy/60 hover:text-brand-navy'}`}
          >
            📱 WhatsApp Templates ({waTemplates.length})
          </button>
          <button
            onClick={() => setActiveTab('emails')}
            className={`rounded-lg px-4 py-2 transition ${activeTab === 'emails' ? 'bg-brand-navy text-white shadow-xs' : 'text-brand-navy/60 hover:text-brand-navy'}`}
          >
            📧 Email Suite ({emailTemplates.length})
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`rounded-lg px-4 py-2 transition ${activeTab === 'assets' ? 'bg-brand-navy text-white shadow-xs' : 'text-brand-navy/60 hover:text-brand-navy'}`}
          >
            📂 PDF Guides & Share Links ({assets.length})
          </button>
          <button
            onClick={() => setActiveTab('advanced')}
            className={`rounded-lg px-3 py-2 transition ${activeTab === 'advanced' ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/40 hover:text-brand-navy'}`}
          >
            ⚙️ Advanced
          </button>
        </div>
      </div>

      {/* 2. TAB: WHATSAPP OUTREACH */}
      {activeTab === 'whatsapp' && (
        <div className="space-y-6">
          {/* Division Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {[
                { key: 'all', label: 'All Messages' },
                { key: 'study', label: '🎓 Study Abroad' },
                { key: 'umrah', label: '🕋 Umrah Pilgrimage' },
                { key: 'attestation', label: '📜 Attestation & Legal' },
                { key: 'operational', label: '💰 Invoices & Receipts' },
              ].map((d) => (
                <button
                  key={d.key}
                  onClick={() => setSelectedDivision(d.key)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${selectedDivision === d.key ? 'bg-brand-navy text-white' : 'bg-brand-navy/5 text-brand-navy/60 hover:bg-brand-navy/10'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <span className="text-sm text-brand-navy/50 font-mono">
              Delivery Gateway: <strong>OpenWA + Chatwoot</strong>
            </span>
          </div>

          {waLoading ? (
            <div className="py-12 text-center text-xs text-brand-navy/40">Loading ready templates…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredWa.map((t: any) => (
                <div key={t.key} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3 hover:border-brand-gold/40 transition">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-brand-gold/15 px-2 py-0.5 font-mono text-xs font-bold text-brand-navy uppercase">
                        {t.division || 'General'}
                      </span>
                      <span className="text-xs font-mono text-brand-navy/40">{t.category}</span>
                    </div>
                    <h3 className="font-display font-bold text-sm text-brand-navy">{t.name}</h3>
                    <p className="text-sm text-brand-navy/50">{t.description}</p>
                    
                    {/* Rendered Preview Box */}
                    <div className="max-h-44 overflow-y-auto rounded-xl bg-brand-cream/80 border border-brand-navy/[0.06] p-3 text-sm text-brand-navy/80 whitespace-pre-wrap font-sans leading-relaxed">
                      {t.renderedSample}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-brand-navy/[0.06] flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleCopy(t.renderedSample, t.key)}
                      className="text-[13px] font-bold text-brand-navy/60 hover:text-brand-navy"
                    >
                      {copiedKey === t.key ? '✅ Copied to Clipboard!' : '📋 Copy Copy'}
                    </button>
                    <button
                      onClick={() => handleOpenWaModal(t)}
                      className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition"
                    >
                      Send to Client 📤
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. TAB: EMAIL SUITE */}
      {activeTab === 'emails' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-brand-navy/60">
              Professional responsive HTML5 email templates. Click <strong>Preview</strong> to see how it renders on mobile & desktop, or <strong>Send</strong> to dispatch.
            </p>
          </div>

          {emailsLoading ? (
            <div className="py-12 text-center text-xs text-brand-navy/40">Loading email suite…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {emailTemplates.map((e: any) => {
                const nameLower = (e.name || '').toLowerCase();
                const badgeColor = nameLower.includes('hot') ? 'bg-rose-100 text-rose-800' : nameLower.includes('warm') ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800';

                return (
                  <div key={e.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-brand-gold/40 transition">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${badgeColor}`}>
                          {nameLower.includes('hot') ? '🔥 Hot VIP' : nameLower.includes('warm') ? '⭐ Warm Nurture' : '❄️ Discovery'}
                        </span>
                        <span className="text-xs font-mono text-brand-navy/40">ID: {e.id}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-bold text-brand-navy leading-snug">{e.name}</h3>
                      <p className="mt-1 text-xs text-brand-navy/60 italic line-clamp-2">
                        &ldquo;{e.subject}&rdquo;
                      </p>
                    </div>

                    <div className="pt-3 border-t border-brand-navy/[0.06] flex items-center justify-between gap-2">
                      <button
                        onClick={() => setPreviewEmailModal(e)}
                        className="text-xs font-bold text-brand-navy/60 hover:text-brand-navy"
                      >
                        Preview Design ↗
                      </button>
                      <button
                        onClick={() => handleOpenEmailModal(e)}
                        className="rounded-lg bg-brand-navy px-3.5 py-1.5 text-xs font-bold text-brand-gold hover:bg-brand-navy/90 shadow-xs transition"
                      >
                        Send Email 📤
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB: PDF GUIDES & SOCIAL SHARE LINKS */}
      {activeTab === 'assets' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-brand-navy/10 bg-brand-cream/40 p-5">
            <h3 className="font-display font-bold text-sm text-brand-navy">Lead Magnets & Social Media Download Links</h3>
            <p className="text-xs text-brand-navy/60 mt-1">
              Share these direct links on WhatsApp, Instagram stories, or Facebook ads. When a prospect downloads a guide, OpusOS captures their contact information automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {assets.map((a: any) => {
              const shareUrl = `https://opusoverseas.com/portal/guides/${a.id || 1}`;
              return (
                <div key={a.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-xs flex flex-col justify-between space-y-3 hover:border-brand-gold/40 transition">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-brand-gold/20 px-2 py-0.5 font-mono text-xs font-bold text-brand-navy uppercase">
                        {a.division || 'PDF Guide'}
                      </span>
                      <span className="text-[13px] font-bold text-emerald-700">{a.downloadCount || 0} Downloads</span>
                    </div>
                    <h4 className="text-xs font-bold text-brand-navy leading-snug">{a.title}</h4>
                  </div>

                  <div className="pt-3 border-t border-brand-navy/[0.06] flex items-center justify-between">
                    <button
                      onClick={() => handleCopy(shareUrl, `asset-${a.id}`)}
                      className="text-xs font-bold text-brand-navy/70 hover:text-brand-navy"
                    >
                      {copiedKey === `asset-${a.id}` ? '✅ Link Copied!' : '🔗 Copy Share Link'}
                    </button>
                    <a
                      href="/portal"
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-brand-navy/5 px-2.5 py-1 text-xs font-bold text-brand-navy hover:bg-brand-gold transition"
                    >
                      Download 📥
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. TAB: ADVANCED ENGINE & SYNC (COLLAPSIBLE) */}
      {activeTab === 'advanced' && (
        <div className="space-y-6 rounded-2xl border border-brand-navy/15 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-brand-navy/10 pb-4">
            <div>
              <h3 className="font-display font-bold text-sm text-brand-navy">⚙️ Superadmin Marketing Infrastructure</h3>
              <p className="text-xs text-brand-navy/50">Mautic automation engine, Listmonk lists, and DPDP suppression records.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-2 bg-brand-cream/40">
              <div className="font-bold text-brand-navy">Listmonk Email Engine</div>
              <p className="text-brand-navy/60">3 campaigns · 18 subscribers synchronized. DPDP suppression ledger active.</p>
            </div>
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-2 bg-brand-cream/40">
              <div className="font-bold text-brand-navy">Mautic Automation Engine</div>
              <p className="text-brand-navy/60">Nurture journeys active. 6 HTML5 templates ready.</p>
            </div>
            <div className="rounded-xl border border-brand-navy/10 p-4 space-y-2 bg-brand-cream/40">
              <div className="font-bold text-brand-navy">OpenWA & Chatwoot Gateway</div>
              <p className="text-brand-navy/60">11 WhatsApp workflows mapped. Real-time counselor inbox sync enabled.</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Send WhatsApp Message */}
      {selectedWaTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-xs">
          <div className="relative flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <div>
                <h3 className="font-display font-bold text-sm text-brand-navy">Dispatch WhatsApp Message</h3>
                <p className="text-xs text-brand-navy/50">{selectedWaTemplate.name}</p>
              </div>
              <button onClick={() => setSelectedWaTemplate(null)} className="rounded-full bg-brand-navy/10 px-3 py-1 text-xs font-bold text-brand-navy hover:bg-brand-navy hover:text-white">
                ✕ Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[13px] font-bold uppercase text-brand-navy/60">Select Lead from CRM</label>
                <select
                  onChange={(e) => handleSelectLeadForWa(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-xs focus:border-brand-gold focus:outline-none"
                >
                  <option value="">-- Choose registered lead --</option>
                  {realLeads.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.phone || 'No phone'} ({l.serviceInterest || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[13px] font-bold uppercase text-brand-navy/60">Recipient Phone</label>
                  <input
                    type="text"
                    value={targetPhone}
                    onChange={(e) => setTargetPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="mt-1 w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-xs font-mono focus:border-brand-gold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-bold uppercase text-brand-navy/60">Recipient Name</label>
                  <input
                    type="text"
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    placeholder="Client Name"
                    className="mt-1 w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-xs focus:border-brand-gold focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] font-bold uppercase text-brand-navy/60">Add Personal Counselor Note (Optional)</label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="e.g. Please bring your transcripts tomorrow at 3 PM."
                  className="mt-1 w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-xs focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[13px] font-bold uppercase text-brand-navy/60">Message Preview</label>
                <div className="mt-1 max-h-36 overflow-y-auto rounded-lg bg-brand-cream p-3 text-xs text-brand-navy/80 whitespace-pre-wrap leading-relaxed font-sans">
                  {selectedWaTemplate.renderedSample}
                  {customNote && `\n\n*Counselor Note:* ${customNote}`}
                </div>
              </div>
            </div>

            {waSendResult && (
              <div className={`rounded-lg p-3 text-xs ${waSendResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {waSendResult.success ? '✅ Message sent successfully through Chatwoot & OpenWA!' : `❌ Send failed: ${waSendResult.error || waSendResult.result?.error || 'Check WhatsApp gateway'}`}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-brand-navy/10">
              <button onClick={() => setSelectedWaTemplate(null)} className="rounded-lg px-4 py-2 text-xs font-semibold text-brand-navy/60 hover:bg-brand-navy/5">
                Cancel
              </button>
              <button
                disabled={!targetPhone || isSendingWa}
                onClick={handleDispatchWa}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-xs"
              >
                {isSendingWa ? 'Sending…' : 'Send WhatsApp Message 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Send Real Email */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-xs">
          <div className="relative flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <div>
                <h3 className="font-display font-bold text-sm text-brand-navy">Dispatch Email Template</h3>
                <p className="text-xs text-brand-navy/50">{selectedEmail.name}</p>
              </div>
              <button onClick={() => setSelectedEmail(null)} className="rounded-full bg-brand-navy/10 px-3 py-1 text-xs font-bold text-brand-navy hover:bg-brand-navy hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[13px] font-bold uppercase text-brand-navy/60">Recipient Email</label>
                <input
                  type="email"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  placeholder="applicant@example.com"
                  className="mt-1 w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-xs focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[13px] font-bold uppercase text-brand-navy/60">Subject Line</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-xs focus:border-brand-gold focus:outline-none"
                />
              </div>
            </div>

            {emailSendStatus && (
              <div className={`rounded-lg p-3 text-xs ${emailSendStatus.startsWith('✅') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {emailSendStatus}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-brand-navy/10">
              <button onClick={() => setSelectedEmail(null)} className="rounded-lg px-4 py-2 text-xs font-semibold text-brand-navy/60 hover:bg-brand-navy/5">
                Cancel
              </button>
              <button
                disabled={!targetEmail || isSendingEmail}
                onClick={handleSendEmail}
                className="rounded-lg bg-brand-navy px-4 py-2 text-xs font-bold text-brand-gold hover:bg-brand-navy/90 disabled:opacity-50 transition shadow-xs"
              >
                {isSendingEmail ? 'Dispatching…' : 'Send Real Email 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Preview HTML5 Email */}
      {previewEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-xs">
          <div className="relative flex h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-brand-navy/10 px-5 py-3.5 bg-brand-cream">
              <div>
                <div className="text-xs font-bold text-brand-navy">{previewEmailModal.name}</div>
                <div className="text-[13px] text-brand-navy/50">Subject: {previewEmailModal.subject}</div>
              </div>
              <button onClick={() => setPreviewEmailModal(null)} className="rounded-full bg-brand-navy/10 px-3 py-1 text-xs font-bold text-brand-navy hover:bg-brand-navy hover:text-white">
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-[#FAF8F4] p-2">
              <iframe title="Email Preview" srcDoc={previewEmailModal.customHtml} className="h-full w-full rounded-lg border border-brand-navy/10 bg-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}