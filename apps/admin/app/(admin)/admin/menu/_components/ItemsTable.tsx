"use client";
import Image from "next/image";
import { Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { Card, Pill } from "@/components/ds";

/* Lista de artículos: tabla en desktop (≥ md), tarjetas en móvil. Incluye
   selección múltiple, toggle de disponibilidad, editar y eliminar. */
export function ItemsTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onToggleAvailable,
  onEdit,
  onDelete,
}: {
  items: any[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleAvailable: (item: any) => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}) {
  const allSelected = items.length > 0 && selectedIds.size === items.length;
  return (
    <>
      {/* Tabla (desktop ≥ md) */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="grid grid-cols-12 gap-3 px-4 py-3 font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim"
          style={{ background: "var(--surf-2)", borderBottom: "1px solid var(--bd-1)" }}>
          <div className="col-span-1 flex items-center gap-2">
            <input type="checkbox" className="cursor-pointer rounded accent-[var(--brand-primary)]"
              checked={allSelected}
              onChange={onToggleSelectAll} />
          </div>
          <span className="col-span-3">Nombre del artículo</span>
          <span className="col-span-2">Categoría</span>
          <span className="col-span-1 text-right">Precio</span>
          <span className="col-span-2 text-center">Estado</span>
          <span className="col-span-3 text-right">Acciones</span>
        </div>

        {items.map((item, idx) => {
          const sel = selectedIds.has(item.id);
          return (
            <div key={item.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 transition-all"
              style={{ borderBottom: "1px solid var(--bd-1)", background: sel ? "var(--accent-soft)" : idx % 2 === 0 ? "transparent" : "var(--surf-1)", opacity: item.isAvailable ? 1 : 0.5 }}>
              <div className="col-span-1 flex items-center gap-2">
                <input type="checkbox" className="cursor-pointer rounded accent-[var(--brand-primary)]"
                  checked={sel} onChange={() => onToggleSelect(item.id)} />
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-ds-sm" style={{ background: "var(--surf-2)" }}>
                  {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={32} height={32} className={`h-full w-full ${item.imageFit === "contain" ? "object-contain" : "object-cover"}`} /> : <UtensilsCrossed size={15} className="text-tx-mut" />}
                </div>
              </div>
              <div className="col-span-3 truncate font-display text-sm font-bold text-tx-hi">{item.name}</div>
              <div className="col-span-2 text-xs font-medium text-tx-mut">{item.category?.name || "—"}</div>
              <div className="col-span-1 text-right font-mono text-sm font-bold text-primary">${item.price}</div>
              <div className="col-span-2 flex flex-wrap items-center justify-center gap-1">
                <button onClick={() => onToggleAvailable(item)} aria-label={item.isAvailable ? "Desactivar" : "Activar"}>
                  <Pill tone={item.isAvailable ? "ok" : "err"}>{item.isAvailable ? "Activo" : "Inactivo"}</Pill>
                </button>
                {item.availableOnline === false && <Pill tone="neutral">Sin web</Pill>}
                {item.availableOnKiosk === false && <Pill tone="neutral">Sin kiosko</Pill>}
              </div>
              <div className="col-span-3 flex justify-end gap-2">
                <button onClick={() => onEdit(item)} className="flex min-h-9 items-center gap-1.5 rounded-ds-sm px-3 text-xs font-bold text-tx-mut" style={{ border: "1px solid var(--bd-1)" }}>
                  <Pencil size={13} /> Editar
                </button>
                <button onClick={() => onDelete(item)} aria-label="Eliminar" className="grid h-9 w-9 place-items-center rounded-ds-sm" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Tarjetas (mobile < md) */}
      <div className="flex flex-col gap-2 pb-2 md:hidden">
        {items.length > 0 && (
          <button type="button" onClick={onToggleSelectAll}
            className="flex items-center gap-2 px-2 py-2 text-left">
            <input type="checkbox" className="h-4 w-4 cursor-pointer rounded accent-[var(--brand-primary)]"
              checked={allSelected}
              onChange={onToggleSelectAll} onClick={e => e.stopPropagation()} />
            <span className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
              Seleccionar todos
            </span>
          </button>
        )}
        {items.map((item) => {
          const sel = selectedIds.has(item.id);
          return (
            <Card key={item.id} className="p-3"
              style={{ borderColor: sel ? "var(--brand-primary)" : undefined, background: sel ? "var(--accent-soft)" : undefined, opacity: item.isAvailable ? 1 : 0.55 }}>
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer rounded accent-[var(--brand-primary)]"
                  checked={sel} onChange={() => onToggleSelect(item.id)} />
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-ds-md" style={{ background: "var(--surf-2)" }}>
                  {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={48} height={48} className={`h-full w-full ${item.imageFit === "contain" ? "object-contain" : "object-cover"}`} /> : <UtensilsCrossed size={20} className="text-tx-mut" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-sm font-extrabold leading-tight text-tx-hi">{item.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-tx-mut">{item.category?.name || "—"}</span>
                    <span className="font-mono text-sm font-bold text-primary">${item.price}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={() => onToggleAvailable(item)} aria-label={item.isAvailable ? "Desactivar" : "Activar"}>
                  <Pill tone={item.isAvailable ? "ok" : "err"}>{item.isAvailable ? "Activo" : "Inactivo"}</Pill>
                </button>
                {item.availableOnline === false && <Pill tone="neutral">Sin web</Pill>}
                {item.availableOnKiosk === false && <Pill tone="neutral">Sin kiosko</Pill>}
                <button onClick={() => onEdit(item)} className="ml-auto flex min-h-9 items-center gap-1.5 rounded-ds-sm px-3 text-xs font-bold text-tx-mut" style={{ border: "1px solid var(--bd-1)" }}>
                  <Pencil size={13} /> Editar
                </button>
                <button onClick={() => onDelete(item)} aria-label="Eliminar" className="grid h-9 w-9 place-items-center rounded-ds-sm" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
