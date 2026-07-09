"use client";
import { TrendingUp } from "lucide-react";
import { Card, IconBadge, EmptyState } from "@/components/ds";
import { movMeta, fmtDate, type Movement } from "./shared";

export function MovementsList({ movements, loading }: { movements: Movement[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-4 grid grid-cols-1 gap-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-ds-md bg-surf-2" />)}
      </div>
    );
  }
  if (movements.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState icon={TrendingUp} title="Sin movimientos" hint="Las entradas, salidas y ajustes de stock aparecerán aquí." />
      </div>
    );
  }
  return (
    <Card className="mt-4 overflow-hidden">
      {movements.map((mov, idx) => {
        const meta = movMeta(mov.type);
        const Icon = meta.icon;
        return (
          <div
            key={mov.id}
            className="flex items-center gap-3 px-3.5 py-3"
            style={idx === movements.length - 1 ? {} : { borderBottom: "1px solid var(--bd-1)" }}
          >
            <IconBadge icon={Icon} tone={meta.tone} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-tx">
                {mov.ingredient?.name || "Insumo"}
              </div>
              <div className="truncate text-[11px] text-tx-mut">
                {meta.label} · {fmtDate(mov.createdAt)}
                {mov.reason ? ` · ${mov.reason}` : ""}
              </div>
            </div>
            <span
              className="shrink-0 font-mono text-sm font-bold"
              style={{ color: `var(--${meta.tone === "ok" ? "ok" : meta.tone === "err" ? "err" : "info"})` }}
            >
              {mov.type === "OUT" ? "−" : mov.type === "IN" ? "+" : "="}{mov.quantity} {mov.ingredient?.unit || ""}
            </span>
          </div>
        );
      })}
    </Card>
  );
}
