/**
 * Authorization helpers — single source of truth for roles.
 * Client + server safe (no Next/Supabase imports).
 * Does NOT replace RLS; use with server guards for real enforcement.
 */

export type ProfileAuthFields = {
  role?: string | null;
  is_owner?: boolean | null;
  company_id?: string | null;
  user_id?: string | null;
  active?: boolean | null;
};

export const VALID_COMPANY_ROLES = ["admin", "worker"] as const;
export type CompanyRole = (typeof VALID_COMPANY_ROLES)[number];

export function normalizeRole(role: string | null | undefined): string {
  return (role || "").trim().toLowerCase();
}

/** Platform owner (Iberogest), not company admin. */
export function isPlatformOwner(profile: ProfileAuthFields | null | undefined): boolean {
  return profile?.is_owner === true;
}

/** Company admin (role=admin) or platform owner. */
export function isCompanyAdmin(profile: ProfileAuthFields | null | undefined): boolean {
  if (!profile) return false;
  if (isPlatformOwner(profile)) return true;
  return normalizeRole(profile.role) === "admin";
}

export function canAccessAdminZone(profile: ProfileAuthFields | null | undefined): boolean {
  return isCompanyAdmin(profile);
}

export function canAccessOwnerZone(profile: ProfileAuthFields | null | undefined): boolean {
  return isPlatformOwner(profile);
}

/** Only platform owners may promote/demote company admins. */
export function canManageAdminRoles(profile: ProfileAuthFields | null | undefined): boolean {
  return isPlatformOwner(profile);
}

export function isWorker(profile: ProfileAuthFields | null | undefined): boolean {
  if (!profile) return false;
  if (isPlatformOwner(profile) || isCompanyAdmin(profile)) return false;
  return normalizeRole(profile.role) === "worker" || !profile.role;
}

/**
 * Fields that must never be written from arbitrary client payloads.
 */
export const FORBIDDEN_PROFILE_CLIENT_WRITES = [
  "is_owner",
  "company_id",
  "user_id",
] as const;

export function assertAllowedRoleAssignment(nextRole: string): CompanyRole {
  const r = normalizeRole(nextRole);
  if (r === "admin" || r === "worker") return r;
  throw new Error("Rol no permitido.");
}
