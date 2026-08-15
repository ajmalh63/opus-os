import { Component, type ReactNode } from 'react';

// Root error boundary — diagnostics in dev, graceful fallback in prod.
// A single throwing component must never render the whole surface white
// (that is exactly what happened on /workspaces: no boundary existed).
// componentDidCatch + window listeners capture React, handler, and promise
// errors; in dev they render on-page so the exact exception is visible.

interface State { error: Error | null; windowError: string | null; }
interface Props { children: ReactNode; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, windowError: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  componentDidMount() {
    const show = (msg: string) => this.setState({ windowError: msg });
    window.addEventListener('error', (e) => show(`window.error: ${e.message}`));
    window.addEventListener('unhandledrejection', (e: any) => show(`unhandledrejection: ${e?.reason?.message || e?.reason || 'unknown'}`));
  }

  render() {
    const dev = import.meta.env.DEV;
    const err = this.state.error;
    if (err || this.state.windowError) {
      const message = err?.message || this.state.windowError || 'Unknown render error';
      const stack = err?.stack || '';
      return (
        <div className="grid min-h-screen place-items-center bg-brand-navy p-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="inline-block rounded-full border border-rose-500/50 bg-rose-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-rose-600">
              {dev ? 'Dev — error captured (root cause)' : 'Something went wrong'}
            </div>
            <h1 className="mt-3 font-display text-lg font-extrabold text-brand-navy">The app hit an unhandled error</h1>
            <pre className="mt-3 overflow-auto rounded-xl bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-rose-700">{message}</pre>
            {dev && stack && <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-100 p-3 font-mono text-[10px] leading-relaxed text-slate-600">{stack}</pre>}
            <button onClick={() => { this.setState({ error: null, windowError: null }); window.location.reload(); }}
              className="mt-4 rounded-full bg-brand-gold px-5 py-2 text-[11px] font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-1 hover:text-white">
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}