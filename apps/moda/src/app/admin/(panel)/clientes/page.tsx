"use client";

import { Users, UserPlus, RefreshCcw, Crown, Download, Star, Repeat, TrendingUp, Clock, type LucideIcon } from "lucide-react";
import AdminTopbar from "@/components/admin/AdminTopbar";
import { StatCard, DataCard, StatusBadge, TablePagination, Donut } from "@/components/admin/atoms";
import { money, num } from "@/lib/admin-format";
import { clients, clientSegments, retention, sparkUp, sparkUp2 } from "@/lib/admin-mock";

const segIcon: Record<string, LucideIcon> = { VIP: Crown, Frecuentes: Repeat, Nuevos: Star, "En riesgo": TrendingUp, Inactivos: Clock };

export default function ClientesPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <AdminTopbar title="Clientes" subtitle="Gestiona tu base de clientes y analiza su comportamiento." searchPlaceholder="Buscar clientes por nombre, correo o teléfono…" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} tone="green" title="Total clientes" value={num(2845)} trend="18.6%" trendLabel="vs. ayer" spark={sparkUp} />
        <StatCard icon={UserPlus} tone="green" title="Clientes nuevos" value={num(284)} trend="21.2%" trendLabel="vs. ayer" spark={sparkUp2} />
        <StatCard icon={RefreshCcw} tone="green" title="Tasa de recompra" value="38.7%" trend="4.6 pp" trendLabel="vs. ayer" spark={sparkUp} />
        <StatCard icon={Crown} tone="orange" title="Clientes VIP" value={num(156)} trend="15.4%" trendLabel="vs. ayer" spark={sparkUp2} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DataCard title="Todos los clientes" action={
          <div className="flex items-center gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold text-[var(--tx-mut)]" style={{ borderColor: "var(--bd-1)" }}><Download size={14} /> Exportar</button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-bold text-white" style={{ background: "var(--brand-primary)" }}><UserPlus size={14} /> Agregar cliente</button>
          </div>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b text-[11px] font-semibold uppercase tracking-wide text-[var(--tx-dim)]" style={{ borderColor: "var(--bd-1)" }}>
                  <th className="py-2.5 pr-3">Cliente</th><th className="py-2.5 pr-3">Correo</th><th className="py-2.5 pr-3">Última compra</th><th className="py-2.5 pr-3">Total gastado</th><th className="py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const initials = c.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <tr key={c.email} className="border-b text-[13px]" style={{ borderColor: "var(--bd-1)" }}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}>{initials}</span>
                          <span className="min-w-0"><span className="block truncate font-semibold text-[var(--tx-hi)]">{c.name}</span><span className="mt-0.5 inline-block"><StatusBadge status={c.tag} /></span></span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-[var(--tx-mut)]">{c.email}</td>
                      <td className="py-2.5 pr-3 text-[var(--tx-mut)]">{c.last}</td>
                      <td className="tnum py-2.5 pr-3 font-bold text-[var(--tx-hi)]">{money(c.spent)}</td>
                      <td className="py-2.5"><StatusBadge status="activo" label="Activo" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination info="Mostrando 1 a 8 de 2,845 clientes" page={1} totalPages={356} />
        </DataCard>

        <div className="space-y-4">
          <DataCard title="Segmentos de clientes" action={<a href="#" className="text-[12px] font-semibold text-[var(--brand-dark)]">Ver todos</a>}>
            <ul className="space-y-3">
              {clientSegments.map((s) => {
                const Icon = segIcon[s.label] || Users;
                return (
                  <li key={s.label}>
                    <div className="flex items-center justify-between gap-3 text-[12px]">
                      <span className="flex items-center gap-2 text-[var(--tx-hi)]"><span className="grid h-6 w-6 place-items-center rounded-md" style={{ background: "var(--surf-2)", color: s.color }}><Icon size={13} /></span>{s.label}</span>
                      <span className="text-[var(--tx-mut)]"><span className="tnum font-semibold text-[var(--tx-hi)]">{num(s.count)}</span> · {s.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surf-2)" }}><div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} /></div>
                  </li>
                );
              })}
            </ul>
          </DataCard>

          <DataCard title="Retención de clientes" action={<a href="#" className="text-[12px] font-semibold text-[var(--brand-dark)]">Ver reporte</a>}>
            <div className="flex items-center gap-4">
              <Donut size={130} segments={retention.map((r) => ({ label: r.label, value: r.pct, color: r.color }))} center={<span><span className="tnum block text-[18px] font-extrabold text-[var(--tx-hi)]">68.3%</span><span className="block text-[9px] text-[var(--tx-mut)]">retención</span></span>} />
              <ul className="flex-1 space-y-2">
                {retention.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-3 text-[12px]">
                    <span className="flex items-center gap-2 text-[var(--tx-mut)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span>
                    <span className="tnum font-semibold text-[var(--tx-hi)]">{r.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl p-3 text-[12px]" style={{ background: "var(--iris-soft)", color: "var(--brand-dark)" }}>
              <TrendingUp size={15} className="mt-0.5 shrink-0" /> Los clientes retenidos han generado {money(236540)} en los últimos 90 días.
            </div>
          </DataCard>
        </div>
      </div>
    </div>
  );
}
