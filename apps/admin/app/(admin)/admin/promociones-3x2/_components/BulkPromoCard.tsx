"use client";
import { Layers, Pencil, Trash2 } from "lucide-react";
import { Card, Pill, Toggle, Button, IconBadge } from "@/components/ds";
import { type BulkPromo, timeWindowLabel } from "./types";

export function BulkPromoCard({
  promo,
  onToggle,
  onEdit,
  onRemove,
}: {
  promo: BulkPromo;
  onToggle: (promo: BulkPromo) => void;
  onEdit: (promo: BulkPromo) => void;
  onRemove: (promo: BulkPromo) => void;
}) {
  const window = timeWindowLabel(promo);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconBadge icon={Layers} tone={promo.isActive ? "ac" : "neutral"} />
          <div className="min-w-0">
            <div className="truncate font-display text-base font-extrabold text-tx-hi">{promo.name}</div>
            <div className="mt-0.5 font-mono text-[11px] text-tx-mut">
              {promo.buyQuantity}x{promo.payQuantity} · paga {promo.payQuantity} de cada {promo.buyQuantity}
              {window ? ` · ${window}` : ""}
            </div>
          </div>
        </div>
        <Pill tone={promo.isActive ? "ok" : "neutral"} live={promo.isActive}>
          {promo.isActive ? "Activa" : "Pausada"}
        </Pill>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Layers size={13} className="text-tx-dim" />
        {promo.categories.length === 0 ? (
          <span className="text-[12px] text-tx-mut">Sin categorías</span>
        ) : (
          promo.categories.map((c) => (
            <span
              key={c.id}
              className="rounded-full px-2 py-[3px] text-[11px] font-semibold"
              style={{ background: "var(--surf-2)", color: "var(--tx)" }}
            >
              {c.name || "—"}
            </span>
          ))
        )}
      </div>

      <div className="mt-1 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--bd-1)" }}>
        <div className="flex items-center gap-2">
          <Toggle checked={promo.isActive} onChange={() => onToggle(promo)} label="Activar promo" />
          <span className="text-[12px] text-tx-mut">{promo.isActive ? "Activa" : "Pausada"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(promo)}>
            Editar
          </Button>
          <Button variant="danger" size="sm" icon={Trash2} onClick={() => onRemove(promo)}>
            <span className="sr-only">Eliminar</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
