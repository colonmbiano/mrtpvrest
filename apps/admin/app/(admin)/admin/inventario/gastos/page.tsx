"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Wallet, Receipt, ShoppingCart, Bike,
  Banknote, CreditCard, ArrowLeftRight, BarChart3, Tag,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Toolbar, DataCard, StatTile,
  Segmented, EmptyState, LoadingCards,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

// /admin/inventario/gastos · Dashboard de gastos operativos + compras.
// Consume /api/reports/expenses-summary y /api/reports/expenses-daily.

type PresetKey = "this-month" | "last-month" | "last-30" | "last-7";

interface Summary {
  range: { from: string; to: string };
  operatingExpenses: { total: number; previousTotal: number; delta: number; deltaPct: number | null; count: number };
  purchases: { total: number; previousTotal: number; delta: number; deltaPct: number | null; count: number };
  driverExpenses: { total: number; previousTotal: number; delta: number; deltaPct: number | null; count: number };
  grandTotal: number;
  previousGrandTotal: number;
  byPaymentMethod: { CASH_DRAWER: number; CORPORATE_CARD: number; TRANSFER: number };
  topCategories: Array<{ categoryId?: string | null; name: string; icon: string; color: string | null; total: number; count: number }>;
}

interface Daily {
  range: { from: string; to: string };
  days: Array<{ date: string; opExpenses: number; purchases: number; driver?: number; total: number }>;
}

const mny = (n: number) => formatMoney(n, false);

function rangeFromPreset(p: PresetKey): { from: string; to: string } {
  const now = new Date();
  const end = now.toISOString();
  if (p === "this-month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.toISOString(), to: end };
  }
  if (p === "last-month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const stop = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from: start.toISOString(), to: stop.toISOString() };
  }
  if (p === "last-7") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { from: start.toISOString(), to: end };
  }
  // last-30
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { from: start.toISOString(), to: end };
}

const PRESETS: { value: PresetKey; label: string }[] = [
  { value: "this-month", label: "Este mes" },
  { value: "last-month", label: "Mes anterior" },
  { value: "last-30", label: "30 días" },
  { value: "last-7", label: "7 días" },
];

function deltaLabel(value: number, prev: number) {
  const delta = value - prev;
  const deltaPct = prev > 0 ? (delta / prev) * 100 : null;
  if (deltaPct == null) return undefined;
  const up = delta > 0;
  // En gastos, subir es "malo" (rojo), bajar es "bueno" (verde).
  return { text: `${up ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(1)}%`, up: !up };
}

export default function GastosReportPage() {
  const [preset, setPreset] = useState<PresetKey>("this-month");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const r = rangeFromPreset(preset);
      const [s, d] = await Promise.all([
        api.get<Summary>("/api/reports/expenses-summary", { params: r }),
        api.get<Daily>("/api/reports/expenses-daily", { params: r }),
      ]);
      setSummary(s.data);
      setDaily(d.data);
    } catch {
      // soft fail
    } finally {
      setLoading(false);
    }
  }

  const maxDaily = useMemo(() => {
    if (!daily) return 0;
    return Math.max(1, ...daily.days.map((d) => d.total));
  }, [daily]);

  const grandDelta = summary ? deltaLabel(summary.grandTotal, summary.previousGrandTotal) : undefined;
  const opDelta = summary
    ? deltaLabel(summary.operatingExpenses.total, summary.operatingExpenses.previousTotal)
    : undefined;
  const purchasesDelta = summary
    ? deltaLabel(summary.purchases.total, summary.purchases.previousTotal)
    : undefined;
  const driverDelta = summary
    ? deltaLabel(summary.driverExpenses.total, summary.driverExpenses.previousTotal)
    : undefined;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Finanzas · Gastos"
        title="Reporte de gastos"
        subtitle="Gastos operativos y compras de inventario por periodo"
      />
      <PageTabs set="finanzas" />

      <Toolbar filters={<Segmented value={preset} onChange={setPreset} options={PRESETS} />} />

      {loading || !summary ? (
        <LoadingCards count={3} />
      ) : (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile
              icon={Wallet}
              value={mny(summary.grandTotal)}
              label="Total gastado"
              delta={grandDelta?.text}
              deltaUp={grandDelta?.up ?? true}
            />
            <StatTile
              icon={Receipt}
              value={mny(summary.operatingExpenses.total)}
              label={`Operativos · ${summary.operatingExpenses.count} reg.`}
              delta={opDelta?.text}
              deltaUp={opDelta?.up ?? true}
            />
            <StatTile
              icon={ShoppingCart}
              value={mny(summary.purchases.total)}
              label={`Compras · ${summary.purchases.count} órdenes`}
              delta={purchasesDelta?.text}
              deltaUp={purchasesDelta?.up ?? true}
            />
            <StatTile
              icon={Bike}
              value={mny(summary.driverExpenses.total)}
              label={`Repartidores · ${summary.driverExpenses.count} mov.`}
              delta={driverDelta?.text}
              deltaUp={driverDelta?.up ?? true}
            />
          </div>

          {/* Por método de pago */}
          <DataCard title="Por método de pago">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MethodCell icon={Banknote} label="Efectivo de caja" amount={summary.byPaymentMethod.CASH_DRAWER} color="var(--warn)" />
              <MethodCell icon={CreditCard} label="Tarjeta corporativa" amount={summary.byPaymentMethod.CORPORATE_CARD} color="var(--info)" />
              <MethodCell icon={ArrowLeftRight} label="Transferencia" amount={summary.byPaymentMethod.TRANSFER} color="var(--brand-primary)" />
            </div>
          </DataCard>

          {/* Tendencia + Top categorías */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DataCard title="Tendencia diaria">
              {daily && daily.days.length > 0 ? (
                <div className="flex h-32 items-end gap-0.5">
                  {daily.days.map((d, i) => {
                    const h = (d.total / maxDaily) * 100;
                    return (
                      <div
                        key={i}
                        title={`${d.date}: ${mny(d.total)}`}
                        className="flex-1 rounded-t"
                        style={{
                          height: `${h}%`,
                          background: d.total > 0
                            ? "linear-gradient(180deg,var(--brand-secondary),var(--brand-primary))"
                            : "var(--bd-1)",
                          minHeight: 2,
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={BarChart3} title="Sin datos en el rango" />
              )}
            </DataCard>

            <DataCard title="Top categorías de gasto">
              {summary.topCategories.length === 0 ? (
                <EmptyState icon={Tag} title="Sin gastos" hint="No hay gastos en este rango." />
              ) : (
                <div className="space-y-3">
                  {summary.topCategories.map((c) => {
                    const pct = summary.grandTotal > 0
                      ? (c.total / summary.grandTotal) * 100
                      : 0;
                    return (
                      <div key={c.categoryId || c.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="text-base leading-none">{c.icon}</span>
                            <span className="truncate font-semibold text-tx">{c.name.replace(/_/g, " ")}</span>
                            <span className="shrink-0 text-xs text-tx-mut">· {c.count}</span>
                          </span>
                          <span className="shrink-0 font-mono font-bold tabular-nums text-tx-hi">{mny(c.total)}</span>
                        </div>
                        <div
                          className="h-1.5 overflow-hidden rounded-full"
                          style={{ background: "var(--surf-2)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: c.color || "var(--brand-primary)" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DataCard>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function MethodCell({
  icon: Icon,
  label,
  amount,
  color,
}: {
  icon: typeof Banknote;
  label: string;
  amount: number;
  color: string;
}) {
  return (
    <div
      className="rounded-ds-lg p-4"
      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: "var(--surf-3)", color }}>
          <Icon size={15} strokeWidth={2} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-tx-mut">{label}</span>
      </div>
      <p className="font-display text-xl font-extrabold tabular-nums" style={{ color }}>
        {mny(amount)}
      </p>
    </div>
  );
}
