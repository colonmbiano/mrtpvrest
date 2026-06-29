"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet, TrendingUp, ShoppingCart, Receipt, Percent, ArrowDownUp,
  AlertTriangle, Lock, Trophy, Flame, Package,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, StatTile, SectionHead, Segmented,
  EmptyState, LoadingCards, Pill, money,
} from "@/components/warmtech";

// /admin/finanzas · Food cost real (COGS vs ventas) + compras vs consumo.
// Consume /api/finance/summary, /cost-vs-purchases y /dishes (módulo FINANCE).

// Objetivo de food cost (configurable a futuro por tenant). Hamburguesas/tacos
// suelen apuntar a ~30-35%.
const FOOD_COST_TARGET = 32;

type PresetKey = "week" | "month" | "last30";
const PRESETS: { value: PresetKey; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Este mes" },
  { value: "last30", label: "30 días" },
];

function rangeFromPreset(p: PresetKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  if (p === "month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to };
  }
  const days = p === "week" ? 7 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return { from: start.toISOString(), to };
}

// Tono del food cost: menor es mejor. Verde ≤ target, ámbar hasta +5, rojo arriba.
function fcTone(pct: number): "ok" | "warn" | "err" {
  if (pct <= FOOD_COST_TARGET) return "ok";
  if (pct <= FOOD_COST_TARGET + 5) return "warn";
  return "err";
}
const TONE_VAR: Record<string, string> = { ok: "var(--ok)", warn: "var(--warn)", err: "var(--err)" };

interface Summary {
  today: { revenue: number; foodCost: number; foodCostPct: number; margin: number; marginPct: number; ordersCount: number; avgTicket: number };
  last30d: {
    revenue: number; foodCostPct: number; marginPct: number;
    topVarianceIngredients: { name: string; costImpact: number }[];
    risingCosts: { name: string; changePct: number }[];
    wasteCost: number; wasteCount: number;
  };
  alerts: { severity: string; message: string }[];
}
interface CostVsPurchases {
  revenue: number; cogs: number; purchases: number; gap: number;
  purchasesBreakdown: { purchaseOrders: number; driverCompras: number; operatingCompras: number };
  itemsTotal: number; itemsWithoutCost: number;
  ordersCount: number; purchaseOrdersCount: number;
  foodCostPct: number; purchasesPct: number; marginPct: number;
}
interface Dish {
  id: string; name: string; price: number; foodCost: number; foodCostPct: number;
  margin: number; marginPct: number; unitsSold: number; revenue: number;
  totalMargin: number; hasRecipe: boolean;
}

const pct = (n: number) => `${(n || 0).toFixed(1)}%`;

export default function FinanzasPage() {
  const [preset, setPreset] = useState<PresetKey>("month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cvp, setCvp] = useState<CostVsPurchases | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setModuleOff(false);
    try {
      const r = rangeFromPreset(preset);
      const [s, c, d] = await Promise.all([
        api.get<Summary>("/api/finance/summary"),
        api.get<CostVsPurchases>("/api/finance/cost-vs-purchases", { params: r }),
        api.get<{ dishes: Dish[] }>("/api/finance/dishes", { params: r }),
      ]);
      setSummary(s.data);
      setCvp(c.data);
      setDishes(d.data.dishes || []);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403) setModuleOff(true);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => { load(); }, [load]);

  const topMargin = useMemo(
    () => [...dishes].filter((d) => d.unitsSold > 0).sort((a, b) => b.totalMargin - a.totalMargin).slice(0, 5),
    [dishes],
  );
  const worstFc = useMemo(
    () => [...dishes].filter((d) => d.hasRecipe && d.unitsSold > 0).sort((a, b) => b.foodCostPct - a.foodCostPct).slice(0, 5),
    [dishes],
  );

  if (moduleOff) {
    return (
      <WtScreen>
        <PageHeader eyebrow="Finanzas" title="Centro financiero" subtitle="Food cost, margen y consumo" />
        <EmptyState
          icon={Lock}
          title="Módulo de Finanzas no activado"
          hint="Actívalo en el plan del tenant (módulo FINANCE) para ver food cost real, márgenes y el análisis de compras vs consumo."
        />
      </WtScreen>
    );
  }

  const fcPeriod = cvp?.foodCostPct ?? 0;
  const tone = fcTone(fcPeriod);
  const maxBar = Math.max(1, cvp?.purchases ?? 0, cvp?.cogs ?? 0);

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Finanzas · Costeo"
        title="Centro financiero"
        subtitle="Food cost real, margen y compras vs consumo"
        actions={<Segmented value={preset} onChange={setPreset} options={PRESETS} className="md:max-w-[360px]" />}
      />
      <div className="mb-4 md:hidden">
        <Segmented value={preset} onChange={setPreset} options={PRESETS} />
      </div>

      {loading || !cvp ? (
        <LoadingCards count={4} />
      ) : (
        <div className="space-y-5">
          {/* KPIs del periodo */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div
              className="rounded-2xl p-4"
              style={{ background: "var(--surf-1)", border: `1px solid ${TONE_VAR[tone]}40` }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "var(--surf-2)", color: TONE_VAR[tone] }}>
                  <Percent size={15} />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-tx-mut">Food cost</span>
              </div>
              <p className="font-display text-2xl font-extrabold tabular-nums" style={{ color: TONE_VAR[tone] }}>{pct(fcPeriod)}</p>
              {cvp.itemsWithoutCost > 0 ? (
                <p className="text-[10px] font-semibold text-[color:var(--warn)]">piso · {cvp.itemsWithoutCost}/{cvp.itemsTotal} líneas sin receta</p>
              ) : (
                <p className="text-[10px] text-tx-dim">objetivo {FOOD_COST_TARGET}% · {tone === "ok" ? "en meta" : tone === "warn" ? "arriba" : "alto"}</p>
              )}
            </div>
            <StatTile icon={TrendingUp} value={pct(cvp.marginPct)} label="Margen bruto" />
            <StatTile icon={Wallet} value={money(cvp.revenue)} label={`Ventas · ${cvp.ordersCount} órd.`} />
            <StatTile icon={ShoppingCart} value={pct(cvp.purchasesPct)} label="Compras / ventas" />
          </div>

          {/* Compras vs consumo */}
          <WtCard className="p-4 md:p-5">
            <SectionHead title="Compras vs consumo (food cost real)" />
            <div className="space-y-3">
              <BarRow label="Consumo real (COGS)" value={cvp.cogs} max={maxBar} color="var(--brand-primary)" />
              <BarRow label="Compras (insumos)" value={cvp.purchases} max={maxBar} color="var(--info)" />
            </div>
            <p className="mt-2 text-[10.5px] text-tx-dim">
              Compras = órdenes {money(cvp.purchasesBreakdown.purchaseOrders)} · repartidor {money(cvp.purchasesBreakdown.driverCompras)} · gastos {money(cvp.purchasesBreakdown.operatingCompras)}
            </p>
            <div
              className="mt-4 flex items-center justify-between gap-3 rounded-xl p-3"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <div className="flex items-center gap-2">
                <ArrowDownUp size={16} className="text-tx-mut" />
                <span className="text-[12px] font-semibold text-tx">Diferencia (compras − consumo)</span>
              </div>
              <span className="font-mono text-base font-extrabold tabular-nums" style={{ color: cvp.gap > 0 ? "var(--warn)" : "var(--ok)" }}>
                {cvp.gap >= 0 ? "+" : "−"}{money(Math.abs(cvp.gap))}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-tx-mut">
              {cvp.gap > 0
                ? "Compraste más de lo que consumiste: o subió tu inventario, o hay merma/robo. Cruza con un conteo físico para distinguir."
                : "Consumiste de inventario previo (compraste menos de lo vendido). Normal si surtiste fuerte la semana pasada."}
            </p>
          </WtCard>

          {/* Hoy + alertas */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <WtCard className="p-4 md:p-5">
              <SectionHead title="Hoy" />
              {summary ? (
                <div className="grid grid-cols-3 gap-3">
                  <MiniKpi label="Food cost" value={pct(summary.today.foodCostPct)} color={TONE_VAR[fcTone(summary.today.foodCostPct)]} />
                  <MiniKpi label="Ventas" value={money(summary.today.revenue)} />
                  <MiniKpi label="Ticket prom." value={money(summary.today.avgTicket)} />
                </div>
              ) : <EmptyState icon={Receipt} title="Sin datos de hoy" />}
            </WtCard>

            <WtCard className="p-4 md:p-5">
              <SectionHead title="Alertas" />
              {summary && summary.alerts.length > 0 ? (
                <div className="space-y-2">
                  {summary.alerts.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-xl p-2.5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: a.severity === "err" ? "var(--err)" : a.severity === "warn" ? "var(--warn)" : "var(--info)" }} />
                      <span className="text-[12px] text-tx">{a.message}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={TrendingUp} title="Todo en orden" hint="Sin alertas de costo." />}
            </WtCard>
          </div>

          {/* Top platillos */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <WtCard className="p-4 md:p-5">
              <SectionHead title="Más rentables (margen total)" />
              {topMargin.length === 0 ? (
                <EmptyState icon={Trophy} title="Sin ventas en el rango" />
              ) : (
                <div className="space-y-2">
                  {topMargin.map((d) => (
                    <DishRow key={d.id} name={d.name} sub={`${d.unitsSold} vend. · ${pct(d.marginPct)} margen`} amount={money(d.totalMargin)} />
                  ))}
                </div>
              )}
            </WtCard>

            <WtCard className="p-4 md:p-5">
              <SectionHead title="Food cost más alto" />
              {worstFc.length === 0 ? (
                <EmptyState icon={Flame} title="Sin recetas con ventas" hint="Carga recetas para ver food cost por platillo." />
              ) : (
                <div className="space-y-2">
                  {worstFc.map((d) => (
                    <DishRow
                      key={d.id}
                      name={d.name}
                      sub={`${money(d.foodCost)} costo · ${d.unitsSold} vend.`}
                      amount={pct(d.foodCostPct)}
                      amountColor={TONE_VAR[fcTone(d.foodCostPct)]}
                    />
                  ))}
                </div>
              )}
            </WtCard>
          </div>

          {/* Costos al alza + mermas (30d) */}
          {summary && (summary.last30d.risingCosts.length > 0 || summary.last30d.wasteCost > 0) && (
            <WtCard className="p-4 md:p-5">
              <SectionHead title="Insumos a vigilar (30 días)" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-tx-mut">Costos al alza</p>
                  {summary.last30d.risingCosts.length === 0 ? (
                    <p className="text-[12px] text-tx-dim">Sin alzas &gt;10%.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {summary.last30d.risingCosts.map((r) => (
                        <div key={r.name} className="flex items-center justify-between text-[12px]">
                          <span className="truncate text-tx">{r.name}</span>
                          <Pill tone="warn">▲ {r.changePct.toFixed(0)}%</Pill>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--surf-3)", color: "var(--err)" }}>
                    <Package size={18} />
                  </span>
                  <div>
                    <p className="font-display text-xl font-extrabold tabular-nums text-tx-hi">{money(summary.last30d.wasteCost)}</p>
                    <p className="text-[11px] text-tx-mut">Mermas del mes · {summary.last30d.wasteCount} registros</p>
                  </div>
                </div>
              </div>
            </WtCard>
          )}
        </div>
      )}
    </WtScreen>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const w = Math.max(2, (value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12px]">
        <span className="font-semibold text-tx">{label}</span>
        <span className="font-mono font-bold tabular-nums text-tx-hi">{money(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full" style={{ background: "var(--surf-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-tx-mut">{label}</p>
      <p className="mt-0.5 font-display text-lg font-extrabold tabular-nums" style={{ color: color || "var(--tx-hi)" }}>{value}</p>
    </div>
  );
}

function DishRow({ name, sub, amount, amountColor }: { name: string; sub: string; amount: string; amountColor?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-tx">{name}</p>
        <p className="truncate text-[11px] text-tx-mut">{sub}</p>
      </div>
      <span className="shrink-0 font-mono text-sm font-extrabold tabular-nums" style={{ color: amountColor || "var(--tx-hi)" }}>{amount}</span>
    </div>
  );
}
