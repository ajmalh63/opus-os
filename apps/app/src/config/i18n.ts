/**
 * i18n — Single source of truth for supported languages.
 * Add languages here only when YOU decide to support them.
 * No hardcoded market assumption — defaults to EN only.
 * To enable: edit one line, e.g. ['EN','HI','AR','ML'] — both portals auto-sync via <LanguagePill />
 *
 * Example: export const SUPPORTED_LANGUAGES = ['EN', 'HI', 'AR', 'ML'] as const;
 * Then: <LanguagePill languages={[...SUPPORTED_LANGUAGES]} />
 *
 * NOTE: Kept as ['EN'] until you confirm. Uncomment below to enable multi-language dropdown (config-driven, no code change elsewhere).
 */
export const SUPPORTED_LANGUAGES = ['EN'] as const;
// When ready, switch to: export const SUPPORTED_LANGUAGES = ['EN', 'HI', 'AR', 'ML'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGUAGES)[number];

// Optional: display names for UI (keep keys = codes)
export const LANGUAGE_LABELS: Record<string, string> = {
  EN: 'EN',
  HI: 'हिंदी',
  AR: 'عربي',
  ML: 'മല',
  BN: 'বাংলা',
  TA: 'தமிழ்',
  TE: 'తెలుగు',
  KN: 'ಕನ್ನಡ',
  MR: 'मराठी',
  GU: 'ગુજરાતી',
};

// Helper: get label for code, fallback to code
export const labelFor = (code: string) => LANGUAGE_LABELS[code] || code;
