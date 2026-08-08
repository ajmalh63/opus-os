import { useState } from 'react';
import { useSession } from '../lib/session';

// 2FA onboarding (gold-standard TOTP): enable → QR/secret + backup codes →
// verify one code → enabled. Runs entirely against Better Auth endpoints.
// Works in the workspace (“Security”) card for every staff role.

const fmtURI = (uri: string) => uri.replace(/&secret=([^&]+)/, '&secret=$1');

export default function TwoFactorSetup() {
  const { me, refresh } = useSession();
  const [step, setStep] = useState<'idle' | 'setup' | 'done'>('idle');
  const [password, setPassword] = useState('');
  const [totpURI, setTotpURI] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const enabled = !!me?.twoFactorEnabled;

  async function post(path: string, body: unknown) {
    const r = await fetch(`/api/auth${path}`, {
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
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5">
        <div>
          <p className="font-display text-sm font-bold text-white">Two-factor authentication</p>
          <p className="mt-1 text-xs text-white/60">Your account is protected by an authenticator app + backup codes.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">On</span>
          <button
            onClick={() => { if (window.confirm('Disable two-factor authentication?')) disable(); }}
            disabled={busy}
            className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-[10px] font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Disable
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-bold text-white">Two-factor authentication</p>
        <span className="rounded-full bg-brand-gold/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-gold">Off</span>
      </div>

      {msg && <div className={`mt-4 rounded-xl px-4 py-3 text-xs font-semibold ${msg.kind === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{msg.text}</div>}

      {step === 'idle' && (
        <form onSubmit={enable} className="mt-4 space-y-3">
          <p className="text-xs text-white/60">Add an authenticator app (Google Authenticator, Authy, 1Password). Enter your password to begin.</p>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-brand-gold focus:outline-none" />
          <button disabled={busy} className="w-full rounded-full bg-brand-gold py-3 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white disabled:opacity-50">
            {busy ? 'Preparing…' : 'Enable 2FA'}
          </button>
        </form>
      )}

      {step === 'setup' && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs text-white/60">Scan in your authenticator app (or enter manually):</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              {totpURI && (
                <div className="w-fit rounded-xl border border-white/10 bg-white p-3">
                  {/* QR: rendered from TOTP URI via external lightweight library is avoided —
                      manual entry + copy is dependency-free. */}
                  <div className="flex h-28 w-28 flex-col items-center justify-center rounded-lg bg-navy-950 text-center">
                    <span className="text-[9px] leading-tight text-brand-textLight">SCAN<br />2FA<br />QR</span>
                  </div>
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <input readOnly value={fmtURI(totpURI)} onFocus={(e) => e.target.select()} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] text-white" />
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(totpURI)} className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/20">Copy URI</button>
                  <button onClick={() => navigator.clipboard.writeText(totpURI.split('secret=')[1]?.split('&')[0] || '')} className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/20">Copy Secret</button>
                </div>
              </div>
            </div>
          </div>

          {backupCodes.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-white/60">Save these backup codes (one-time use):</p>
              <div className="grid grid-cols-2 gap-1.5">
                {backupCodes.map((b, i) => (
                  <span key={i} className="rounded-lg bg-white/5 px-2 py-1 font-mono text-[11px] text-brand-gold">{b}</span>
                ))}
              </div>
              <button onClick={() => navigator.clipboard.writeText(backupCodes.join('\n'))} className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white hover:bg-white/20">
                Copy all backup codes
              </button>
            </div>
          )}

          <form onSubmit={verify} className="space-y-3">
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter 6-digit code from app"
              maxLength={6}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-lg tracking-[0.4em] text-white focus:border-brand-gold focus:outline-none"
            />
            <button disabled={busy} className="w-full rounded-full bg-emerald-500 py-3 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-emerald-600 disabled:opacity-50">
              {busy ? 'Verifying…' : 'Verify & Enable'}
            </button>
            <button type="button" onClick={() => { setStep('idle'); }} className="w-full text-center text-xs text-white/50 hover:text-white">
              Cancel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}