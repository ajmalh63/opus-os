import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSession } from '../lib/session';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

// 2FA onboarding (gold-standard TOTP): enable → QR/secret + backup codes →
// verify one code → enabled. Runs entirely against Better Auth endpoints.
// Works in the workspace (“Security”) card for every staff role.

export default function TwoFactorSetup() {
  const { me, refresh } = useSession();
  const [step, setStep] = useState<'idle' | 'setup' | 'done'>('idle');
  const [password, setPassword] = useState('');
  const [totpURI, setTotpURI] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const enabled = !!me?.twoFactorEnabled;

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  async function post(path: string, body: unknown) {
    const r = await fetch(`${API}/api/auth${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await post('/two-factor/enable', { password, issuer: 'Opus Overseas' });
      if (r.status === 200 && r.data.totpURI) {
        setTotpURI(r.data.totpURI);
        setBackupCodes(Array.isArray(r.data.backupCodes) ? r.data.backupCodes : []);
        setStep('setup');
      } else {
        setMsg({ kind: 'err', text: r.data?.message || r.data?.code || 'Enable failed — verify your password.' });
      }
    } finally { setBusy(false); }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await post('/two-factor/verify-totp', { code });
      if (r.status === 200 || r.data?.status === true || r.data === true) {
        await refresh();
        setStep('done');
        setMsg({ kind: 'ok', text: '2FA enabled. Keep your backup codes safe!' });
      } else {
        setMsg({ kind: 'err', text: r.data?.message || 'Invalid code.' });
      }
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await post('/two-factor/disable', { password });
      if (r.status === 200) {
        await refresh();
        setStep('idle');
        setMsg({ kind: 'ok', text: '2FA disabled.' });
      } else {
        setMsg({ kind: 'err', text: r.data?.message || 'Disable failed.' });
      }
    } finally { setBusy(false); }
  };

  if (enabled) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-brand-navy-900 to-brand-navy p-6 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            <p className="font-display text-base font-extrabold text-white">Two-Factor Authentication (2FA)</p>
          </div>
          <p className="mt-1 text-xs text-white/70">Your workspace account is protected by hardware/software TOTP authenticator & encrypted backup codes.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-emerald-300 shadow-xs">
            ● Active
          </span>
          <button
            onClick={() => { if (window.confirm('Disable two-factor authentication? This will lower your account security.')) disable(); }}
            disabled={busy}
            className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            Disable 2FA
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand-navy/15 bg-gradient-to-br from-brand-navy-900 via-brand-navy to-brand-navy-800 p-6 shadow-xl backdrop-blur-md text-white">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-brand-gold text-lg">🛡️</span>
            <p className="font-display text-base font-black text-white">Two-Factor Authentication (2FA)</p>
          </div>
          <p className="text-xs text-white/60 mt-0.5">Protect your administrative account with time-based one-time passcodes.</p>
        </div>
        <span className="rounded-full bg-brand-gold/20 border border-brand-gold/40 px-3.5 py-1 text-[13px] font-black uppercase tracking-wider text-brand-gold shadow-xs">
          Disabled
        </span>
      </div>

      {msg && (
        <div className={`mt-4 rounded-xl px-4 py-3 text-xs font-bold border ${msg.kind === 'ok' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'}`}>
          {msg.text}
        </div>
      )}

      {step === 'idle' && (
        <form onSubmit={enable} className="mt-5 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/80 leading-relaxed space-y-2">
            <div className="flex items-center gap-2 font-bold text-white">
              <span className="text-brand-gold font-bold">📱</span> Compatible Authenticator Apps:
            </div>
            <p className="text-white/60">
              Works with Google Authenticator, Microsoft Authenticator, Apple Passwords, 1Password, Bitwarden, or Authy.
            </p>
          </div>

          <div>
            <label className="block text-[13px] font-extrabold uppercase tracking-wider text-brand-gold mb-1.5">
              Confirm Current Password to Begin
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your current password"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold focus:outline-none transition"
            />
          </div>

          <button
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-brand-gold to-amber-500 py-3 text-xs font-black uppercase tracking-wider text-brand-navy shadow-md hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
          >
            {busy ? 'Generating Security Keys…' : 'Generate 2FA QR Code & Secret →'}
          </button>
        </form>
      )}

      {step === 'setup' && (
        <div className="mt-5 space-y-6">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-extrabold uppercase tracking-wider text-brand-gold mb-3">
              Step 1: Scan QR Code with your Authenticator App
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {totpURI && (
                <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white shadow-2xl border-2 border-brand-gold/50 shrink-0">
                  <QRCodeSVG value={totpURI} size={148} level="M" includeMargin={false} />
                  <span className="text-xs font-black text-brand-navy mt-2 uppercase tracking-widest">Opus Security TOTP</span>
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-3 w-full">
                <div>
                  <span className="text-[13px] font-bold uppercase tracking-wider text-white/50 block mb-1">
                    Or Enter Secret Manually:
                  </span>
                  <input
                    readOnly
                    value={totpURI.split('secret=')[1]?.split('&')[0] || ''}
                    onFocus={(e) => e.target.select()}
                    className="w-full rounded-xl border border-white/20 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-brand-gold font-bold tracking-widest outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(totpURI.split('secret=')[1]?.split('&')[0] || '', 'secret')}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>{copiedKey === 'secret' ? '✓ Copied' : '📋 Copy Secret'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(totpURI, 'uri')}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>{copiedKey === 'uri' ? '✓ Copied' : '🔗 Copy TOTP URI'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {backupCodes.length > 0 && (
            <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-extrabold uppercase tracking-wider text-brand-gold">
                  Step 2: Save Emergency Backup Codes
                </p>
                <button
                  type="button"
                  onClick={() => copyText(backupCodes.join('\n'), 'backup')}
                  className="rounded-lg bg-brand-gold/20 border border-brand-gold/40 px-2.5 py-1 text-[13px] font-bold text-brand-gold hover:bg-brand-gold hover:text-brand-navy transition cursor-pointer"
                >
                  {copiedKey === 'backup' ? '✓ All Copied' : 'Copy All Codes'}
                </button>
              </div>
              <p className="text-sm text-white/70 mb-3">
                Each code can be used once if you lose access to your authenticator app. Store them securely.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {backupCodes.map((b, i) => (
                  <div key={i} className="rounded-lg bg-black/40 border border-brand-gold/20 px-2.5 py-1.5 font-mono text-xs text-brand-gold font-bold text-center tracking-wider">
                    {b}
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={verify} className="space-y-4">
            <div>
              <label className="block text-[13px] font-extrabold uppercase tracking-wider text-emerald-400 mb-1.5 text-center">
                Step 3: Enter 6-Digit Code from Authenticator
              </label>
              <input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000 000"
                maxLength={6}
                autoFocus
                className="w-full rounded-2xl border-2 border-emerald-500/50 bg-black/50 px-4 py-3.5 text-center font-mono text-2xl font-black tracking-[0.5em] text-white placeholder-white/20 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40 focus:outline-none transition shadow-inner"
              />
            </div>

            <button
              disabled={busy || code.trim().length < 6}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-40"
            >
              {busy ? 'Verifying Code…' : '✓ Verify & Enable 2FA Protection'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('idle'); setTotpURI(''); }}
              className="w-full text-center text-xs font-bold text-white/50 hover:text-white transition cursor-pointer"
            >
              Cancel & Return
            </button>
          </form>
        </div>
      )}
    </div>
  );
}