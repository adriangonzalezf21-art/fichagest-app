import { requireAdminProfile } from "@/lib/auth/server";

/**
 * Server gate for /admin/** — navigation lives in AppShell.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminProfile("/admin/shifts");
  return <>{children}</>;
}
