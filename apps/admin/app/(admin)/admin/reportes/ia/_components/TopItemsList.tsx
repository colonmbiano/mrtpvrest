"use client";
import { formatMoney, formatNumber } from "@/lib/format";
import type { TopItem } from "./types";

/* Ranking de productos (GET /api/dashboard/top-items?limit=5). */
export function TopItemsList({ items, loading }: { items: TopItem[]; loading: boolean }) {
  return (
    <div className="rounded-ds-lg px-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      {items.length === 0 && (
        <div className="py-7 text-center text-[13px] text-tx-mut">
          {loading ? "Cargando top productos…" : "Sin pedidos suficientes para el ranking"}
        </div>
      )}
      {items.map((p, i) => (
        <div
          key={p.id ?? p.name}
          className="flex items-center justify-between gap-3 py-2.5"
          style={{ borderBottom: i < items.length - 1 ? "1px solid var(--bd-1)" : "none" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="w-6 shrink-0 font-mono text-[11px] font-bold text-primary">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-tx">{p.name}</div>
              <div className="text-[11px] text-tx-mut">{formatNumber(p.quantity ?? 0)} unidades</div>
            </div>
          </div>
          <div className="shrink-0 font-mono font-semibold text-tx-hi">{formatMoney(p.revenue ?? 0, false)}</div>
        </div>
      ))}
    </div>
  );
}
