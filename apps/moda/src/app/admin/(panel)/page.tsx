"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingBag, ReceiptText, Boxes, UsersRound, ShoppingCart, Download, PackagePlus,
  UserPlus, AlertTriangle, Shirt, ArrowRight, RefreshCw, type LucideIcon,
} from "lucide-react";
import api from "@/lib/admin-api";
import { ADMIN_KEYS, getAdminUser } from "@/lib/admin-auth";
import { money, num } from "@/lib/admin-format";
import { StatCard, DataCard, ActionTile, SalesAreaChart } from "@/components/admin/atoms";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { salesToday as salesSeries, topProducts, sparkUp, sparkUp2, sparkWarn } from "@/lib/admin-mock";

type Sku = { stockBalances?: { qty: number }[] };
type Product = { skus: Sku[] };
type StockRow = { id: string; qty: number; minQty: number; sku: { product: { name: string } } };
type Sale = { id: string; folio: string; total: number; status: string; createdAt: string };

export default function DashboardPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const locationId = typeof window !== "undefined" ? localStorage.getItem(ADMIN_KEYS.locationId) : "";
    const q = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
    try {
      const [stk, sal] = await Promise.all([
        api.get<StockRow[]>(`/api/retail/v1/stock${q}`),
        api.get<Sale[]>(`/api/retail/v1/sales${q ? `${q}&limit=40` : "?limit=40"}`),
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

  const kpi = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todays = sales.filter((s) => s.status === "COMPLETED" && s.createdAt?.slice(0, 10) === today);
    const revenue = todays.reduce((n, s) => n + Number(s.total || 0), 0);
    const low = stock.filter((r) => Number(r.minQty) > 0 && Number(r.qty) <= Number(r.minQty));
    const out = stock.filter((r) => Number(r.qty) <= 0);
    return { revenue, tickets: todays.length, low, out, todays };
  }, [sales, stock]);

  const activity = useMemo(() => {
    const user = getAdminUser();
    const list: Array<{ icon: LucideIcon; tone: string; text: string; time: string }> = [];
    const lastSale = kpi.todays[0] || sales[0];
    if (lastSale) list.push({ icon: ShoppingCart, tone: "green", text: `Nueva venta ${lastSale.folio} por ${money(lastSale.total)}`, time: "reciente" });
    if (kpi.low[0]) list.push({ icon: AlertTriangle, tone: "orange", text: `Stock bajo: ${kpi.low[0].sku.product.name}`, time: "" });
    list.push({ icon: UserPlus, tone: "blue", text: "Nuevo cliente registrado: Sofía Ramírez", time: "Hace 32 min" });
    list.push({ icon: Download, tone: "green", text: `Descarga de caja realizada por ${user?.name || "Renata"}`, time: "Hace 1 h" });
    return list;
  }, [kpi, sales]);

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Resumen" subtitle="Vista general del rendimiento de tu tienda." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShoppingBag} tone="green" title="Ventas del día" value={loading ? "—" : money(kpi.revenue)} trend="18.6%" trendLabel="vs. ayer" spark={sparkUp} />
        <StatCard icon={ReceiptText} tone="green" title="Tickets" value={loading ? "—" : num(kpi.tickets)} trend="12.4%" trendLabel="vs. ayer" spark={sparkUp2} />
        <StatCard icon={Boxes} tone="orange" title="Productos bajos" value={loading ? "—" : num(kpi.low.length)} trend={`${kpi.out.length} requieren atención`} trendTone="warn" spark={sparkWarn} />
        <StatCard icon={UsersRound} tone="green" title="Clientes nuevos" value="34" trend="21.2%" trendLabel="vs. ayer" spark={sparkUp} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <DataCard title="Ventas" action={<span className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>Hoy ▾</span>}>
          <div className="flex items-end gap-2">
            <div className="tnum text-[30px] font-extrabold leading-none text-[var(--tx-hi)]" style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>{loading ? "—" : money(kpi.revenue)}</div>
            <span className="tnum mb-1 text-[12px] font-semibold text-[var(--ok)]">▲ 18.6%</span>
            <span className="mb-1 text-[12px] text-[var(--tx-dim)]">vs. ayer</span>
          </div>
          <div className="mt-3">
            <SalesAreaChart data={salesSeries} />
          </div>
          <div className="mt-2 flex items-center gap-4 text-[12px] text-[var(--tx-mut)]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--brand-primary)" }} /> Hoy</span>
            <span className="flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: "var(--bd-2)" }} /> Ayer</span>
          </div>
        </DataCard>

        <DataCard title="Productos más vendidos" action={<a href="/admin/catalogo" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--brand-dark)]">Ver todos <ArrowRight size={13} /></a>}>
          <ul className="space-y-1">
            {topProducts.map((p) => (
              <li key={p.sku} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[var(--surf-2)]">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold text-[var(--tx-mut)]" style={{ background: "var(--surf-2)" }}>{p.rank}</span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: "var(--surf-2)", color: "var(--tx-dim)" }}><Shirt size={16} /></span>
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
