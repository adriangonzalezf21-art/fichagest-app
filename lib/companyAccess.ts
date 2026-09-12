import { createClient } from "@/lib/supabase/client";

/**
 * Client helper: session + company blocked flag.
 * Prefer middleware / server layouts for hard route protection.
 */
export async function getMyCompanyAccess() {
  const supabase = createClient();
  const { data: sess, error: sessErr } = await supabase.auth.getSession();
  if (sessErr) throw new Error(sessErr.message);
  if (!sess.session) return { session: null, blocked: false, companyId: null };

  const userId = sess.session.user.id;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("company_id, is_owner")
    .eq("user_id", userId)
    .maybeSingle<{ company_id: string | null; is_owner?: boolean | null }>();

  if (pErr) throw new Error(pErr.message);

  if (profile?.is_owner === true) {
    return { session: sess.session, blocked: false, companyId: profile.company_id ?? null };
  }

  if (!profile?.company_id) {
    return { session: sess.session, blocked: false, companyId: null };
  }

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id, blocked")
    .eq("id", profile.company_id)
    .maybeSingle<{ id: string; blocked: boolean | null }>();

  if (cErr) throw new Error(cErr.message);

  return {
    session: sess.session,
    blocked: company?.blocked === true,
    companyId: profile.company_id,
  };
}
