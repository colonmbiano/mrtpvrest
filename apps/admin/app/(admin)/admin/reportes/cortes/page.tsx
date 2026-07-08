"use client";
import { useEffect, useMemo, useState } from "react";
import { Wallet, Bike, Download, TrendingUp, TrendingDown, ScrollText } from "lucide-react";
import api from "@/lib/api";
import {
  PageShell,
  PageHeader,
  PageTabs,
  Toolbar,
  Segmented,
  Input,
  Button,
  StatTile,
  Pill,
  DataTable,
  Drawer,
  LoadingState,
  ErrorState,
  type Col,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { ShiftDetail, DriverDetail, type CashShift, type DriverCut } from "./_components/CorteDetail";

/* ── Tipos ── */
type Row =
  | { kind: "shift"; id: string; date: string; who: string; balance: number; data: CashShift }
  | { kind: "driver"; id: string; date: string; who: string; balance: number; data: DriverCut };

type Filter = "ALL" | "shift" | "driver";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "shift", label: "Caja" },
  { value: "driver", label: "Repartidores" },
];

/* ── Helpers ── */
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const todayMx = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

export default function CortesUnificadosPage() {
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [cuts, setCuts] = useState<DriverCut[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [date, setDate] = useState<string>(""); // "" = todas las fechas
  const [selected, setSelected] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    const safe = <T,>(p: Promise<{ data: T }>, fb: T): Promise<T> => p.then((r) => r.data).catch(() => fb);
    Promise.all([
      safe<CashShift[]>(api.get("/api/shifts"), []),
      safe<DriverCut[]>(api.get("/api/driver-cash/cuts"), []),
    ]).then(([s, c]) => {
      if (cancel) return;
      setShifts(Array.isArray(s) ? s : []);
      setCuts(Array.isArray(c) ? c : []);
    }).catch(() => !cancel && setError("No pude cargar los cortes."))
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, [reloadKey]);

  // Unifica y ordena por fecha desc.
  const rows = useMemo<Row[]>(() => {
    const sRows: Row[] = shifts.map((s) => ({
      kind: "shift", id: "s_" + s.id, date: s.closedAt || s.openedAt, who: s.employeeName || "Cajero",
      balance: s.closingFloat ?? s.expectedCash ?? 0, data: s,
    }));
    const dRows: Row[] = cuts.map((c) => ({
      kind: "driver", id: "d_" + c.id, date: c.createdAt, who: c.driverName, balance: c.balance, data: c,
    }));
    let all = [...sRows, ...dRows];
    if (filter !== "ALL") all = all.filter((r) => r.kind === filter);
    if (date) all = all.filter((r) => dayKey(r.date) === date);
    return all.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [shifts, cuts, filter, date]);

  // KPIs del conjunto filtrado.
  const kpi = useMemo(() => {
    const shiftRows = rows.filter((r) => r.kind === "shift") as Extract<Row, { kind: "shift" }>[];
    const driverRows = rows.filter((r) => r.kind === "driver") as Extract<Row, { kind: "driver" }>[];
    let faltante = 0, sobrante = 0;
    for (const r of shiftRows) {
      const s = r.data;
      if (!s.isOpen && s.closingFloat != null && s.expectedCash != null) {
        const diff = s.closingFloat - s.expectedCash;
        if (diff < 0) faltante += diff; else sobrante += diff;
      }
    }
    return {
      count: rows.length,
      ventasCaja: shiftRows.reduce((a, r) => a + (r.data.totalSales || 0), 0),
      // Venta real cobrada por repartidores (entregas) vs el fondo que traen en
      // mano (dinero a comprobar, NO venta). Se separan a propósito: mezclarlos
      // en un solo "entregado" inflaba el efectivo del día con el fondo.
      cobradoRep: driverRows.reduce((a, r) => a + (r.data.totalIncome || 0), 0),
      fondoRep: driverRows.reduce((a, r) => a + (r.data.totalFloat || 0), 0),
      faltante, sobrante,
    };
  }, [rows]);

  function exportCsv() {
    const head = ["Tipo", "Quien", "Fecha", "Balance/Entregado", "Ventas", "Gastos", "Esperado", "Contado", "Diferencia"];
    const lines = rows.map((r) => {
      if (r.kind === "shift") {
        const s = r.data;
        const diff = (!s.isOpen && s.closingFloat != null && s.expectedCash != null) ? (s.closingFloat - s.expectedCash) : "";
        return ["Caja", r.who, fmtDateTime(r.date), "", s.totalSales, s.totalExpenses, s.expectedCash ?? "", s.closingFloat ?? "", diff];
      }
      const c = r.data;
      return ["Repartidor", r.who, fmtDateTime(r.date), c.balance, c.totalIncome, c.totalExpense, "", "", ""];
    });
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cortes-${date || "todos"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Col<Row>[] = [
    {
      key: "tipo",
      header: "Tipo",
      width: "130px",
      render: (r) => (
        <Pill tone={r.kind === "shift" ? "info" : "ac"}>
          {r.kind === "shift" ? <Wallet size={12} /> : <Bike size={12} />} {r.kind === "shift" ? "Caja" : "Repartidor"}
        </Pill>
      ),
    },
    {
      key: "who",
      header: "Responsable",
      render: (r) => (
        <span className="inline-flex items-center gap-2 font-semibold text-tx-hi">
          {r.who}
          {r.kind === "shift" && r.data.isOpen && <Pill tone="warn">Abierto</Pill>}
        </span>
      ),
    },
    {
      key: "date",
      header: "Fecha",
      mono: true,
      render: (r) => <span className="text-tx-mut">{fmtDateTime(r.date)}</span>,
    },
    {
      key: "balance",
      header: "Efectivo",
      align: "right",
      render: (r) => (
        <div>
          <div className="font-mono text-sm font-bold text-tx-hi">{formatMoney(r.balance)}</div>
          <div className="font-mono text-[9.5px] uppercase tracking-[.06em] text-tx-mut">
            {r.kind === "shift" ? "En caja" : "A entregar"}
          </div>
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Reportes · Cortes"
        title="Cortes de caja"
        subtitle="Cortes de turno (cajero) y de repartidores, en un solo lugar."
      />
      <PageTabs set="reportes" />

      {/* Controles */}
      <Toolbar
        filters={
          <>
            <Segmented options={FILTERS} value={filter} onChange={setFilter} />
            <div className="w-40">
              <Input type="date" value={date} max={todayMx()} onChange={(e) => setDate(e.target.value)} title="Filtrar por día" />
            </div>
            {date && (
              <Button variant="ghost" size="sm" onClick={() => setDate("")}>Ver todas</Button>
            )}
          </>
        }
        actions={
          <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv} disabled={!rows.length}>
            CSV
          </Button>
        }
      />

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={ScrollText} value={String(kpi.count)} label="Cortes" />
        <StatTile icon={Wallet} value={formatMoney(kpi.ventasCaja)} label="Ventas en caja" />
        <StatTile icon={Bike} value={formatMoney(kpi.cobradoRep)} label="Cobrado repartidores" />
        <StatTile icon={Wallet} value={formatMoney(kpi.fondoRep)} label="Fondo a comprobar" />
        <StatTile icon={kpi.faltante < 0 ? TrendingDown : TrendingUp} value={formatMoney(kpi.faltante)} label="Faltantes en caja" />
        <StatTile value={formatMoney(kpi.sobrante)} label="Sobrantes en caja" />
      </div>

      {loading ? (
        <LoadingState label="Cargando cortes…" />
      ) : error ? (
        <ErrorState hint={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSelected(r)}
          empty={{ icon: ScrollText, title: "Sin cortes", hint: "No hay cortes para este filtro/fecha." }}
        />
      )}

      {/* Detalle del corte (cajero o repartidor) */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.who}
        subtitle={selected ? `${selected.kind === "shift" ? "Corte de caja" : "Corte de repartidor"} · ${fmtDateTime(selected.date)}` : undefined}
        width={520}
      >
        {selected?.kind === "shift" && <ShiftDetail s={selected.data} />}
        {selected?.kind === "driver" && <DriverDetail c={selected.data} />}
      </Drawer>
    </PageShell>
  );
}
