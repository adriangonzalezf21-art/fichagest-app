import { requireOwnerProfile } from "@/lib/auth/server";

/**
 * Server gate for /owner/** — navigation lives in AppShell.
 */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await requireOwnerProfile("/owner");
  return <>{children}</>;
}
