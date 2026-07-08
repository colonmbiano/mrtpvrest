"use client";
import type { ReactNode } from "react";
import { Download, Save, Share2, Sparkles } from "lucide-react";
import { Card, IconBadge, IconButton, Pill } from "@/components/ds";
import { KpiStrip } from "./KpiStrip";
import { DailySalesChart } from "./DailySalesChart";
import { SedesTable } from "./SedesTable";
import { TopItemsList } from "./TopItemsList";
import { SuggestedActions } from "./SuggestedActions";
import {
  PERIOD_LABEL,
  type Period,
  type SalesByDay,
  type SedeRow,
  type StatsResponse,
  type SuggestedAction,
  type TopItem,
} from "./types";

/* Título de sub-sección dentro del reporte (tick de acento + Syne). */
function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`mb-3 flex items-center gap-2 font-display text-sm font-extrabold text-tx-hi ${className}`}>
      <span className="inline-block h-3.5 w-[3px] rounded-sm" style={{ background: "var(--brand-primary)" }} />
      {children}
    </h3>
  );
}

/* Reporte principal "Ventas por sucursal": KPIs, resumen, evolución diaria,
   tabla por sede, top productos y acciones sugeridas. */
export function ReportCard({
  period,
  stats,
  sedes,
  daily,
  topItems,
  actions,
  loading,
  onSave,
  onShare,
  onExport,
  onAskAction,
}: {
  period: Period;
  stats: StatsResponse | null;
  sedes: SedeRow[];
  daily: SalesByDay | null;
  topItems: TopItem[];
  actions: SuggestedAction[];
  loading: boolean;
  onSave: () => void;
  onShare: () => void;
  onExport: () => void;
  onAskAction: (prompt: string) => void;
}) {
  const sedesTxt = `${sedes.length} ${sedes.length === 1 ? "sede" : "sedes"}`;
  const ordersTxt = stats ? `${(stats.orders.value ?? 0).toLocaleString("es-MX")} pedidos` : "sin pedidos";

  return (
    <Card className="mb-4 overflow-hidden">
      {/* Cabecera del reporte */}
      <div
        className="flex flex-wrap items-start justify-between gap-4 border-b px-4 py-4 md:px-5"
        style={{ borderColor: "var(--bd-1)" }}
      >
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Pill tone="ac">
              <Sparkles size={11} /> DATOS EN VIVO
            </Pill>
            <span className="font-mono text-[10px] tracking-[.1em] text-tx-dim">
              {PERIOD_LABEL[period].toUpperCase()}
            </span>
          </div>
          <h2 className="font-display text-lg font-extrabold text-tx-hi">Ventas por sucursal · período {period}</h2>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-tx-mut">
            <span>{sedesTxt}</span>
            <span className="text-tx-dim">·</span>
            <span>{ordersTxt}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <IconButton icon={Save} label="Guardar reporte" onClick={onSave} />
          <IconButton icon={Share2} label="Copiar enlace al reporte" onClick={onShare} />
          <IconButton icon={Download} label="Descargar / imprimir como PDF" onClick={onExport} />
        </div>
      </div>

      {/* KPIs del período */}
      <KpiStrip stats={stats} />

      {/* Cuerpo */}
      <div className="p-4 md:p-5">
        {/* Resumen ejecutivo — se genera bajo demanda desde el chat de Mesero */}
        <div
          className="mb-5 rounded-ds-lg px-4 py-4"
          style={{
            background: "linear-gradient(180deg,var(--accent-soft),transparent),var(--surf-2)",
            border: "1px solid var(--bd-2)",
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <IconBadge icon={Sparkles} tone="ac" size={24} />
            <h3 className="font-display text-[13px] font-extrabold text-tx-hi">Resumen ejecutivo · Mesero</h3>
          </div>
          <p className="text-[13px] leading-relaxed text-tx-mid">
            {stats
              ? `En el período actual se registraron ${(stats.orders.value ?? 0).toLocaleString("es-MX")} pedidos y $${(stats.sales.value ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })} en ventas, con ticket promedio de $${stats.averageTicket?.value ?? 0}. Usa el chat de Mesero para generar un análisis detallado sobre este reporte.`
              : "Aún no hay datos suficientes para generar un resumen. Pregúntale a Mesero desde el panel derecho cuando quieras un análisis personalizado."}
          </p>
        </div>

        {/* Evolución diaria */}
        <SectionTitle>Evolución diaria · ventas {daily ? `(últimos ${daily.days} días)` : ""}</SectionTitle>
        <DailySalesChart daily={daily} loading={loading} />

        {/* Desempeño por sede */}
        <SectionTitle className="mt-6">Desempeño por sede</SectionTitle>
        <SedesTable sedes={sedes} loading={loading} />

        {/* Top productos + acciones sugeridas */}
        <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
          <div>
            <SectionTitle>Top productos del período</SectionTitle>
            <TopItemsList items={topItems} loading={loading} />
          </div>
          <div>
            <SectionTitle>Acciones sugeridas</SectionTitle>
            <SuggestedActions actions={actions} loading={loading} onAct={onAskAction} />
          </div>
        </div>
      </div>
    </Card>
  );
}
