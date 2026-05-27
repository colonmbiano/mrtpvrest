"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import api from "@/lib/api";

interface IngredientLite {
  id: string;
  name: string;
  unit: string;
  cost: number;
}
interface CostHistoryEntry {
  createdAt: string;
  cost: number;
  purchaseCost: number | null;
  reason: string | null;
}
interface CostHistoryResponse {
  ingredientId: string;
  name: string;
  unit: string;
  history: CostHistoryEntry[];
  currentCost: number;
  changePct30d: number;
  affectedDishes: Array<{ menuItemId: string; name: string; marginImpactPct: number }>;
}

interface AggRow {
  ingredient: IngredientLite;
  changePct30d: number;
  history: CostHistoryEntry[];
}

const fmtMoney = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "—";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" });

export default function CentroCostosPage() {
  const [list, setList] = useState<AggRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CostHistoryResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar lista usando /api/inventory/ingredients (necesitamos id+cost para
  // pintar la lista). Pedimos costHistory para top 30 días a través del
  // endpoint /api/finance/cost-history por lazy load al expandir.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        // Para que /api/inventory/ingredients responda necesitamos location.
        const locationId = typeof window !== "undefined"
          ? localStorage.getItem("locationId") || localStorage.getItem("activeLocationId")
          : null;
        if (!locationId) {
          setError("Selecciona una sucursal en el hub para ver costos por ingrediente.");
          return;
        }
        const { data } = await api.get<any[]>("/api/inventory/ingredients", {
          params: { locationId },
        });
        if (cancel) return;
        const ingredients = (data || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          unit: i.unit,
          cost: Number(i.cost) || 0,
        })) as IngredientLite[];

        // Para detectar % cambio 30d cargamos /api/finance/cost-history para
        // cada ingrediente en paralelo, en lotes de 6 para no saturar.
        const result: AggRow[] = [];
        const batchSize = 6;
        for (let i = 0; i < ingredients.length; i += batchSize) {
          const batch = ingredients.slice(i, i + batchSize);
          const settled = await Promise.allSettled(
            batch.map((ing) => api.get<CostHistoryResponse>(`/api/finance/cost-history/${ing.id}`)),
          );
          settled.forEach((res, idx) => {
            const ing = batch[idx]!;
            if (res.status === "fulfilled") {
              result.push({
                ingredient: ing,
                changePct30d: Number(res.value.data.changePct30d) || 0,
                history: res.value.data.history,
              });
            } else {
              result.push({ ingredient: ing, changePct30d: 0, history: [] });
            }
          });
          if (cancel) return;
        }
        result.sort((a, b) => Math.abs(b.changePct30d) - Math.abs(a.changePct30d));
        if (!cancel) setList(result);
      } catch (e: any) {
        if (!cancel) setError(e?.response?.data?.error || e.message);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Cuando cambia selectedId, fetch detallado
  useEffect(() => {
    let cancel = false;
    if (!selectedId) {
      queueMicrotask(() => { if (!cancel) setDetail(null); });
      return () => { cancel = true; };
    }
    queueMicrotask(() => { if (!cancel) setLoadingDetail(true); });
    (async () => {
      try {
        const { data } = await api.get<CostHistoryResponse>(`/api/finance/cost-history/${selectedId}`);
        if (!cancel) setDetail(data);
      } catch (e: any) {
        if (!cancel) setError(e?.response?.data?.error || e.message);
      } finally {
        if (!cancel) setLoadingDetail(false);
      }
    })();
    return () => { cancel = true; };
  }, [selectedId]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-6 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-center">
        <AlertTriangle className="mx-auto mb-3" size={22} />
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }
  if (!list) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/40">
        <Loader2 className="animate-spin mb-3" size={26} />
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Cargando histórico…</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
      {/* Lista */}
      <section className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
        <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-[11px] font-black tracking-[0.25em] text-white/50 uppercase">
            Ingredientes
          </h3>
          <span className="text-[10px] font-black text-white/30">{list.length}</span>
        </header>
        <ul className="divide-y divide-white/5 max-h-[70vh] overflow-auto">
          {list.map((row) => {
            const isUp = row.changePct30d > 0;
            const isFlat = Math.abs(row.changePct30d) < 0.5;
            const isActive = selectedId === row.ingredient.id;
            return (
              <li key={row.ingredient.id}>
                <button
                  onClick={() => setSelectedId(row.ingredient.id)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 active:bg-white/10 transition-colors ${isActive ? "bg-white/[0.06]" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{row.ingredient.name}</div>
                    <div className="text-[11px] text-white/40 tabular-nums">{fmtMoney(row.ingredient.cost)} / {row.ingredient.unit}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isFlat ? (
                      <span className="text-[11px] font-bold text-white/40">—</span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 text-[11px] font-black tabular-nums ${isUp ? "text-rose-300" : "text-emerald-300"}`}>
                        {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                        {isUp ? "+" : ""}{row.changePct30d.toFixed(1)}%
                      </span>
                    )}
                    <ChevronRight size={13} className="text-white/30" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Detalle */}
      <section className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center text-center p-10 text-white/40">
            <p className="text-sm max-w-sm">
              Selecciona un ingrediente para ver su evolución de costo y los platos afectados.
            </p>
          </div>
        ) : loadingDetail || !detail ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-white/40" size={22} />
          </div>
        ) : (
          <CostDetail data={detail} />
        )}
      </section>
    </div>
  );
}

function CostDetail({ data }: { data: CostHistoryResponse }) {
  const sparkline = useMemo(() => {
    if (data.history.length < 2) return null;
    return buildSparkline(data.history);
  }, [data.history]);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <header className="px-5 py-4 border-b border-white/10">
        <h2 className="text-base font-black text-white">{data.name}</h2>
        <div className="flex items-baseline gap-3 mt-1">
          <span className="text-2xl font-black text-white tabular-nums">
            {data.currentCost.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </span>
          <span className="text-[11px] text-white/40">/ {data.unit}</span>
          <span className={`ml-auto text-[12px] font-black tabular-nums ${data.changePct30d > 0 ? "text-rose-300" : data.changePct30d < 0 ? "text-emerald-300" : "text-white/40"}`}>
            {data.changePct30d > 0 ? "+" : ""}{data.changePct30d.toFixed(1)}% · 30d
          </span>
        </div>
      </header>

      {/* Sparkline */}
      {sparkline && (
        <div className="px-5 py-4 border-b border-white/10">
          <svg viewBox="0 0 200 60" className="w-full h-20">
            <polyline
              fill="none"
              stroke="rgb(252,211,77)"
              strokeWidth="1.5"
              points={sparkline.points}
            />
            <polyline
              fill="rgba(252,211,77,0.08)"
              stroke="none"
              points={sparkline.fill}
            />
          </svg>
          <div className="flex justify-between text-[9px] text-white/40 mt-1 tabular-nums">
            <span>{fmtDate(data.history[0]!.createdAt)}</span>
            <span>{fmtDate(data.history[data.history.length - 1]!.createdAt)}</span>
          </div>
        </div>
      )}

      {/* Cambios recientes */}
      <section className="px-5 py-4">
        <h3 className="text-[10px] font-black tracking-[0.25em] text-white/50 uppercase mb-2">
          Últimos cambios
        </h3>
        {data.history.length === 0 ? (
          <p className="text-sm text-white/40">Sin historial registrado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {data.history.slice(-10).reverse().map((h, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-[12px] text-white tabular-nums">{fmtDate(h.createdAt)}</div>
                  <div className="text-[10px] text-white/40">{h.reason || "manual_update"}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-white tabular-nums">{fmtMoney(h.cost)}</div>
                  {h.purchaseCost != null && (
                    <div className="text-[10px] text-white/40 tabular-nums">paquete {fmtMoney(h.purchaseCost)}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Platos afectados */}
      {data.affectedDishes.length > 0 && (
        <section className="px-5 py-4 border-t border-white/10">
          <h3 className="text-[10px] font-black tracking-[0.25em] text-white/50 uppercase mb-2">
            Platos afectados
          </h3>
          <ul className="flex flex-col divide-y divide-white/5">
            {data.affectedDishes.slice(0, 10).map((d) => (
              <li key={d.menuItemId} className="flex items-center justify-between py-2">
                <span className="text-sm font-semibold text-white truncate">{d.name}</span>
                <span className={`text-[12px] font-black tabular-nums ${d.marginImpactPct < 0 ? "text-rose-300" : "text-emerald-300"}`}>
                  {d.marginImpactPct > 0 ? "+" : ""}{d.marginImpactPct.toFixed(2)} pts
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function buildSparkline(history: CostHistoryEntry[]) {
  const xs = history.map((h) => new Date(h.createdAt).getTime());
  const ys = history.map((h) => h.cost);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const points = xs
    .map((x, i) => {
      const px = ((x - minX) / rangeX) * 200;
      const py = 56 - ((ys[i]! - minY) / rangeY) * 50;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  const fill = `0,60 ${points} 200,60`;
  return { points, fill };
}
