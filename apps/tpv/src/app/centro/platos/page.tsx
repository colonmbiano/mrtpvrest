"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChefHat, Loader2, ArrowUpDown } from "lucide-react";
import api from "@/lib/api";

interface Dish {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  categoryName: string | null;
  foodCost: number;
  foodCostPct: number;
  margin: number;
  marginPct: number;
  unitsSold: number;
  revenue: number;
  totalMargin: number;
  hasRecipe: boolean;
}
interface DishesResponse {
  dishes: Dish[];
  summary: {
    avgFoodCostPct: number;
    avgMarginPct: number;
    dishesWithoutRecipe: number;
    totalDishes: number;
  };
}

const RANGES = [
  { key: "today", label: "Hoy", days: 0 },
  { key: "7d", label: "7 días", days: 7 },
  { key: "30d", label: "30 días", days: 30 },
] as const;

const fmtMoney = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 })
    : "—";
const fmtPct = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : "—");

type SortKey = "name" | "foodCostPct" | "marginPct" | "unitsSold" | "totalMargin";

export default function CentroPlatosPage() {
  const [data, setData] = useState<DishesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30d");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("totalMargin");
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    let cancel = false;
    // Defer el reset para que la actualización de range no dispare
    // un setState síncrono durante el effect (react-compiler).
    queueMicrotask(() => { if (!cancel) setData(null); });
    (async () => {
      try {
        const params: Record<string, string> = {};
        if (range !== "today") {
          const r = RANGES.find((x) => x.key === range)!;
          const from = new Date(Date.now() - r.days * 24 * 60 * 60 * 1000);
          params.from = from.toISOString();
        } else {
          const now = new Date();
          const from = new Date(now); from.setHours(0, 0, 0, 0);
          params.from = from.toISOString();
        }
        const { data } = await api.get<DishesResponse>("/api/finance/dishes", { params });
        if (!cancel) setData(data);
      } catch (e: any) {
        if (!cancel) setError(e?.response?.data?.error || e.message);
      }
    })();
    return () => { cancel = true; };
  }, [range]);

  const categories = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, string>();
    for (const d of data.dishes) {
      if (d.categoryId && !map.has(d.categoryId)) {
        map.set(d.categoryId, d.categoryName ?? "Sin categoría");
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.dishes;
    if (categoryFilter) rows = rows.filter((d) => d.categoryId === categoryFilter);
    return rows.slice().sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
  }, [data, categoryFilter, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  };

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
        <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">Calculando food cost…</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-4">
      {/* Resumen + filtros */}
      <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <MiniStat label="Food cost prom." value={fmtPct(data.summary.avgFoodCostPct)} tone="rose" />
          <MiniStat label="Margen prom." value={fmtPct(data.summary.avgMarginPct)} tone="emerald" />
          <MiniStat
            label="Sin receta"
            value={`${data.summary.dishesWithoutRecipe} / ${data.summary.totalDishes}`}
            tone="amber"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
                range === r.key
                  ? "text-[var(--brand-fg)] bg-[var(--brand)]"
                  : "text-white/70 bg-white/5 border border-white/10 hover:bg-white/10"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </section>

      {/* Filtro por categoría */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategoryFilter("")}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
              categoryFilter === ""
                ? "text-[var(--bg)] bg-white"
                : "text-white/60 bg-white/5 border border-white/10 hover:bg-white/10"
            }`}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                categoryFilter === c.id
                  ? "text-[var(--bg)] bg-white"
                  : "text-white/60 bg-white/5 border border-white/10 hover:bg-white/10"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-white/10 bg-white/5">
              <tr className="text-[10px] font-semibold tracking-[0.14em] uppercase text-white/40">
                <SortableTh label="Plato"     active={sortKey === "name"}         desc={sortDesc} onClick={() => toggleSort("name")} />
                <th className="px-3 py-3">Precio</th>
                <th className="px-3 py-3">Food cost</th>
                <SortableTh label="FC %"      active={sortKey === "foodCostPct"}  desc={sortDesc} onClick={() => toggleSort("foodCostPct")} />
                <th className="px-3 py-3">Margen</th>
                <SortableTh label="Margen %"  active={sortKey === "marginPct"}    desc={sortDesc} onClick={() => toggleSort("marginPct")} />
                <SortableTh label="Vendidos"  active={sortKey === "unitsSold"}    desc={sortDesc} onClick={() => toggleSort("unitsSold")} />
                <SortableTh label="Margen $"  active={sortKey === "totalMargin"}  desc={sortDesc} onClick={() => toggleSort("totalMargin")} />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-white/[0.03]">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <ChefHat size={13} className="text-white/30" />
                      <span className="text-sm font-bold text-white">{d.name}</span>
                      {!d.hasRecipe && (
                        <span
                          title="Sin receta — food cost no calculable"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--warning-soft)] border border-[var(--warning)] text-[var(--warning)] text-[9px] font-semibold uppercase tracking-widest"
                        >
                          <AlertTriangle size={9} /> Sin receta
                        </span>
                      )}
                    </div>
                    {d.categoryName && (
                      <div className="text-[10px] text-white/30 mt-0.5">{d.categoryName}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-white tabular-nums">{fmtMoney(d.price)}</td>
                  <td className="px-3 py-3 text-sm font-semibold text-white/70 tabular-nums">{fmtMoney(d.foodCost)}</td>
                  <td className={`px-3 py-3 text-sm font-semibold tabular-nums ${fcColor(d.foodCostPct, d.hasRecipe)}`}>
                    {d.hasRecipe ? fmtPct(d.foodCostPct) : "—"}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-white tabular-nums">{fmtMoney(d.margin)}</td>
                  <td className="px-3 py-3 text-sm font-bold text-white/80 tabular-nums">{d.hasRecipe ? fmtPct(d.marginPct) : "—"}</td>
                  <td className="px-3 py-3 text-sm font-bold text-white tabular-nums">{d.unitsSold}</td>
                  <td className="px-3 py-3 text-sm font-semibold text-emerald-300 tabular-nums">{fmtMoney(d.totalMargin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center text-white/40 py-12 text-sm">Sin platos en este filtro.</div>
        )}
      </div>
    </div>
  );
}

// FC % thresholds: <25% verde, 25-35% amarillo, >35% rojo
function fcColor(pct: number, hasRecipe: boolean) {
  if (!hasRecipe) return "text-white/40";
  if (!Number.isFinite(pct)) return "text-white/40";
  if (pct > 35) return "text-rose-300";
  if (pct >= 25) return "text-amber-300";
  return "text-emerald-300";
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "rose" | "emerald" | "amber" }) {
  const t = tone === "rose" ? "text-rose-300" : tone === "emerald" ? "text-emerald-300" : "text-amber-300";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold tracking-[0.14em] uppercase text-white/40">{label}</span>
      <span className={`text-base font-semibold ${t} tabular-nums`}>{value}</span>
    </div>
  );
}

function SortableTh({ label, active, desc, onClick }: { label: string; active: boolean; desc: boolean; onClick: () => void }) {
  return (
    <th className="px-3 py-3">
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${active ? "text-[var(--brand)]" : "text-white/40"}`}
      >
        {label}
        <ArrowUpDown size={10} className={active ? (desc ? "rotate-0" : "rotate-180") : "opacity-40"} />
      </button>
    </th>
  );
}
