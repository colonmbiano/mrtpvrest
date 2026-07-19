"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingBag, ReceiptText, Boxes, ShoppingCart, Download, PackagePlus,
  UserPlus, AlertTriangle, ArrowRight, RefreshCw, type LucideIcon,
} from "lucide-react";
import api from "@/lib/admin-api";
import { ADMIN_KEYS } from "@/lib/admin-auth";
import { money, num } from "@/lib/admin-format";
import { StatCard, DataCard, ActionTile, SalesAreaChart } from "@/components/admin/atoms";
import AdminTopbar from "@/components/admin/AdminTopbar";
type StockRow = { id: string; qty: number; minQty: number; sku: { product: { name: string } } };
// `lines` viene en GET /sales (include: { lines: true }) con productName y skuCode
// ya desnormalizados — el top de productos sale de ahí, sin pedir el catálogo.
type SaleLine = { skuId: string; skuCode: string; productName: string; quantity: number | string; subtotal: number | string };
type Sale = { id: string; folio: string; total: number; status: string; createdAt: string; lines?: SaleLine[] };

export default function DashboardPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const locationId = typeof window !== "undefined" ? localStorage.getItem(ADMIN_KEYS.locationId) : "";
    const q = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
    try {
      // day=today: el backend corta el día en hora de México y trae TODAS las
      // ventas del día (no las primeras 40). Antes se pedía limit=40 y se sumaba
      // en el cliente filtrando por fecha UTC — dos bugs a la vez: el total del
      // día se truncaba a 40 ventas, y "hoy" saltaba a las 18:00 hora local.
      const salesQ = `${q ? `${q}&` : "?"}day=today`;
      const [stk, sal] = await Promise.all([
        api.get<StockRow[]>(`/api/retail/v1/stock${q}`),
        api.get<Sale[]>(`/api/retail/v1/sales${salesQ}`),
      ]);
      setStock(Array.isArray(stk.data) ? stk.data : []);
      setSales(Array.isArray(sal.data) ? sal.data : []);
    } catch {
      setStock([]); setSales([]);
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

  // `sales` YA viene acotado a hoy (hora de México) desde el backend: aquí solo
  // se separa por estado. No se re-filtra por fecha en el cliente — hacerlo con
  // new Date().toISOString() reintroduciría el corte en UTC que se acaba de quitar.
  const kpi = useMemo(() => {
    const todays = sales.filter((s) => s.status === "COMPLETED");
    const revenue = todays.reduce((n, s) => n + Number(s.total || 0), 0);
    const low = stock.filter((r) => Number(r.minQty) > 0 && Number(r.qty) <= Number(r.minQty));
    const out = stock.filter((r) => Number(r.qty) <= 0);
    return { revenue, tickets: todays.length, low, out, todays };
  }, [sales, stock]);

  // Solo entradas derivadas de datos reales. Aquí había dos fijas —"Nuevo cliente
  // registrado: Sofía Ramírez" y una "Descarga de caja realizada por {tu nombre}"—
  // mezcladas con la venta y la alerta de stock, que sí son reales. La segunda era
  // la peor: usaba el nombre del admin logueado para parecer auténtica.
  const activity = useMemo(() => {
    const list: Array<{ icon: LucideIcon; tone: string; text: string; time: string }> = [];
    const lastSale = kpi.todays[0] || sales[0];
    if (lastSale) list.push({ icon: ShoppingCart, tone: "green", text: `Nueva venta ${lastSale.folio} por ${money(lastSale.total)}`, time: "reciente" });
    if (kpi.low[0]) list.push({ icon: AlertTriangle, tone: "orange", text: `Stock bajo: ${kpi.low[0].sku.product.name}`, time: "" });
    return list;
  }, [kpi, sales]);

  // Ventas de hoy acumuladas por hora, de la primera venta a la última. Misma
  // forma que usa ventas/page.tsx con datos reales: `ayer: 0` porque no hay
  // comparativa contra ayer (antes la curva entera era una constante que subía
  // hasta $12,540 sin importar el tenant).
  const series = useMemo(() => {
    // La hora se lee en zona de México, no con getHours() (que usaría la TZ de
    // la PC): así la curva coincide con el corte de día que hizo el backend. Si
    // la caja estuviera en otra zona, getHours() metería ventas en la hora
    // equivocada o incluso fuera del rango [0..23] del eje.
    const mxHour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour: "2-digit", hour12: false });
    const hourOf = (iso: string) => { const h = parseInt(mxHour.format(new Date(iso)), 10); return h === 24 ? 0 : h; };
    const byHour = new Map<number, number>();
    for (const s of kpi.todays) {
      const h = hourOf(s.createdAt);
      byHour.set(h, (byHour.get(h) || 0) + Number(s.total || 0));
    }
    const hours = [...byHour.keys()].sort((a, b) => a - b);
    if (!hours.length) return [];
    const out: Array<{ h: string; hoy: number; ayer: number }> = [];
    let acc = 0;
    for (let h = hours[0]; h <= hours[hours.length - 1]; h++) {
      acc += byHour.get(h) || 0;
      out.push({ h: `${String(h).padStart(2, "0")}:00`, hoy: Math.round(acc), ayer: 0 });
    }
    return out;
  }, [kpi.todays]);

  // Top de HOY desde las líneas de venta (sales ya viene acotado al día). Antes
  // eran 5 prendas fijas — "Camiseta Oversize Negra", "Jean Slim Fit"— que se
  // pintaban igual en una ferretería. En un día sin ventas la tarjeta muestra su
  // estado vacío, coherente con que el resto del panel también es "de hoy".
  const top = useMemo(() => {
    const by = new Map<string, { name: string; sku: string; units: number; total: number }>();
    for (const s of kpi.todays) {
      for (const l of s.lines || []) {
        const k = l.skuId || l.skuCode;
        const cur = by.get(k) || { name: l.productName, sku: l.skuCode, units: 0, total: 0 };
        cur.units += Number(l.quantity || 0);
        cur.total += Number(l.subtotal || 0);
        by.set(k, cur);
      }
    }
    return [...by.values()].sort((a, b) => b.units - a.units).slice(0, 5);
  }, [kpi.todays]);

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Resumen" subtitle="Vista general del rendimiento de tu tienda." />

      {/* Sin `trend` ni `spark` inventados: el valor sale de la BD, pero el
          "18.6% vs. ayer" y la curvita eran constantes escritas a mano. Mezclar
          un dato real con una comparación falsa en la MISMA tarjeta es peor que
          una pantalla toda de maqueta: nadie puede distinguir cuál es cuál.
          Cuando haya comparativa contra ayer de verdad, vuelven.
          "Clientes nuevos" se quitó entero: el 34 también era inventado. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={ShoppingBag} tone="green" title="Ventas del día" value={loading ? "—" : money(kpi.revenue)} />
        <StatCard icon={ReceiptText} tone="green" title="Tickets" value={loading ? "—" : num(kpi.tickets)} />
        <StatCard icon={Boxes} tone="orange" title="Productos bajos" value={loading ? "—" : num(kpi.low.length)} trend={`${kpi.out.length} requieren atención`} trendTone="warn" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <DataCard title="Ventas" action={<span className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>Hoy ▾</span>}>
          {/* Sin "▲ 18.6% vs. ayer": era una constante. Y sin leyenda "Ayer": esa
              serie no existe. */}
          <div className="flex items-end gap-2">
            <div className="tnum text-[30px] font-extrabold leading-none text-[var(--tx-hi)]" style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>{loading ? "—" : money(kpi.revenue)}</div>
            <span className="mb-1 text-[12px] text-[var(--tx-dim)]">acumulado de hoy</span>
          </div>
          <div className="mt-3">
            {/* SalesAreaChart divide entre (data.length - 1): con un solo punto
                daría NaN. Mismo guard que ventas/page.tsx. */}
            {series.length >= 2
              ? <SalesAreaChart data={series} />
              : (
                <div className="grid h-[210px] place-items-center text-center text-[12px] text-[var(--tx-mut)]">
                  {loading ? "Cargando…" : kpi.tickets > 0
                    ? "Aún no hay suficientes ventas hoy para dibujar la curva."
                    : "Sin ventas hoy todavía."}
                </div>
              )}
          </div>
        </DataCard>

        <DataCard title="Productos más vendidos" action={<a href="/admin/catalogo" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--brand-dark)]">Ver todos <ArrowRight size={13} /></a>}>
          <ul className="space-y-1">
            {top.length === 0 && (
              <li className="py-8 text-center text-[13px] text-[var(--tx-mut)]">{loading ? "Cargando…" : "Sin ventas registradas todavía."}</li>
            )}
            {top.map((p, i) => (
              <li key={p.sku} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--surf-2)]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-[var(--tx-mut)]" style={{ background: "var(--surf-2)" }}>{i + 1}</span>
                {/* Boxes y no Shirt: el ícono de camisa venía de cuando esto solo
                    era MODA+ y quedaba absurdo en una ferretería. */}
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "var(--surf-2)", color: "var(--tx-dim)" }}><Boxes size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[var(--tx-hi)]">{p.name}</span>
                  <span className="block truncate font-mono text-[11px] text-[var(--tx-dim)]">SKU: {p.sku}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold text-[var(--tx-hi)]">{p.units} uds.</span>
                  <span className="tnum block text-[11px] text-[var(--tx-mut)]">{money(p.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <DataCard title="Actividad reciente" action={<a href="/admin/ventas" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--brand-dark)]">Ver todo <ArrowRight size={13} /></a>}>
          <ul className="space-y-1">
            {activity.map((a, i) => {
              const Icon = a.icon;
              const c = a.tone === "orange" ? { bg: "var(--warn-soft)", fg: "var(--warn)" } : a.tone === "blue" ? { bg: "var(--info-soft)", fg: "var(--info)" } : { bg: "var(--iris-soft)", fg: "var(--brand-dark)" };
              return (
                <li key={i} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: c.bg, color: c.fg }}><Icon size={15} /></span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--tx-hi)]">{a.text}</span>
                  {a.time && <span className="shrink-0 text-[11px] text-[var(--tx-dim)]">{a.time}</span>}
                </li>
              );
            })}
          </ul>
        </DataCard>

        <DataCard title="Acciones rápidas">
          <div className="grid grid-cols-2 gap-3">
            <ActionTile icon={ShoppingCart} title="Nueva venta" subtitle="Crear venta rápida" href="/admin/ventas" />
            <ActionTile icon={Download} title="Descargar caja" subtitle="Generar archivo" href="/admin/descargas" />
            <ActionTile icon={PackagePlus} title="Agregar producto" subtitle="Nuevo al catálogo" href="/admin/catalogo" />
            <ActionTile icon={UserPlus} title="Nuevo cliente" subtitle="Registrar cliente" href="/admin/clientes" />
          </div>
        </DataCard>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3.5 py-2 text-[12px] font-semibold text-[var(--tx-mut)] disabled:opacity-50" style={{ borderColor: "var(--bd-1)" }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>
    </div>
  );
}
