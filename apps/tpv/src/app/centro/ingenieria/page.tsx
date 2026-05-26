"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Star, ChefHat, Lightbulb, Skull } from "lucide-react";
import api from "@/lib/api";

type QuadKey = "STAR" | "PLOWHORSE" | "PUZZLE" | "DOG";

interface Dish {
  id: string;
  name: string;
  price: number;
  cost: number;
  margin: number;
  unitsSold: number;
  type?: QuadKey;
}
interface ApiResponse {
  matrix: Record<QuadKey, Dish[]>;
  thresholds: { avgMargin: number; avgUnitsSold: number };
  recommendations: Array<{ dishId: string; name: string; type: QuadKey; action: string }>;
}

const QUAD: Record<QuadKey, { label: string; bg: string; border: string; text: string; Icon: any; tagline: string }> = {
  STAR:      { label: "Estrellas",  bg: "bg-emerald-500/10",  border: "border-emerald-500/30", text: "text-emerald-300", Icon: Star,      tagline: "Margen alto · Alta venta" },
  PUZZLE:    { label: "Puzzles",    bg: "bg-violet-500/10",   border: "border-violet-500/30",  text: "text-violet-300",  Icon: Lightbulb, tagline: "Margen alto · Baja venta" },
  PLOWHORSE: { label: "Caballos",   bg: "bg-amber-500/10",    border: "border-amber-500/30",   text: "text-amber-300",   Icon: ChefHat,   tagline: "Margen bajo · Alta venta" },
  DOG:       { label: "Perros",     bg: "bg-rose-500/10",     border: "border-rose-500/30",    text: "text-rose-300",    Icon: Skull,     tagline: "Margen bajo · Baja venta" },
};

const fmtMoney = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });

export default function CentroIngenieriaPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get<ApiResponse>("/api/finance/menu-engineering");
        if (!cancel) setData(data);
      } catch (e: any) {
        if (!cancel) setError(e?.response?.data?.error || e.message);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const counts = useMemo(() => {
    if (!data) return null;
    return {
      STAR: data.matrix.STAR.length,
      PLOWHORSE: data.matrix.PLOWHORSE.length,
      PUZZLE: data.matrix.PUZZLE.length,
      DOG: data.matrix.DOG.length,
    };
  }, [data]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-6 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-center">
        <AlertTriangle className="mx-auto mb-3" size={22} />
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }
  if (!data || !counts) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/40">
        <Loader2 className="animate-spin mb-3" size={26} />
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Calculando matriz…</span>
      </div>
    );
  }

  const totalDishes = counts.STAR + counts.PUZZLE + counts.PLOWHORSE + counts.DOG;

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      {/* Resumen */}
      <section className="flex flex-wrap items-center gap-5">
        <div className="flex flex-col">
          <span className="text-[9px] font-black tracking-[0.25em] text-white/40 uppercase">Margen prom.</span>
          <span className="text-lg font-black text-white tabular-nums">{fmtMoney(data.thresholds.avgMargin)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-black tracking-[0.25em] text-white/40 uppercase">Venta prom.</span>
          <span className="text-lg font-black text-white tabular-nums">{data.thresholds.avgUnitsSold.toFixed(1)} uds</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] font-black tracking-[0.25em] text-white/40 uppercase">Platos</span>
          <span className="text-lg font-black text-white tabular-nums">{totalDishes}</span>
        </div>
      </section>

      {/* Matriz 2x2 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <QuadrantCard quad="PUZZLE"    dishes={data.matrix.PUZZLE} />
        <QuadrantCard quad="STAR"      dishes={data.matrix.STAR} />
        <QuadrantCard quad="DOG"       dishes={data.matrix.DOG} />
        <QuadrantCard quad="PLOWHORSE" dishes={data.matrix.PLOWHORSE} />
      </section>

      {/* Recomendaciones */}
      <section className="rounded-2xl bg-white/5 border border-white/10 p-5">
        <h3 className="text-[11px] font-black tracking-[0.25em] text-white/50 uppercase mb-3">
          Recomendaciones automáticas
        </h3>
        {data.recommendations.length === 0 ? (
          <p className="text-sm text-white/40">Sin recomendaciones — agrega recetas y ventas para activar.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5">
            {data.recommendations.slice(0, 12).map((r) => {
              const q = QUAD[r.type];
              return (
                <li key={r.dishId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${q.bg} ${q.text} border ${q.border} text-[9px] font-black uppercase tracking-widest`}>
                      <q.Icon size={9} /> {q.label}
                    </span>
                    <span className="text-sm font-bold text-white truncate">{r.name}</span>
                  </div>
                  <span className="text-[12px] font-semibold text-white/60 text-right hidden sm:inline">
                    {r.action}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function QuadrantCard({ quad, dishes }: { quad: QuadKey; dishes: Dish[] }) {
  const q = QUAD[quad];
  return (
    <div className={`rounded-2xl ${q.bg} border ${q.border} p-4 flex flex-col gap-2.5 min-h-[160px]`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${q.bg} ${q.text} border ${q.border}`}>
            <q.Icon size={14} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">
              {q.tagline}
            </span>
            <span className={`text-sm font-black ${q.text}`}>{q.label}</span>
          </div>
        </div>
        <span className="text-2xl font-black text-white tabular-nums">{dishes.length}</span>
      </div>
      <ul className="flex flex-col gap-1 max-h-32 overflow-auto">
        {dishes.slice(0, 8).map((d) => (
          <li key={d.id} className="flex items-center justify-between py-1 text-[12px]">
            <span className="text-white/80 truncate font-semibold">{d.name}</span>
            <span className="text-white/40 tabular-nums shrink-0 pl-2">{d.unitsSold} uds · {fmtMoney(d.margin)}</span>
          </li>
        ))}
        {dishes.length > 8 && (
          <li className="text-[10px] text-white/30 italic pt-1">+{dishes.length - 8} más</li>
        )}
      </ul>
    </div>
  );
}
