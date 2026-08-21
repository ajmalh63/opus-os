/** Shared PII masking — single source (DRY for 4 silos) */
export const maskPassport = (v: string) => v ? `${v.slice(0,2)}****${v.slice(-2)}` : '—';
export const maskPan = (v: string) => v ? `${v.slice(0,2)}****${v.slice(-4)}` : '—';
export const maskAccount = (v: string) => v ? `****${v.slice(-4)}` : '—';
export const maskSecret = (v: string) => v ? `${v.slice(0,4)}****` : '—';
