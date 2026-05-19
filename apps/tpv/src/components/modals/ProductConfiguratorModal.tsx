"use client";
import React, { useMemo, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import Button from "@/components/ui/Button";
import type {
  MenuItemVariant,
  Modifier,
  ModifierGroup,
  ModifierSelection,
  Product,
} from "@/store/ticketStore";

const COMPLEMENTS_GROUP_ID = "__complements";
export const COMPLEMENT_MODIFIER_PREFIX = "complement:";

interface ProductConfiguratorModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (payload: {
    variant: MenuItemVariant | null;
    modifiers: ModifierSelection[];
    unitPrice: number;
    notes?: string;
  }) => void;
}

function computeUnitExtra(
  groups: ModifierGroup[],
  selectionsByGroup: Record<string, Modifier[]>,
): number {
  let extra = 0;
  for (const g of groups) {
    const sel = selectionsByGroup[g.id] || [];
    const free = g.freeModifiersLimit || 0;
    const sorted = [...sel].sort((a, b) => a.priceAdd - b.priceAdd);
    sorted.forEach((m, idx) => {
      if (idx >= free) extra += m.priceAdd;
    });
  }
  return extra;
}

export default function ProductConfiguratorModal({
  product,
  onClose,
  onConfirm,
}: ProductConfiguratorModalProps) {
  const variants = useMemo(
    () => (product.variants ?? []).filter((v) => v.isAvailable !== false),
    [product],
  );

  const groups = useMemo(() => {
    const baseGroups = product.modifierGroups || [];
    const complements = (product.complements || []).filter(
      (c) => c.isAvailable !== false,
    );
    if (complements.length === 0) return baseGroups;

    const complementGroup: ModifierGroup = {
      id: COMPLEMENTS_GROUP_ID,
      name: "Complementos",
      required: false,
      multiSelect: true,
      minSelection: 0,
      maxSelection: 0,
      freeModifiersLimit: 0,
      modifiers: complements.map((c) => ({
        id: `${COMPLEMENT_MODIFIER_PREFIX}${c.id}`,
        groupId: COMPLEMENTS_GROUP_ID,
        name: c.name,
        priceAdd: Number(c.price || 0),
      })),
    };

    return [...baseGroups, complementGroup];
  }, [product]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selections, setSelections] = useState<Record<string, Modifier[]>>(() => {
    const init: Record<string, Modifier[]> = {};
    for (const g of groups) {
      const defaults = g.modifiers.filter((m) => m.isDefault);
      init[g.id] = g.multiSelect ? defaults : defaults.slice(0, 1);
    }
    return init;
  });

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? null,
    [selectedVariantId, variants],
  );

  const basePrice = selectedVariant?.price ?? product.promoPrice ?? product.price;
  const unitExtra = useMemo(
    () => computeUnitExtra(groups, selections),
    [groups, selections],
  );
  const unitPrice = basePrice + unitExtra;
  const totalPrice = unitPrice * quantity;

  const validationError = useMemo(() => {
    if (variants.length > 0 && !selectedVariant) {
      return "Selecciona una variante";
    }
    for (const g of groups) {
      const count = (selections[g.id] || []).length;
      const min = Math.max(g.required ? 1 : 0, g.minSelection || 0);
      if (count < min) {
        return `Selecciona ${min} en "${g.name}"`;
      }
      if (g.maxSelection > 0 && count > g.maxSelection) {
        return `Max ${g.maxSelection} en "${g.name}"`;
      }
    }
    return null;
  }, [groups, selections, selectedVariant, variants.length]);

  function toggle(group: ModifierGroup, mod: Modifier) {
    setSelections((prev) => {
      const current = prev[group.id] || [];
      const isSelected = current.some((m) => m.id === mod.id);
      if (group.multiSelect) {
        if (isSelected) {
          return { ...prev, [group.id]: current.filter((m) => m.id !== mod.id) };
        }
        if (group.maxSelection > 0 && current.length >= group.maxSelection) {
          return prev;
        }
        return { ...prev, [group.id]: [...current, mod] };
      }
      if (isSelected) {
        return group.required ? prev : { ...prev, [group.id]: [] };
      }
      return { ...prev, [group.id]: [mod] };
    });
  }

  function confirm() {
    if (validationError) return;

    const flat: ModifierSelection[] = [];
    for (const g of groups) {
      for (const m of selections[g.id] || []) {
        flat.push({
          id: m.id,
          groupId: g.id,
          name: m.name,
          priceAdd: m.priceAdd,
        });
      }
    }

    for (let i = 0; i < quantity; i += 1) {
      onConfirm({
        variant: selectedVariant,
        modifiers: flat,
        unitPrice,
        notes: notes.trim() || undefined,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-bd bg-surf-1 shadow-2xl animate-in slide-in-from-bottom duration-200 sm:max-w-3xl sm:rounded-2xl sm:zoom-in-95">
        <div className="flex shrink-0 items-center justify-between border-b border-bd px-5 py-4">
          <div className="min-w-0 flex flex-col">
            <span className="eyebrow">CONFIGURAR PRODUCTO</span>
            <h2 className="truncate text-[18px] font-black">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-surf-2 text-tx-mut transition-pos hover:bg-surf-3"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {variants.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[14px] font-black text-tx-pri">Variantes</h3>
                <span className="eyebrow text-tx-mut">Elige 1</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {variants.map((variant) => {
                  const isSelected = selectedVariantId === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-4 transition-pos active:scale-95 ${
                        isSelected
                          ? "border-iris-500 bg-iris-500/10"
                          : "border-bd bg-surf-2 hover:bg-surf-3"
                      }`}
                    >
                      <span className="text-center text-[14px] font-black">
                        {variant.name}
                      </span>
                      <span className="mono tnum tracking-tighter text-[16px] font-black text-iris-500">
                        ${variant.price.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {groups.map((g) => {
            const selected = selections[g.id] || [];
            const selectedIds = new Set(selected.map((m) => m.id));
            const min = Math.max(g.required ? 1 : 0, g.minSelection || 0);
            const max = g.maxSelection || 0;
            const free = g.freeModifiersLimit || 0;

            return (
              <section key={g.id} className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[14px] font-black text-tx-pri">
                    {g.name}
                    {g.required && (
                      <span className="ml-1 text-[12px] text-iris-500">*</span>
                    )}
                  </h3>
                  <span className="eyebrow text-tx-mut">
                    {g.multiSelect
                      ? `${min > 0 ? `Min ${min} / ` : ""}${max > 0 ? `Max ${max}` : "Varios"}`
                      : "Elige 1"}
                    {free > 0 ? ` / ${free} sin costo` : ""}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {g.modifiers.map((m) => {
                    const isOn = selectedIds.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(g, m)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-pos ${
                          isOn
                            ? "border-iris-500 bg-iris-500/10"
                            : "border-bd bg-surf-2 hover:bg-surf-3"
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                            g.multiSelect ? "rounded-md" : "rounded-full"
                          } ${
                            isOn
                              ? "bg-iris-500 text-white"
                              : "border border-bd bg-surf-1"
                          }`}
                        >
                          {isOn && <Check size={12} strokeWidth={3} />}
                        </div>
                        <span className="flex-1 text-[14px] font-bold">{m.name}</span>
                        <span
                          className={`mono tnum shrink-0 text-[12px] font-black ${
                            m.priceAdd > 0 ? "text-tx-sec" : "text-success"
                          }`}
                        >
                          {m.priceAdd > 0 ? `+$${m.priceAdd.toFixed(2)}` : "Sin costo"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-black text-tx-pri">Cantidad</h3>
              <span className="eyebrow text-tx-mut">Ajusta antes de agregar</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-bd bg-surf-2 p-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-bd bg-surf-1"
              >
                <Minus size={16} />
              </button>
              <span className="mono tnum w-12 text-center text-[18px] font-black">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-bd bg-surf-1"
              >
                <Plus size={16} />
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[14px] font-black text-tx-pri">
              Nota para cocina
              <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-tx-mut">
                Opcional
              </span>
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 200))}
              placeholder="Sin cebolla, termino medio, alergia a..."
              rows={2}
              maxLength={200}
              className="w-full resize-none rounded-lg border border-bd bg-surf-2 px-3 py-2.5 text-[13px] text-tx-pri outline-none placeholder:text-tx-mut focus:border-iris-500"
            />
          </section>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-bd bg-surf-2/50 px-5 py-4">
          {validationError && (
            <p className="text-[12px] font-bold text-danger">{validationError}</p>
          )}
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <span className="eyebrow">Total</span>
              <p className="text-[12px] font-bold text-tx-mut">
                ${unitPrice.toFixed(2)} por unidad
              </p>
            </div>
            <span className="mono tnum tracking-tighter text-[28px] font-black">
              ${totalPrice.toFixed(2)}
            </span>
          </div>
          <Button
            variant="primary"
            size="xl"
            fullWidth
            className="h-12 text-xs font-black uppercase tracking-widest"
            onClick={confirm}
            disabled={!!validationError}
          >
            Agregar al ticket
          </Button>
        </div>
      </div>
    </div>
  );
}
