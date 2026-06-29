"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft, Wallet, TrendingUp, AlertTriangle, CalendarRange, Lock, ArrowDown, ArrowUp,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, StatTile, SectionHead, Segmented, EmptyState, LoadingCards, money,
} from "@/components/warmtech";

// /admin/finanzas/flujo · Flujo de caja proyectado (deudas por vencer +
// recurrentes vs efectivo + ventas esperadas), semana por semana.

interface Week { weekStart: string; weekEnd: string; due: number; expectedSales: number; net: number; balance: number }
interface Cashflow {
  startingCash: number; avgDailySales: number; horizonDays: number;
  noDateTotal: number; totalDue: number; minBalance: number; cashCrunch: boolean;
  weeks: Week[];
}

const PRESETS = [
  { value: "14", label: "2 semanas" },
  { value: "30", label: "30 días" },
  { value: "60", label: "60 días" },
] as const;

const fmtRange = (a: string, b: string) => {
  const o: Intl.DateTimeFormatOptions = { timeZone: "America/Mexico_City", day: "2-digit", month: "short" };
  return `${new Date(a).toLocaleDateString("es-MX", o)} – ${new Date(new Date(b).getTime() - 1).toLocaleDateString("es-MX", o)}`;
};

export default function FlujoCajaPage() {
  const [days, setDays] = useState<string>("30");
  const [data, setData] = useState<Cashflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setModuleOff(false);
    try {
      const { data } = await api.get<Cashflow>("/api/finance/cashflow", { params: { days } });
      setData(data);
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 403) setModuleOff(true);
    } finally {
      setLoading(false);
    }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  if (moduleOff) {
    return (
      <WtScreen>
        <PageHeader eyebrow="Finanzas" title="Flujo de caja" subtitle="Proyección de efectivo" />
        <EmptyState icon={Lock} title="Módulo de Finanzas no activado" hint="Actívalo (módulo FINANCE) para ver la proyección de flujo de caja." />
      </WtScreen>
    );
  }

  const maxBar = data ? Math.max(1, ...data.weeks.map((w) => Math.max(w.expectedSales, w.due))) : 1;

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Finanzas · Tesorería"
        title="Flujo de caja proyectado"
        subtitle="Lo que vas a deber vs lo que esperas tener"
        actions={<Segmented value={days} onChange={setDays} options={PRESETS} className="md:max-w-[320px]" />}
      />
      <div className="mb-4 md:hidden flex items-center justify-between">
        <a href="/admin/finanzas" className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-tx-mut">
          <ChevronLeft size={15} /> Finanzas
        </a>
        <Segmented value={days} onChange={setDays} options={PRESETS} />
      </div>

      {loading || !data ? (
        <LoadingCards count={4} />
      ) : (
        <div className="space-y-5">
          {data.cashCrunch && (
            <div className="flex items-center gap-3 rounded-2xl p-4" style={{ background: "var(--err-soft)", border: "1px solid var(--err)" }}>
              <AlertTriangle size={20} className="shrink-0 text-[color:var(--err)]" />
              <div>
                <p className="text-sm font-bold text-[color:var(--err)]">Alerta de flujo: el saldo proyectado se vuelve negativo</p>
                <p className="text-[11px] text-tx-mut">Llega hasta {money(data.minBalance)}. Difiere pagos, acelera cobros o consigue fondeo.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={Wallet} value={money(data.startingCash)} label="Efectivo disponible" />
            <StatTile icon={TrendingUp} value={money(data.avgDailySales)} label="Ventas esperadas/día" />
            <StatTile icon={ArrowDown} value={money(data.totalDue)} label={`Por pagar (${data.horizonDays}d)`} />
            <StatTile
              icon={CalendarRange}
              value={money(data.minBalance)}
              label="Saldo mínimo proyectado"
            />
          </div>

          <WtCard className="overflow-hidden">
            <div className="p-4 md:p-5"><SectionHead title="Proyección semanal" /></div>
            {data.weeks.map((w, i) => {
              const neg = w.balance < 0;
              return (
                <div key={i} className="px-4 py-3 md:px-5" style={i === data.weeks.length - 1 ? {} : { borderBottom: "1px solid var(--bd-1)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-tx">{fmtRange(w.weekStart, w.weekEnd)}</span>
                    <span className="font-mono text-sm font-extrabold tabular-nums" style={{ color: neg ? "var(--err)" : "var(--tx-hi)" }}>
                      saldo {money(w.balance)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
                    <Bar value={w.expectedSales} max={maxBar} color="var(--ok)" />
                    <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-[color:var(--ok)]"><ArrowUp size={11} />{money(w.expectedSales)}</span>
                    <Bar value={w.due} max={maxBar} color="var(--warn)" />
                    <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-[color:var(--warn)]"><ArrowDown size={11} />{money(w.due)}</span>
                  </div>
                  <div className="mt-1.5 text-right text-[11px] text-tx-mut">
                    neto <span className="font-mono font-bold" style={{ color: w.net < 0 ? "var(--err)" : "var(--ok)" }}>{w.net >= 0 ? "+" : "−"}{money(Math.abs(w.net))}</span>
                  </div>
                </div>
              );
            })}
          </WtCard>

          {data.noDateTotal > 0 && (
            <p className="text-[12px] text-tx-mut">
              ⚠️ {money(data.noDateTotal)} en deudas <strong>sin fecha de vencimiento</strong> no entran en la proyección. Asígnales fecha en Cuentas por pagar para verlas aquí.
            </p>
          )}
          <p className="text-[11px] text-tx-dim">
            Las ventas esperadas son el promedio diario de los últimos 28 días. La proyección es estimada — úsala como guía, no como pronóstico exacto.
          </p>
        </div>
      )}
    </WtScreen>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = Math.max(2, (value / max) * 100);
  return (
    <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--surf-2)" }}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}
