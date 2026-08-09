import { useState } from 'react';
import { useLocation } from 'wouter';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import Logo from '../components/Logo';
import { useSession } from '../lib/session';

// Central login gateway. Every account type (staff, partner, public) signs in
// here with the same page. Account creation is NOT in this page — public users
// sign up on /signup, partners on /partner, and staff are created by an admin.

export default function Login() {
  const [, setLocation] = useLocation();
  const { refresh } = useSession();

  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [totp, setTotp] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (t: string) => setMsg({ kind: 'err', text: t });
  const ok = (t: string) => setMsg({ kind: 'ok', text: t });

  async function post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`/api/auth${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  const finish = async () => {
    await refresh();
    setLocation('/workspaces'); // role-aware hub
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await post('/sign-in/email', { email, password });
      if (r.status === 200 && r.data?.user && r.data?.token) {
        ok('Signed in.');
        await finish();
        return;
      }
      if (r.data?.code === 'TWO_FACTOR_REQUIRED' || r.data?.twoFactor) {
        setTwoFactorStep(true);
        ok('Enter your 2FA code.');
        return;
      }
      fail(r.data?.message || r.data?.error || 'Sign-in failed.');
    } finally { setBusy(false); }
  };

  const handleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await post('/two-factor/verify-totp', { code: totp });
      if (r.status === 200 || r.data?.status === true) {
        ok('2FA verified — welcome.');
        await finish();
      } else {
        fail(r.data?.message || 'Invalid 2FA code.');
      }
    } finally { setBusy(false); }
  };

  const handleOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await post('/otp/verify', { email, otp: code });
      if (r.status === 200) {
        ok('Verified.');
        await finish();
      } else {
        fail(r.data?.error || 'Invalid OTP.');
      }
    } finally { setBusy(false); }
  };

  const baseInput = 'w-full rounded-xl border border-brand-navy/10 bg-white px-4 py-3 text-sm text-brand-navy placeholder:text-brand-gray focus:border-brand-gold focus:outline-none transition-colors';

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-navy font-sans">
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb -left-24 top-1/3 h-[28rem] w-[28rem] bg-brand-gold/15 blur-3xl" />
        <div className="hero-orb -right-20 bottom-1/4 h-96 w-96 bg-brand-blue/30 blur-3xl" />
      </div>

      <main className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 pb-20 pt-32">
        <div className="w-full max-w-md">
          <div className="glass-light rounded-[2rem] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="mb-7 flex flex-col items-center gap-3 text-center">
              <Logo className="h-10 w-auto" />
              <h1 className="font-display text-2xl font-bold text-brand-navy">Sign In</h1>
            </div>

            {msg && (
              <div className={`mb-5 rounded-xl px-4 py-3 text-xs font-semibold ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                {msg.text}
              </div>
            )}

            {!twoFactorStep && (
              <>
                <div className="mb-5 grid grid-cols-2 rounded-full bg-brand-navy/5 p-1 text-xs font-bold">
                  <button onClick={() => setMode('password')} className={`rounded-full py-2 transition-all ${mode === 'password' ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/60 hover:text-brand-gold'}`}>Password</button>
                  <button onClick={() => setMode('otp')} className={`rounded-full py-2 transition-all ${mode === 'otp' ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/60 hover:text-brand-gold'}`}>Email OTP</button>
                </div>

                {mode === 'password' ? (
                  <form onSubmit={handlePasswordLogin} className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-brand-textLight">Email</label>
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@opusoverseas.com" className={baseInput} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-brand-textLight">Password</label>
                      <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={baseInput} />
                    </div>
                    <button disabled={busy} className="w-full rounded-full bg-brand-gold py-3.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] disabled:opacity-50">
                      {busy ? 'Signing in…' : 'Sign In'}
                    </button>
                    <button type="button" onClick={() => setMode('otp')} className="w-full text-center text-xs font-semibold text-brand-textLight transition-colors hover:text-brand-gold">
                      Forgot password? Use email OTP
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleOTP} className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-brand-textLight">Email</label>
                      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={baseInput} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-brand-textLight">One-time code</label>
                      <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" maxLength={6} className={baseInput} />
                    </div>
                    <button disabled={busy} className="w-full rounded-full bg-brand-gold py-3.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] disabled:opacity-50">
                      {busy ? 'Verifying…' : 'Verify OTP'}
                    </button>
                  </form>
                )}
              </>
            )}

            {twoFactorStep && (
              <form onSubmit={handleTwoFactor} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-brand-textLight">2FA Code (authenticator app)</label>
                  <input inputMode="numeric" autoFocus value={totp} onChange={(e) => setTotp(e.target.value)} placeholder="000000" maxLength={6} className={`${baseInput} text-center text-xl font-bold tracking-[0.4em]`} />
                </div>
                <button disabled={busy} className="w-full rounded-full bg-brand-gold py-3.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] disabled:opacity-50">
                  {busy ? 'Verifying…' : 'Verify 2FA'}
                </button>
                <button type="button" onClick={() => setTwoFactorStep(false)} className="w-full text-center text-xs text-brand-textLight hover:text-brand-gold">
                  Back to sign-in
                </button>
              </form>
            )}

            <p className="mt-6 text-center text-xs text-brand-textLight">
              Need an account?{' '}
              <button onClick={() => setLocation('/signup')} className="font-bold text-brand-gold hover:text-brand-gold-hover">
                Create one here
              </button>{' '}
              ·{' '}
              <button onClick={() => setLocation('/partner')} className="font-bold text-brand-gold hover:text-brand-gold-hover">
                Partner portal
              </button>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}