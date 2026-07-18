"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingBag, CalendarRange, Tag, Users, RefreshCw, RotateCcw, XCircle,
  AlertTriangle, X, type LucideIcon,
} from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { StatCard, DataCard, StatusBadge, TablePagination, SalesAreaChart, Donut, EmptyState } from "@/components/admin/atoms";
import { money } from "@/lib/admin-format";
import api from "@/lib/admin-api";
import { ADMIN_KEYS, getAdminUser } from "@/lib/admin-auth";

const ADMIN_ROLES = ["ADMIN", "MANAGER", "OWNER", "SUPER_ADMIN"];
const PAGE_SIZE = 10;

// ── Tipos del backend (parciales) ────────────────────────────────────────────
type SalePayment = { method: string; amount: number | string };
type SaleLine = { quantity: number | string };
type RetailSale = {
  id: string;
  folio: string;
  status: string; // COMPLETED | CANCELLED | RETURNED
  total: number | string;
  customerName?: string | null;
  createdAt: string;
  payments?: SalePayment[];
  lines?: SaleLine[];
};

// ── Etiquetas ─────────────────────────────────────────────────────────────────
const METHOD_LABEL: Record<string, string> = {
  CASH: "Efectivo", CARD_PRESENT: "Tarjeta", TRANSFER: "Transferencia", COURTESY: "Cortesía",
};
const METHOD_COLOR: Record<string, string> = {
  CASH: "#f59e0b", CARD_PRESENT: "#22c55e", TRANSFER: "#8b5cf6", COURTESY: "#94a3b8",
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completado", CANCELLED: "Cancelado", RETURNED: "Devuelto",
};
const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "#22c55e", CANCELLED: "#ef4444", RETURNED: "#8b5cf6",
};

const num = (v: number | string | null | undefined) => Number(v || 0);
// Día natural (YYYY-MM-DD) en hora de México, NO el slice(0,10) del ISO (que es
// UTC). Una venta de las 19:00 en México cae a las 01:00 UTC del día siguiente:
// con el slice UTC se agrupaba en "mañana" y "ventas de hoy" perdía la tarde.
// formatToParts (no toLocaleDateString ni en-CA) para no depender del orden que
// el locale imponga a los componentes. Mismo enfoque que dayRange.js del backend.
const MX_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
});
const dayKey = (iso: string) => {
  if (!iso) return "";
  try {
    const p: Record<string, string> = {};
    for (const { type, value } of MX_DATE.formatToParts(new Date(iso))) p[type] = value;
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return (iso || "").slice(0, 10); }
};
const fmtDate = (iso: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
};
const fmtDayLabel = (key: string) => {
  try {
    return new Date(`${key}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  } catch { return key; }
};
const methodOf = (s: RetailSale): string => {
  const pos = (s.payments || []).filter((p) => num(p.amount) > 0);
  if (pos.length === 0) return "—";
  const methods = [...new Set(pos.map((p) => p.method))];
  return methods.length === 1 ? METHOD_LABEL[methods[0]] || methods[0] : "Mixto";
};

function Filter({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3.5 text-[13px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>
      <Icon size={15} /> {label}
    </span>
  );
}

function DonutLegend({ rows }: { rows: Array<{ label: string; pct: number; amount: number; color: string }> }) {
  if (rows.length === 0) return <p className="flex-1 text-[13px] text-[var(--tx-mut)]">Sin datos en el periodo.</p>;
  return (
    <ul className="flex-1 space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-3 text-[12px]">
          <span className="flex min-w-0 items-center gap-2 text-[var(--tx-mut)]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} /><span className="truncate">{r.label}</span></span>
          <span className="shrink-0 text-right"><span className="font-bold text-[var(--tx-hi)]">{r.pct.toFixed(1)}%</span> <span className="tnum block text-[11px] text-[var(--tx-dim)]">{money(r.amount)}</span></span>
        </li>
      ))}
    </ul>
  );
}

// ── Modal de cancelar / devolver ──────────────────────────────────────────────
function ReverseModal({ sale, action, onClose, onDone }: {
  sale: RetailSale; action: "cancel" | "return"; onClose: () => void; onDone: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isCancel = action === "cancel";

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post(`/api/retail/v1/sales/${sale.id}/${action}`, { notes: notes.trim() || undefined });
      onDone();
    } catch (e) {
      const msg = (e as { message?: string })?.message || "No se pudo completar la operación.";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-[20px] border bg-[var(--surf-1)] p-5" style={{ borderColor: "var(--bd-1)", boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: isCancel ? "var(--err-soft)" : "var(--purple-soft)", color: isCancel ? "var(--err)" : "var(--purple)" }}>
            {isCancel ? <XCircle size={20} /> : <RotateCcw size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold text-[var(--tx-hi)]">{isCancel ? "Cancelar venta" : "Devolver venta"}</h3>
            <p className="mt-0.5 text-[13px] text-[var(--tx-mut)]">
              Folio <span className="font-mono font-semibold text-[var(--tx-hi)]">{sale.folio}</span> · {money(num(sale.total))}
            </p>
          </div>
          <button type="button" onClick={busy ? undefined : onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--tx-dim)] hover:bg-[var(--surf-2)]" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12px]" style={{ borderColor: "var(--warn-soft)", background: "var(--warn-soft)", color: "var(--warn)" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{isCancel
            ? "Se repone el stock de las prendas y se registra el reembolso de cada pago. Esta acción no se puede deshacer."
            : "Se reingresa el stock de las prendas y se asienta la devolución del dinero. Esta acción no se puede deshacer."}</span>
        </div>

        <label className="mt-4 block text-[12px] font-semibold text-[var(--tx-mut)]">Motivo (opcional)</label>
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={busy}
          placeholder={isCancel ? "Ej. error de captura, cliente canceló…" : "Ej. talla equivocada, prenda con defecto…"}
          className="mt-1.5 w-full resize-none rounded-xl border bg-[var(--surf-1)] px-3 py-2 text-[13px] text-[var(--tx-hi)] outline-none focus:border-[var(--brand-primary)]"
          style={{ borderColor: "var(--bd-1)" }}
        />

        {err && <p className="mt-3 rounded-xl px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--err-soft)", color: "var(--err)" }}>{err}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={busy ? undefined : onClose} className="h-11 flex-1 rounded-xl border text-[14px] font-semibold text-[var(--tx-mut)] disabled:opacity-50" style={{ borderColor: "var(--bd-1)" }} disabled={busy}>Volver</button>
          <button type="button" onClick={submit} disabled={busy} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-bold text-white disabled:opacity-60" style={{ background: isCancel ? "var(--err)" : "var(--purple)" }}>
            {busy ? <RefreshCw size={16} className="animate-spin" /> : (isCancel ? <XCircle size={16} /> : <RotateCcw size={16} />)}
            {busy ? "Procesando…" : (isCancel ? "Cancelar venta" : "Devolver venta")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VentasPage() {
  const [sales, setSales] = useState<RetailSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ sale: RetailSale; action: "cancel" | "return" } | null>(null);

  const canReverse = useMemo(() => {
    const role = (getAdminUser()?.role || "").toUpperCase();
    return !role || ADMIN_ROLES.includes(role);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const locationId = typeof window !== "undefined" ? localStorage.getItem(ADMIN_KEYS.locationId) : "";
    const q = locationId ? `?locationId=${encodeURIComponent(locationId)}&limit=200` : "?limit=200";
    try {
      const res = await api.get<RetailSale[]>(`/api/retail/v1/sales${q}`);
      setSales(Array.isArray(res.data) ? res.data : []);
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("locationChanged", refresh);
    return () => window.removeEventListener("locationChanged", refresh);
  }, [load]);

  // ── Derivados (todo de ventas reales) ──────────────────────────────────────
  const d = useMemo(() => {
    const completed = sales.filter((s) => s.status === "COMPLETED");
    // "hoy" en hora de México, con el mismo dayKey que agrupa las ventas — antes
    // era toISOString().slice(0,10), es decir el día UTC, que no coincide con el
    // día local y desfasaba "ventas de hoy" contra la serie diaria.
    const today = dayKey(new Date().toISOString());

    const ventasHoy = completed.filter((s) => dayKey(s.createdAt) === today).reduce((n, s) => n + num(s.total), 0);
    const ventasPeriodo = completed.reduce((n, s) => n + num(s.total), 0);
    const pedidos = completed.length;
    const ticketProm = pedidos ? ventasPeriodo / pedidos : 0;

    // Serie diaria (suma de COMPLETED por día), últimos 12 días con ventas.
    const byDay = new Map<string, number>();
    for (const s of completed) {
      const k = dayKey(s.createdAt);
      byDay.set(k, (byDay.get(k) || 0) + num(s.total));
    }
    const series = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-12)
      .map(([k, v]) => ({ h: fmtDayLabel(k), hoy: Math.round(v), ayer: 0 }));
    const spark = series.map((p) => p.hoy);

    // Donut por método de pago (real).
    const byMethod = new Map<string, number>();
    for (const s of completed) for (const p of s.payments || []) {
      const amt = num(p.amount);
      if (amt > 0) byMethod.set(p.method, (byMethod.get(p.method) || 0) + amt);
    }
    const methodTotal = [...byMethod.values()].reduce((a, b) => a + b, 0);
    const methods = [...byMethod.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([m, amount]) => ({ label: METHOD_LABEL[m] || m, pct: methodTotal ? (amount / methodTotal) * 100 : 0, amount, color: METHOD_COLOR[m] || "#94a3b8" }));

    // Donut por estado (real): monto por estado.
    const byStatus = new Map<string, number>();
    for (const s of sales) byStatus.set(s.status, (byStatus.get(s.status) || 0) + num(s.total));
    const statusTotal = [...byStatus.values()].reduce((a, b) => a + b, 0);
    const statuses = ["COMPLETED", "CANCELLED", "RETURNED"]
      .filter((st) => byStatus.has(st))
      .map((st) => { const amount = byStatus.get(st) || 0; return { label: STATUS_LABEL[st] || st, pct: statusTotal ? (amount / statusTotal) * 100 : 0, amount, color: STATUS_COLOR[st] || "#94a3b8" }; });

    return { completed, ventasHoy, ventasPeriodo, pedidos, ticketProm, series, spark, methods, methodTotal, statuses, statusTotal };
  }, [sales]);

  const totalPages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = sales.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Ventas" subtitle="Monitorea tus ventas y el rendimiento de tu negocio." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShoppingBag} tone="green" title="Ventas de hoy" value={loading ? "—" : money(d.ventasHoy)} spark={d.spark} />
        <StatCard icon={CalendarRange} tone="green" title="Ventas del periodo" value={loading ? "—" : money(d.ventasPeriodo)} spark={d.spark} />
        <StatCard icon={Tag} tone="orange" title="Ticket promedio" value={loading ? "—" : money(d.ticketProm)} />
        <StatCard icon={Users} tone="green" title="Pedidos completados" value={loading ? "—" : String(d.pedidos)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Filter icon={CalendarRange} label="Últimas 200 ventas" />
        <Filter icon={Tag} label="Sucursal activa" />
        <button type="button" onClick={load} disabled={loading} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3.5 text-[13px] font-semibold text-[var(--tx-mut)] disabled:opacity-50" style={{ borderColor: "var(--bd-1)" }}>
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Evolución de ventas" className="lg:col-span-1">
          <div className="flex items-end gap-2">
            <div className="tnum text-[24px] font-extrabold leading-none text-[var(--tx-hi)]" style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>{loading ? "—" : money(d.ventasPeriodo)}</div>
            <span className="mb-1 text-[12px] text-[var(--tx-dim)]">en el periodo</span>
          </div>
          <div className="mt-3">
            {d.series.length >= 2
              ? <SalesAreaChart data={d.series} height={170} />
              : <p className="grid h-[170px] place-items-center text-[13px] text-[var(--tx-mut)]">Aún no hay suficientes ventas para graficar.</p>}
          </div>
        </DataCard>

        <DataCard title="Ventas por método de pago">
          <div className="flex items-center gap-4">
            <Donut segments={d.methods.map((p) => ({ label: p.label, value: p.amount, color: p.color }))} center={<span><span className="block text-[10px] text-[var(--tx-mut)]">Total</span><span className="tnum block text-[14px] font-extrabold text-[var(--tx-hi)]">{money(d.methodTotal)}</span></span>} />
            <DonutLegend rows={d.methods} />
          </div>
        </DataCard>

        <DataCard title="Ventas por estado">
          <div className="flex items-center gap-4">
            <Donut segments={d.statuses.map((p) => ({ label: p.label, value: p.amount, color: p.color }))} center={<span><span className="block text-[10px] text-[var(--tx-mut)]">Órdenes</span><span className="tnum block text-[14px] font-extrabold text-[var(--tx-hi)]">{sales.length}</span></span>} />
            <DonutLegend rows={d.statuses} />
          </div>
        </DataCard>
      </div>

      <DataCard title="Órdenes de venta" className="mt-4">
        {!loading && sales.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Sin ventas registradas" hint="Las ventas cobradas en la caja MODA+ aparecerán aquí." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-dim)]" style={{ borderColor: "var(--bd-1)" }}>
                    <th className="py-2.5 pr-3">Folio</th><th className="py-2.5 pr-3">Cliente</th><th className="py-2.5 pr-3">Fecha</th><th className="py-2.5 pr-3">Total</th><th className="py-2.5 pr-3">Método</th><th className="py-2.5 pr-3">Estado</th>
                    {canReverse && <th className="py-2.5 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((o) => (
                    <tr key={o.id} className="border-b text-[13px]" style={{ borderColor: "var(--bd-1)" }}>
                      <td className="py-3 pr-3 font-mono font-semibold text-[var(--brand-dark)]">{o.folio}</td>
                      <td className="py-3 pr-3 text-[var(--tx-hi)]">{o.customerName || "Público general"}</td>
                      <td className="py-3 pr-3 text-[var(--tx-mut)]">{fmtDate(o.createdAt)}</td>
                      <td className="tnum py-3 pr-3 font-bold text-[var(--tx-hi)]">{money(num(o.total))}</td>
                      <td className="py-3 pr-3 text-[var(--tx-mut)]">{methodOf(o)}</td>
                      <td className="py-3 pr-3"><StatusBadge status={STATUS_LABEL[o.status] || o.status} /></td>
                      {canReverse && (
                        <td className="py-3 text-right">
                          {o.status === "COMPLETED" ? (
                            <div className="inline-flex gap-1.5">
                              <button type="button" onClick={() => setModal({ sale: o, action: "return" })} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold text-[var(--purple)] hover:bg-[var(--purple-soft)]" style={{ borderColor: "var(--bd-1)" }}><RotateCcw size={13} /> Devolver</button>
                              <button type="button" onClick={() => setModal({ sale: o, action: "cancel" })} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold text-[var(--err)] hover:bg-[var(--err-soft)]" style={{ borderColor: "var(--bd-1)" }}><XCircle size={13} /> Cancelar</button>
                            </div>
                          ) : (
                            <span className="text-[12px] text-[var(--tx-dim)]">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              info={`Mostrando ${sales.length ? (pageSafe - 1) * PAGE_SIZE + 1 : 0} a ${Math.min(pageSafe * PAGE_SIZE, sales.length)} de ${sales.length} órdenes`}
              page={pageSafe} totalPages={totalPages} onPage={setPage}
            />
          </>
        )}
      </DataCard>

      {modal && (
        <ReverseModal
          sale={modal.sale}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
