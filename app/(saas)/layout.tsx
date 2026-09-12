import AppShell from "@/components/AppShell";
import CompanyBlocked from "@/components/CompanyBlocked";
import { requireAppContext } from "@/lib/auth/server";
import { isPlatformOwner } from "@/lib/authz";

/**
 * Authenticated product shell. URLs unchanged via route group (saas).
 */
export default async function SaasLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, company, email } = await requireAppContext("/app");

  if (
    !isPlatformOwner(profile) &&
    company?.blocked === true
  ) {
    return <CompanyBlocked />;
  }

  void user;

  return (
    <AppShell
      email={email}
      profile={profile}
      companyName={company?.name ?? null}
      enableShiftPlanning={company?.enable_shift_planning ?? null}
    >
      {children}
    </AppShell>
  );
}
