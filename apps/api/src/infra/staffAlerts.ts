import { getDb } from '../db/client.js';
import { staffAlerts, appSettings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Staff alert feed — every client sale/inquiry/application across divisions
// creates one row; staff dashboards poll and pop them up. Superadmin controls
// per-role visibility via app_settings key `staff_alert_visibility`
// (JSON: { role: [type, ...] }).

export const ALERT_TYPES = [
  'visa_inquiry', 'visa_application', 'visa_sale',
  'manpower_application', 'membership_sale', 'document_upload', 'resume_upload',
] as const;

// Default visibility: super_admin sees everything; other roles get sensible defaults.
const DEFAULT_VISIBILITY: Record<string, string[]> = {
  super_admin: ['*'],
  manager: ['visa_sale', 'visa_application', 'visa_inquiry', 'manpower_application', 'membership_sale'],
  counselor: ['visa_application', 'visa_inquiry', 'manpower_application'],
  receptionist: ['visa_inquiry', 'manpower_application'],
  coordinator: ['visa_application', 'manpower_application'],
};

export async function getAlertTypesForRole(env: { DB: D1Database }, role: string): Promise<string[]> {
  try {
    const db = getDb(env.DB);
    const row = await db.select().from(appSettings).where(eq(appSettings.key, 'staff_alert_visibility')).get();
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      const types = parsed?.[role];
      if (Array.isArray(types)) return types;
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_VISIBILITY[role] || DEFAULT_VISIBILITY.counselor;
}

export async function createStaffAlert(
  env: { DB: D1Database },
  a: { division: string; type: string; title: string; body?: string; payload?: unknown; clientId?: string | null; severity?: 'info' | 'warning' | 'urgent'; link?: string }
) {
  try {
    const db = getDb(env.DB);
    await db.insert(staffAlerts).values({
      id: crypto.randomUUID(),
      division: a.division,
      type: a.type,
      title: a.title,
      body: a.body || null,
      payloadJson: a.payload ? JSON.stringify(a.payload) : null,
      clientId: a.clientId || null,
      status: 'new',
      severity: a.severity ?? 'info',
      link: a.link ?? null,
      createdAt: Math.floor(Date.now() / 1000),
    }).catch(() => {});
  } catch { /* alerts are best-effort, never block the primary flow */ }
}
