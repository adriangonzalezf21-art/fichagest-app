"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type ShiftRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
};

type EntryType = "IN" | "BREAK_START" | "BREAK_END" | "OUT";
type TimeEntryRow = {
  shift_id: string;
  entry_type: EntryType;
  ts: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  dni: string | null;
  company_id: string | null;
};

type CompanyRow = {
  id: string;
  name: string | null;
  cif: string | null;
  legal_representative: string | null;
};

function startOfDayISO(dateYYYYMMDD: string) {
  return new Date(`${dateYYYYMMDD}T00:00:00`).toISOString();
}

function endOfDayExclusiveISO(dateYYYYMMDD: string) {
  const d = new Date(`${dateYYYYMMDD}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function msToHHMM(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function secondsToHHMM(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function fmtYYYYMMDD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeShiftTotals(entriesAsc: TimeEntryRow[], now: Date) {
  let grossSeconds = 0;
  let breakSeconds = 0;

  let inAt: Date | null = null;
  let breakAt: Date | null = null;

  for (const e of entriesAsc) {
    const t = new Date(e.ts);

    if (e.entry_type === "IN") {
      inAt = t;
      breakAt = null;
    }

    if (e.entry_type === "BREAK_START" && inAt) {
      breakAt = t;
    }

    if (e.entry_type === "BREAK_END" && inAt && breakAt) {
      breakSeconds += (t.getTime() - breakAt.getTime()) / 1000;
      breakAt = null;
    }

    if (e.entry_type === "OUT" && inAt) {
      grossSeconds += (t.getTime() - inAt.getTime()) / 1000;

      if (breakAt) {
        breakSeconds += (t.getTime() - breakAt.getTime()) / 1000;
        breakAt = null;
      }

      inAt = null;
    }
  }

  if (inAt) {
    grossSeconds += (now.getTime() - inAt.getTime()) / 1000;
    if (breakAt) {
      breakSeconds += (now.getTime() - breakAt.getTime()) / 1000;
    }
  }

  const netSeconds = Math.max(0, grossSeconds - breakSeconds);

  return {
    grossSeconds: Math.floor(grossSeconds),
    breakSeconds: Math.floor(breakSeconds),
    netSeconds: Math.floor(netSeconds),
  };
}

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdminShiftsPage() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const [dniByUser, setDniByUser] = useState<Record<string, string>>({});

  const [workers, setWorkers] = useState<Array<{ user_id: string; full_name: string; dni: string }>>(
    []
  );
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [totalsByShift, setTotalsByShift] = useState<
    Record<string, { grossSeconds: number; breakSeconds: number; netSeconds: number }>
  >({});

  const [search, setSearch] = useState("");
  const [onlyInCourse, setOnlyInCourse] = useState(false);

  const [dateFrom, setDateFrom] = useState<string>(todayYYYYMMDD());
  const [dateTo, setDateTo] = useState<string>(todayYYYYMMDD());

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);
      if (!sess.session) throw new Error("No hay sesión. Vuelve a iniciar sesión.");

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", sess.session.user.id)
        .maybeSingle<{ company_id: string | null }>();

      if (meErr) throw new Error(meErr.message);

      const companyId = me?.company_id ?? null;
      setMyCompanyId(companyId);
      if (!companyId) throw new Error("Tu usuario no está asociado a una empresa.");

      const { data: comp, error: cErr } = await supabase
        .from("companies")
        .select("id, name, cif, legal_representative")
        .eq("id", companyId)
        .maybeSingle<CompanyRow>();

      if (cErr) throw new Error(cErr.message);
      setCompany(comp ?? null);

      const { data: wRows, error: wErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, dni, company_id")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true });

      if (wErr) throw new Error(wErr.message);

      const wArr =
        (wRows as ProfileRow[] | null)?.map((p) => ({
          user_id: p.user_id,
          full_name: (p.full_name?.trim() || p.user_id.slice(0, 8)) as string,
          dni: (p.dni || "").trim(),
        })) ?? [];
      setWorkers(wArr);

      const fromISO = startOfDayISO(dateFrom);
      const toISO = endOfDayExclusiveISO(dateTo);

      const { data: sRows, error: sErr } = await supabase
        .from("shifts")
        .select("id, user_id, started_at, ended_at")
        .gte("started_at", fromISO)
        .lt("started_at", toISO)
        .order("started_at", { ascending: false })
        .limit(3000);

      if (sErr) throw new Error(sErr.message);

      const list = (sRows ?? []) as ShiftRow[];
      setShifts(list);

      const userIds = Array.from(new Set(list.map((x) => x.user_id)));
      if (userIds.length) {
        const { data: pRows, error: pErr } = await supabase
          .from("profiles")
          .select("user_id, full_name, dni")
          .in("user_id", userIds);

        if (pErr) throw new Error(pErr.message);

        const nameMap: Record<string, string> = {};
        const dniMap: Record<string, string> = {};
        (pRows as Pick<ProfileRow, "user_id" | "full_name" | "dni">[] | null)?.forEach((p) => {
          nameMap[p.user_id] = p.full_name?.trim() || p.user_id.slice(0, 8);
          dniMap[p.user_id] = (p.dni || "").trim();
        });
        setNameByUser(nameMap);
        setDniByUser(dniMap);
      } else {
        setNameByUser({});
        setDniByUser({});
      }

      const shiftIds = list.map((x) => x.id);
      if (shiftIds.length === 0) {
        setTotalsByShift({});
        setLoading(false);
        return;
      }

      const { data: teRows, error: teErr } = await supabase
        .from("time_entries")
        .select("shift_id, entry_type, ts")
        .in("shift_id", shiftIds)
        .order("ts", { ascending: true });

      if (teErr) throw new Error(teErr.message);

      const byShift: Record<string, TimeEntryRow[]> = {};
      for (const r of (teRows ?? []) as any[]) {
        const row = r as TimeEntryRow;
        (byShift[row.shift_id] ||= []).push(row);
      }

      const now = new Date();
      const totalsMap: Record<string, { grossSeconds: number; breakSeconds: number; netSeconds: number }> =
        {};

      for (const sid of shiftIds) {
        totalsMap[sid] = computeShiftTotals(byShift[sid] || [], now);
      }

      setTotalsByShift(totalsMap);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return shifts.filter((s) => {
      if (onlyInCourse && s.ended_at) return false;
      if (selectedUserId && s.user_id !== selectedUserId) return false;

      if (!q) return true;

      const name = (nameByUser[s.user_id] || "").toLowerCase();
      const dni = (dniByUser[s.user_id] || "").toLowerCase();
      return name.includes(q) || dni.includes(q);
    });
  }, [shifts, nameByUser, dniByUser, search, onlyInCourse, selectedUserId]);

  const filteredClosed = useMemo(() => filtered.filter((s) => !!s.ended_at), [filtered]);

  const totalNetSeconds = useMemo(() => {
    return filtered.reduce((acc, s) => acc + (totalsByShift[s.id]?.netSeconds ?? 0), 0);
  }, [filtered, totalsByShift]);

  const inCourse = useMemo(() => filtered.filter((s) => !s.ended_at).length, [filtered]);

  const exportFilteredExcel = () => {
    const header = ["Trabajador", "DNI", "Inicio", "Fin", "Neto (HH:MM)", "Shift ID"];

    const body = filteredClosed.map((s) => {
      const who = nameByUser[s.user_id] || s.user_id.slice(0, 8);
      const dni = dniByUser[s.user_id] || "";
      const start = new Date(s.started_at).toLocaleString();
      const end = s.ended_at ? new Date(s.ended_at).toLocaleString() : "";
      const net = totalsByShift[s.id]?.netSeconds ?? 0;

      return [who, dni, start, end, secondsToHHMM(net), s.id];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Turnos");
    const label = selectedUserId ? (nameByUser[selectedUserId] || selectedUserId.slice(0, 8)) : "todos";
    XLSX.writeFile(wb, `turnos_${label}_${dateFrom}_a_${dateTo}.xlsx`);
  };

  const exportFilteredPDF = () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const COLOR_PRIMARY = "#134396";
    const COLOR_DARK = "#1E2A38";
    const COLOR_LIGHT_BORDER = "#DCE3F2";
    const COLOR_HEADER = "#080808";

    const companyName = company?.name || "—";
    const companyCif = company?.cif || "—";
    const representative = company?.legal_representative || "—";
    const issuedAt = new Date();

    const closed = filteredClosed;

    const fmtDate = (iso: string) => fmtYYYYMMDD(new Date(iso));
    const fmtTime = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };

    const addFooterAllPages = () => {
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(9);
        doc.setTextColor(COLOR_DARK);
        doc.text(`Empresa: ${companyName} · CIF: ${companyCif}`, 14, 290);
        doc.text(`Página ${p} / ${totalPages}`, 200, 290, { align: "right" });
      }
    };

    doc.setFillColor(COLOR_HEADER);
    doc.rect(0, 0, 210, 28, "F");

    doc.setTextColor("#FFFFFF");
    doc.setFontSize(16);
    doc.text("REGISTRO DE JORNADA", 14, 16);

    doc.setTextColor(COLOR_DARK);
    doc.setFontSize(10);

    doc.text(`Empresa: ${companyName}`, 14, 36);
    doc.text(`CIF: ${companyCif}`, 14, 41);
    doc.text(`Periodo: ${dateFrom} → ${dateTo}`, 14, 46);
    doc.text(
      `Trabajador: ${
        selectedUserId ? nameByUser[selectedUserId] || selectedUserId.slice(0, 8) : "Todos"
      }`,
      14,
      51
    );
    doc.text(`Fecha emisión: ${issuedAt.toLocaleString()}`, 14, 56);

    doc.setFontSize(9);
    doc.setTextColor(COLOR_DARK);
    doc.text(
      doc.splitTextToSize(
        "Este documento recoge el registro diario de jornada conforme al artículo 34.9 del Estatuto de los Trabajadores. " +
          "La empresa conserva este registro y lo pone a disposición de la Inspección de Trabajo y Seguridad Social cuando sea requerido.",
        182
      ),
      14,
      62
    );

    let cursorY = 78;

    const shiftsByUser: Record<string, ShiftRow[]> = {};
    for (const s of closed) {
      if (selectedUserId && s.user_id !== selectedUserId) continue;
      (shiftsByUser[s.user_id] ||= []).push(s);
    }

    const userIds = Object.keys(shiftsByUser).sort((a, b) =>
      (nameByUser[a] || "").toLowerCase().localeCompare((nameByUser[b] || "").toLowerCase())
    );

    if (!userIds.length) {
      doc.setFontSize(11);
      doc.text("No hay turnos cerrados en el periodo seleccionado.", 14, cursorY);
      addFooterAllPages();
      const label = selectedUserId
        ? nameByUser[selectedUserId] || selectedUserId.slice(0, 8)
        : "todos";
      doc.save(`registro_jornada_${label}_${dateFrom}_a_${dateTo}.pdf`);
      return;
    }

    for (const uid of userIds) {
      const who = nameByUser[uid] || uid.slice(0, 8);
      const dni = dniByUser[uid] || "—";

      if (cursorY > 250) {
        doc.addPage();
        cursorY = 20;
      }

      doc.setFontSize(12);
      doc.setTextColor(COLOR_HEADER);
      doc.text(`${who} (${dni})`, 14, cursorY);

      cursorY += 6;

      const rows = shiftsByUser[uid]
        .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
        .map((s) => {
          const net = totalsByShift[s.id]?.netSeconds ?? 0;
          return [fmtDate(s.started_at), fmtTime(s.started_at), s.ended_at ? fmtTime(s.ended_at) : "—", secondsToHHMM(net)];
        });

      autoTable(doc, {
        startY: cursorY,
        head: [["Fecha", "Inicio", "Fin", "Neto (HH:MM)"]],
        body: rows.length ? rows : [["—", "—", "—", "00:00"]],
        theme: "grid",
        styles: {
          fontSize: 10,
          cellPadding: 3,
          textColor: COLOR_DARK,
          lineColor: COLOR_LIGHT_BORDER,
        },
        headStyles: {
          fillColor: COLOR_PRIMARY,
          textColor: "#FFFFFF",
          fontStyle: "bold",
        },
        alternateRowStyles: {
          fillColor: "#F5F7FC",
        },
        margin: { left: 14, right: 14 },
      });

      // @ts-ignore
      cursorY = (doc as any).lastAutoTable.finalY + 12;

      doc.setDrawColor(COLOR_LIGHT_BORDER);
      doc.line(14, cursorY - 6, 196, cursorY - 6);
      doc.setDrawColor(0);
      doc.setTextColor(COLOR_DARK);
    }

    if (cursorY > 240) {
      doc.addPage();
      cursorY = 30;
    }

    doc.setTextColor(COLOR_DARK);
    doc.setFontSize(10);
    doc.text("Firma del representante de la empresa", 14, cursorY);

    doc.setDrawColor(COLOR_PRIMARY);
    doc.rect(14, cursorY + 4, 110, 30);

    doc.setFontSize(9);
    doc.text(`Representante: ${representative}`, 18, cursorY + 14);
    doc.text("Firma:", 18, cursorY + 26);

    doc.setFontSize(10);
    doc.text("Sello", 150, cursorY);
    doc.rect(140, cursorY + 4, 56, 30);
    doc.setFontSize(9);
    doc.text("Espacio para sello", 168, cursorY + 20, { align: "center" });

    addFooterAllPages();

    const label = selectedUserId
      ? nameByUser[selectedUserId] || selectedUserId.slice(0, 8)
      : "todos";

    doc.save(`registro_jornada_${label}_${dateFrom}_a_${dateTo}.pdf`);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Turnos empresa</h2>
          <p className="text-sm text-white/60">
            {company?.name ? (
              <>
                Empresa: <b className="text-white">{company.name}</b> · CIF:{" "}
                <b className="text-white">{company.cif || "—"}</b>
              </>
            ) : (
              <>
                Empresa: <b className="text-white">—</b>
              </>
            )}
            <br />
            Rango: <b className="text-white">{dateFrom}</b> → <b className="text-white">{dateTo}</b>
            {selectedUserId ? (
              <>
                {" "}
                · Trabajador:{" "}
                <b className="text-white">
                  {nameByUser[selectedUserId] || selectedUserId.slice(0, 8)}
                </b>
              </>
            ) : (
              <>
                {" "}
                · Trabajador: <b className="text-white">Todos</b>
              </>
            )}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          <button
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
            onClick={exportFilteredExcel}
            disabled={loading || filteredClosed.length === 0}
            title={filteredClosed.length === 0 ? "No hay turnos cerrados para exportar" : ""}
          >
            Export Excel
          </button>

          <button
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
            onClick={exportFilteredPDF}
            disabled={loading || filteredClosed.length === 0}
            title={filteredClosed.length === 0 ? "No hay turnos cerrados para exportar" : ""}
          >
            Export PDF (inspección)
          </button>

          <button
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white hover:bg-white/[0.10] transition"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Cargando..." : "Recargar"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-100">
          {errorMsg}
        </div>
      )}

      <div className="border border-white/10 rounded-2xl p-4 mb-6 bg-black/20">
        <div className="font-bold mb-3 text-white">Filtros</div>

        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <div className="text-xs text-white/60 mb-1">Desde</div>
            <input
              type="date"
              className="border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div>
            <div className="text-xs text-white/60 mb-1">Hasta</div>
            <input
              type="date"
              className="border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div>
            <div className="text-xs text-white/60 mb-1">Trabajador</div>
            <select
              className="border border-white/10 rounded-xl px-3 py-2 text-sm min-w-[240px] bg-white/[0.04] text-white"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Todos</option>
              {workers.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name} {w.dni ? `(${w.dni})` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            className="rounded-xl bg-white text-black px-3 py-2 text-sm font-medium"
            onClick={load}
            disabled={loading || !dateFrom || !dateTo}
          >
            Aplicar
          </button>

          <div className="text-sm text-white/60">
            Mostrando: <b className="text-white">{filtered.length}</b> · Cerrados:{" "}
            <b className="text-white">{filteredClosed.length}</b> · En curso:{" "}
            <b className="text-white">{inCourse}</b> · Neto total:{" "}
            <b className="text-white">{secondsToHHMM(totalNetSeconds)}</b>
            <span className="ml-2 text-xs text-white/40">
              (PDF inspección excluye en curso)
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <input
          className="border border-white/10 rounded-xl px-3 py-2 text-sm bg-white/[0.04] text-white"
          placeholder="Buscar por trabajador o DNI/NIE..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={onlyInCourse}
            onChange={(e) => setOnlyInCourse(e.target.checked)}
          />
          Solo en curso
        </label>
      </div>

      {loading ? (
        <p className="text-white/70">Cargando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-white/50">No hay turnos con estos filtros.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const start = new Date(s.started_at);
            const end = s.ended_at ? new Date(s.ended_at) : null;

            const durMs = (end ? end.getTime() : Date.now()) - start.getTime();
            const durGrossVisual = msToHHMM(durMs);

            const t = totalsByShift[s.id] || {
              grossSeconds: 0,
              breakSeconds: 0,
              netSeconds: 0,
            };

            const who = nameByUser[s.user_id] || s.user_id.slice(0, 8);
            const dni = dniByUser[s.user_id] || "—";

            return (
              <div
                key={s.id}
                className="border border-white/10 rounded-xl p-4 bg-black/20 flex justify-between items-center gap-4"
              >
                <div>
                  <div className="font-bold flex items-center gap-2 text-white">
                    {who}
                    <span className="text-xs text-white/50">({dni})</span>
                    {!s.ended_at && (
                      <span className="text-xs px-2 py-1 rounded-full border border-white/10 text-white/80">
                        EN CURSO
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-white/70 mt-1">
                    {start.toLocaleString()} → {end ? end.toLocaleString() : "—"}
                  </div>

                  <div className="text-sm text-white/60 mt-1">
                    Neto: <b className="text-white">{secondsToHHMM(t.netSeconds)}</b>
                    <span className="text-xs text-white/40 ml-2">
                      (visual bruto: {durGrossVisual})
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 items-center">
                  <a className="text-sm text-[#7AA2FF] hover:underline" href={`/shift/${s.id}`}>
                    Ver detalle →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}