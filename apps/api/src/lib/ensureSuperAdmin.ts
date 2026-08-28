import { users, accounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from './auth/crypto.js';

export const PERMANENT_SUPERADMINS = [
  {
    id: 'VwJgCvXV81oT6uxLnPU4O3kcMyfsTJIX',
    name: 'Ajmal Hussain',
    email: 'ajmalsn63@gmail.com',
    role: 'super_admin' as const,
    accountId: 'OfB5yrT5tjNY4mI8490U3uawmKnQ7fJ2',
  },
  {
    id: '9TZgFVKEoorNfGuwA9ic6PMz9rDW09KF',
    name: 'Owner',
    email: 'owner@opusoverseas.com',
    role: 'super_admin' as const,
    accountId: 'WfAlZVFp2S6Nadn8KPzH7wqriUMEKf7P',
  },
] as const;

export const PERMANENT_SUPERADMIN_EMAILS = new Set(PERMANENT_SUPERADMINS.map((u) => u.email.toLowerCase()));
export const ALL_DIVISIONS_JSON = JSON.stringify(['study_abroad', 'visa', 'umrah', 'attestation', 'manpower']);

/**
 * Ensures permanent superadmins exist and are permanently active with verified PBKDF2 hashes in D1.
 * Runs on every server startup, /api/infrastructure/health, and auth fail-safe.
 */
export async function ensurePermanentSuperAdmins(db: any, env?: any): Promise<void> {
  const defaultPassword = env?.ADMIN_PASSWORD || 'OwnerPass2026!';
  const now = new Date();

  for (const su of PERMANENT_SUPERADMINS) {
    try {
      const [existing] = await db.select().from(users).where(eq(users.email, su.email)).limit(1);
      const pbkdf2Hash = await hashPassword(defaultPassword);

      if (!existing) {
        // 1. Insert user row
        await db.insert(users).values({
          id: su.id,
          name: su.name,
          email: su.email,
          role: su.role,
          emailVerified: true,
          userDivisions: ALL_DIVISIONS_JSON,
          passwordHash: pbkdf2Hash,
          twoFactorEnabled: false,
          createdAt: now,
          updatedAt: now,
        });

        // 2. Insert account row for legacy compatibility
        await db.insert(accounts).values({
          id: su.accountId,
          userId: su.id,
          accountId: su.id,
          providerId: 'credential',
          password: pbkdf2Hash,
          issuer: 'local:credential',
          createdAt: now,
          updatedAt: now,
        }).catch(() => {});
      } else {
        // 3. Self-heal: ensure role is super_admin, emailVerified, and all divisions
        const needsUpdate =
          existing.role !== 'super_admin' ||
          !existing.emailVerified ||
          !existing.passwordHash?.startsWith('pbkdf2:') ||
          existing.userDivisions !== ALL_DIVISIONS_JSON;

        if (needsUpdate) {
          await db
            .update(users)
            .set({
              role: 'super_admin',
              emailVerified: true,
              userDivisions: ALL_DIVISIONS_JSON,
              passwordHash: pbkdf2Hash,
              updatedAt: now,
            })
            .where(eq(users.email, su.email));
        }

        // Keep accounts table in sync
        const [acct] = await db.select().from(accounts).where(eq(accounts.userId, existing.id)).limit(1);
        if (!acct) {
          await db.insert(accounts).values({
            id: su.accountId,
            userId: existing.id,
            accountId: existing.id,
            providerId: 'credential',
            password: pbkdf2Hash,
            issuer: 'local:credential',
            createdAt: now,
            updatedAt: now,
          }).catch(() => {});
        } else if (!acct.password?.startsWith('pbkdf2:')) {
          await db.update(accounts).set({ password: pbkdf2Hash, updatedAt: now }).where(eq(accounts.id, acct.id));
        }
      }
    } catch (e: any) {
      console.warn(`[ensureSuperAdmin] Non-fatal self-heal warning for ${su.email}:`, e?.message);
    }
  }
}

export function isPermanentSuperAdminEmail(email: string): boolean {
  return PERMANENT_SUPERADMIN_EMAILS.has(email.toLowerCase());
}
