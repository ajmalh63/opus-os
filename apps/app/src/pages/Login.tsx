import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import LiveWallpaper from '../components/LiveWallpaper';
import { useLocation } from 'wouter';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import Logo from '../components/Logo';
import { useSession } from '../lib/session';

export default function Login() {
  const [, setLocation] = useLocation();
  const { refresh } = useSession();

  // Sign-In Methods: 'password' | 'otp'
  const [signInMethod, setSignInMethod] = useState<'password' | 'otp'>('password');
  
  // Credentials State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [otpCode, setOtpCode] = useState('');
  
  // 2FA TOTP State
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [totp, setTotp] = useState('');
  
  // UI & Feedback State
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.fromTo(
      cardRef.current,
      { y: 30, opacity: 0, scale: 0.98 },
      { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'power3.out' }
    );
  }, [signInMethod, twoFactorStep, forgotPasswordMode]);

  const fail = (t: string) => setMsg({ kind: 'err', text: t });
  const ok = (t: string) => setMsg({ kind: 'ok', text: t });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    setCapsLockActive(e.getModifierState('CapsLock'));
  };

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
    // Role-aware hub: partners → partner portal; staff → workspace dashboard; clients → client workspace portal.
    const meRes = await fetch('/api/auth/me', { credentials: 'include' });
    const me = await meRes.json().catch(() => null);
    await refresh();
    if (!me?.authenticated) { setLocation('/login'); return; }
    try {
      const p = await fetch('/api/public/partners/session', { credentials: 'include' }).then(r => r.json()).catch(() => ({}));
      if (p?.authenticated === true && p?.partner) { setLocation('/partner'); return; }
    } catch { /* not a partner — fall through */ }
    const staff = ['super_admin', 'manager', 'counselor', 'coordinator', 'receptionist'];
    setLocation(staff.includes(me.role) ? '/dashboard' : '/portal');
  };

  // Password Sign-In
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await post('/sign-in/email', { email, password });
      if (r.status === 200 && (r.data?.user || r.data?.token || r.data?.session)) {
        if (r.data?.twoFactorSetupRequired) {
          ok('2FA setup required — redirecting to security vault.');
          await finish();
          return;
        }
        ok('Sign-in successful. Loading your workspace…');
        await finish();
        return;
      }
      if (r.status === 200 && (r.data?.code === 'TWO_FACTOR_REQUIRED' || r.data?.twoFactor || r.data?.twoFactorRedirect)) {
        setTwoFactorStep(true);
        ok('Two-factor authentication required. Enter your 6-digit authenticator code.');
        return;
      }
      if (r.data?.code === 'ACCOUNT_LOCKED') {
        fail(r.data?.error || 'Security lock: Too many failed attempts. Try again in 15 minutes.');
        return;
      }
      fail(r.data?.message || r.data?.error || 'Invalid email or password. Please check your credentials.');
    } catch (err: any) {
      fail(`Connection error: ${err.message}`);
    } finally { 
      setBusy(false); 
    }
  };

  // Forgot Password Request
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      fail('Please enter your registered email address.');
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const r = await post('/request-password-reset', { email, redirectTo: window.location.origin + '/login' });
      if (r.status === 200 || r.data?.status === true) {
        ok(`Password reset instructions sent to ${email}. Please check your inbox.`);
      } else {
        fail(r.data?.message || r.data?.error || 'Unable to process reset request. Please check your email.');
      }
    } catch (err: any) {
      fail(`Connection error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  // 2FA TOTP Verification
  const handleTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await post('/two-factor/verify-totp', { code: totp });
      if (r.status === 200 || r.data?.status === true) {
        ok('2FA security token accepted. Loading workspace…');
        await finish();
      } else {
        fail(r.data?.message || 'Invalid or expired 2FA code.');
      }
    } catch (err: any) {
      fail(`Connection error: ${err.message}`);
    } finally { 
      setBusy(false); 
    }
  };

  // Step 1: Send Email OTP
  const handleSendOTP = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !email.includes('@')) {
      fail('Please enter a valid email address.');
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const r = await post('/otp/send', { email });
      if (r.status === 200) {
        setOtpSent(true);
        ok(`6-digit code sent to ${email}. Check your inbox.`);
      } else {
        fail(r.data?.error || 'Failed to send OTP code.');
      }
    } catch (err: any) {
      fail(`Connection error: ${err.message}`);
    } finally { 
      setBusy(false); 
    }
  };

  // Step 2: Verify Email OTP Sign-In
  const handleOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      fail('Please enter the 6-digit code sent to your email.');
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const r = await post('/otp/verify', { email, otp: otpCode });
      if (r.status === 200 && r.data?.success) {
        ok('Passcode verified. Loading your workspace…');
        await finish();
      } else {
        fail(r.data?.error || 'Invalid or expired one-time passcode.');
      }
    } catch (err: any) {
      fail(`Connection error: ${err.message}`);
    } finally { 
      setBusy(false); 
    }
  };

  const inputClasses = 'w-full rounded-2xl border border-brand-navy/15 bg-white/90 backdrop-blur-sm px-4 py-3.5 text-sm text-brand-navy placeholder:text-brand-textLight/60 focus:border-brand-gold focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/20 transition-all font-sans';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#061e38] font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <LiveWallpaper />
      <div className="film-grain" aria-hidden="true" />
      <Nav />

      {/* Atmospheric Ambient Glows */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb -left-28 top-1/4 h-[32rem] w-[32rem] bg-brand-gold/15 blur-[130px]" />
        <div className="hero-orb -right-24 bottom-1/4 h-[30rem] w-[30rem] bg-brand-blue/25 blur-[140px]" />
      </div>

      <main className="relative z-10 flex min-h-[100dvh] items-center justify-center px-4 pb-20 pt-32 sm:pt-36">
        <div className="w-full max-w-lg">
          
          {/* Main Elevated Glass Gate */}
          <div 
            ref={cardRef} 
            className="glass-light rounded-[2.5rem] p-7 sm:p-10 shadow-[0_30px_90px_rgba(0,0,0,0.5)] border border-white/20 hover:border-brand-gold/40 transition-all duration-500"
          >
            {/* Brand Header */}
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <Logo className="h-11 w-auto" />
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy tracking-tight">
                  Sign In to Opus OS
                </h1>
              </div>
            </div>

            {/* Client Quick-Track Banner */}
            <div className="mb-6 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-3.5 text-xs text-brand-navy flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">🔍</span>
                <div>
                  <p className="font-bold text-brand-navy leading-tight">Tracking an Application?</p>
                  <p className="text-sm text-brand-navy/70">No password needed with your case token</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocation('/portal')}
                className="shrink-0 rounded-xl bg-brand-navy px-3 py-1.5 text-sm font-bold uppercase tracking-wider text-brand-gold hover:bg-brand-navy/90 transition cursor-pointer"
              >
                Track Token →
              </button>
            </div>

            {/* Status Feedback Alerts */}
            {msg && (
              <div className={`mb-5 rounded-2xl px-4 py-3 text-xs font-semibold flex items-center gap-2.5 animate-[fadeIn_0.2s_ease-out] ${
                msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                <span>{msg.kind === 'ok' ? '✓' : '⚠️'}</span>
                <span>{msg.text}</span>
              </div>
            )}

            {/* Standard Sign-In Surface */}
            {!twoFactorStep && (
              <>
                {forgotPasswordMode ? (
                  /* Forgot Password Request Surface */
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="rounded-2xl bg-brand-gold/10 border border-brand-gold/30 p-4 text-xs text-brand-navy space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <span>🔑</span> Reset Your Account Password
                      </p>
                      <p className="text-sm text-brand-navy/75">
                        Enter your registered account email. We'll send you a secure 10-minute password reset link to your mailbox.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[13px] font-bold uppercase tracking-wider text-brand-textLight">
                        Registered Account Email
                      </label>
                      <input 
                        type="email" 
                        required 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        placeholder="you@example.com" 
                        className={inputClasses} 
                      />
                    </div>

                    <button 
                      disabled={busy} 
                      className="w-full cursor-pointer rounded-full bg-brand-navy py-4 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 tactile-btn"
                    >
                      {busy ? 'Dispatching Reset Link…' : 'Send Password Reset Link →'}
                    </button>

                    <div className="text-center pt-2">
                      <button
                        type="button"
                        onClick={() => { setForgotPasswordMode(false); setMsg(null); }}
                        className="text-xs font-bold text-brand-textLight hover:text-brand-navy transition cursor-pointer"
                      >
                        ← Back to Sign In
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    {/* Method selector: Password vs Instant Email OTP */}
                    <div className="mb-6 grid grid-cols-2 rounded-2xl bg-brand-navy/5 p-1 text-xs font-bold border border-brand-navy/10">
                      <button 
                        type="button"
                        onClick={() => { setSignInMethod('password'); setMsg(null); }} 
                        className={`cursor-pointer rounded-xl py-2.5 transition-all ${
                          signInMethod === 'password' 
                            ? 'bg-brand-navy text-white shadow-md' 
                            : 'text-brand-navy/70 hover:text-brand-navy'
                        }`}
                      >
                        Password Sign In
                      </button>
                      <button 
                        type="button"
                        onClick={() => { setSignInMethod('otp'); setMsg(null); }} 
                        className={`cursor-pointer rounded-xl py-2.5 transition-all ${
                          signInMethod === 'otp' 
                            ? 'bg-brand-gold text-brand-navy shadow-md font-extrabold' 
                            : 'text-brand-navy/70 hover:text-brand-navy'
                        }`}
                      >
                        Direct Email OTP
                      </button>
                    </div>

                    {signInMethod === 'password' ? (
                      <form onSubmit={handlePasswordLogin} className="space-y-4">
                        <div>
                          <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                            Email Address
                          </label>
                          <input 
                            type="email" 
                            required 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="you@example.com" 
                            className={inputClasses} 
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight">
                              Password
                            </label>
                            <button
                              type="button"
                              onClick={() => { setForgotPasswordMode(true); setMsg(null); }}
                              className="text-sm font-bold text-brand-gold-hover hover:underline cursor-pointer"
                            >
                              Forgot Password?
                            </button>
                          </div>
                          <div className="relative">
                            <input 
                              type={showPassword ? 'text' : 'password'} 
                              required 
                              minLength={8} 
                              value={password} 
                              onChange={(e) => setPassword(e.target.value)} 
                              onKeyDown={handleKeyDown}
                              placeholder="••••••••••••" 
                              className={`${inputClasses} pr-11`} 
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-textLight hover:text-brand-navy cursor-pointer"
                            >
                              {showPassword ? 'Hide' : 'Show'}
                            </button>
                          </div>
                          {capsLockActive && (
                            <span className="mt-1 block text-[13px] font-bold text-amber-600 animate-pulse">
                              ⚠️ Caps Lock is ON
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <label className="flex items-center gap-2 text-xs text-brand-textLight cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={rememberMe} 
                              onChange={(e) => setRememberMe(e.target.checked)} 
                              className="h-4 w-4 rounded border-brand-navy/20 accent-brand-gold"
                            />
                            <span>Remember session (30d)</span>
                          </label>
                          <button 
                            type="button" 
                            onClick={() => { setSignInMethod('otp'); setMsg(null); }} 
                            className="text-xs font-bold text-brand-gold-hover hover:underline cursor-pointer"
                          >
                            Sign in via Email OTP
                          </button>
                        </div>

                        <button 
                          disabled={busy} 
                          className="w-full cursor-pointer rounded-full bg-brand-navy py-4 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 tactile-btn"
                        >
                          {busy ? 'Authenticating…' : 'Sign In to Workspace →'}
                        </button>
                      </form>
                    ) : (
                      /* Email OTP 2-Step Interactive Form */
                      <form onSubmit={otpSent ? handleOTP : handleSendOTP} className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight">
                              Registered Account Email
                            </label>
                            {otpSent && (
                              <button
                                type="button"
                                onClick={() => { setOtpSent(false); setOtpCode(''); setMsg(null); }}
                                className="text-sm font-bold text-brand-gold-hover hover:underline cursor-pointer"
                              >
                                ✏️ Change Email
                              </button>
                            )}
                          </div>
                          <input 
                            type="email" 
                            required 
                            disabled={otpSent || busy}
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            placeholder="you@example.com" 
                            className={`${inputClasses} ${otpSent ? 'opacity-70 bg-brand-navy/5' : ''}`} 
                          />
                        </div>

                        {!otpSent ? (
                          <>
                            <p className="text-sm text-brand-textLight/80">
                              🔒 No password needed. We will transmit a 6-digit one-time code to your registered email address.
                            </p>
                            <button 
                              type="submit"
                              disabled={busy} 
                              className="w-full cursor-pointer rounded-full bg-brand-gold py-4 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 tactile-btn"
                            >
                              {busy ? 'Sending One-Time Passcode…' : 'Send One-Time Passcode →'}
                            </button>
                          </>
                        ) : (
                          <>
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight">
                                  6-Digit Passcode from Email
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleSendOTP()}
                                  disabled={busy}
                                  className="text-sm font-bold text-brand-gold-hover hover:underline cursor-pointer"
                                >
                                  Resend Code
                                </button>
                              </div>
                              <input 
                                inputMode="numeric" 
                                autoFocus
                                required
                                value={otpCode} 
                                onChange={(e) => setOtpCode(e.target.value)} 
                                placeholder="e.g. 482913" 
                                maxLength={6} 
                                className={`${inputClasses} font-mono tracking-widest text-center text-lg font-bold`} 
                              />
                            </div>
                            <button 
                              type="submit"
                              disabled={busy} 
                              className="w-full cursor-pointer rounded-full bg-brand-navy py-4 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 tactile-btn"
                            >
                              {busy ? 'Verifying Code…' : 'Verify Email OTP & Sign In →'}
                            </button>
                          </>
                        )}
                      </form>
                    )}

                    {/* Account Registration Link */}
                    <div className="mt-6 pt-5 border-t border-brand-navy/10 text-center text-xs text-brand-textLight space-y-2">
                      <p>
                        Don't have a client account yet?{' '}
                        <button 
                          onClick={() => setLocation('/signup')} 
                          className="font-bold text-brand-navy hover:text-brand-gold underline cursor-pointer"
                        >
                          Create Client Account →
                        </button>
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {/* 2FA TOTP STEP */}
            {twoFactorStep && (
              <form onSubmit={handleTwoFactor} className="space-y-4">
                <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 text-xs text-sky-900 space-y-1">
                  <p className="font-bold">Two-Factor Authentication Active</p>
                  <p className="text-sky-800 text-sm">
                    Enter the 6-digit rolling passcode generated by your Google Authenticator or 1Password app.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-bold uppercase tracking-wider text-brand-textLight">
                    Authenticator Code (TOTP)
                  </label>
                  <input 
                    inputMode="numeric" 
                    autoFocus 
                    value={totp} 
                    onChange={(e) => setTotp(e.target.value)} 
                    placeholder="000000" 
                    maxLength={6} 
                    className={`${inputClasses} text-center text-2xl font-black tracking-[0.4em] font-mono text-brand-navy`} 
                  />
                </div>

                <button 
                  disabled={busy} 
                  className="w-full cursor-pointer rounded-full bg-brand-gold py-4 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 tactile-btn"
                >
                  {busy ? 'Verifying 2FA…' : 'Authenticate Session →'}
                </button>

                <button 
                  type="button" 
                  onClick={() => { setTwoFactorStep(false); setMsg(null); }} 
                  className="w-full text-center text-xs font-semibold text-brand-textLight hover:text-brand-navy cursor-pointer"
                >
                  ← Back to Email Sign-In
                </button>
              </form>
            )}

            {/* Security Trust Badges */}
            <div className="mt-6 pt-5 border-t border-brand-navy/10 flex items-center justify-between text-sm text-brand-textLight">
              <span className="flex items-center gap-1">
                🔒 256-Bit TLS
              </span>
              <span>● DPDP Compliant</span>
              <button 
                onClick={() => setLocation('/partner')} 
                className="font-bold text-brand-gold-hover hover:underline cursor-pointer"
              >
                Partner Portal →
              </button>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
