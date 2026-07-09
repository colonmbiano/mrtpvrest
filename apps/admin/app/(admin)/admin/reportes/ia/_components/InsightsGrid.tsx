"use client";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";
import { Button, Card, IconBadge, TONE_BG, TONE_FG } from "@/components/ds";
import { INSIGHT_TONE, PERIOD_LABEL, type Insight, type Period } from "./types";

/* Insights detectados automáticamente (GET /api/dashboard/insights). */
export function InsightsGrid({
  insights,
  loading,
  period,
  onAct,
  onDismiss,
  onMore,
}: {
  insights: Insight[];
  loading: boolean;
  period: Period;
  onAct: (insight: Insight) => void;
  onDismiss: (title: string) => void;
  onMore: () => void;
}) {
  return (
    <section className="mb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold text-tx-hi">Insights que encontré para ti</h2>
          <p className="mt-0.5 text-xs text-tx-mut">Detectados automáticamente en {PERIOD_LABEL[period].toLowerCase()}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onMore}>
          Pedir más →
        </Button>
      </div>

      {insights.length === 0 ? (
        <Card className="px-5 py-8 text-center text-[13px] text-tx-mut">
          {loading ? "Analizando datos del período…" : "Aún no hay insights automáticos para este período."}
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
          {insights.map((ins) => {
            const tone = INSIGHT_TONE[ins.variant] ?? "ac";
            const Icon = ins.variant === "warn" ? TrendingDown : ins.variant === "ok" ? TrendingUp : Activity;
            return (
              <Card
                key={ins.title}
                className="relative overflow-hidden p-4"
                style={{
                  borderColor: TONE_FG[tone],
                  background: `linear-gradient(180deg,${TONE_BG[tone]},transparent 60%),var(--surf-1)`,
                }}
              >
                <div
                  className="pointer-events-none absolute -right-5 -top-5 h-20 w-20 rounded-full opacity-50 blur-[30px]"
                  style={{ background: TONE_BG[tone] }}
                />
                <div className="relative">
                  <div className="mb-2 flex items-center gap-2">
                    <IconBadge icon={Icon} tone={tone} size={28} />
                    <span
                      className="font-mono text-[9px] font-bold uppercase tracking-[.14em]"
                      style={{ color: TONE_FG[tone] }}
                    >
                      {ins.kind}
                    </span>
                  </div>
                  <h3 className="mb-1.5 font-display text-[15px] font-extrabold leading-tight text-tx-hi">{ins.title}</h3>
                  <p className="mb-3 text-xs leading-relaxed text-tx-mid">{ins.body}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => onAct(ins)}>
                      {ins.cta}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onDismiss(ins.title)}>
                      Ignorar
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
