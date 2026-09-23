import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  canAccessAdminZone,
  canAccessOwnerZone,
  type ProfileAuthFields,
} from "@/lib/authz";

export type AuthProfile = ProfileAuthFields & {
  user_id: string;
  full_name?: string | null;
  active?: boolean | null;
};

export type CompanySummary = {
  id: string;
  name: string | null;
  cif: string | null;
  enable_shift_planning?: boolean | null;
  blocked?: boolean | null;
};

export async function loadProfile(userId: string): Promise<AuthProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, role, is_owner, company_id, active, full_name")
    .eq("user_id", userId)
    .maybeSingle<AuthProfile>();

  if (error || !data) return null;
  return data;
}

/** Require authenticated session (server). Redirects to login if missing. */
export async function requireUser(nextPath = "/app") {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}

/** Authenticated context for AppShell (profile + optional company). */
export async function requireAppContext(nextPath = "/app") {
  const user = await requireUser(nextPath);
  const profile = await loadProfile(user.id);

  // Avoid /login ↔ /app redirect loops when Auth works but profiles row is missing.
  const safeProfile: AuthProfile =
    profile ??
    ({
      user_id: user.id,
      role: "worker",
      is_owner: false,
      company_id: null,
      full_name: null,
      active: true,
    } satisfies AuthProfile);

  let company: CompanySummary | null = null;
  if (safeProfile.company_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("companies")
      .select("id, name, cif, enable_shift_planning, blocked")
      .eq("id", safeProfile.company_id)
      .maybeSingle<CompanySummary>();
    company = data ?? null;
  }

  return {
    user,
    profile: safeProfile,
    company,
    email: user.email ?? "",
  };
}

/** Require company admin (or platform owner). Used by /admin/** layouts. */
export async function requireAdminProfile(nextPath = "/admin/shifts") {
  const user = await requireUser(nextPath);
  const profile = await loadProfile(user.id);

  if (!profile || profile.active === false || !canAccessAdminZone(profile)) {
    redirect("/app");
  }

  return { user, profile };
}

/** Require platform owner (is_owner). Used by /owner/** layouts. */
export async function requireOwnerProfile(nextPath = "/owner/companies") {
  const user = await requireUser(nextPath);
  const profile = await loadProfile(user.id);

  if (!profile || !canAccessOwnerZone(profile)) {
    redirect("/app");
  }

  return { user, profile };
}
