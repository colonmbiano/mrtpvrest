"use client";

import { Card, ProgressBar, SectionHead } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import type { TopItem } from "./types";

/* Ranking de platillos más vendidos del periodo. */
export default function TopItemsCard({ items }: { items: TopItem[] }) {
  const maxQuantity = Math.max(1, ...items.map((item) => item.quantity));
  return (
    <div>
      <SectionHead title="Top platillos" action="Ver menú" href="/admin/menu" />
      <Card className="overflow-hidden px-4 md:px-5">
        {items.length === 0 ? (
          <div className="py-6 text-center text-sm text-tx-mut">
            Aún no hay ventas de platillos en este periodo.
          </div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.name}
              className="flex min-h-[70px] items-center gap-3 py-3"
              style={{ borderBottom: index < items.length - 1 ? "1px solid var(--bd-1)" : "none" }}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] font-mono text-xs font-bold text-primary"
                style={{ background: "var(--accent-soft)" }}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-tx">{item.name}</div>
                <div className="mt-2">
                  <ProgressBar pct={Math.max(8, (item.quantity / maxQuantity) * 100)} />
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs font-semibold text-tx-hi">{formatMoney(item.revenue, false)}</div>
                <div className="mt-1 font-mono text-[10px] text-tx-mut">{item.quantity} ud</div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
