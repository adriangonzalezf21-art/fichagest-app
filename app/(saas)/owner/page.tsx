"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Plus, RefreshCw, Shield } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { isPlatformOwner } from "@/lib/authz";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type CompanyRow = {
  id: string;
  blocked: boolean | null;
  primary_admin_user_id: string | null;
};

/**
 * Platform owner home. Metrics reuse the same companies/profiles reads as /owner/companies.
 * Protected by owner/layout → requireOwnerProfile (SSR) + client assert.
 */
export default function OwnerHomePage() {
  const router = useRouter();
  const { error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [totalCompanies, setTotalCompanies] = useState<number | null>(null);
  const [activeCompanies, setActiveCompanies] = useState<number | null>(null);
  const [blockedCompanies, setBlockedCompanies] = useState<number | null>(null);
  const [withoutAdmin, setWithoutAdmin] = useState<number | null>(null);
  const [totalWorkers, setTotalWorkers] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);
      if (!sess.session) {
        router.push("/login?next=/owner");
        return;
      }

      const { data: meRow, error: meErr } = await supabase
        .from("profiles")
        .select("user_id, is_owner")
        .eq("user_id", sess.session.user.id)
        .maybeSingle<{ user_id: string; is_owner: boolean | null }>();

      if (meErr) throw new Error(meErr.message);
      if (!meRow || !isPlatformOwner(meRow)) {
        router.push("/app");
        return;
      }

      // Same global listing contract as /owner/companies (depends on remote RLS).
      const { data: compRows, error: compErr } = await supabase
        .from("companies")
        .select("id, blocked, primary_admin_user_id");

      if (compErr) throw new Error(compErr.message);

      const companies = (compRows ?? []) as CompanyRow[];
      const blocked = companies.filter((c) => c.blocked === true).length;
      setTotalCompanies(companies.length);
      setBlockedCompanies(blocked);
      setActiveCompanies(companies.length - blocked);
      setWithoutAdmin(companies.filter((c) => !c.primary_admin_user_id).length);

      const companyIds = companies.map((c) => c.id);
      if (companyIds.length === 0) {
        setTotalWorkers(0);
        return;
      }

      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id, company_id, role, active")
        .in("company_id", companyIds);

      if (profilesErr) throw new Error(profilesErr.message);

      const workers = (profiles ?? []).filter(
        (p) =>
          (p.role === "worker" || p.role === "admin") && p.active !== false && p.company_id
      );
      setTotalWorkers(workers.length);
    } catch (e: unknown) {
      const msg = userFacingError(e);
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <PageSkeleton />;

  if (errorMsg) {
    return <ErrorState message={errorMsg} onRetry={() => void load()} />;
  }

  return (
    <div>
      <PageHeader
        title="Panel Owner"
        description="Control Center de la plataforma Fichagest"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone="accent">
          <span className="inline-flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Fichagest
          </span>
        </Badge>
        <Badge tone="neutral">Solo owner</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Empresas totales" value={String(totalCompanies ?? "—")} />
        <StatCard
          title="Empresas activas"
          value={String(activeCompanies ?? "—")}
          tone="success"
          sub="No bloqueadas"
        />
        <StatCard
          title="Empresas bloqueadas"
          value={String(blockedCompanies ?? "—")}
          tone={blockedCompanies && blockedCompanies > 0 ? "danger" : "default"}
        />
        <StatCard
          title="Sin administrador"
          value={String(withoutAdmin ?? "—")}
          tone={withoutAdmin && withoutAdmin > 0 ? "warning" : "default"}
          sub="Sin primary_admin_user_id"
        />
        <StatCard
          title="Usuarios activos"
          value={String(totalWorkers ?? "—")}
          sub="Admin + worker activos en empresas"
        />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link href="/owner/companies">
          <Card className="transition hover:border-[var(--border-strong)]">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-[var(--text-muted)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">Ver empresas</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Listado, bloqueo, códigos y administradores
                </div>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/owner/companies?new=1">
          <Card className="transition hover:border-[var(--border-strong)]">
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-[var(--text-muted)]" />
              <div>
                <div className="text-sm font-medium text-[var(--text)]">Nueva empresa</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Abrir el formulario de alta en Empresas
                </div>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
