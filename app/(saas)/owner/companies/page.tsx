"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Copy,
  Lock,
  RefreshCw,
  Search,
  Unlock,
  CalendarClock,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { isPlatformOwner } from "@/lib/authz";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type MeRow = {
  user_id: string;
  is_owner: boolean | null;
  full_name: string | null;
};

type CompanyRow = {
  id: string;
  name: string | null;
  cif: string | null;
  join_code: string | null;
  created_at?: string | null;
  primary_admin_user_id?: string | null;
  plan?: string | null;
  plan_status?: string | null;
  blocked?: boolean | null;
  enable_shift_planning?: boolean | null;
};

type CompanyUserRow = {
  user_id: string;
  company_id: string | null;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
};

type ConfirmAction =
  | { type: "rotate"; companyId: string }
  | { type: "block"; companyId: string; nextBlocked: boolean }
  | { type: "planner"; companyId: string; nextEnabled: boolean }
  | { type: "assignAdmin"; companyId: string };

function randomJoinCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function formatPlanDisplay(plan?: string | null, status?: string | null) {
  const rawPlan = (plan || "free").trim();
  const rawStatus = (status || "active").trim().toLowerCase();
  const planLabel = rawPlan ? rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1).toLowerCase() : "Free";
  const statusLabel = rawStatus === "active" ? "Activo" : rawStatus;
  return `Plan: ${planLabel} · ${statusLabel}`;
}

export default function OwnerCompaniesPage() {
  const router = useRouter();
  const { success, error: toastError, info } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyCompanyId, setBusyCompanyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [workerCounts, setWorkerCounts] = useState<Record<string, number>>({});
  const [usersByCompany, setUsersByCompany] = useState<Record<string, CompanyUserRow[]>>({});
  const [selectedAdminByCompany, setSelectedAdminByCompany] = useState<Record<string, string>>({});

  const [companyName, setCompanyName] = useState("");
  const [companyCif, setCompanyCif] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const assertOwnerSession = async (): Promise<MeRow | null> => {
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw new Error(sessErr.message);
    if (!sess.session) {
      router.push("/login?next=/owner/companies");
      return null;
    }

    const { data: meRow, error: meErr } = await supabase
      .from("profiles")
      .select("user_id, is_owner, full_name")
      .eq("user_id", sess.session.user.id)
      .maybeSingle();

    if (meErr) throw new Error(meErr.message);

    if (!meRow || !isPlatformOwner(meRow)) {
      router.push("/app");
      return null;
    }

    return meRow as MeRow;
  };

  const companyBelongsToLoadedSet = (companyId: string) =>
    companies.some((c) => c.id === companyId);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const meRow = await assertOwnerSession();
      if (!meRow) return;

      // NOTA: el listado global de empresas depende de RLS remota.
      // Sin RLS correcta, este panel es altamente sensible.
      const { data: compRows, error: compErr } = await supabase
        .from("companies")
        .select(
          "id, name, cif, join_code, created_at, primary_admin_user_id, plan, plan_status, blocked, enable_shift_planning"
        )
        .order("created_at", { ascending: false });

      if (compErr) throw new Error(compErr.message);

      const companyList = (compRows ?? []) as CompanyRow[];
      setCompanies(companyList);

      const companyIds = companyList.map((c) => c.id);

      if (companyIds.length > 0) {
        const { data: profiles, error: profilesErr } = await supabase
          .from("profiles")
          .select("user_id, company_id, full_name, role, active")
          .in("company_id", companyIds);

        if (profilesErr) throw new Error(profilesErr.message);

        const counts: Record<string, number> = {};
        const groupedUsers: Record<string, CompanyUserRow[]> = {};
        const selectedMap: Record<string, string> = {};

        companyIds.forEach((id) => {
          counts[id] = 0;
          groupedUsers[id] = [];
        });

        (profiles ?? []).forEach((p: CompanyUserRow) => {
          const row = p;
          if (!row.company_id) return;

          if ((row.role === "worker" || row.role === "admin") && row.active !== false) {
            counts[row.company_id] = (counts[row.company_id] || 0) + 1;
          }

          groupedUsers[row.company_id] = groupedUsers[row.company_id] || [];
          groupedUsers[row.company_id].push(row);
        });

        companyList.forEach((company) => {
          selectedMap[company.id] = company.primary_admin_user_id || "";
        });

        setWorkerCounts(counts);
        setUsersByCompany(groupedUsers);
        setSelectedAdminByCompany(selectedMap);
      } else {
        setWorkerCounts({});
        setUsersByCompany({});
        setSelectedAdminByCompany({});
      }
    } catch (e: unknown) {
      const msg = userFacingError(e);
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("new") === "1") setCreateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.cif || "").toLowerCase().includes(q) ||
        (c.join_code || "").toLowerCase().includes(q)
    );
  }, [companies, search]);

  const summary = useMemo(() => {
    const blocked = companies.filter((c) => c.blocked === true).length;
    const withPlanner = companies.filter((c) => c.enable_shift_planning === true).length;
    const withoutAdmin = companies.filter((c) => !c.primary_admin_user_id).length;
    return {
      total: companies.length,
      active: companies.length - blocked,
      blocked,
      withPlanner,
      withoutAdmin,
    };
  }, [companies]);

  const createCompany = async () => {
    if (!companyName.trim()) {
      toastError("Introduce el nombre de la empresa");
      return;
    }

    setSaving(true);

    try {
      const owner = await assertOwnerSession();
      if (!owner) return;

      let joinCode = randomJoinCode();

      for (let i = 0; i < 10; i++) {
        const { data: existingCompany, error: existingErr } = await supabase
          .from("companies")
          .select("id")
          .eq("join_code", joinCode)
          .maybeSingle();

        if (existingErr) throw existingErr;
        if (!existingCompany) break;
        joinCode = randomJoinCode();
      }

      const { data, error } = await supabase
        .from("companies")
        .insert({
          name: companyName.trim(),
          cif: companyCif.trim() || null,
          join_code: joinCode,
          blocked: false,
          is_active: true,
          plan: "free",
          plan_status: "active",
          enable_shift_planning: false,
        })
        .select("id, name, join_code")
        .single();

      if (error) {
        toastError(userFacingError(error));
        return;
      }

      setCompanyName("");
      setCompanyCif("");
      setCreateOpen(false);

      await load();

      const link = `${window.location.origin}/join?code=${data.join_code}`;
      success(`Empresa creada. Código: ${data.join_code}`);
      info(`Enlace de invitación: ${link}`);
    } catch (e: unknown) {
      toastError(userFacingError(e, "Error creando empresa"));
    } finally {
      setSaving(false);
    }
  };

  const rotateJoinCode = async (companyId: string) => {
    if (!companyBelongsToLoadedSet(companyId)) {
      toastError("Empresa no válida en este contexto.");
      return;
    }

    setBusyCompanyId(companyId);
    setConfirmLoading(true);

    try {
      const owner = await assertOwnerSession();
      if (!owner) return;

      let newCode = randomJoinCode();

      for (let i = 0; i < 10; i++) {
        const { data: existingCompany, error: existingErr } = await supabase
          .from("companies")
          .select("id")
          .eq("join_code", newCode)
          .maybeSingle();

        if (existingErr) throw existingErr;
        if (!existingCompany) break;
        newCode = randomJoinCode();
      }

      const { error } = await supabase
        .from("companies")
        .update({ join_code: newCode })
        .eq("id", companyId);

      if (error) throw error;

      await load();
      success("Código regenerado");
    } catch (e: unknown) {
      toastError(userFacingError(e, "Error regenerando código"));
    } finally {
      setBusyCompanyId(null);
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  const toggleBlocked = async (companyId: string, nextBlocked: boolean) => {
    if (!companyBelongsToLoadedSet(companyId)) {
      toastError("Empresa no válida en este contexto.");
      return;
    }

    setBusyCompanyId(companyId);
    setConfirmLoading(true);

    try {
      const owner = await assertOwnerSession();
      if (!owner) return;

      const { error } = await supabase
        .from("companies")
        .update({ blocked: nextBlocked })
        .eq("id", companyId);

      if (error) throw error;

      await load();
      success(nextBlocked ? "Empresa bloqueada" : "Empresa desbloqueada");
    } catch (e: unknown) {
      toastError(userFacingError(e, "Error actualizando bloqueo"));
    } finally {
      setBusyCompanyId(null);
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  const toggleShiftPlanning = async (companyId: string, nextEnabled: boolean) => {
    if (!companyBelongsToLoadedSet(companyId)) {
      toastError("Empresa no válida en este contexto.");
      return;
    }

    setBusyCompanyId(companyId);
    setConfirmLoading(true);

    try {
      const owner = await assertOwnerSession();
      if (!owner) return;

      const { error } = await supabase
        .from("companies")
        .update({ enable_shift_planning: nextEnabled })
        .eq("id", companyId);

      if (error) throw error;

      await load();
      success(nextEnabled ? "Planificador activado" : "Planificador desactivado");
    } catch (e: unknown) {
      toastError(userFacingError(e, "Error actualizando planificador"));
    } finally {
      setBusyCompanyId(null);
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  const assignAdmin = async (companyId: string) => {
    if (!companyBelongsToLoadedSet(companyId)) {
      toastError("Empresa no válida en este contexto.");
      return;
    }

    const userId = selectedAdminByCompany[companyId];

    if (!userId) {
      toastError("Selecciona un usuario");
      setConfirmAction(null);
      return;
    }

    const companyUsers = usersByCompany[companyId] || [];
    if (!companyUsers.some((u) => u.user_id === userId)) {
      toastError("El usuario seleccionado no pertenece a esta empresa.");
      setConfirmAction(null);
      return;
    }

    setBusyCompanyId(companyId);
    setConfirmLoading(true);

    try {
      const owner = await assertOwnerSession();
      if (!owner) return;

      // Solo role. Nunca is_owner / company_id / user_id.
      const { error: roleErr } = await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("user_id", userId)
        .eq("company_id", companyId);

      if (roleErr) throw roleErr;

      const { error: companyErr } = await supabase
        .from("companies")
        .update({ primary_admin_user_id: userId })
        .eq("id", companyId);

      if (companyErr) throw companyErr;

      await load();
      success("Administrador asignado");
    } catch (e: unknown) {
      toastError(userFacingError(e, "Error asignando administrador"));
    } finally {
      setBusyCompanyId(null);
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  const runConfirm = () => {
    if (!confirmAction) return;
    if (confirmAction.type === "rotate") void rotateJoinCode(confirmAction.companyId);
    if (confirmAction.type === "block")
      void toggleBlocked(confirmAction.companyId, confirmAction.nextBlocked);
    if (confirmAction.type === "planner")
      void toggleShiftPlanning(confirmAction.companyId, confirmAction.nextEnabled);
    if (confirmAction.type === "assignAdmin") void assignAdmin(confirmAction.companyId);
  };

  const confirmCopy = (() => {
    if (!confirmAction) return { title: "", description: "", danger: false, label: "Confirmar" };
    switch (confirmAction.type) {
      case "rotate":
        return {
          title: "¿Regenerar código de invitación?",
          description: "El enlace anterior dejará de funcionar.",
          danger: false,
          label: "Regenerar",
        };
      case "block":
        return confirmAction.nextBlocked
          ? {
              title: "¿Bloquear esta empresa?",
              description: "Sus trabajadores dejarán de poder acceder.",
              danger: true,
              label: "Bloquear",
            }
          : {
              title: "¿Desbloquear esta empresa?",
              description: "Los trabajadores podrán volver a acceder.",
              danger: false,
              label: "Desbloquear",
            };
      case "planner":
        return confirmAction.nextEnabled
          ? {
              title: "¿Activar planificador de turnos?",
              description: "La empresa podrá usar la planificación semanal.",
              danger: false,
              label: "Activar",
            }
          : {
              title: "¿Desactivar planificador de turnos?",
              description: "La empresa dejará de poder planificar turnos.",
              danger: false,
              label: "Desactivar",
            };
      case "assignAdmin":
        return {
          title: "¿Asignar administrador principal?",
          description: "Solo se cambiará role=admin (nunca is_owner).",
          danger: false,
          label: "Asignar",
        };
    }
  })();

  if (loading && companies.length === 0 && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Empresas"
        description="Gestiona las organizaciones de Fichagest"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Recargar
            </Button>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              Nueva empresa
            </Button>
          </>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      {companies.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total" value={String(summary.total)} />
          <StatCard title="Activas" value={String(summary.active)} tone="success" />
          <StatCard title="Bloqueadas" value={String(summary.blocked)} tone="danger" />
          <StatCard
            title="Sin admin"
            value={String(summary.withoutAdmin)}
            tone={summary.withoutAdmin > 0 ? "warning" : "default"}
          />
        </div>
      ) : null}

      <Card>
        <FormField label="Buscar" htmlFor="company-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              id="company-search"
              className="pl-10"
              placeholder="Nombre, CIF o código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </FormField>
      </Card>

      {filteredCompanies.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title={companies.length === 0 ? "No hay empresas" : "Sin coincidencias"}
          description={
            companies.length === 0
              ? "Crea la primera organización para empezar."
              : "Prueba con otro término de búsqueda."
          }
          actionLabel={companies.length === 0 ? "Nueva empresa" : undefined}
          onAction={companies.length === 0 ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filteredCompanies.map((c) => {
            const busy = busyCompanyId === c.id;
            const isBlocked = c.blocked === true;
            const plannerEnabled = c.enable_shift_planning === true;
            const companyUsers = usersByCompany[c.id] || [];
            const expanded = expandedCompanyId === c.id;

            return (
              <Card key={c.id} className="overflow-hidden" padding={false}>
                <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-[var(--text)] sm:text-lg">
                        {c.name}
                      </h2>
                      {isBlocked ? (
                        <Badge tone="danger">Bloqueada</Badge>
                      ) : (
                        <Badge tone="success">Activa</Badge>
                      )}
                      {plannerEnabled ? (
                        <Badge tone="info">Planificador activado</Badge>
                      ) : (
                        <Badge tone="neutral">Planificador desactivado</Badge>
                      )}
                      {c.primary_admin_user_id ? (
                        <Badge tone="accent">Administrador asignado</Badge>
                      ) : (
                        <Badge tone="warning">Sin administrador</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
                      <span>CIF: {c.cif || "—"}</span>
                      <span>Trabajadores: {workerCounts[c.id] || 0}</span>
                      <span>{formatPlanDisplay(c.plan, c.plan_status)}</span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setExpandedCompanyId((prev) => (prev === c.id ? null : c.id))
                    }
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
                    />
                    {expanded ? "Cerrar" : "Gestionar"}
                  </Button>
                </div>

                {expanded ? (
                  <div className="space-y-4 border-t border-[var(--border)] bg-[var(--surface-muted)]/40 p-4 sm:p-5">
                    <div className="text-sm text-[var(--text-secondary)]">
                      Código: <span className="font-medium text-[var(--text)]">{c.join_code}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const fullLink = `${window.location.origin}/join?code=${c.join_code}`;
                          void navigator.clipboard.writeText(fullLink);
                          success("Enlace copiado");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar link
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(c.join_code || "");
                          success("Código copiado");
                        }}
                      >
                        Copiar código
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => setConfirmAction({ type: "rotate", companyId: c.id })}
                      >
                        Nuevo código
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          setConfirmAction({
                            type: "planner",
                            companyId: c.id,
                            nextEnabled: !plannerEnabled,
                          })
                        }
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        {plannerEnabled ? "Desactivar planificador" : "Activar planificador"}
                      </Button>
                      <Button
                        variant={isBlocked ? "secondary" : "danger"}
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          setConfirmAction({
                            type: "block",
                            companyId: c.id,
                            nextBlocked: !isBlocked,
                          })
                        }
                      >
                        {isBlocked ? (
                          <>
                            <Unlock className="h-3.5 w-3.5" />
                            Desbloquear
                          </>
                        ) : (
                          <>
                            <Lock className="h-3.5 w-3.5" />
                            Bloquear
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="border-t border-[var(--border)] pt-4">
                      <h3 className="mb-3 text-sm font-medium text-[var(--text)]">
                        Asignar administrador principal
                      </h3>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                          <Select
                            value={selectedAdminByCompany[c.id] || ""}
                            onChange={(e) =>
                              setSelectedAdminByCompany((prev) => ({
                                ...prev,
                                [c.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Selecciona un usuario</option>
                            {companyUsers.map((u) => (
                              <option key={u.user_id} value={u.user_id}>
                                {(u.full_name || u.user_id.slice(0, 8)) +
                                  ` · ${u.role || "worker"}${u.active === false ? " · inactivo" : ""}`}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Button
                          variant="accent"
                          size="sm"
                          className="shrink-0 sm:h-[42px]"
                          disabled={busy || !companyUsers.length}
                          onClick={() =>
                            setConfirmAction({ type: "assignAdmin", companyId: c.id })
                          }
                        >
                          Asignar administrador
                        </Button>
                      </div>
                      {!companyUsers.length ? (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Aún no hay usuarios registrados en esta empresa.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} title="Crear empresa" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <FormField label="Nombre" htmlFor="new-company-name">
            <Input
              id="new-company-name"
              placeholder="Nombre de la empresa"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </FormField>
          <FormField label="CIF" htmlFor="new-company-cif" hint="Opcional">
            <Input
              id="new-company-cif"
              placeholder="CIF"
              value={companyCif}
              onChange={(e) => setCompanyCif(e.target.value)}
            />
          </FormField>
          <p className="text-xs text-[var(--text-muted)]">
            Se generará un código de acceso para enviar al cliente. Después podrás asignar un
            administrador cuando se registre.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={createCompany} loading={saving}>
              Crear empresa
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.label}
        danger={confirmCopy.danger}
        loading={confirmLoading}
        onConfirm={runConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
