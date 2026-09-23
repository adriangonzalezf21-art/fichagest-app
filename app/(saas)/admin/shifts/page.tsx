"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { canAccessAdminZone } from "@/lib/authz";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input, Select } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { userFacingError } from "@/lib/userFacingError";

type ShiftRow = {
  id: string;
  user_id: string;
  company_id?: string | null;
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
  const { success, error: toastError } = useToast();
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
        .select("company_id, role, is_owner")
        .eq("user_id", sess.session.user.id)
        .maybeSingle<{
          company_id: string | null;
          role: string | null;
          is_owner: boolean | null;
        }>();

      if (meErr) throw new Error(meErr.message);

      if (!canAccessAdminZone(me)) {
        throw new Error("No tienes permisos de administración para ver estos fichajes.");
      }

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

      const companyUserIds = new Set(wArr.map((w) => w.user_id));

      const fromISO = startOfDayISO(dateFrom);
      const toISO = endOfDayExclusiveISO(dateTo);

      // Defensa en profundidad: filtrar siempre por company_id del perfil autenticado.
      // No aceptar company_id de URL/UI. RLS puede fallar; no depender solo de ella.
      const { data: sRows, error: sErr } = await supabase
        .from("shifts")
        .select("id, user_id, company_id, started_at, ended_at")
        .eq("company_id", companyId)
        .gte("started_at", fromISO)
        .lt("started_at", toISO)
        .order("started_at", { ascending: false })
        .limit(3000);

      if (sErr) throw new Error(sErr.message);

      const list = ((sRows ?? []) as ShiftRow[]).filter(
        (s) => s.company_id === companyId && companyUserIds.has(s.user_id)
      );
      setShifts(list);

      const userIds = Array.from(new Set(list.map((x) => x.user_id)));
      if (userIds.length) {
        const { data: pRows, error: pErr } = await supabase
          .from("profiles")
          .select("user_id, full_name, dni, company_id")
          .eq("company_id", companyId)
          .in("user_id", userIds);

        if (pErr) throw new Error(pErr.message);

        const nameMap: Record<string, string> = {};
        const dniMap: Record<string, string> = {};
        (pRows as ProfileRow[] | null)?.forEach((p) => {
          if (p.company_id !== companyId) return;
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

  const exportFilteredExcel = async () => {
    if (!myCompanyId) {
      toastError("No se pudo determinar tu empresa. No se exportará nada.");
      return;
    }

    const scoped = filteredClosed.filter((s) => {
      if (s.company_id && s.company_id !== myCompanyId) return false;
      return workers.some((w) => w.user_id === s.user_id);
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Turnos");

    sheet.addRow(["Trabajador", "DNI", "Inicio", "Fin", "Neto (HH:MM)", "Shift ID"]);

    for (const s of scoped) {
      const who = nameByUser[s.user_id] || s.user_id.slice(0, 8);
      const dni = dniByUser[s.user_id] || "";
      const start = new Date(s.started_at).toLocaleString();
      const end = s.ended_at ? new Date(s.ended_at).toLocaleString() : "";
      const net = totalsByShift[s.id]?.netSeconds ?? 0;
      sheet.addRow([who, dni, start, end, secondsToHHMM(net), s.id]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const label = selectedUserId
      ? nameByUser[selectedUserId] || selectedUserId.slice(0, 8)
      : "todos";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `turnos_${label}_${dateFrom}_a_${dateTo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    success("Excel exportado correctamente.");
  };

  const exportFilteredPDF = () => {
    if (!myCompanyId) {
      toastError("No se pudo determinar tu empresa. No se exportará nada.");
      return;
    }

    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const COLOR_PRIMARY = "#134396";
    const COLOR_DARK = "#1E2A38";
    const COLOR_LIGHT_BORDER = "#DCE3F2";
    const COLOR_HEADER = "#080808";

    const companyName = company?.name || "—";
    const companyCif = company?.cif || "—";
    const representative = company?.legal_representative || "—";
    const issuedAt = new Date();

    const closed = filteredClosed.filter((s) => {
      if (s.company_id && s.company_id !== myCompanyId) return false;
      return workers.some((w) => w.user_id === s.user_id);
    });

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
    success("PDF exportado correctamente.");
  };

  if (loading && shifts.length === 0 && !errorMsg) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fichajes"
        description="Consulta y gestiona los registros horarios del equipo"
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportFilteredExcel}
              disabled={loading || filteredClosed.length === 0}
              title={filteredClosed.length === 0 ? "No hay turnos cerrados para exportar" : ""}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportFilteredPDF}
              disabled={loading || filteredClosed.length === 0}
              title={filteredClosed.length === 0 ? "No hay turnos cerrados para exportar" : ""}
            >
              <FileText className="h-4 w-4" />
              Exportar PDF
            </Button>
            <Button variant="primary" size="sm" onClick={load} disabled={loading} loading={loading}>
              <RefreshCw className="h-4 w-4" />
              {loading ? "Cargando…" : "Aplicar / Recargar"}
            </Button>
          </>
        }
      />

      {errorMsg ? <ErrorState message={errorMsg} onRetry={load} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total jornadas" value={String(filtered.length)} sub={company?.name || undefined} />
        <StatCard title="Horas netas" value={secondsToHHMM(totalNetSeconds)} sub={`${filteredClosed.length} cerradas`} />
        <StatCard
          title="En curso"
          value={String(inCourse)}
          sub="Turnos abiertos"
          tone={inCourse > 0 ? "warning" : "default"}
        />
      </div>

      <Card>
        <div className="mb-4 text-sm font-semibold text-[var(--text)]">Filtros</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Desde" htmlFor="shift-from">
            <Input
              id="shift-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </FormField>
          <FormField label="Hasta" htmlFor="shift-to">
            <Input
              id="shift-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </FormField>
          <FormField label="Trabajador" htmlFor="shift-worker">
            <Select
              id="shift-worker"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Todos</option>
              {workers.map((w) => (
                <option key={w.user_id} value={w.user_id}>
                  {w.full_name} {w.dni ? `(${w.dni})` : ""}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Buscar" htmlFor="shift-search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                id="shift-search"
                className="pl-9"
                placeholder="Nombre o DNI/NIE…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </FormField>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              className="rounded border-[var(--border)]"
              checked={onlyInCourse}
              onChange={(e) => setOnlyInCourse(e.target.checked)}
            />
            Solo en curso
          </label>
          <Button
            variant="accent"
            size="sm"
            onClick={load}
            disabled={loading || !dateFrom || !dateTo}
          >
            <Download className="h-4 w-4" />
            Aplicar
          </Button>
          <span className="text-xs text-[var(--text-muted)]">
            PDF de inspección excluye turnos en curso
          </span>
        </div>
      </Card>

      {loading ? (
        <PageSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-8 w-8" />}
          title="No hay turnos con estos filtros"
          description="Prueba otro rango de fechas o quita el filtro de trabajador."
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card padding={false} className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-xs text-[var(--text-muted)]">
                    <th className="px-5 py-3 font-medium">Trabajador</th>
                    <th className="px-5 py-3 font-medium">DNI</th>
                    <th className="px-5 py-3 font-medium">Inicio</th>
                    <th className="px-5 py-3 font-medium">Fin</th>
                    <th className="px-5 py-3 font-medium">Neto</th>
                    <th className="px-5 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const start = new Date(s.started_at);
                    const end = s.ended_at ? new Date(s.ended_at) : null;
                    const t = totalsByShift[s.id] || {
                      grossSeconds: 0,
                      breakSeconds: 0,
                      netSeconds: 0,
                    };
                    const who = nameByUser[s.user_id] || s.user_id.slice(0, 8);
                    const dni = dniByUser[s.user_id] || "—";
                    const open = !s.ended_at;

                    return (
                      <tr
                        key={s.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]/60"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={who} size="sm" />
                            <span className="font-medium text-[var(--text)]">{who}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{dni}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">
                          {start.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">
                          {end ? end.toLocaleString() : "—"}
                        </td>
                        <td className="px-5 py-3 font-medium text-[var(--text)]">
                          {secondsToHHMM(t.netSeconds)}
                        </td>
                        <td className="px-5 py-3">
                          {open ? (
                            <Badge tone="warning">EN CURSO</Badge>
                          ) : (
                            <Badge tone="success">Completa</Badge>
                          )}
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
              const open = !s.ended_at;

              return (
                <Card key={s.id}>
                  <div className="flex items-start gap-3">
                    <Avatar name={who} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--text)]">{who}</span>
                        {open ? (
                          <Badge tone="warning">EN CURSO</Badge>
                        ) : (
                          <Badge tone="success">Completa</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">DNI: {dni}</div>
                      <div className="mt-2 text-sm text-[var(--text-secondary)]">
                        {start.toLocaleString()} → {end ? end.toLocaleString() : "—"}
                      </div>
                      <div className="mt-2 text-sm text-[var(--text)]">
                        Neto: <span className="font-semibold">{secondsToHHMM(t.netSeconds)}</span>
                        <span className="ml-2 text-xs text-[var(--text-muted)]">
                          (bruto visual: {durGrossVisual})
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
