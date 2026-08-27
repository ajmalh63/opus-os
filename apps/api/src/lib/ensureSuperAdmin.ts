import { getDb } from '../db/client.js';
import { users, accounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Permanent superadmins — never delete, auto-heal on every health check and on auth failures
// If you need to rotate password, update the hash here and redeploy; health check will auto-update the DB
export const PERMANENT_SUPERADMINS = [
  {
    id: 'VwJgCvXV81oT6uxLnPU4O3kcMyfsTJIX',
    name: 'Owner',
    email: 'ajmalsn63@gmail.com',
    role: 'super_admin' as const,
    // OwnerPass2026! — scrypt hash via better-auth (salt:hash)
    passwordHash: 'b7451ba7a84a2bbc39b324a483fae010:1845a0e735ceffde707b8f5629cfba36404514c2e0a3b85b9bff48038b9609d74a2911ca5492d553c947f0092993204bca4513e1af57abe7639b45d64b8e0c71',
    accountId: 'OfB5yrT5tjNY4mI8490U3uawmKnQ7fJ2',
  },
  {
    id: '9TZgFVKEoorNfGuwA9ic6PMz9rDW09KF',
    name: 'Owner',
    email: 'owner@opusoverseas.com',
    role: 'super_admin' as const,
    // Same password OwnerPass2026! — ensures both logins work
    passwordHash: 'b7451ba7a84a2bbc39b324a483fae010:1845a0e735ceffde707b8f5629cfba36404514c2e0a3b85b9bff48038b9609d74a2911ca5492d553c947f0092993204bca4513e1af57abe7639b45d64b8e0c71',
    accountId: 'WfAlZVFp2S6Nadn8KPzH7wqriUMEKf7P',
  },
] as const;

export const PERMANENT_SUPERADMIN_EMAILS = new Set(PERMANENT_SUPERADMINS.map(u => u.email.toLowerCase()));

export async function ensurePermanentSuperAdmins(db: any): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  for (const su of PERMANENT_SUPERADMINS) {
    try {
      const existing = await db.select().from(users).where(eq(users.email, su.email)).get();
      if (!existing) {
        // Create user + credential account
        await db.insert(users).values({
          id: su.id,
          name: su.name,
          email: su.email,
          role: su.role,
          createdAt: now,
          updatedAt: now,
          emailVerified: true,
          userDivisions: JSON.stringify(["study-abroad","visa","umrah","attestation","manpower"]),
          passwordHash: null,
          twoFactorEnabled: false,
        } as any);
        await db.insert(accounts).values({
          id: su.accountId,
          userId: su.id,
          accountId: su.id,
          providerId: 'credential',
          password: su.passwordHash,
          createdAt: now,
          updatedAt: now,
          issuer: 'local:credential',
        } as any);
      } else {
        // Heal: ensure role is super_admin and emailVerified, and divisions are full
        const needsUpdate = existing.role !== 'super_admin' || !existing.emailVerified;
        if (needsUpdate) {
          await db.update(users).set({
            role: 'super_admin',
            emailVerified: true,
            userDivisions: JSON.stringify(["study-abroad","visa","umrah","attestation","manpower"]),
            updatedAt: now,
          }).where(eq(users.email, su.email));
        }
        // Ensure account password is correct (if missing or stale)
        const acct = await db.select().from(accounts).where(eq(accounts.userId, existing.id)).get();
        if (!acct) {
          await db.insert(accounts).values({
            id: su.accountId,
            userId: existing.id,
            accountId: existing.id,
            providerId: 'credential',
            password: su.passwordHash,
            createdAt: now,
            updatedAt: now,
            issuer: 'local:credential',
          } as any);
        } else if (acct.password !== su.passwordHash) {
          await db.update(accounts).set({ password: su.passwordHash, updatedAt: now }).where(eq(accounts.id, acct.id));
        }
      }
    } catch (e) {
      // Non-fatal — health check must never throw
      console.warn(`[ensureSuperAdmin] failed for ${su.email}:`, (e as any)?.message);
    }
  }
}

export function isPermanentSuperAdminEmail(email: string): boolean {
  return PERMANENT_SUPERADMIN_EMAILS.has(email.toLowerCase());
}
