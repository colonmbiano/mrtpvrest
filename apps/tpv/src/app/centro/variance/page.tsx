"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import api from "@/lib/api";

interface VarianceRow {
  ingredientId: string;
  name: string;
  unit: string;
  baseUnit: string;
  theoretical: number;
  actual: number;
  variance: number;
  variancePct: number;
  costImpact: number;
  severity: "OK" | "WATCH" | "ALERT";
}
interface VarianceResponse {
  variances: VarianceRow[];
  totalCostImpact: number;
  range: { from: string; to: string };
}

const RANGES = [
  { key: "7d", label: "7 días", days: 7 },
  { key: "30d", label: "30 días", days: 30 },
  { key: "90d", label: "90 días", days: 90 },
] as const;

const SEV_FILTER = ["all", "ALERT", "WATCH", "OK"] as const;

const fmtMoney = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

const fmtNum = (n: number, unit?: string) =>
  `${n.toLocaleString("es-MX", { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;

const SEV_STYLES = {
  OK:    { dot: "bg-emerald-400", text: "text-emerald-300" },
  WATCH: { dot: "bg-amber-400",   text: "text-amber-300" },
  ALERT: { dot: "bg-rose-400",    text: "text-rose-300" },
};

export default function CentroVariancePage() {
  const [data, setData] = useState<VarianceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30d");
  const [sevFilter, setSevFilter] = useState<(typeof SEV_FILTER)[number]>("all");

  useEffect(() => {
    let cancel = false;
    setData(null);
    (async () => {
      try {
        const r = RANGES.find((x) => x.key === range)!;
        const from = new Date(Date.now() - r.days * 24 * 60 * 60 * 1000);
        const { data } = await api.get<VarianceResponse>("/api/finance/variance", {
          params: { from: from.toISOString() },
        });
        if (!cancel) setData(data);
      } catch (e: any) {
        if (!cancel) setError(e?.response?.data?.error || e.message);
      }
    })();
    return () => { cancel = true; };
  }, [range]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-6 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-center">
        <AlertTriangle className="mx-auto mb-3" size={22} />
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/40">
        <Loader2 className="animate-spin mb-3" size={26} />
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Calculando variance…</span>
      </div>
    );
  }

  const rows = sevFilter === "all" ? data.variances : data.variances.filter((v) => v.severity === sevFilter);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-4">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-5">
          <div className="flex flex-col">
            <span className="text-[9px] font-black tracking-[0.25em] text-white/40 uppercase">Impacto total</span>
            <span className={`text-xl font-black tabular-nums ${data.totalCostImpact > 0 ? "text-rose-300" : "text-emerald-300"}`}>
              {fmtMoney(data.totalCostImpact)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black tracking-[0.25em] text-white/40 uppercase">Ingredientes</span>
            <span className="text-xl font-black text-white tabular-nums">{data.variances.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-all ${
                range === r.key
                  ? "text-[#0a0a0c] bg-amber-400"
                  : "text-white/70 bg-white/5 border border-white/10 hover:bg-white/10"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {/* Filtros severity */}
      <div className="flex flex-wrap gap-1.5">
        {SEV_FILTER.map((s) => (
          <button
            key={s}
            onClick={() => setSevFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
              sevFilter === s
                ? "text-[#0a0a0c] bg-white"
                : "text-white/60 bg-white/5 border border-white/10 hover:bg-white/10"
            }`}
          >
            {s === "all" ? "Todos" : s === "OK" ? "OK" : s === "WATCH" ? "Watch" : "Alert"}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-white/10 bg-white/5">
              <tr className="text-[10px] font-black tracking-[0.18em] uppercase text-white/40">
                <th className="px-3 py-3">Ingrediente</th>
                <th className="px-3 py-3">Teórico</th>
                <th className="px-3 py-3">Real</th>
                <th className="px-3 py-3">Variance</th>
                <th className="px-3 py-3">%</th>
                <th className="px-3 py-3">$ Impacto</th>
                <th className="px-3 py-3">Sev.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((v) => {
                const sev = SEV_STYLES[v.severity];
                return (
                  <tr key={v.ingredientId} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-3 text-sm font-bold text-white">{v.name}</td>
                    <td className="px-3 py-3 text-sm text-white/70 tabular-nums">{fmtNum(v.theoretical, v.unit)}</td>
                    <td className="px-3 py-3 text-sm text-white/70 tabular-nums">{fmtNum(v.actual, v.unit)}</td>
                    <td className={`px-3 py-3 text-sm font-bold tabular-nums ${v.variance > 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {v.variance > 0 ? "+" : ""}{fmtNum(v.variance, v.unit)}
                    </td>
                    <td className={`px-3 py-3 text-sm font-bold tabular-nums ${sev.text}`}>
                      {v.variancePct > 0 ? "+" : ""}{v.variancePct.toFixed(1)}%
                    </td>
                    <td className={`px-3 py-3 text-sm font-black tabular-nums ${v.costImpact > 0 ? "text-rose-300" : "text-emerald-300"}`}>
                      {fmtMoney(v.costImpact)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest ${sev.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        {v.severity}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="text-center text-white/40 py-12 text-sm">Sin movimientos en este filtro.</div>
        )}
      </div>

      <p className="text-[11px] text-white/40 leading-relaxed max-w-3xl">
        Teórico = ventas × receta. Real = movimientos de inventario (ventas + mermas + ajustes + conteos)
        en el rango. Variance positivo = consumo de inventario mayor al esperado por las recetas — puede
        indicar mermas no registradas, sobre-porcionado o pérdidas.
      </p>
    </div>
  );
}
