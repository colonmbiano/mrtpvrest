"use client";
import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";

// /admin/finanzas/gastos · Dashboard de gastos operativos + compras.
// Consume /api/reports/expenses-summary y /api/reports/expenses-daily.

type PresetKey = "this-month" | "last-month" | "last-30" | "last-7";

interface Summary {
  range: { from: string; to: string };
  operatingExpenses: { total: number; previousTotal: number; delta: number; deltaPct: number | null; count: number };
  purchases: { total: number; previousTotal: number; delta: number; deltaPct: number | null; count: number };
  grandTotal: number;
  previousGrandTotal: number;
  byPaymentMethod: { CASH_DRAWER: number; CORPORATE_CARD: number; TRANSFER: number };
  topCategories: Array<{ categoryId: string | null; name: string; icon: string; color: string | null; total: number; count: number }>;
}

interface Daily {
  range: { from: string; to: string };
  days: Array<{ date: string; opExpenses: number; purchases: number; total: number }>;
}

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

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-syne text-3xl font-black">Gastos & Compras</h1>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">
            Egresos del local: gastos operativos + compras de inventario
          </p>
        </div>

        <div className="ml-auto flex gap-2">
          {(
            [
              { id: "this-month", label: "Este mes" },
              { id: "last-month", label: "Mes anterior" },
              { id: "last-30", label: "30 días" },
              { id: "last-7", label: "7 días" },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: preset === p.id ? "var(--gold)" : "var(--surf)",
                color: preset === p.id ? "#000" : "var(--text)",
                border: `1px solid ${preset === p.id ? "var(--gold)" : "var(--border)"}`,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading || !summary ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: "var(--surf)", borderColor: "var(--border)", border: "1px solid" }} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              label="Total gastado"
              value={summary.grandTotal}
              prev={summary.previousGrandTotal}
              accent="var(--gold)"
            />
            <KpiCard
              label="Gastos operativos"
              value={summary.operatingExpenses.total}
              prev={summary.operatingExpenses.previousTotal}
              hint={`${summary.operatingExpenses.count} registros`}
            />
            <KpiCard
              label="Compras de inventario"
              value={summary.purchases.total}
              prev={summary.purchases.previousTotal}
              hint={`${summary.purchases.count} órdenes`}
            />
          </div>

          {/* Method breakdown */}
          <div className="rounded-2xl p-5" style={{ background: "var(--surf)", borderColor: "var(--border)", border: "1px solid" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "var(--muted)" }}>
              Por método de pago
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <MethodCell label="Efectivo de caja" amount={summary.byPaymentMethod.CASH_DRAWER} color="#f59e0b" />
              <MethodCell label="Tarjeta corporativa" amount={summary.byPaymentMethod.CORPORATE_CARD} color="#a78bfa" />
              <MethodCell label="Transferencia" amount={summary.byPaymentMethod.TRANSFER} color="#22d3ee" />
            </div>
          </div>

          {/* Sparkline + Top Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl p-5" style={{ background: "var(--surf)", borderColor: "var(--border)", border: "1px solid" }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "var(--muted)" }}>
                Tendencia diaria
              </h3>
              {daily && daily.days.length > 0 ? (
                <div className="flex items-end gap-0.5 h-32">
                  {daily.days.map((d, i) => {
                    const h = (d.total / maxDaily) * 100;
                    return (
                      <div
                        key={i}
                        title={`${d.date}: $${d.total.toFixed(2)}`}
                        className="flex-1 rounded-t"
                        style={{
                          height: `${h}%`,
                          background: d.total > 0 ? "var(--gold)" : "var(--border)",
                          minHeight: 2,
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm py-12 text-center" style={{ color: "var(--muted)" }}>
                  Sin datos en el rango.
                </p>
              )}
            </div>

            <div className="rounded-2xl p-5" style={{ background: "var(--surf)", borderColor: "var(--border)", border: "1px solid" }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "var(--muted)" }}>
                Top categorías de gasto
              </h3>
              {summary.topCategories.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
                  Sin gastos operativos en el rango.
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.topCategories.map((c) => {
                    const pct = summary.operatingExpenses.total > 0 ? (c.total / summary.operatingExpenses.total) * 100 : 0;
                    return (
                      <div key={c.categoryId || c.name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-2">
                            <span className="text-base">{c.icon}</span>
                            <span className="font-medium">{c.name.replace(/_/g, " ")}</span>
                            <span className="text-xs" style={{ color: "var(--muted)" }}>· {c.count}</span>
                          </span>
                          <span className="tabular-nums font-bold">${c.total.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surf2)" }}>
                          <div
                            className="h-full"
                            style={{
                              width: `${pct}%`,
                              background: c.color || "var(--gold)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  prev,
  accent,
  hint,
}: {
  label: string;
  value: number;
  prev: number;
  accent?: string;
  hint?: string;
}) {
  const delta = value - prev;
  const deltaPct = prev > 0 ? (delta / prev) * 100 : null;
  const isUp = delta > 0;
  return (
    <div
      className="rounded-2xl p-5 space-y-2"
      style={{ background: "var(--surf)", borderColor: "var(--border)", border: "1px solid", borderLeft: accent ? `4px solid ${accent}` : undefined }}
    >
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
      </p>
      <p className="text-3xl font-black tabular-nums">${value.toFixed(2)}</p>
      {deltaPct != null ? (
        <p
          className="text-xs font-bold tabular-nums"
          style={{ color: isUp ? "#ef4444" : "#10b981" }}
          title={`Anterior: $${prev.toFixed(2)}`}
        >
          {isUp ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% vs periodo anterior
        </p>
      ) : (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Sin comparativo
        </p>
      )}
      {hint && (
        <p className="text-[10px]" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function MethodCell({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: "var(--surf2)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      </div>
      <p className="text-xl font-black tabular-nums" style={{ color }}>
        ${amount.toFixed(2)}
      </p>
    </div>
  );
}
