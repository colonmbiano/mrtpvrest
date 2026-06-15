"use client";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bike, Wallet, Banknote, AlertTriangle, Download, Printer, RotateCw, Package,
} from "lucide-react";
import api from "@/lib/api";
import { WtScreen, PageHeader, WtCard, StatTile, Pill, EmptyState } from "@/components/warmtech";

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
const mny = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

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

const PRINT_CSS = `
@keyframes rep-spin { to { transform: rotate(360deg); } }
.ia-spin { animation: rep-spin .9s linear infinite; display: inline-block; }
@keyframes rep-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.ia-pulse { animation: rep-pulse 1.6s ease-in-out infinite; }
@media print {
  aside, nav, [data-sidebar], .ia-no-print, .rep-no-print { display: none !important; }
  body { background: #fff !important; }
  .rep-print { color: #000 !important; }
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

  return (
    <WtScreen>
      <style>{PRINT_CSS}</style>
      <PageHeader
        eyebrow="Reportes · Caja de repartidores"
        title="Reporte de repartidor"
        subtitle="Corte pendiente, pedidos del día y desglose de envíos — todo cuadrado server-side."
      />

      {/* Barra de controles — siempre visible (PageHeader se oculta en móvil). */}
      <div
        className="rep-no-print"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}
      >
        <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={selectStyle}>
          {drivers.length === 0 && <option value="">Sin repartidores</option>}
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}{d.ordersToday ? ` · ${d.ordersToday} hoy` : ""}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          max={todayMx()}
          onChange={(e) => setDate(e.target.value)}
          style={selectStyle}
        />
        {date === todayMx() && (
          <span
            title={updatedAt ? `Actualizado ${horaMx(new Date(updatedAt).toISOString())}` : "En vivo"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
              color: "var(--ok)", background: "var(--ok-soft)", border: "1px solid var(--ok)",
              borderRadius: 999, padding: "6px 11px",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }} className="ia-pulse" />
            En vivo
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={exportCsv} disabled={!report} style={btnStyle} title="Descargar CSV (Excel)">
          <Download size={14} /> CSV
        </button>
        <button onClick={() => window.print()} disabled={!report} style={btnStyle} title="Imprimir / Guardar PDF">
          <Printer size={14} /> PDF
        </button>
      </div>

      {error && (
        <WtCard className="rep-no-print" style={{ padding: 16, borderColor: "var(--err)", marginBottom: 16 }}>
          <span style={{ color: "var(--err)", fontSize: 13 }}>{error}</span>
        </WtCard>
      )}

      {loading && !report && (
        <WtCard style={{ padding: 40, textAlign: "center", color: "var(--tx-mut)" }}>
          <RotateCw size={18} className="ia-spin" /> Cargando reporte…
        </WtCard>
      )}

      {report && (
        <div className="rep-print" style={{ display: "flex", flexDirection: "column", gap: 18, opacity: loading ? 0.6 : 1 }}>

          {/* Encabezado del reporte */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Pill tone="ac"><Bike size={12} /> {report.driver.name}</Pill>
            <span style={{ fontSize: 13, color: "var(--tx-mut)" }}>
              {date === todayMx() ? "Hoy" : new Date(date + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>

          {/* Aviso si ya tuvo corte ese día */}
          {report.lastCut && (
            <WtCard style={{ padding: 14, borderColor: "var(--warn)", background: "var(--warn-soft)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertTriangle size={18} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 13, color: "var(--tx-mid)" }}>
                  Este repartidor <b>ya tuvo un corte</b> ese día (balance {mny(report.lastCut.balance)}, {report.lastCut.movements} movimientos).
                  El saldo pendiente de abajo es lo acumulado <b>después</b> del corte.
                </div>
              </div>
            </WtCard>
          )}

          {/* Resumen de caja (pendiente de corte) */}
          <div>
            <SectionTitle icon={<Wallet size={14} />} title="Caja · pendiente de corte" hint="Efectivo que debe entregar (movimientos sin aprobar)" />
            <div style={gridStats}>
              <StatTile icon={Banknote} value={mny(cs!.balance)} label="Saldo a entregar" />
              <StatTile value={mny(cs!.income)} label="Cobrado (efectivo)" />
              <StatTile value={mny(cs!.float)} label="Fondo de cambio" />
              <StatTile value={mny(cs!.expense)} label="Gastos" />
            </div>
          </div>

          {/* Resumen de pedidos */}
          <div>
            <SectionTitle icon={<Package size={14} />} title="Pedidos del día" hint={`${os!.count} pedidos asignados`} />
            <div style={gridStats}>
              <StatTile value={mny(os!.total)} label="Venta total" />
              <StatTile value={mny(os!.paid)} label="Pagado" />
              <StatTile value={mny(os!.pending)} label="Sin cobrar" />
              <StatTile value={mny(report.shipping.total)} label="Envíos cobrados" />
            </div>
          </div>

          {/* Tabla de pedidos */}
          <div>
            <SectionTitle title="Detalle de pedidos" />
            {report.orders.length === 0 ? (
              <EmptyState icon={Package} title="Sin pedidos" hint="Este repartidor no tiene pedidos en la fecha seleccionada." />
            ) : (
              <WtCard style={{ overflow: "hidden", overflowX: "auto", padding: 0 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      {["Pedido", "Cliente", "Teléfono", "Pago", "Estado", "Envío", "Total", "Hora"].map((h) => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.orders.map((o) => (
                      <tr key={o.id}>
                        <td style={tdStyle}><span style={{ fontFamily: "'DM Mono',monospace", color: "var(--tx-hi)" }}>{o.orderNumber}</span></td>
                        <td style={tdStyle}>{o.customer || "—"}</td>
                        <td style={{ ...tdStyle, fontFamily: "'DM Mono',monospace", color: "var(--tx-mut)" }}>{o.phone || "—"}</td>
                        <td style={tdStyle}>{payLabel(o.paymentMethod)}</td>
                        <td style={tdStyle}>
                          <Pill tone={o.paymentStatus === "PAID" ? "ok" : "warn"}>{o.paymentStatus === "PAID" ? "Pagado" : statusLabel(o.status)}</Pill>
                        </td>
                        <td style={{ ...tdStyle, color: o.shipping ? "var(--tx-mid)" : "var(--err)" }}>
                          {o.shipping ? `${mny(o.shipping)}${o.shippingZones.length ? ` · ${o.shippingZones.join(", ")}` : ""}` : "sin envío"}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: "'DM Mono',monospace", color: "var(--tx-hi)", fontWeight: 600 }}>{mny(o.total)}</td>
                        <td style={{ ...tdStyle, fontFamily: "'DM Mono',monospace", color: "var(--tx-mut)" }}>{horaMx(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </WtCard>
            )}
          </div>

          {/* Envíos por zona */}
          <div>
            <SectionTitle title="Envíos por zona" hint={`Total ${mny(report.shipping.total)}`} />
            {report.shipping.byZone.length === 0 ? (
              <EmptyState icon={Bike} title="Sin envíos cobrados" hint="Ningún pedido trae línea de la categoría Envíos." />
            ) : (
              <WtCard style={{ overflow: "hidden", padding: 0 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>{["Zona", "Pedidos", "Monto"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {report.shipping.byZone.map((z) => (
                      <tr key={z.zone}>
                        <td style={tdStyle}>{z.zone}</td>
                        <td style={{ ...tdStyle, fontFamily: "'DM Mono',monospace" }}>{z.count}</td>
                        <td style={{ ...tdStyle, fontFamily: "'DM Mono',monospace", color: "var(--tx-hi)", fontWeight: 600 }}>{mny(z.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </WtCard>
            )}
            {report.shipping.ordersWithoutShipping.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--warn)", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Pedidos sin línea de envío: {report.shipping.ordersWithoutShipping.join(", ")}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </WtScreen>
  );
}

/* ── Subcomponente de título de sección ── */
function SectionTitle({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ width: 3, height: 14, background: "var(--brand-primary)", borderRadius: 2, display: "inline-block" }} />
      {icon && <span style={{ color: "var(--brand-primary)" }}>{icon}</span>}
      <h3 style={{ fontFamily: "var(--font-display),'Syne',sans-serif", fontWeight: 800, fontSize: 15, color: "var(--tx-hi)" }}>{title}</h3>
      {hint && <span style={{ fontSize: 12, color: "var(--tx-mut)", marginLeft: 4 }}>· {hint}</span>}
    </div>
  );
}

/* ── Estilos inline reutilizados ── */
const selectStyle: CSSProperties = {
  background: "var(--surf-2)", border: "1px solid var(--bd-1)", borderRadius: 10,
  color: "var(--tx)", fontSize: 13, padding: "8px 10px", fontFamily: "inherit", minHeight: 38,
};
const btnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", borderRadius: 10,
  border: "1px solid var(--bd-1)", background: "var(--surf-1)", color: "var(--tx-mid)",
  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", minHeight: 38,
};
const gridStats: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10,
};
const tableStyle: CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640,
};
const thStyle: CSSProperties = {
  textAlign: "left", fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--tx-dim)",
  letterSpacing: ".12em", textTransform: "uppercase", padding: "11px 12px",
  borderBottom: "1px solid var(--bd-1)", fontWeight: 600, whiteSpace: "nowrap",
};
const tdStyle: CSSProperties = {
  padding: "11px 12px", borderBottom: "1px solid var(--bd-1)", color: "var(--tx-mid)", whiteSpace: "nowrap",
};
