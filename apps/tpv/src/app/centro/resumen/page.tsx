"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DollarSign, Percent, ShoppingBag, TrendingUp, TrendingDown,
  AlertTriangle, ArrowRight, Loader2,
} from "lucide-react";
import api from "@/lib/api";

interface SummaryResponse {
  today: {
    revenue: number; foodCost: number; foodCostPct: number;
    margin: number; marginPct: number;
    ordersCount: number; avgTicket: number;
  };
  yesterday: { revenue: number; foodCostPct: number; marginPct: number; ordersCount: number; avgTicket: number; };
  last30d: {
    revenue: number; foodCostPct: number; marginPct: number;
    topVarianceIngredients: Array<{ name: string; costImpact: number }>;
    risingCosts: Array<{ ingredientId: string; name: string; changePct: number }>;
  };
  alerts: Array<{ severity: "info" | "warn" | "err"; message: string; cta?: { label: string; href: string } }>;
}

const fmtMoney = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 })
    : "—";

const fmtPct = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}%` : "—");

export default function CentroResumenPage() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get<SummaryResponse>("/api/finance/summary");
        if (!cancel) setData(data);
      } catch (e: any) {
        if (!cancel) setError(e?.response?.data?.error || e.message || "Error al cargar resumen");
      }
    })();
    return () => { cancel = true; };
  }, []);

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
        <span className="text-[10px] font-black uppercase tracking-[0.3em]">Cargando KPIs…</span>
      </div>
    );
  }

  const fcDelta = data.today.foodCostPct - data.yesterday.foodCostPct;
  const marginDelta = data.today.marginPct - data.yesterday.marginPct;

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Food cost % · hoy"
          value={fmtPct(data.today.foodCostPct)}
          delta={fcDelta}
          deltaInvert
          Icon={Percent}
          accent="rose"
        />
        <KpiCard
          label="Margen % · hoy"
          value={fmtPct(data.today.marginPct)}
          delta={marginDelta}
          Icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          label="Ventas · hoy"
          value={fmtMoney(data.today.revenue)}
          sub={`${data.today.ordersCount} órdenes · ${fmtMoney(data.today.avgTicket)} prom.`}
          Icon={DollarSign}
          accent="amber"
        />
        <KpiCard
          label="CMV · hoy"
          value={fmtMoney(data.today.foodCost)}
          sub={`Margen $: ${fmtMoney(data.today.margin)}`}
          Icon={ShoppingBag}
          accent="violet"
        />
      </div>

      {/* Panel: Alertas */}
      <section className="rounded-2xl bg-white/5 border border-white/10 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-black tracking-[0.25em] text-white/50 uppercase">
            Alertas
          </h3>
          <span className="text-[10px] font-black tracking-widest text-white/30">
            {data.alerts.length} {data.alerts.length === 1 ? "evento" : "eventos"}
          </span>
        </div>
        {data.alerts.length === 0 ? (
          <p className="text-sm text-white/40 py-4 text-center">
            Sin alertas. Todo dentro de rango.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.alerts.map((a, i) => {
              const tone = a.severity === "err"
                ? "bg-red-500/10 border-red-500/30 text-red-200"
                : a.severity === "warn"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                : "bg-sky-500/10 border-sky-500/30 text-sky-200";
              return (
                <li key={i} className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border ${tone}`}>
                  <p className="text-[13px] font-semibold leading-snug">{a.message}</p>
                  {a.cta && (
                    <Link
                      href={a.cta.href}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black bg-white/10 hover:bg-white/15 transition-colors"
                    >
                      {a.cta.label} <ArrowRight size={11} strokeWidth={3} />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Costos al alza + Top variance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Costos al alza · 30d" cta={{ label: "Ver histórico", href: "/centro/costos" }}>
          {data.last30d.risingCosts.length === 0 ? (
            <p className="text-sm text-white/40 py-4 text-center">Sin alzas significativas (&gt;10%).</p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/5">
              {data.last30d.risingCosts.map((r) => (
                <li key={r.ingredientId} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-semibold text-white truncate">{r.name}</span>
                  <span className="text-sm font-black text-rose-300 tabular-nums">
                    +{r.changePct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top variance · 30d" cta={{ label: "Ver variance", href: "/centro/variance" }}>
          {data.last30d.topVarianceIngredients.length === 0 ? (
            <p className="text-sm text-white/40 py-4 text-center">Sin variance acumulada.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-white/5">
              {data.last30d.topVarianceIngredients.map((v, i) => (
                <li key={i} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-semibold text-white truncate">{v.name}</span>
                  <span className="text-sm font-black text-amber-300 tabular-nums">
                    {fmtMoney(Math.abs(v.costImpact))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* 30d resumen línea */}
      <section className="rounded-2xl bg-white/5 border border-white/10 p-5">
        <h3 className="text-[11px] font-black tracking-[0.25em] text-white/50 uppercase mb-3">
          Últimos 30 días
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <Mini label="Ventas" value={fmtMoney(data.last30d.revenue)} />
          <Mini label="Food cost %" value={fmtPct(data.last30d.foodCostPct)} />
          <Mini label="Margen %" value={fmtPct(data.last30d.marginPct)} />
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label, value, sub, delta, deltaInvert, Icon, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  deltaInvert?: boolean;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  accent: "rose" | "emerald" | "amber" | "violet";
}) {
  const accentMap = {
    rose:    { bg: "bg-rose-500/15",    border: "border-rose-500/30",    text: "text-rose-300" },
    emerald: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-300" },
    amber:   { bg: "bg-amber-500/15",   border: "border-amber-500/30",   text: "text-amber-300" },
    violet:  { bg: "bg-violet-500/15",  border: "border-violet-500/30",  text: "text-violet-300" },
  }[accent];

  const positiveIsGood = !deltaInvert;
  const isPositive = (delta ?? 0) > 0;
  const isBetter = positiveIsGood ? isPositive : !isPositive;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase leading-tight">
          {label}
        </span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accentMap.bg} border ${accentMap.border}`}>
          <Icon size={14} className={accentMap.text} strokeWidth={2.5} />
        </div>
      </div>
      <div className="text-2xl font-black text-white tabular-nums leading-tight">{value}</div>
      {delta != null && Number.isFinite(delta) && Math.abs(delta) > 0.05 && (
        <div className={`inline-flex items-center gap-1 text-[11px] font-bold ${isBetter ? "text-emerald-300" : "text-rose-300"}`}>
          {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {delta > 0 ? "+" : ""}{delta.toFixed(1)} pts vs ayer
        </div>
      )}
      {sub && <div className="text-[11px] font-semibold text-white/50 truncate">{sub}</div>}
    </div>
  );
}

function Panel({ title, cta, children }: { title: string; cta?: { label: string; href: string }; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/5 border border-white/10 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-black tracking-[0.25em] text-white/50 uppercase">
          {title}
        </h3>
        {cta && (
          <Link
            href={cta.href}
            className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest text-amber-300 hover:text-amber-200"
          >
            {cta.label} <ArrowRight size={11} strokeWidth={3} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-1">
      <span className="text-[9px] font-black tracking-[0.22em] text-white/40 uppercase">{label}</span>
      <span className="text-base font-black text-white tabular-nums">{value}</span>
    </div>
  );
}
