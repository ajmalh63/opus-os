import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import LiveWallpaper from '../components/LiveWallpaper';
import { useLocation } from 'wouter';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import Logo from '../components/Logo';

// Dedicated public account creation page. Better Auth handles the sign-up +
// email verification. Staff accounts are NOT created here — the owner/admin
// provisions staff from the Admin Console (register-staff endpoint).
// A self-created account gets the least-privilege 'counselor' scope by default.

export default function Signup() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.fromTo(cardRef.current,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.0, ease: 'power3.out' }
    );
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 200) {
        setMsg({
          kind: 'ok',
          text: 'Account created! Check your inbox for the verification link. (Dev: see the API log.)',
        });
      } else {
        setMsg({ kind: 'err', text: data?.message || data?.error || 'Sign-up failed.' });
      }
    } catch (err: any) {
      setMsg({ kind: 'err', text: err?.message || 'Network error.' });
    } finally {
      setBusy(false);
    }
  };

  const baseInput = 'w-full rounded-xl border border-brand-navy/10 bg-white px-4 py-3 text-sm text-brand-navy placeholder:text-brand-gray focus:border-brand-gold focus:outline-none transition-colors';

  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-navy font-sans">
      <LiveWallpaper />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb -right-24 top-1/4 h-[28rem] w-[28rem] bg-brand-blue/25 blur-3xl" />
        <div className="hero-orb -left-20 bottom-1/4 h-96 w-96 bg-brand-gold/15 blur-3xl" />
      </div>

      <main className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 pb-20 pt-32">
        <div className="w-full max-w-md">
          <div ref={cardRef} className="glass-light rounded-[2rem] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)] border border-white/5 hover:border-brand-gold/30 transition-all duration-500">
            <div className="mb-7 flex flex-col items-center gap-3 text-center">
              <Logo className="h-10 w-auto" />
              <h1 className="font-display text-2xl font-bold text-brand-navy">Create Account</h1>
              <p className="text-xs text-brand-textLight">Public sign-up. Staff are added by an administrator.</p>
            </div>

            {msg && (
              <div className={`mb-5 rounded-xl px-4 py-3 text-xs font-semibold ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                {msg.text}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-brand-textLight">Full name</label>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={baseInput} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-brand-textLight">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={baseInput} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-brand-textLight">Password</label>
                <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" className={baseInput} />
                <p className="mt-1.5 text-[10px] text-brand-textLight">Use 8+ characters. 2FA (authenticator app) can be enabled later from your workspace.</p>
              </div>
              <button disabled={busy} className="w-full rounded-full bg-brand-gold py-3.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] disabled:opacity-50">
                {busy ? 'Creating…' : 'Create & Verify Account'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-brand-textLight">
              Already have an account?{' '}
              <button onClick={() => setLocation('/login')} className="font-bold text-brand-gold hover:text-brand-gold-hover">
                Sign in
              </button>
              <span className="mx-2 text-brand-gray">·</span>
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
