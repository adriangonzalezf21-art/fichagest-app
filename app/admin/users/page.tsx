"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

export default function AdminUsersPage() {
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

      const owner = me.is_owner === true;
      const admin = owner || (me.role || "").toLowerCase() === "admin";

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
      setErrorMsg(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleActive = async (u: ProfileRow, nextActive: boolean) => {
    const isOwnerTarget = u.is_owner === true;
    const isAdminTarget = (u.role || "").toLowerCase() === "admin";

    if (isOwnerTarget) {
      alert("El dueño (OWNER) no se puede desactivar.");
      return;
    }

    if (!iAmOwner && iAmAdmin && isAdminTarget) {
      alert("Un ADMIN secundario no puede activar/desactivar a otros ADMIN.");
      return;
    }

    if (u.user_id === myUserId) {
      alert("No puedes desactivarte a ti mismo.");
      return;
    }

    if (!myCompanyId) {
      alert("No se pudo determinar tu empresa.");
      return;
    }

    const ok = confirm(
      nextActive ? "¿Activar este usuario?" : "¿Desactivar este usuario? (no podrá fichar)"
    );
    if (!ok) return;

    setBusy(u.user_id, true);

    const { error } = await supabase
      .from("profiles")
      .update({ active: nextActive })
      .eq("user_id", u.user_id)
      .eq("company_id", myCompanyId);

    setBusy(u.user_id, false);

    if (error) {
      alert(error.message);
      return;
    }

    await load();
  };

  const setRole = async (u: ProfileRow, nextRole: "admin" | "worker") => {
    const isOwnerTarget = u.is_owner === true;

    if (isOwnerTarget) {
      alert("El dueño (OWNER) no se puede modificar.");
      return;
    }

    if (!iAmOwner) {
      alert("Solo el OWNER puede asignar o quitar permisos de admin.");
      return;
    }

    if (u.user_id === myUserId) {
      alert("No puedes cambiarte el rol a ti mismo.");
      return;
    }

    if (!myCompanyId) {
      alert("No se pudo determinar tu empresa.");
      return;
    }

    const ok = confirm(
      nextRole === "admin"
        ? "¿Convertir a este usuario en ADMIN?"
        : "¿Quitar permisos de ADMIN a este usuario?"
    );
    if (!ok) return;

    setBusy(u.user_id, true);

    const { error } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("user_id", u.user_id)
      .eq("company_id", myCompanyId);

    setBusy(u.user_id, false);

    if (error) {
      alert(error.message);
      return;
    }

    await load();
  };

  const updateVacationDays = async (u: ProfileRow, value: string) => {
  if (!myCompanyId) {
    alert("No se pudo determinar tu empresa.");
    return;
  }

  const days = Number(value);

  if (!Number.isInteger(days) || days < 0 || days > 60) {
    alert("Introduce un número válido entre 0 y 60.");
    await load();
    return;
  }

  setBusy(u.user_id, true);

  const { error } = await supabase
    .from("profiles")
    .update({ vacation_days_per_year: days })
    .eq("user_id", u.user_id)
    .eq("company_id", myCompanyId);

  setBusy(u.user_id, false);

  if (error) {
    alert("Error al guardar días de vacaciones: " + error.message);
    await load();
    return;
  }

  alert("Días de vacaciones actualizados ✅");
  await load();
};

  const deleteUserProfile = async (u: ProfileRow) => {
    const isOwnerTarget = u.is_owner === true;
    const isAdminTarget = (u.role || "").toLowerCase() === "admin";

    if (isOwnerTarget) {
      alert("El OWNER no se puede eliminar.");
      return;
    }

    if (u.user_id === myUserId) {
      alert("No puedes eliminarte a ti mismo.");
      return;
    }

    if (!iAmOwner && iAmAdmin && isAdminTarget) {
      alert("Un ADMIN secundario no puede eliminar a otros ADMIN.");
      return;
    }

    if (!iAmOwner) {
      alert("Solo el OWNER puede eliminar usuarios.");
      return;
    }

    if (!myCompanyId) {
      alert("No se pudo determinar tu empresa.");
      return;
    }

    const ok = confirm(
      "¿Eliminar este usuario?\n\nEsto borrará su perfil (y dejará sus turnos históricos en la base)."
    );
    if (!ok) return;

    setBusy(u.user_id, true);

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("user_id", u.user_id)
      .eq("company_id", myCompanyId);

    setBusy(u.user_id, false);

    if (error) {
      alert(error.message);
      return;
    }

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

  return (
    <main className="min-h-screen bg-[#111827] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <div className="text-white/60 text-xs">Fichagest · by Iberogest</div>
              <h1 className="text-3xl font-bold text-white mt-1">Usuarios</h1>
              <p className="text-white/60 mt-1">
                Gestión de trabajadores
                {company?.name ? (
                  <>
                    {" "}
                    · <b className="text-white">{company.name}</b>
                  </>
                ) : null}
                {iAmOwner ? (
                  <span className="ml-2 text-xs px-2 py-1 border border-white/10 rounded-full text-white/80">
                    OWNER
                  </span>
                ) : (
                  <span className="ml-2 text-xs px-2 py-1 border border-white/10 rounded-full text-white/80">
                    ADMIN
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-3 flex-wrap justify-end">
              <button
                onClick={load}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
              >
                Recargar
              </button>

              <a
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                href="/admin/shifts"
              >
                Turnos
              </a>

              <a
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                href="/admin/vacations"
              >
                Vacaciones equipo
              </a>

              <a
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white hover:bg-white/[0.10] transition"
                href="/app"
              >
                Panel
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Stat label="Total" value={total} />
            <Stat label="Activos" value={activeCount} />
            <Stat label="Desactivados" value={inactiveCount} />
            <Stat label="Admins" value={adminCount} />
          </div>

          <div className="flex gap-3 mb-6 flex-wrap items-center">
            <input
              className="border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
              />
              Solo activos
            </label>
          </div>

          <div className="border border-white/10 rounded-2xl p-5 mb-6 bg-black/20">
            <div className="font-bold mb-2 text-white">Alta de trabajadores</div>

            {company?.join_code ? (
              <>
                <div className="text-sm mb-2 text-white/70">
                  Código: <b className="text-white">{company.join_code}</b>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      alert("Link copiado ✅");
                    }}
                  >
                    Copiar link de alta
                  </button>

                  <span className="text-xs text-white/40 break-all">{inviteLink}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-red-300">No se puede leer join_code.</p>
            )}
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl border border-red-500/30 text-red-100 bg-red-500/10">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <p className="text-white/70">Cargando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-white/50">No hay usuarios.</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((u) => {
                const isAdminTarget = (u.role || "").toLowerCase() === "admin";
                const active = u.active ?? true;
                const isOwnerTarget = u.is_owner === true;
                const isMe = u.user_id === myUserId;
                const busy = busyByUser[u.user_id] === true;

                return (
                  <div
                    key={u.user_id}
                    className="border border-white/10 rounded-2xl p-4 bg-black/20 flex justify-between items-center gap-4"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                        {u.full_name?.trim() || u.user_id.slice(0, 8)}

                        {isOwnerTarget ? (
                          <span className="text-xs px-2 py-1 border border-white/10 rounded-full text-white/80">
                            OWNER
                          </span>
                        ) : isAdminTarget ? (
                          <span className="text-xs px-2 py-1 border border-white/10 rounded-full text-white/80">
                            ADMIN
                          </span>
                        ) : null}

                        {isMe && (
                          <span className="text-xs px-2 py-1 border border-white/10 rounded-full text-white/60">
                            Tú
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-white/60 mt-1">
                        Estado: <b className="text-white">{active ? "Activo" : "Desactivado"}</b>
                      </div>

                      <div className="text-sm text-white/60 mt-3">
                        Días vacaciones/año
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <input
  type="number"
  min={0}
  max={60}
  className="w-24 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
  value={u.vacation_days_per_year ?? 30}
  disabled={busy}
  onChange={(e) => {
    const value = Number(e.target.value);

    setRows((prev) =>
      prev.map((row) =>
        row.user_id === u.user_id
          ? { ...row, vacation_days_per_year: value }
          : row
      )
    );
  }}
  onBlur={(e) => updateVacationDays(u, e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }}
/>

                        <span className="text-xs text-white/40">
                          Pulsa Enter o sal del campo para guardar
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap justify-end">
                      <a
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition"
                        href={`/admin/vacations?user=${encodeURIComponent(u.user_id)}`}
                        title="Ver vacaciones de este trabajador"
                      >
                        Ver vacaciones
                      </a>

                      {iAmOwner && !isOwnerTarget && !isMe && (
                        <>
                          {!isAdminTarget ? (
                            <button
                              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition"
                              onClick={() => setRole(u, "admin")}
                              disabled={busy}
                              title={busy ? "Procesando..." : ""}
                            >
                              Hacer admin
                            </button>
                          ) : (
                            <button
                              className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition"
                              onClick={() => setRole(u, "worker")}
                              disabled={busy}
                              title={busy ? "Procesando..." : ""}
                            >
                              Quitar admin
                            </button>
                          )}
                        </>
                      )}

                      {!isOwnerTarget &&
                        !isMe &&
                        ((iAmOwner && true) || (iAmAdmin && !iAmOwner && !isAdminTarget)) && (
                          <button
                            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition"
                            onClick={() => toggleActive(u, !active)}
                            disabled={busy}
                            title={busy ? "Procesando..." : ""}
                          >
                            {active ? "Desactivar" : "Activar"}
                          </button>
                        )}

                      {iAmOwner && !isOwnerTarget && !isMe && (
                        <button
                          className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white hover:bg-white/[0.06] transition"
                          onClick={() => deleteUserProfile(u)}
                          disabled={busy}
                          title={busy ? "Procesando..." : ""}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-white/10 rounded-2xl p-4 text-center bg-black/20">
      <div className="text-sm text-white/60">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}