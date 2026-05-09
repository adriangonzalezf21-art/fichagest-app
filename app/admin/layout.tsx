"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getMyCompanyAccess } from "@/lib/companyAccess";
import CompanyBlocked from "@/components/CompanyBlocked";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [ok, setOk] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const guard = async () => {
      try {
        const access = await getMyCompanyAccess();

        if (!access.session) {
          router.push("/login?next=/admin/shifts");
          return;
        }

        if (access.blocked) {
          setBlocked(true);
          setOk(true);
          return;
        }

        const uid = access.session.user.id;

        const { data: prof, error } = await supabase
          .from("profiles")
          .select("role, is_owner")
          .eq("user_id", uid)
          .maybeSingle<{ role: string | null; is_owner: boolean | null }>();

        if (error) {
          router.push("/app");
          return;
        }

        const isOwner = prof?.is_owner === true;
        const role = (prof?.role || "").toLowerCase();

        if (!isOwner && role !== "admin") {
          router.push("/app");
          return;
        }

        setOk(true);
      } catch {
        router.push("/app");
      }
    };

    guard();
  }, [router]);

  if (!ok) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-white/60">Comprobando permisos...</p>
      </main>
    );
  }

  if (blocked) {
    return <CompanyBlocked />;
  }

  const isActive = (href: string) => pathname?.startsWith(href);

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="text-white/50 text-xs">Fichagest · by Iberogest</div>
            <h1 className="text-2xl font-bold text-white">Zona Admin</h1>
            <p className="text-white/60 text-sm">Gestión de empresa</p>
          </div>

          <div className="flex gap-3 text-sm flex-wrap">
            <Link
              href="/admin/shifts"
              className={`px-4 py-2 rounded-lg border border-white/10 ${
                isActive("/admin/shifts") ? "bg-white/10" : "bg-white/5"
              }`}
            >
              Fichajes
            </Link>

            <Link
              href="/admin/users"
              className={`px-4 py-2 rounded-lg border border-white/10 ${
                isActive("/admin/users") ? "bg-white/10" : "bg-white/5"
              }`}
            >
              Usuarios
            </Link>

            <Link
              href="/admin/vacations"
              className={`px-4 py-2 rounded-lg border border-white/10 ${
                isActive("/admin/vacations") ? "bg-white/10" : "bg-white/5"
              }`}
            >
              Vacaciones
            </Link>

            <Link
              href="/app"
              className="px-4 py-2 rounded-lg border border-white/10 bg-white/5"
            >
              Panel
            </Link>
          </div>
        </div>

        {children}
      </div>
    </main>
  );
}