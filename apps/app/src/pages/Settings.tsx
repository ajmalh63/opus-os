import { useState, useEffect } from 'react';
import { useSession } from '../lib/session';
import TwoFactorSetup from '../components/TwoFactorSetup';

// ============================================================
// Profile Settings — /settings
//   Profile tab  : identity summary + role + 2FA status
//   Security tab : 2FA (enable/disable/backup codes) + change password
//   Sessions tab : active sessions, revoke others
// All security actions run against Better Auth endpoints via the
// same-origin /api/auth proxy (httpOnly session cookie, no tokens).
// ============================================================

type TabKey = 'profile' | 'security' | 'sessions';

interface SessionRow {
  token: string;
  createdAt?: string;
  updatedAt?: string;
  ipAddress?: string;
  userAgent?: string;
  isCurrent?: boolean;
  [k: string]: unknown;
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="font-display text-sm font-bold text-brand-navy">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-brand-navy/50">{sub}</p>}
    </div>
  );
}

const baseInput =
  'w-full rounded-xl border border-brand-navy/10 bg-white px-4 py-2.5 text-sm text-brand-navy placeholder:text-brand-navy/30 focus:border-brand-gold focus:outline-none';

function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (next.length < 8) { setMsg({ kind: 'err', text: 'New password must be at least 8 characters.' }); return; }
      if (next !== confirm) { setMsg({ kind: 'err', text: 'New passwords do not match.' }); return; }
      const r = await fetch('/api/auth/change-password', { credentials: 'include', method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && r.status !== 400) {
        setMsg({ kind: 'ok', text: 'Password updated successfully.' });
        setCurrent(''); setNext(''); setConfirm('');
      } else {
        setMsg({ kind: 'err', text: data.message || data.code || 'Change failed — verify your current password.' });
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-[0_4px_20px_rgba(10,45,80,0.05)]">
      <SectionTitle title="Change password" sub="Use 8+ characters. Breached passwords are rejected automatically." />
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className={baseInput} />
        <input type="password" required value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" className={baseInput} />
        <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" className={baseInput} />
        {msg && <p className={`text-xs font-semibold ${msg.kind === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
        <button disabled={busy} className="w-full rounded-full bg-brand-navy py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-brand-navy-800 disabled:opacity-50">
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

function SessionsCard() {
  const { me } = useSession();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    try {
      const r = await fetch('/api/auth/list-sessions', { credentials: 'include', });
      if (!r.ok) { setMsg({ kind: 'err', text: 'Could not load sessions.' }); return; }
      const data = await r.json();
      const list = Array.isArray(data) ? data : data.sessions ?? [];
      setRows(list as SessionRow[]);
      setMsg(null);
    } catch { setMsg({ kind: 'err', text: 'Could not load sessions.' }); }
  };
  useEffect(() => { load(); }, []);

  const revoke = async (token?: string, others = false) => {
    setBusy(true); setMsg(null);
    try {
      const body = others ? {} : { token };
      const r = await fetch(others ? '/api/auth/revoke-other-sessions' : '/api/auth/revoke-session', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { setMsg({ kind: 'ok', text: others ? 'All other sessions revoked.' : 'Session revoked.' }); await load(); }
      else setMsg({ kind: 'err', text: data.message || data.code || 'Revoke failed.' });
    } finally { setBusy(false); }
  };

  const fmtDate = (t?: string) => (t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const deviceOf = (s: SessionRow) => {
    const ua = (s.userAgent || '').toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return '📱 Mobile';
    if (ua.includes('mac')) return '💻 Mac';
    if (ua.includes('windows')) return '🖥️ Windows';
    if (ua.includes('linux')) return '🐧 Linux';
    return '🌐 Browser';
  };

  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-[0_4px_20px_rgba(10,45,80,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle title="Active sessions" sub="Devices currently signed in to your account." />
        <button onClick={() => revoke(undefined, true)} disabled={busy}
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50">
          Sign out all others
        </button>
      </div>
      {msg && <p className={`mt-3 text-xs font-semibold ${msg.kind === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>}
      <div className="mt-4 space-y-2">
        {rows === null ? (
          <p className="text-xs text-brand-navy/40">Loading sessions…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-brand-navy/40">No active sessions found.</p>
        ) : rows.map((s, i) => {
          const isCurrent = s.isCurrent || s.token === me?.id;
          return (
            <div key={s.token || i} className="flex items-center gap-3 rounded-xl border border-brand-navy/10 bg-brand-cream px-4 py-3">
              <span className="text-lg">{deviceOf(s)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-brand-navy">
                  {deviceOf(s)}
                  {isCurrent && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700">This device</span>}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-brand-navy/50">
                  Signed in {fmtDate(s.createdAt)} · Last active {fmtDate(s.updatedAt)}{s.ipAddress ? ` · ${s.ipAddress}` : ''}
                </div>
              </div>
              {!isCurrent && (
                <button onClick={() => revoke(s.token)} disabled={busy}
                  className="rounded-lg border border-brand-navy/10 px-3 py-1.5 text-[11px] font-semibold text-brand-navy/60 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50">
                  Revoke
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfileTab() {
  const { me } = useSession();
  if (!me) return null;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_4px_20px_rgba(10,45,80,0.05)]">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-gold/15 text-xl font-bold text-brand-gold">
            {(me.name || 'O').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-brand-navy">{me.name}</h2>
            <p className="truncate text-xs text-brand-navy/50">{me.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-navy/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-navy">{me.role?.replace('_', ' ')}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${me.twoFactorEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {me.twoFactorEnabled ? '2FA on' : '2FA off'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-[0_4px_20px_rgba(10,45,80,0.05)]">
        <SectionTitle title="About this account" sub="Your identity is managed by the workspace owner." />
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/40">Name</dt><dd className="mt-0.5 text-sm text-brand-navy">{me.name}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/40">Email</dt><dd className="mt-0.5 text-sm text-brand-navy">{me.email}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/40">Role</dt><dd className="mt-0.5 text-sm capitalize text-brand-navy">{me.role?.replace('_', ' ')}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/40">Email verified</dt><dd className="mt-0.5 text-sm text-brand-navy">{me.emailVerified ? 'Yes' : 'No'}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState<TabKey>('profile');

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { key: 'security', label: 'Security', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    { key: 'sessions', label: 'Sessions', icon: 'M3 7h11m-5 5h9m-5 5h5' },
  ];

  return (
    <div className="min-h-full space-y-6 font-sans">
      <div className="border-b border-brand-navy/10 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(215,160,25,0.8)] animate-pulse" />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-brand-gold">Account Governance</span>
        </div>
        <h1 className="font-display text-2xl font-black text-brand-navy tracking-tight">Account & Security Settings</h1>
        <p className="mt-0.5 text-xs text-brand-textLight">Manage your personal credentials, hardware 2FA authenticator, and active enterprise sessions.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-brand-navy/15 bg-white/80 backdrop-blur-md p-1.5 w-fit shadow-xs">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200 cursor-pointer ${
              tab === t.key ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-sm' : 'text-brand-navy/60 hover:bg-brand-navy/5 hover:text-brand-navy'
            }`}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab />}

      {tab === 'security' && (
        <div className="space-y-6 max-w-4xl">
          <TwoFactorSetup />
          <ChangePasswordCard />
        </div>
      )}

      {tab === 'sessions' && <SessionsCard />}
    </div>
  );
}
