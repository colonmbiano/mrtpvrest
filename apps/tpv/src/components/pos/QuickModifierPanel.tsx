import React, { useState, useMemo } from "react";
import { Plus, Minus, ChevronLeft, X, Check, Delete } from "lucide-react";
import { type Product, type ModifierGroup, type ModifierSelection, type CartItem, type MenuItemVariant, type Modifier } from "@/store/ticketStore";
import { computeUnitExtra, buildOptionGroups, getValidationError, flattenSelections } from "@/lib/modifiers";
import { formatModifierGroupName } from "@/lib/formatDisplayName";

export type ConfiguratorInitial = { variant?: MenuItemVariant | null; selectedModifiers?: ModifierSelection[] };

export function QuickModifierPanel({
  product,
  initial,
  submitLabel = "Agregar",
  onBack,
  onConfirm,
}: {
  product: Product;
  initial?: ConfiguratorInitial | null;
  submitLabel?: string;
  onBack: () => void;
  onConfirm: (payload: {
    variant: MenuItemVariant | null;
    modifiers: ModifierSelection[];
    unitPrice: number;
    quantity: number;
    notes?: string;
  }) => void;
}) {
  const variants = useMemo(
    () => (product.variants ?? []).filter((variant) => variant.isAvailable !== false),
    [product],
  );
  const variantMultiSelect = !!product.variantMultiSelect && variants.length > 0;
  const groups = useMemo(
    () => buildOptionGroups(product, variants, variantMultiSelect),
    [product, variantMultiSelect, variants],
  );

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initial?.variantId ?? variants[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  // Teclado numérico de cantidad (estilo Loyverse): teclear el número
  // directo en vez de tocar +/− N veces. qtyEntry "" = mostrando el valor
  // del stepper; el primer dígito reemplaza. Entero 1-99.
  const [qtyEntry, setQtyEntry] = useState("");
  const [showQtyPad, setShowQtyPad] = useState(false);
  const stepQty = (next: number) => {
    setQuantity(Math.max(1, Math.min(99, next)));
    setQtyEntry("");
  };
  const pressQtyDigit = (d: string) => {
    const candidate = (qtyEntry === "" ? "" : qtyEntry) + d;
    const num = parseInt(candidate, 10);
    if (Number.isNaN(num) || num > 99) return;
    setQtyEntry(candidate);
    setQuantity(Math.max(1, num));
  };
  const pressQtyBackspace = () => {
    const candidate = qtyEntry.slice(0, -1);
    setQtyEntry(candidate);
    setQuantity(candidate === "" ? 1 : Math.max(1, parseInt(candidate, 10) || 1));
  };
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [selections, setSelections] = useState<Record<string, Modifier[]>>(() => {
    // Modo edición: pre-marcamos los modificadores que el item ya traía.
    // Modo alta: usamos los modificadores marcados como default.
    const initialIds = initial?.selectedModifierIds
      ? new Set(initial.selectedModifierIds)
      : null;
    const out: Record<string, Modifier[]> = {};
    for (const group of groups) {
      if (initialIds) {
        const matched = group.modifiers.filter((modifier) => initialIds.has(modifier.id));
        out[group.id] = group.multiSelect ? matched : matched.slice(0, 1);
      } else {
        const defaults = group.modifiers.filter((modifier) => modifier.isDefault);
        out[group.id] = group.multiSelect ? defaults : defaults.slice(0, 1);
      }
    }
    return out;
  });

  const selectedVariant = useMemo(
    () => (variantMultiSelect ? null : variants.find((variant) => variant.id === selectedVariantId) ?? null),
    [selectedVariantId, variantMultiSelect, variants],
  );
  const basePrice = Number(selectedVariant?.price ?? product.promoPrice ?? product.price ?? 0);
  const unitPrice = basePrice + computeUnitExtra(groups, selections);
  const totalPrice = unitPrice * quantity;
  const validationError = getValidationError(groups, selections, variants.length, selectedVariant, variantMultiSelect);

  const toggle = (group: ModifierGroup, modifier: Modifier) => {
    setSelections((prev) => {
      const current = prev[group.id] || [];
      const isSelected = current.some((item) => item.id === modifier.id);
      if (group.multiSelect) {
        if (isSelected) return { ...prev, [group.id]: current.filter((item) => item.id !== modifier.id) };
        if (group.maxSelection > 0 && current.length >= group.maxSelection) return prev;
        return { ...prev, [group.id]: [...current, modifier] };
      }

      if (isSelected) return group.required ? prev : { ...prev, [group.id]: [] };
      return { ...prev, [group.id]: [modifier] };
    });
  };

  const confirm = () => {
    if (validationError) return;
    const modifiers = flattenSelections(groups, selections);
    onConfirm({
      variant: selectedVariant,
      modifiers,
      unitPrice,
      quantity,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border-2 border-bd bg-surf-1">
      <header className="flex shrink-0 items-center gap-3 border-b border-bd px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-surf-2 text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
          aria-label="Volver al catalogo"
        >
          <ChevronLeft size={23} strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase text-tx-mut">
            {initial ? "Editar producto" : "Modificadores rapidos"}
          </p>
          <h2 className="truncate text-[22px] font-black text-tx-pri">{product.name}</h2>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-surf-2 text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
          aria-label="Cerrar modificadores"
        >
          <X size={21} strokeWidth={3} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!variantMultiSelect && variants.length > 0 && (
          <OptionSection title="Variantes" helper="Elige 1">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {variants.map((variant) => {
                const active = selectedVariantId === variant.id;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setSelectedVariantId(variant.id)}
                    className={`min-h-20 rounded-lg border-2 p-3 text-left focus:outline-none focus:ring-2 focus:ring-iris-500 ${
                      active
                        ? "border-green-700 bg-green-500 text-black"
                        : "border-bd bg-surf-2 text-tx-pri active:bg-surf-3"
                    }`}
                  >
                    <span className="block text-[16px] font-black">{variant.name}</span>
                    <span className="mt-1 block text-[18px] font-black tabular-nums">
                      ${Number(variant.price || 0).toFixed(0)}
                    </span>
                  </button>
                );
              })}
            </div>
          </OptionSection>
        )}

        {groups.map((group) => {
          const selectedIds = new Set((selections[group.id] || []).map((modifier) => modifier.id));
          const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
          const max = group.maxSelection || 0;
          const free = group.freeModifiersLimit || 0;
          return (
            <OptionSection
              key={group.id}
              title={formatModifierGroupName(group.name)}
              helper={`${group.multiSelect ? `${min > 0 ? `Min ${min} / ` : ""}${max > 0 ? `Max ${max}` : "Varios"}` : "Elige 1"}${free > 0 ? ` / ${free} sin costo` : ""}`}
            >
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {group.modifiers.map((modifier) => {
                  const active = selectedIds.has(modifier.id);
                  const isFree = modifier.isKitchenNote || modifier.priceAdd === 0;
                  return (
                    <button
                      key={modifier.id}
                      type="button"
                      onClick={() => toggle(group, modifier)}
                      className={`flex min-h-16 items-center gap-3 rounded-lg border-2 px-3 text-left focus:outline-none focus:ring-2 focus:ring-iris-500 ${
                        active
                          ? "border-green-700 bg-green-500 text-black"
                          : isFree
                          ? "border-dashed border-bd-strong bg-surf-1 text-tx-pri active:bg-surf-2"
                          : "border-bd bg-surf-2 text-tx-pri active:bg-surf-3"
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center ${group.multiSelect ? "rounded-md" : "rounded-full"} ${active ? "bg-black text-white" : "border-2 border-bd-strong bg-surf-1"}`}>
                        {active && <Check size={15} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="text-[15px] font-black">{modifier.name}</span>
                        {isFree && <span className="rounded bg-surf-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-tx-mut">Nota</span>}
                      </span>
                      {!isFree && (
                        <span className="text-[14px] font-semibold tabular-nums">
                          +${modifier.priceAdd.toFixed(0)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </OptionSection>
          );
        })}

        <OptionSection title="Cantidad" helper="Toca el número para teclear">
          <div className="inline-flex items-center gap-2 rounded-lg border-2 border-bd bg-surf-2 p-2">
            <button
              type="button"
              onClick={() => stepQty(quantity - 1)}
              className="flex h-12 w-12 items-center justify-center rounded-md bg-surf-1 text-tx-pri active:bg-surf-3"
            >
              <Minus size={20} strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={() => setShowQtyPad((open) => !open)}
              aria-label="Teclear cantidad"
              className={`w-16 rounded-md text-center text-[24px] font-black tabular-nums text-tx-pri active:bg-surf-3 ${showQtyPad ? "bg-surf-3 ring-2 ring-iris-500" : ""}`}
            >
              {quantity}
            </button>
            <button
              type="button"
              onClick={() => stepQty(quantity + 1)}
              className="flex h-12 w-12 items-center justify-center rounded-md bg-surf-1 text-tx-pri active:bg-surf-3"
            >
              <Plus size={20} strokeWidth={3} />
            </button>
          </div>

          {showQtyPad && (
            <div className="mt-3 grid w-full max-w-[320px] grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pressQtyDigit(d)}
                  className="flex h-14 items-center justify-center rounded-lg border-2 border-bd bg-surf-2 text-[22px] font-black tabular-nums text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => stepQty(1)}
                className="flex h-14 items-center justify-center rounded-lg border-2 border-bd bg-surf-1 text-[13px] font-semibold uppercase text-tx-mut active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
              >
                C
              </button>
              <button
                type="button"
                onClick={() => pressQtyDigit("0")}
                className="flex h-14 items-center justify-center rounded-lg border-2 border-bd bg-surf-2 text-[22px] font-black tabular-nums text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
              >
                0
              </button>
              <button
                type="button"
                onClick={pressQtyBackspace}
                aria-label="Borrar"
                className="flex h-14 items-center justify-center rounded-lg border-2 border-bd bg-surf-2 text-tx-pri active:bg-surf-3 focus:outline-none focus:ring-2 focus:ring-iris-500"
              >
                <Delete size={22} strokeWidth={2.4} />
              </button>
            </div>
          )}
        </OptionSection>

        <OptionSection title="Nota para cocina" helper="Opcional">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value.slice(0, 200))}
            placeholder="Sin cebolla, termino medio, alergia..."
            rows={2}
            maxLength={200}
            className="w-full resize-none rounded-lg border-2 border-bd bg-surf-2 px-3 py-3 text-[15px] font-bold text-tx-pri outline-none placeholder:text-tx-mut focus:border-iris-500"
          />
        </OptionSection>
      </div>

      <footer className="shrink-0 border-t border-bd bg-surf-1 p-4">
        {validationError && <p className="mb-2 text-[13px] font-semibold text-danger">{validationError}</p>}
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase text-tx-mut">Total configurado</p>
            <p className="text-[15px] font-bold text-tx-sec">${unitPrice.toFixed(2)} por unidad</p>
          </div>
          <span className="text-[28px] font-black tabular-nums text-tx-pri">${totalPrice.toFixed(2)}</span>
          <button
            type="button"
            onClick={confirm}
            disabled={!!validationError}
            className="h-16 min-w-[210px] rounded-lg bg-green-500 px-5 text-[15px] font-black uppercase text-black active:bg-green-600 disabled:opacity-40 disabled:grayscale focus:outline-none focus:ring-2 focus:ring-iris-500"
          >
            {submitLabel}
          </button>
        </div>
      </footer>
    </section>
  );
}

export function OptionSection({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[17px] font-black text-tx-pri">{title}</h3>
        <span className="text-[11px] font-semibold uppercase text-tx-mut">{helper}</span>
      </div>
      {children}
    </section>
  );
}

