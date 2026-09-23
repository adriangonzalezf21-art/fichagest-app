"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Copy,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  assertAllowedRoleAssignment,
  canAccessAdminZone,
  canManageAdminRoles,
  isPlatformOwner,
} from "@/lib/authz";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
  is_owner: boolean | null;
  company_id: string | null;
  vacation_days_per_year: number | null;
};

type CompanyRow = {
  id: string;
  name: string | null;
  join_code: string | null;
};

type ConfirmAction =
  | { type: "toggleActive"; user: ProfileRow; nextActive: boolean }
  | { type: "setRole"; user: ProfileRow; nextRole: "admin" | "worker" }
  | { type: "delete"; user: ProfileRow };

export default function AdminUsersPage() {
  const { success, error: toastError } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const [myUserId, setMyUserId] = useState<string>("");
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);

  const [iAmOwner, setIAmOwner] = useState<boolean>(false);
  const [iAmAdmin, setIAmAdmin] = useState<boolean>(false);

  const [busyByUser, setBusyByUser] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [vacationEdit, setVacationEdit] = useState<ProfileRow | null>(null);
  const [vacationDaysInput, setVacationDaysInput] = useState("30");
  const [vacationSaving, setVacationSaving] = useState(false);

  const inviteLink = useMemo(() => {
    if (!company?.join_code) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/join?code=${encodeURIComponent(company.join_code)}`;
  }, [company?.join_code]);

  const setBusy = (uid: string, v: boolean) =>
    setBusyByUser((prev) => ({ ...prev, [uid]: v }));

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      const session = sess.session;
      if (!session) throw new Error("No hay sesión.");

      setMyUserId(session.user.id);

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("role, is_owner, company_id")
        .eq("user_id", session.user.id)
        .maybeSingle<{ role: string | null; is_owner: boolean | null; company_id: string | null }>();

      if (meErr) throw new Error(meErr.message);
      if (!me?.company_id) throw new Error("Tu usuario no está asociado a una empresa.");

      setMyCompanyId(me.company_id);

      if (!canAccessAdminZone(me)) {
        throw new Error("No tienes permisos de administración.");
      }

      const owner = isPlatformOwner(me);
      const admin = canAccessAdminZone(me);

      setIAmOwner(owner);
      setIAmAdmin(admin);

      const { data: comp, error: cErr } = await supabase
        .from("companies")
        .select("id, name, join_code")
        .eq("id", me.company_id)
        .maybeSingle<CompanyRow>();

      if (cErr) throw new Error(cErr.message);
      setCompany(comp ?? null);

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, role, active, is_owner, company_id, vacation_days_per_year")
        .eq("company_id", me.company_id)
        .order("is_owner", { ascending: false })
        .order("role", { ascending: true })
        .order("full_name", { ascending: true });

      if (error) throw new Error(error.message);

      setRows((data ?? []) as ProfileRow[]);
    } catch (e: any) {
      const msg = userFacingError(e, e?.message ?? "Error inesperado");
      setErrorMsg(msg);
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestToggleActive = (u: ProfileRow, nextActive: boolean) => {
    if (!iAmAdmin) {
      toastError("No tienes permisos.");
      return;
    }

    const isOwnerTarget = u.is_owner === true;
    const isAdminTarget = (u.role || "").toLowerCase() === "admin";

    if (isOwnerTarget) {
      toastError("El dueño (OWNER) no se puede desactivar.");
      return;
    }

    if (!iAmOwner && iAmAdmin && isAdminTarget) {
      toastError("Un ADMIN secundario no puede activar/desactivar a otros ADMIN.");
      return;
    }

    if (u.user_id === myUserId) {
      toastError("No puedes desactivarte a ti mismo.");
      return;
    }

    if (!myCompanyId) {
      toastError("No se pudo determinar tu empresa.");
      return;
    }

    if (u.company_id && u.company_id !== myCompanyId) {
      toastError("No puedes modificar usuarios de otra empresa.");
      return;
    }

    setConfirmAction({ type: "toggleActive", user: u, nextActive });
  };

  const requestSetRole = (u: ProfileRow, nextRole: "admin" | "worker") => {
    if (!canManageAdminRoles({ is_owner: iAmOwner })) {
      toastError("Solo el OWNER de plataforma puede asignar o quitar permisos de admin.");
      return;
    }

    const isOwnerTarget = u.is_owner === true;

    if (isOwnerTarget) {
      toastError("El dueño (OWNER) no se puede modificar.");
      return;
    }

    if (u.user_id === myUserId) {
      toastError("No puedes cambiarte el rol a ti mismo.");
      return;
    }

    if (!myCompanyId) {
      toastError("No se pudo determinar tu empresa.");
      return;
    }

    if (u.company_id && u.company_id !== myCompanyId) {
      toastError("No puedes modificar usuarios de otra empresa.");
      return;
    }

    let safeRole: "admin" | "worker";
    try {
      safeRole = assertAllowedRoleAssignment(nextRole);
    } catch (e: unknown) {
      toastError(e instanceof Error ? e.message : "Rol no permitido.");
      return;
    }

    setConfirmAction({ type: "setRole", user: u, nextRole: safeRole });
  };

  const requestDelete = (u: ProfileRow) => {
    const isOwnerTarget = u.is_owner === true;
    const isAdminTarget = (u.role || "").toLowerCase() === "admin";

    if (isOwnerTarget) {
      toastError("El OWNER no se puede eliminar.");
      return;
    }

    if (u.user_id === myUserId) {
      toastError("No puedes eliminarte a ti mismo.");
      return;
    }

    if (!iAmOwner && iAmAdmin && isAdminTarget) {
      toastError("Un ADMIN secundario no puede eliminar a otros ADMIN.");
      return;
    }

    if (!iAmOwner) {
      toastError("Solo el OWNER puede eliminar usuarios.");
      return;
    }

    if (!myCompanyId) {
      toastError("No se pudo determinar tu empresa.");
      return;
    }

    if (u.company_id && u.company_id !== myCompanyId) {
      toastError("No puedes eliminar usuarios de otra empresa.");
      return;
    }

    setConfirmAction({ type: "delete", user: u });
  };

  const executeConfirm = async () => {
    if (!confirmAction || !myCompanyId) return;

    const u = confirmAction.user;
    setConfirmLoading(true);
    setBusy(u.user_id, true);

    try {
      if (confirmAction.type === "toggleActive") {
        // Solo `active`. Nunca escribir is_owner / company_id / user_id / role aquí.
        const { error } = await supabase
          .from("profiles")
          .update({ active: confirmAction.nextActive })
          .eq("user_id", u.user_id)
          .eq("company_id", myCompanyId);

        if (error) throw error;
        success(confirmAction.nextActive ? "Usuario activado." : "Usuario desactivado.");
      }

      if (confirmAction.type === "setRole") {
        // Solo `role` admin|worker. Nunca is_owner / company_id / user_id.
        const { error } = await supabase
          .from("profiles")
          .update({ role: confirmAction.nextRole })
          .eq("user_id", u.user_id)
          .eq("company_id", myCompanyId);

        if (error) throw error;
        success(
          confirmAction.nextRole === "admin"
            ? "Permisos de admin asignados."
            : "Permisos de admin retirados."
        );
      }

      if (confirmAction.type === "delete") {
        const { error } = await supabase
          .from("profiles")
          .delete()
          .eq("user_id", u.user_id)
          .eq("company_id", myCompanyId);

        if (error) throw error;
        success("Usuario eliminado.");
      }

      setConfirmAction(null);
      await load();
    } catch (e: unknown) {
      toastError(userFacingError(e));
    } finally {
      setBusy(u.user_id, false);
      setConfirmLoading(false);
    }
  };

  const openVacationEdit = (u: ProfileRow) => {
    if (!iAmAdmin) {
      toastError("No tienes permisos.");
      return;
    }

    if (!myCompanyId) {
      toastError("No se pudo determinar tu empresa.");
      return;
    }

    if (u.company_id && u.company_id !== myCompanyId) {
      toastError("No puedes modificar usuarios de otra empresa.");
      return;
    }

    setVacationEdit(u);
    setVacationDaysInput(String(u.vacation_days_per_year ?? 30));
  };

  const saveVacationDays = async () => {
    if (!vacationEdit || !myCompanyId) return;

    if (!iAmAdmin) {
      toastError("No tienes permisos.");
      return;
    }

    if (vacationEdit.company_id && vacationEdit.company_id !== myCompanyId) {
      toastError("No puedes modificar usuarios de otra empresa.");
      return;
    }

    const days = Number(vacationDaysInput);

    if (!Number.isInteger(days) || days < 0 || days > 60) {
      toastError("Introduce un número válido entre 0 y 60.");
      return;
    }

    setVacationSaving(true);
    setBusy(vacationEdit.user_id, true);

    // Solo vacation_days_per_year.
    const { error } = await supabase
      .from("profiles")
      .update({ vacation_days_per_year: days })
      .eq("user_id", vacationEdit.user_id)
      .eq("company_id", myCompanyId);

    setBusy(vacationEdit.user_id, false);
    setVacationSaving(false);

    if (error) {
      toastError(userFacingError(error, "Error al guardar días de vacaciones."));
      await load();
      return;
    }

    success("Días de vacaciones actualizados.");
    setVacationEdit(null);
    await load();
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((u) => {
      const name = (u.full_name || "").toLowerCase();
      const matchesSearch = !q || name.includes(q);

      const isActive = u.active ?? true;
      const matchesActive = onlyActive ? isActive : true;

      return matchesSearch && matchesActive;
    });
  }, [rows, search, onlyActive]);

  const total = rows.length;
  const activeCount = rows.filter((u) => (u.active ?? true)).length;
  const inactiveCount = total - activeCount;
  const adminCount = rows.filter((u) => (u.role || "").toLowerCase() === "admin").length;

  const confirmCopy = useMemo(() => {
    if (!confirmAction) return { title: "", description: "", confirmLabel: "Confirmar", danger: false };
    const name = confirmAction.user.full_name?.trim() || confirmAction.user.user_id.slice(0, 8);

    if (confirmAction.type === "toggleActive") {
      return {
        title: confirmAction.nextActive ? "Activar usuario" : "Desactivar usuario",
        description: confirmAction.nextActive
          ? `¿Activar a ${name}?`
          : `¿Desactivar a ${name}? No podrá fichar mientras esté desactivado.`,
        confirmLabel: confirmAction.nextActive ? "Activar" : "Desactivar",
        danger: !confirmAction.nextActive,
      };
    }

    if (confirmAction.type === "setRole") {
      return {
        title: confirmAction.nextRole === "admin" ? "Convertir en admin" : "Quitar admin",
        description:
          confirmAction.nextRole === "admin"
            ? `¿Convertir a ${name} en ADMIN?`
            : `¿Quitar permisos de ADMIN a ${name}?`,
        confirmLabel: confirmAction.nextRole === "admin" ? "Hacer admin" : "Quitar admin",
        danger: false,
      };
    }

    return {
      title: "Eliminar usuario",
      description: `¿Eliminar a ${name}? Se borrará su perfil (los turnos históricos permanecerán en la base).`,
      confirmLabel: "Eliminar",
      danger: true,
    };
  }, [confirmAction]);

  const roleBadge = (u: ProfileRow) => {
    if (u.is_owner === true) return <Badge tone="accent">OWNER</Badge>;
    if ((u.role || "").toLowerCase() === "admin") return <Badge tone="info">ADMIN</Badge>;
    return <Badge tone="neutral">Trabajador</Badge>;
  };

  if (loading && rows.length === 0 && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empleados"
        description="Gestiona las personas y permisos de tu empresa"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={load} disabled={loading} loading={loading}>
              <RefreshCw className="h-4 w-4" />
              Recargar
            </Button>
            {iAmOwner ? <Badge tone="accent">OWNER</Badge> : <Badge tone="info">ADMIN</Badge>}
          </>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total" value={String(total)} />
        <StatCard title="Activos" value={String(activeCount)} tone="success" />
        <StatCard title="Desactivados" value={String(inactiveCount)} tone={inactiveCount ? "warning" : "default"} />
        <StatCard title="Admins" value={String(adminCount)} tone="info" />
      </div>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <FormField label="Buscar" htmlFor="users-search">
              <div className="relative min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  id="users-search"
                  className="pl-9"
                  placeholder="Buscar por nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </FormField>
            <label className="mb-2.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                className="rounded border-[var(--border)]"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
              />
              Solo activos
            </label>
          </div>

          {company?.join_code ? (
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(inviteLink);
                success("Link de invitación copiado.");
              }}
            >
              <Copy className="h-4 w-4" />
              Copiar link de alta
            </Button>
          ) : null}
        </div>

        {company?.join_code ? (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Código: <span className="font-medium text-[var(--text-secondary)]">{company.join_code}</span>
            {" · "}
            <span className="break-all">{inviteLink}</span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-[var(--danger)]">No se puede leer join_code.</p>
        )}
      </Card>

      {loading ? (
        <PageSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No hay usuarios"
          description="Ajusta la búsqueda o invita a alguien con el link de alta."
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card padding={false} className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs text-[var(--text-muted)]">
                    <th className="px-5 py-3 font-medium">Persona</th>
                    <th className="px-5 py-3 font-medium">Rol</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                    <th className="px-5 py-3 font-medium">Vacaciones/año</th>
                    <th className="px-5 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const isAdminTarget = (u.role || "").toLowerCase() === "admin";
                    const active = u.active ?? true;
                    const isOwnerTarget = u.is_owner === true;
                    const isMe = u.user_id === myUserId;
                    const busy = busyByUser[u.user_id] === true;
                    const name = u.full_name?.trim() || u.user_id.slice(0, 8);

                    return (
                      <tr
                        key={u.user_id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]/60"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={name} size="sm" />
                            <div>
                              <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--text)]">
                                {name}
                                {isMe ? <Badge tone="neutral">Tú</Badge> : null}
                              </div>
                              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                                {u.user_id.slice(0, 8)}…
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">{roleBadge(u)}</td>
                        <td className="px-5 py-3">
                          {active ? (
                            <Badge tone="success">Activo</Badge>
                          ) : (
                            <Badge tone="danger">Desactivado</Badge>
                          )}
                        </td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">
                          {u.vacation_days_per_year ?? 30}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Link href={`/admin/vacations?user=${encodeURIComponent(u.user_id)}`}>
                              <Button variant="ghost" size="sm" title="Ver vacaciones">
                                <CalendarDays className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => openVacationEdit(u)}
                              title="Editar días de vacaciones"
                            >
                              Vacaciones
                            </Button>
                            {iAmOwner && !isOwnerTarget && !isMe ? (
                              !isAdminTarget ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => requestSetRole(u, "admin")}
                                >
                                  <Shield className="h-3.5 w-3.5" />
                                  Admin
                                </Button>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => requestSetRole(u, "worker")}
                                >
                                  Quitar admin
                                </Button>
                              )
                            ) : null}
                            {!isOwnerTarget &&
                            !isMe &&
                            ((iAmOwner && true) || (iAmAdmin && !iAmOwner && !isAdminTarget)) ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={busy}
                                onClick={() => requestToggleActive(u, !active)}
                              >
                                {active ? (
                                  <>
                                    <UserMinus className="h-3.5 w-3.5" />
                                    Desactivar
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-3.5 w-3.5" />
                                    Activar
                                  </>
                                )}
                              </Button>
                            ) : null}
                            {iAmOwner && !isOwnerTarget && !isMe ? (
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={busy}
                                onClick={() => requestDelete(u)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Eliminar
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((u) => {
              const isAdminTarget = (u.role || "").toLowerCase() === "admin";
              const active = u.active ?? true;
              const isOwnerTarget = u.is_owner === true;
              const isMe = u.user_id === myUserId;
              const busy = busyByUser[u.user_id] === true;
              const name = u.full_name?.trim() || u.user_id.slice(0, 8);

              return (
                <Card key={u.user_id}>
                  <div className="flex items-start gap-3">
                    <Avatar name={name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--text)]">{name}</span>
                        {roleBadge(u)}
                        {active ? (
                          <Badge tone="success">Activo</Badge>
                        ) : (
                          <Badge tone="danger">Desactivado</Badge>
                        )}
                        {isMe ? <Badge tone="neutral">Tú</Badge> : null}
                      </div>
                      <div className="mt-2 text-sm text-[var(--text-secondary)]">
                        Vacaciones/año:{" "}
                        <span className="font-medium text-[var(--text)]">
                          {u.vacation_days_per_year ?? 30}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link href={`/admin/vacations?user=${encodeURIComponent(u.user_id)}`}>
                          <Button variant="ghost" size="sm">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Vacaciones
                          </Button>
                        </Link>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => openVacationEdit(u)}
                        >
                          Editar días
                        </Button>
                        {iAmOwner && !isOwnerTarget && !isMe ? (
                          !isAdminTarget ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => requestSetRole(u, "admin")}
                            >
                              Hacer admin
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => requestSetRole(u, "worker")}
                            >
                              Quitar admin
                            </Button>
                          )
                        ) : null}
                        {!isOwnerTarget &&
                        !isMe &&
                        ((iAmOwner && true) || (iAmAdmin && !iAmOwner && !isAdminTarget)) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => requestToggleActive(u, !active)}
                          >
                            {active ? "Desactivar" : "Activar"}
                          </Button>
                        ) : null}
                        {iAmOwner && !isOwnerTarget && !isMe ? (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => requestDelete(u)}
                          >
                            Eliminar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        danger={confirmCopy.danger}
        loading={confirmLoading}
        onConfirm={executeConfirm}
        onCancel={() => {
          if (!confirmLoading) setConfirmAction(null);
        }}
      />

      <Modal
        open={!!vacationEdit}
        title="Días de vacaciones"
        onClose={() => {
          if (!vacationSaving) setVacationEdit(null);
        }}
      >
        {vacationEdit ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {vacationEdit.full_name?.trim() || vacationEdit.user_id.slice(0, 8)}
            </p>
            <FormField
              label="Días por año"
              htmlFor="vac-days"
              hint="Entre 0 y 60"
            >
              <Input
                id="vac-days"
                type="number"
                min={0}
                max={60}
                value={vacationDaysInput}
                onChange={(e) => setVacationDaysInput(e.target.value)}
                disabled={vacationSaving}
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setVacationEdit(null)}
                disabled={vacationSaving}
              >
                Cancelar
              </Button>
              <Button variant="accent" onClick={saveVacationDays} loading={vacationSaving}>
                Guardar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
