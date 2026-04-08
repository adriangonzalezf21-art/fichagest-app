"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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
};

type CompanyUserRow = {
  user_id: string;
  company_id: string | null;
  full_name: string | null;
  role: string | null;
  active: boolean | null;
};

function randomJoinCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function OwnerCompaniesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyCompanyId, setBusyCompanyId] = useState<string | null>(null);

  const [me, setMe] = useState<MeRow | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [workerCounts, setWorkerCounts] = useState<Record<string, number>>({});
  const [usersByCompany, setUsersByCompany] = useState<Record<string, CompanyUserRow[]>>({});
  const [selectedAdminByCompany, setSelectedAdminByCompany] = useState<Record<string, string>>({});

  const [companyName, setCompanyName] = useState("");
  const [companyCif, setCompanyCif] = useState("");

  const load = async () => {
    setLoading(true);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      if (!sess.session) {
        router.push("/login");
        return;
      }

      const { data: meRow, error: meErr } = await supabase
        .from("profiles")
        .select("user_id, is_owner, full_name")
        .eq("user_id", sess.session.user.id)
        .maybeSingle();

      if (meErr) throw new Error(meErr.message);

      if (!meRow || meRow.is_owner !== true) {
        router.push("/app");
        return;
      }

      setMe(meRow as MeRow);

      const { data: compRows, error: compErr } = await supabase
        .from("companies")
        .select("id, name, cif, join_code, created_at, primary_admin_user_id, plan, plan_status, blocked")
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

        (profiles ?? []).forEach((p: any) => {
          const row = p as CompanyUserRow;
          if (!row.company_id) return;

          if ((row.role === "worker" || row.role === "admin") && row.active !== false) {
            counts[row.company_id] = (counts[row.company_id] || 0) + 1;
          }

          groupedUsers[row.company_id] = groupedUsers[row.company_id] || [];
          groupedUsers[row.company_id].push(row);
        });

        companyList.forEach((company) => {
          if (company.primary_admin_user_id) {
            selectedMap[company.id] = company.primary_admin_user_id;
          } else {
            selectedMap[company.id] = "";
          }
        });

        setWorkerCounts(counts);
        setUsersByCompany(groupedUsers);
        setSelectedAdminByCompany(selectedMap);
      } else {
        setWorkerCounts({});
        setUsersByCompany({});
        setSelectedAdminByCompany({});
      }
    } catch (e: any) {
      alert(e?.message ?? "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createCompany = async () => {
    if (!companyName.trim()) {
      alert("Introduce nombre");
      return;
    }

    setSaving(true);

    try {
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
        })
        .select("id, name, join_code")
        .single();

      if (error) {
        alert(error.message);
        return;
      }

      setCompanyName("");
      setCompanyCif("");

      await load();

      const link = `${window.location.origin}/join?code=${data.join_code}`;

      alert(`Empresa creada ✅

Código: ${data.join_code}

Link:
${link}

Después, cuando el usuario se registre, lo asignas como admin desde este panel.`);
    } catch (e: any) {
      alert(e?.message ?? "Error creando empresa");
    } finally {
      setSaving(false);
    }
  };

  const rotateJoinCode = async (companyId: string) => {
    setBusyCompanyId(companyId);

    try {
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
      alert("Código regenerado ✅");
    } catch (e: any) {
      alert(e?.message ?? "Error regenerando código");
    } finally {
      setBusyCompanyId(null);
    }
  };

  const toggleBlocked = async (companyId: string, nextBlocked: boolean) => {
    const ok = confirm(nextBlocked ? "¿Bloquear esta empresa?" : "¿Desbloquear esta empresa?");
    if (!ok) return;

    setBusyCompanyId(companyId);

    try {
      const { error } = await supabase
        .from("companies")
        .update({ blocked: nextBlocked })
        .eq("id", companyId);

      if (error) throw error;

      await load();
      alert(nextBlocked ? "Empresa bloqueada ✅" : "Empresa desbloqueada ✅");
    } catch (e: any) {
      alert(e?.message ?? "Error actualizando bloqueo");
    } finally {
      setBusyCompanyId(null);
    }
  };

  const assignAdmin = async (companyId: string) => {
    const userId = selectedAdminByCompany[companyId];

    if (!userId) {
      alert("Selecciona un usuario");
      return;
    }

    const ok = confirm("¿Asignar este usuario como administrador principal?");
    if (!ok) return;

    setBusyCompanyId(companyId);

    try {
      const { error: roleErr } = await supabase
        .from("profiles")
        .update({ role: "admin" })
        .eq("user_id", userId);

      if (roleErr) throw roleErr;

      const { error: companyErr } = await supabase
        .from("companies")
        .update({ primary_admin_user_id: userId })
        .eq("id", companyId);

      if (companyErr) throw companyErr;

      await load();
      alert("Administrador asignado ✅");
    } catch (e: any) {
      alert(e?.message ?? "Error asignando administrador");
    } finally {
      setBusyCompanyId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-white">Cargando...</div>;
  }

  return (
    <div className="p-6 text-white max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Empresas</h1>
          <p className="text-sm text-white/50">Owner: {me?.full_name}</p>
        </div>

        <button onClick={load} className="border px-3 py-2 rounded">
          Recargar
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.3)]">
        <h2 className="text-lg font-semibold mb-4">Crear empresa</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            placeholder="Nombre empresa"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          />

          <input
            placeholder="CIF"
            value={companyCif}
            onChange={(e) => setCompanyCif(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          />

          <button
            onClick={createCompany}
            disabled={saving}
            className="rounded-xl bg-white text-black font-medium px-4 py-3 hover:bg-white/90 transition disabled:opacity-50"
          >
            {saving ? "Creando..." : "Crear empresa"}
          </button>
        </div>

        <p className="text-xs text-white/40 mt-3">
          Se generará un código de acceso para enviar al cliente.
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="border p-4 rounded-xl text-white/60">No hay empresas.</div>
      ) : (
        companies.map((c) => {
          const busy = busyCompanyId === c.id;
          const isBlocked = c.blocked === true;
          const companyUsers = usersByCompany[c.id] || [];

          return (
            <div key={c.id} className="border p-4 rounded-xl">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-bold flex items-center gap-2 flex-wrap">
                    {c.name}
                    {isBlocked ? (
                      <span className="text-xs px-2 py-1 rounded border border-red-400/30 text-red-200 bg-red-500/10">
                        Bloqueada
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded border border-emerald-400/30 text-emerald-200 bg-emerald-500/10">
                        Activa
                      </span>
                    )}
                    {c.primary_admin_user_id ? (
                      <span className="text-xs px-2 py-1 rounded border border-white/10 text-white/80">
                        Admin asignado
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded border border-yellow-400/30 text-yellow-200 bg-yellow-500/10">
                        Sin admin
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-white/60">CIF: {c.cif || "—"}</div>

                  <div className="text-sm text-white/60">Código: {c.join_code}</div>

                  <div className="text-sm text-white/60">
                    👤 Trabajadores: {workerCounts[c.id] || 0}
                  </div>

                  <div className="text-sm text-white/60">
                    Plan: {c.plan || "free"} · Estado: {c.plan_status || "active"}
                  </div>
                </div>

                <div className="mt-2 flex gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      const fullLink = `${window.location.origin}/join?code=${c.join_code}`;
                      navigator.clipboard.writeText(fullLink);
                      alert("Link copiado ✅");
                    }}
                    className="border px-2 py-1 rounded"
                  >
                    Copiar link
                  </button>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(c.join_code || "");
                      alert("Código copiado ✅");
                    }}
                    className="border px-2 py-1 rounded"
                  >
                    Copiar código
                  </button>

                  <button
                    onClick={() => rotateJoinCode(c.id)}
                    className="border px-2 py-1 rounded"
                    disabled={busy}
                  >
                    Nuevo código
                  </button>

                  {isBlocked ? (
                    <button
                      onClick={() => toggleBlocked(c.id, false)}
                      className="border px-2 py-1 rounded"
                      disabled={busy}
                    >
                      Desbloquear
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleBlocked(c.id, true)}
                      className="border px-2 py-1 rounded"
                      disabled={busy}
                    >
                      Bloquear
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="text-sm font-medium mb-2">Asignar administrador principal</div>

                <div className="flex gap-2 flex-wrap items-center">
                  <select
                    value={selectedAdminByCompany[c.id] || ""}
                    onChange={(e) =>
                      setSelectedAdminByCompany((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    className="min-w-[280px] rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white"
                  >
                    <option value="">Selecciona un usuario</option>
                    {companyUsers.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {(u.full_name || u.user_id.slice(0, 8)) +
                          ` · ${u.role || "worker"}${u.active === false ? " · inactivo" : ""}`}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => assignAdmin(c.id)}
                    className="border px-3 py-2 rounded"
                    disabled={busy || !companyUsers.length}
                  >
                    Asignar admin
                  </button>
                </div>

                {!companyUsers.length && (
                  <p className="text-xs text-white/40 mt-2">
                    Aún no hay usuarios registrados en esta empresa.
                  </p>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}