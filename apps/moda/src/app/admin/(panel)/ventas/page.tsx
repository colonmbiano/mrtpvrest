"use client";

import { ShoppingBag, CalendarRange, Tag, Users, Download, ChevronDown, type LucideIcon } from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { StatCard, DataCard, StatusBadge, TablePagination, SalesAreaChart, Donut } from "@/components/admin/atoms";
import { money } from "@/lib/admin-format";
import { ventasSeries, paymentMethods, salesChannels, orders, sparkUp, sparkUp2, sparkWarn } from "@/lib/admin-mock";

function Filter({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3.5 text-[13px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>
      <Icon size={15} /> {label} <ChevronDown size={14} className="text-[var(--tx-dim)]" />
    </button>
  );
}

function DonutLegend({ rows }: { rows: Array<{ label: string; pct: number; amount: number; color: string }> }) {
  return (
    <ul className="flex-1 space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-3 text-[12px]">
          <span className="flex min-w-0 items-center gap-2 text-[var(--tx-mut)]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} /><span className="truncate">{r.label}</span></span>
          <span className="shrink-0 text-right"><span className="font-bold text-[var(--tx-hi)]">{r.pct}%</span> <span className="tnum block text-[11px] text-[var(--tx-dim)]">{money(r.amount)}</span></span>
        </li>
      ))}
    </ul>
  );
}

export default function VentasPage() {
  const total = paymentMethods.reduce((a, p) => a + p.amount, 0);
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Ventas" subtitle="Monitorea tus ventas y el rendimiento de tu negocio." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShoppingBag} tone="green" title="Ventas hoy" value={money(8750)} trend="12.3%" trendLabel="vs. ayer" spark={sparkUp} />
        <StatCard icon={CalendarRange} tone="green" title="Ventas mensuales" value={money(142680)} trend="18.7%" trendLabel="vs. mes anterior" spark={sparkUp2} />
        <StatCard icon={Tag} tone="orange" title="Ticket promedio" value={money(620.4)} trend="6.4%" trendLabel="vs. mes anterior" spark={sparkWarn} />
        <StatCard icon={Users} tone="green" title="Pedidos completados" value="356" trend="15.2%" trendLabel="vs. mes anterior" spark={sparkUp} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Filter icon={CalendarRange} label="01 may. 2024 - 31 may. 2024" />
        <Filter icon={Tag} label="Todas las sucursales" />
        <Filter icon={Tag} label="Todos los estados" />
        <button type="button" className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border bg-[var(--surf-1)] px-3.5 text-[13px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}><Download size={15} /> Exportar</button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DataCard title="Evolución de ventas" action={<span className="rounded-lg border px-2.5 py-1 text-[12px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}>Diario ▾</span>}>
          <div className="flex items-end gap-2">
            <div className="tnum text-[24px] font-extrabold leading-none text-[var(--tx-hi)]" style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>{money(142680)}</div>
            <span className="tnum mb-1 text-[12px] font-semibold text-[var(--ok)]">▲ 18.7%</span>
          </div>
          <div className="mt-3"><SalesAreaChart data={ventasSeries} height={170} /></div>
        </DataCard>

        <DataCard title="Ventas por método de pago">
          <div className="flex items-center gap-4">
            <Donut segments={paymentMethods.map((p) => ({ label: p.label, value: p.amount, color: p.color }))} center={<span><span className="block text-[10px] text-[var(--tx-mut)]">Total</span><span className="tnum block text-[14px] font-extrabold text-[var(--tx-hi)]">{money(total)}</span></span>} />
            <DonutLegend rows={paymentMethods} />
          </div>
        </DataCard>

        <DataCard title="Ventas por canal">
          <div className="flex items-center gap-4">
            <Donut segments={salesChannels.map((p) => ({ label: p.label, value: p.amount, color: p.color }))} center={<span><span className="block text-[10px] text-[var(--tx-mut)]">Total</span><span className="tnum block text-[14px] font-extrabold text-[var(--tx-hi)]">{money(total)}</span></span>} />
            <DonutLegend rows={salesChannels} />
          </div>
        </DataCard>
      </div>

      <DataCard title="Órdenes de venta" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-dim)]" style={{ borderColor: "var(--bd-1)" }}>
                <th className="py-2.5 pr-3">Folio</th><th className="py-2.5 pr-3">Cliente</th><th className="py-2.5 pr-3">Fecha</th><th className="py-2.5 pr-3">Total</th><th className="py-2.5 pr-3">Método de pago</th><th className="py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.folio} className="border-b text-[13px]" style={{ borderColor: "var(--bd-1)" }}>
                  <td className="py-3 pr-3 font-mono font-semibold text-[var(--brand-dark)]">{o.folio}</td>
                  <td className="py-3 pr-3 text-[var(--tx-hi)]">{o.customer}</td>
                  <td className="py-3 pr-3 text-[var(--tx-mut)]">{o.date}</td>
                  <td className="tnum py-3 pr-3 font-bold text-[var(--tx-hi)]">{money(o.total)}</td>
                  <td className="py-3 pr-3 text-[var(--tx-mut)]">{o.method}</td>
                  <td className="py-3"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination info="Mostrando 1 a 5 de 50 órdenes" page={1} totalPages={10} />
      </DataCard>
    </div>
  );
}
