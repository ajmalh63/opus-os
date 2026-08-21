/** Shared paise helpers — single source of truth (DRY for 7 helpers across app) */
export const formatPaise = (p: number | null | undefined) => (p == null ? '—' : '₹' + (p / 100).toLocaleString('en-IN'));
export const formatPaiseExact = (p: number | null | undefined) => (p == null ? '—' : '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 }));
export const formatInr = formatPaise;
export const rs = formatPaise;
