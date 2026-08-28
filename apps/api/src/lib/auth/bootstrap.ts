import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';
import { hashPassword, verifyPassword } from './crypto.js';

export const CANONICAL_ADMIN_EMAIL = 'owner@opusoverseas.com';
export const CANONICAL_ADMIN_NAME = 'Ajmal Hussain';
export const ALL_DIVISIONS = JSON.stringify(['study_abroad', 'visa', 'umrah', 'attestation', 'manpower']);

/**
 * Ensures the permanent superadmin account exists and is valid in D1.
 * Self-healing: Automatically provisions or updates the owner account with PBKDF2 hash.
 */
export async function ensureSuperadmin(db: any, env: any): Promise<{ id: string; email: string; repaired: boolean }> {
  const adminEmail = (env?.ADMIN_EMAIL || CANONICAL_ADMIN_EMAIL).toLowerCase().trim();
  const adminPassword = env?.ADMIN_PASSWORD || 'OpusAdmin2026!';
  const now = new Date();

  // 1. Check if superadmin exists
  const [existingAdmin] = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  if (existingAdmin) {
    let needsUpdate = false;
    const updateData: any = {};

    // Ensure super_admin role and all divisions
    if (existingAdmin.role !== 'super_admin') {
      updateData.role = 'super_admin';
      needsUpdate = true;
    }
    if (!existingAdmin.emailVerified) {
      updateData.emailVerified = true;
      needsUpdate = true;
    }
    if (existingAdmin.userDivisions !== ALL_DIVISIONS) {
      updateData.userDivisions = ALL_DIVISIONS;
      needsUpdate = true;
    }

    // Verify if current password matches; if missing or invalid, re-hash with PBKDF2
    const passwordValid = await verifyPassword(adminPassword, existingAdmin.passwordHash);
    if (!passwordValid || !existingAdmin.passwordHash?.startsWith('pbkdf2:')) {
      updateData.passwordHash = await hashPassword(adminPassword);
      needsUpdate = true;
    }

    if (needsUpdate) {
      updateData.updatedAt = now;
      await db.update(users).set(updateData).where(eq(users.id, existingAdmin.id));
      return { id: existingAdmin.id, email: adminEmail, repaired: true };
    }

    return { id: existingAdmin.id, email: adminEmail, repaired: false };
  }

  // 2. Insert new permanent superadmin record
  const adminId = 'usr_superadmin_' + Math.random().toString(36).substring(2, 10);
  const passwordHash = await hashPassword(adminPassword);

  await db.insert(users).values({
    id: adminId,
    name: CANONICAL_ADMIN_NAME,
    email: adminEmail,
    emailVerified: true,
    role: 'super_admin',
    userDivisions: ALL_DIVISIONS,
    passwordHash,
    twoFactorEnabled: false,
    createdAt: now,
    updatedAt: now,
  });

  return { id: adminId, email: adminEmail, repaired: true };
}
