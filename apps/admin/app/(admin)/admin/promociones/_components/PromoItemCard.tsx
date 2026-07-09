"use client";
import { Utensils } from "lucide-react";
import { Card, Pill, Toggle } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { type PromoItem, discountPct } from "./types";

export function PromoItemCard({
  item,
  togglingItem,
  onToggle,
}: {
  item: PromoItem;
  togglingItem: string | null;
  onToggle: (item: PromoItem) => void;
}) {
  return (
    <Card className="flex gap-3 p-4" style={item.isPromo ? { borderColor: "var(--accent-soft)" } : undefined}>
      {/* Imagen */}
      <div
        className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-ds-lg"
        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <Utensils size={22} className="text-tx-dim" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-extrabold text-tx-hi">{item.name}</div>
            <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-tx-dim">
              {item.category.name}
            </div>
          </div>
          <Toggle
            checked={item.isPromo}
            onChange={() => {
              if (togglingItem !== item.id) onToggle(item);
            }}
            label={item.isPromo ? "Desactivar promo" : "Activar promo"}
          />
        </div>

        {item.isPromo && item.promoPrice && (
          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-xs text-tx-dim line-through">{formatMoney(item.price)}</span>
            <span className="font-display text-sm font-extrabold text-primary">{formatMoney(item.promoPrice)}</span>
            <Pill tone="ac">-{discountPct(item.price, item.promoPrice)}%</Pill>
          </div>
        )}

        <div className="mt-2 flex items-center gap-5 border-t pt-2" style={{ borderColor: "var(--bd-1)" }}>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-tx-dim">Vendidos 7d</div>
            <div
              className="font-display text-sm font-extrabold"
              style={{ color: item.soldLast7Days < 5 ? "var(--err)" : "var(--ok)" }}
            >
              {item.soldLast7Days}
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-tx-dim">Actualizado</div>
            <div className="text-[10.5px] text-tx-mut">
              {new Date(item.updatedAt).toLocaleDateString("es-MX", {
                timeZone: "America/Mexico_City",
                day: "2-digit",
                month: "short",
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
