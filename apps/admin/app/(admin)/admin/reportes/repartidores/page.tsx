"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bike, Wallet, Banknote, AlertTriangle, Download, Printer, Package } from "lucide-react";
import api from "@/lib/api";
import {
  PageShell,
  PageHeader,
  PageTabs,
  Card,
  Select,
  Input,
  Button,
  StatTile,
  Pill,
  DataTable,
  LoadingState,
  ErrorState,
  EmptyState,
  type Col,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

/* ── Tipos del reporte (espejo de GET /api/driver-cash/:id/report) ── */
type ReportOrder = {
  id: string; orderNumber: string; customer: string | null; phone: string | null;
  address: string | null; paymentMethod: string | null; paymentStatus: string | null;
  status: string; total: number; deliveryFee: number; tip: number;
  cashCollected: boolean; paidAt: string | null; createdAt: string;
  shipping: number; shippingZones: string[];
};
type Zone = { zone: string; count: number; amount: number };
type Report = {
  driver: { id: string; name: string };
  date: string | null;
  cashSummary: { float: number; income: number; expense: number; returned: number; movements: number; balance: number };
  lastCut: { balance: number; movements: number; createdAt: string } | null;
  orders: ReportOrder[];
  ordersSummary: {
    count: number; total: number; paid: number; pending: number;
    deliveryFees: number; tips: number;
    byMethod: Record<string, number>; byStatus: Record<string, number>;
  };
  shipping: { total: number; byZone: Zone[]; ordersWithoutShipping: string[] };
};
type Driver = { id: string; name: string; photo: string | null; ordersToday?: number };

/* ── Helpers ── */
const horaMx = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" });

// Hoy en hora de México como YYYY-MM-DD (en-CA da ese formato en TZ local/forzada).
const todayMx = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

const PAY_LABEL: Record<string, string> = { CASH: "Efectivo", TRANSFER: "Transferencia", CARD: "Tarjeta", TERMINAL: "Terminal", ONLINE: "En línea", OTHER: "Otro" };
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente", CONFIRMED: "Confirmado", PREPARING: "En cocina", READY: "Listo",
  ON_THE_WAY: "En camino", DELIVERED: "Entregado", CANCELLED: "Cancelado", OPEN: "Abierto",
};
const payLabel = (m: string | null) => (m ? PAY_LABEL[m] || m : "—");
const statusLabel = (s: string) => STATUS_LABEL[s] || s;

/* Solo reglas de impresión — colores con keywords CSS (no hex) a propósito. */
const PRINT_CSS = `
@media print {
  aside, nav, [data-sidebar], .ia-no-print, .rep-no-print { display: none !important; }
  body { background: white !important; }
  .rep-print { color: black !important; }
}
`;

export default function ReportesRepartidoresPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverId, setDriverId] = useState<string>("");
  const [date, setDate] = useState<string>(todayMx());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  // Cargar repartidores. El backend los ordena por actividad de hoy, así que
  // drivers[0] suele ser uno CON pedidos (no un repartidor inactivo como Kebra).
  useEffect(() => {
    api.get("/api/driver-cash/drivers")
      .then((r) => {
        setDrivers(r.data || []);
        if (r.data?.length) setDriverId((cur) => cur || r.data[0].id);
      })
      .catch(() => setError("No pude cargar la lista de repartidores."));
  }, []);

  // Carga del reporte. El reporte se calcula server-side desde las órdenes, así
  // que cada llamada refleja el estado actual (ventas/cobros en vivo).
  // silent=true para el refresco automático (no parpadea el loader).
  const loadReport = useCallback((silent = false) => {
    if (!driverId) return;
    if (!silent) setLoading(true);
    api.get(`/api/driver-cash/${driverId}/report`, { params: { date } })
      .then((r) => { setReport(r.data); setError(null); setUpdatedAt(Date.now()); })
      .catch((e) => { if (!silent) setError(e.response?.data?.error || "No pude cargar el reporte."); })
      .finally(() => { if (!silent) setLoading(false); });
  }, [driverId, date]);

  useEffect(() => { loadReport(false); }, [loadReport]);

  // Refresco EN VIVO: re-consulta cada 20 s (silencioso). Solo tiene sentido
  // para el día de hoy; un día histórico ya no cambia.
  useEffect(() => {
    if (!driverId || date !== todayMx()) return;
    const t = setInterval(() => loadReport(true), 20000);
    return () => clearInterval(t);
  }, [driverId, date, loadReport]);

  const driverName = useMemo(() => drivers.find((d) => d.id === driverId)?.name || "", [drivers, driverId]);

  function exportCsv() {
    if (!report) return;
    const head = ["Pedido", "Cliente", "Telefono", "Metodo", "Estado pago", "Estado", "Total", "Envio", "Zona envio", "Hora"];
    const rows = report.orders.map((o) => [
      o.orderNumber, o.customer || "", o.phone || "", payLabel(o.paymentMethod),
      o.paymentStatus || "", statusLabel(o.status), o.total.toFixed(2),
      o.shipping.toFixed(2), o.shippingZones.join(" / "), horaMx(o.createdAt),
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-${driverName.replace(/\s+/g, "_")}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const cs = report?.cashSummary;
  const os = report?.ordersSummary;

  const orderCols: Col<ReportOrder>[] = [
    { key: "orderNumber", header: "Pedido", mono: true, render: (o) => <span className="text-tx-hi">{o.orderNumber}</span> },
    { key: "customer", header: "Cliente", render: (o) => o.customer || "—" },
    { key: "phone", header: "Teléfono", mono: true, hideBelowMd: true, render: (o) => <span className="text-tx-mut">{o.phone || "—"}</span> },
    { key: "pay", header: "Pago", render: (o) => payLabel(o.paymentMethod) },
    {
      key: "status", header: "Estado",
      render: (o) => (
        <Pill tone={o.paymentStatus === "PAID" ? "ok" : "warn"}>{o.paymentStatus === "PAID" ? "Pagado" : statusLabel(o.status)}</Pill>
      ),
    },
    {
      key: "shipping", header: "Envío", hideBelowMd: true,
      render: (o) => (
        <span style={{ color: o.shipping ? "var(--tx-mid)" : "var(--err)" }}>
          {o.shipping ? `${formatMoney(o.shipping)}${o.shippingZones.length ? ` · ${o.shippingZones.join(", ")}` : ""}` : "sin envío"}
        </span>
      ),
    },
    { key: "total", header: "Total", align: "right", mono: true, render: (o) => <span className="font-semibold text-tx-hi">{formatMoney(o.total)}</span> },
    { key: "hora", header: "Hora", mono: true, hideBelowMd: true, render: (o) => <span className="text-tx-mut">{horaMx(o.createdAt)}</span> },
  ];

  const zoneCols: Col<Zone>[] = [
    { key: "zone", header: "Zona", render: (z) => z.zone },
    { key: "count", header: "Pedidos", mono: true, render: (z) => z.count },
    { key: "amount", header: "Monto", align: "right", mono: true, render: (z) => <span className="font-semibold text-tx-hi">{formatMoney(z.amount)}</span> },
  ];

  return (
    <PageShell>
      <style>{PRINT_CSS}</style>
      <PageHeader
        eyebrow="Reportes · Caja de repartidores"
        title="Reporte de repartidor"
        subtitle="Corte pendiente, pedidos del día y desglose de envíos — todo cuadrado server-side."
      />
      <div className="rep-no-print">
        <PageTabs set="reportes" />
      </div>

      {/* Barra de controles — siempre visible (PageHeader se oculta en móvil). */}
      <div className="rep-no-print mb-4 flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            {drivers.length === 0 && <option value="">Sin repartidores</option>}
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.ordersToday ? ` · ${d.ordersToday} hoy` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Input type="date" value={date} max={todayMx()} onChange={(e) => setDate(e.target.value)} />
        </div>
        {date === todayMx() && (
          <span title={updatedAt ? `Actualizado ${horaMx(new Date(updatedAt).toISOString())}` : "En vivo"}>
            <Pill tone="ok" live>En vivo</Pill>
          </span>
        )}
        <div className="flex-1" />
        <span title="Descargar CSV (Excel)">
          <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv} disabled={!report}>CSV</Button>
        </span>
        <span title="Imprimir / Guardar PDF">
          <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()} disabled={!report}>PDF</Button>
        </span>
      </div>

      {error && (
        report ? (
          <Card className="rep-no-print mb-4 p-4" style={{ borderColor: "var(--err)" }}>
            <span className="text-[13px]" style={{ color: "var(--err)" }}>{error}</span>
          </Card>
        ) : (
          <div className="rep-no-print">
            <ErrorState hint={error} onRetry={() => loadReport(false)} />
          </div>
        )
      )}

      {loading && !report && <LoadingState label="Cargando reporte…" />}

      {report && (
        <div className="rep-print flex flex-col" style={{ gap: 18, opacity: loading ? 0.6 : 1 }}>

          {/* Encabezado del reporte */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Pill tone="ac"><Bike size={12} /> {report.driver.name}</Pill>
            <span className="text-[13px] text-tx-mut">
              {date === todayMx() ? "Hoy" : new Date(date + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>

          {/* Aviso si ya tuvo corte ese día */}
          {report.lastCut && (
            <Card className="p-3.5" style={{ borderColor: "var(--warn)", background: "var(--warn-soft)" }}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
                <div className="text-[13px] text-tx-mid">
                  Este repartidor <b>ya tuvo un corte</b> ese día (balance {formatMoney(report.lastCut.balance)}, {report.lastCut.movements} movimientos).
                  El saldo pendiente de abajo es lo acumulado <b>después</b> del corte.
                </div>
              </div>
            </Card>
          )}

          {/* Resumen de caja (pendiente de corte) */}
          <div>
            <SectionTitle icon={<Wallet size={14} />} title="Caja · pendiente de corte" hint="Efectivo que debe entregar (movimientos sin aprobar)" />
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <StatTile icon={Banknote} value={formatMoney(cs!.balance)} label="Saldo a entregar" />
              <StatTile value={formatMoney(cs!.income)} label="Cobrado (efectivo)" />
              <StatTile value={formatMoney(cs!.float)} label="Fondo de cambio" />
              <StatTile value={formatMoney(cs!.expense)} label="Gastos" />
            </div>
          </div>

          {/* Resumen de pedidos */}
          <div>
            <SectionTitle icon={<Package size={14} />} title="Pedidos del día" hint={`${os!.count} pedidos asignados`} />
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              <StatTile value={formatMoney(os!.total)} label="Venta total" />
              <StatTile value={formatMoney(os!.paid)} label="Pagado" />
              <StatTile value={formatMoney(os!.pending)} label="Sin cobrar" />
              <StatTile value={formatMoney(report.shipping.total)} label="Envíos cobrados" />
            </div>
          </div>

          {/* Tabla de pedidos */}
          <div>
            <SectionTitle title="Detalle de pedidos" />
            <DataTable
              columns={orderCols}
              rows={report.orders}
              rowKey={(o) => o.id}
              empty={{ icon: Package, title: "Sin pedidos", hint: "Este repartidor no tiene pedidos en la fecha seleccionada." }}
            />
          </div>

          {/* Envíos por zona */}
          <div>
            <SectionTitle title="Envíos por zona" hint={`Total ${formatMoney(report.shipping.total)}`} />
            {report.shipping.byZone.length === 0 ? (
              <EmptyState icon={Bike} title="Sin envíos cobrados" hint="Ningún pedido trae línea de la categoría Envíos." />
            ) : (
              <DataTable columns={zoneCols} rows={report.shipping.byZone} rowKey={(z) => z.zone} />
            )}
            {report.shipping.ordersWithoutShipping.length > 0 && (
              <div className="mt-2.5 flex items-start gap-2 text-[12.5px]" style={{ color: "var(--warn)" }}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>Pedidos sin línea de envío: {report.shipping.ordersWithoutShipping.join(", ")}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}

/* ── Subcomponente de título de sección ── */
function SectionTitle({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className="inline-block h-3.5 w-[3px] rounded-sm" style={{ background: "var(--brand-primary)" }} />
      {icon && <span className="text-primary">{icon}</span>}
      <h3 className="font-display text-[15px] font-extrabold text-tx-hi">{title}</h3>
      {hint && <span className="ml-1 text-xs text-tx-mut">· {hint}</span>}
    </div>
  );
}
