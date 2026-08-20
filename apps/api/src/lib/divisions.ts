import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { appSettings } from '../db/schema.js';

// ============================================================
// Division availability switch (docs/division-availability.md)
// Single source of truth: app_settings key `divisions_enabled`
// = JSON map of division key -> boolean. Missing keys / missing
// row fall back to the owner's stated business defaults, so a
// fresh DB boots with only Study Abroad live and every other
// division safely closed (kill-switch semantics).
// ============================================================

export const DIVISION_KEYS = ['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'] as const;

export const DEFAULT_DIVISIONS_ENABLED: Record<string, boolean> = {
  'study-abroad': true,
  visa: false,
  umrah: false,
  attestation: false,
  manpower: false,
};

export const DIVISIONS_ENABLED_KEY = 'divisions_enabled';

// Reads the stored JSON map and MERGES it over the defaults so a
// partial/corrupt store can never silently enable a division.
// Fail-open to defaults on any DB/parse error.
export async function getDivisionsEnabled(env: { DB?: D1Database }): Promise<Record<string, boolean>> {
  const merged: Record<string, boolean> = { ...DEFAULT_DIVISIONS_ENABLED };
  if (env?.DB) {
    try {
      const db = getDb(env.DB);
      const row = await db.select().from(appSettings).where(eq(appSettings.key, DIVISIONS_ENABLED_KEY)).get();
      if (row?.value) {
        try {
          const parsed = JSON.parse(row.value);
          if (parsed && typeof parsed === 'object') {
            for (const key of DIVISION_KEYS) {
              if (typeof (parsed as Record<string, unknown>)[key] === 'boolean') {
                merged[key] = (parsed as Record<string, boolean>)[key];
              }
            }
          }
        } catch {
          // corrupted value → defaults
        }
      }
    } catch {
      // DB unavailable → defaults
    }
  }
  return merged;
}

export async function isDivisionEnabled(env: { DB?: D1Database }, key: string): Promise<boolean> {
  const map = await getDivisionsEnabled(env);
  return map[key] === true;
}

// Idempotent bootstrap: insert the defaults row only when missing
// (like seedPartnerCreatives — caller passes the drizzle db client).
export async function seedDivisionsEnabled(db: ReturnType<typeof getDb>): Promise<void> {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, DIVISIONS_ENABLED_KEY)).get();
  if (existing) return;
  await db
    .insert(appSettings)
    .values({
      key: DIVISIONS_ENABLED_KEY,
      value: JSON.stringify(DEFAULT_DIVISIONS_ENABLED),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoNothing();
}
