"use client";
import { ShoppingCart, MessageCircle, RotateCw } from "lucide-react";
import { Card, Pill, EmptyState, SectionLabel } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import type { SuggestionGroup } from "./shared";

export function ShoppingList({
  shoppingList,
  shoppingLoading,
  onRefresh,
}: {
  shoppingList: SuggestionGroup[] | null;
  shoppingLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionLabel>Sugerencias por consumo (últimos 30 días)</SectionLabel>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Recalcular"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-ds-md text-tx-mut"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
        >
          <RotateCw size={16} className={shoppingLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {shoppingLoading ? (
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-ds-lg bg-surf-2" />)}
        </div>
      ) : !shoppingList || shoppingList.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Sin compras sugeridas"
          hint="Cuando tus insumos se acerquen al mínimo según su consumo, las sugerencias aparecerán aquí." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shoppingList.map((group, gi) => {
            const phone = group.supplier?.phone?.replace(/\D/g, "");
            return (
              <Card key={group.supplier?.id || `nogroup-${gi}`} className="overflow-hidden p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-display text-base font-extrabold text-tx-hi">
                        {group.supplier?.name || "Sin proveedor asignado"}
                      </span>
                      {group.urgentCount > 0 && <Pill tone="err" live>{group.urgentCount} urgente{group.urgentCount !== 1 ? "s" : ""}</Pill>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-tx-mut">
                      {group.items.length} insumo{group.items.length !== 1 ? "s" : ""}
                      {group.belowMinOrder && " · bajo el mínimo de pedido"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-base font-extrabold text-primary">{formatMoney(group.totalAmount)}</div>
                    <div className="text-[10px] text-tx-dim">estimado</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {group.items.map((it) => (
                    <div
                      key={it.ingredient.id}
                      className="flex items-center justify-between gap-3 rounded-ds-md px-3 py-2"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-tx">{it.ingredient.name}</span>
                          <Pill tone={it.urgency === "URGENTE" ? "err" : "warn"}>{it.urgency === "URGENTE" ? "Urgente" : "Pronto"}</Pill>
                        </div>
                        <div className="text-[10.5px] text-tx-mut">
                          Stock {it.ingredient.stock} · {it.daysOfStock != null ? `${it.daysOfStock.toFixed(1)} días` : "sin consumo"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[13px] font-bold text-tx">
                          {it.qtySuggestedPurchase} {it.purchaseUnit || it.ingredient.unit}
                        </div>
                        <div className="font-mono text-[10px] text-tx-mut">{formatMoney(it.lineTotal)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {phone && (
                  <a
                    href={`https://wa.me/${phone}`}
                    target="_blank" rel="noopener noreferrer"
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-ds-md text-[13px] font-bold"
                    style={{ background: "var(--ok-soft)", color: "var(--ok)" }}
                  >
                    <MessageCircle size={16} /> Pedir por WhatsApp
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
