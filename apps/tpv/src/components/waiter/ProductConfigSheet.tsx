"use client";
import React, { useMemo, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import type {
  MenuItemVariant,
  Modifier,
  ModifierGroup,
  ModifierSelection,
  Product,
} from "@/store/ticketStore";
import {
  buildOptionGroups,
  computeUnitExtra,
  flattenSelections,
  getValidationError,
} from "@/lib/modifiers";

/**
 * ProductConfigSheet — bottom sheet de variantes/modificadores/complementos
 * para la pantalla de meseros. Misma lógica de agrupado, precio y validación
 * que el configurador del POS principal (helpers compartidos en
 * lib/modifiers.ts), con el lenguaje visual del módulo de meseros
 * (obsidiana + ámbar, bordes 3xl).
 *
 * El precio que muestra es informativo: el backend SIEMPRE re-lee precios de
 * DB al crear la orden o la ronda.
 */
export default function ProductConfigSheet({
  product,
  onClose,
  onConfirm,
}: {
  product: Product;
  onClose: () => void;
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
    variants[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selections, setSelections] = useState<Record<string, Modifier[]>>(() => {
    const out: Record<string, Modifier[]> = {};
    for (const group of groups) {
      const defaults = group.modifiers.filter((modifier) => modifier.isDefault);
      out[group.id] = group.multiSelect ? defaults : defaults.slice(0, 1);
    }
    return out;
  });

  const selectedVariant = useMemo(
    () =>
      variantMultiSelect
        ? null
        : variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [selectedVariantId, variantMultiSelect, variants],
  );
  const basePrice = Number(selectedVariant?.price ?? product.promoPrice ?? product.price ?? 0);
  const unitPrice = basePrice + computeUnitExtra(groups, selections);
  const totalPrice = unitPrice * quantity;
  const validationError = getValidationError(
    groups,
    selections,
    variants.length,
    selectedVariant,
    variantMultiSelect,
  );

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
    onConfirm({
      variant: selectedVariant,
      modifiers: flattenSelections(groups, selections),
      unitPrice,
      quantity,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[88%] bg-[var(--bg)] border-t border-white/10 rounded-t-3xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Configurar producto
            </div>
            <div className="text-[16px] font-black truncate">{product.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-12 h-12 min-h-[48px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-transform"
          >
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide">
          {!variantMultiSelect && variants.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                  Variantes
                </span>
                <span className="text-[10px] font-bold text-white/30 uppercase">Elige 1</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {variants.map((variant) => {
                  const active = selectedVariantId === variant.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`min-h-[64px] rounded-2xl border p-3 text-left active:scale-[0.98] transition-transform ${
                        active
                          ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]"
                          : "bg-white/5 border-white/10 text-white/80"
                      }`}
                    >
                      <span className="block text-[13px] font-black truncate">{variant.name}</span>
                      <span className="block tabular-nums text-[13px] font-bold opacity-80">
                        ${Number(variant.price || 0).toFixed(0)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {groups.map((group) => {
            const selectedIds = new Set((selections[group.id] || []).map((modifier) => modifier.id));
            const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
            const max = group.maxSelection || 0;
            const free = group.freeModifiersLimit || 0;
            const helper = `${
              group.multiSelect
                ? `${min > 0 ? `Min ${min} / ` : ""}${max > 0 ? `Max ${max}` : "Varios"}`
                : "Elige 1"
            }${free > 0 ? ` / ${free} sin costo` : ""}`;
            return (
              <section key={group.id} className="space-y-2">
                <div className="flex items-baseline justify-between px-1">
                  <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
                    {group.name}
                  </span>
                  <span className="text-[10px] font-bold text-white/30 uppercase">{helper}</span>
                </div>
                <div className="space-y-2">
                  {group.modifiers.map((modifier) => {
                    const active = selectedIds.has(modifier.id);
                    return (
                      <button
                        key={modifier.id}
                        type="button"
                        onClick={() => toggle(group, modifier)}
                        className={`w-full min-h-[52px] flex items-center gap-3 rounded-2xl border px-3 text-left active:scale-[0.99] transition-transform ${
                          active
                            ? "bg-[var(--brand-soft)] border-[var(--brand)] text-[var(--brand)]"
                            : "bg-white/5 border-white/10 text-white/80"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center ${
                            group.multiSelect ? "rounded-md" : "rounded-full"
                          } ${active ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "border border-white/20 bg-white/5"}`}
                        >
                          {active && <Check size={14} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] font-bold truncate">
                          {modifier.name}
                        </span>
                        <span className="tabular-nums text-[12px] font-black shrink-0">
                          {modifier.priceAdd > 0 ? `+$${modifier.priceAdd.toFixed(0)}` : "$0"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="space-y-2">
            <span className="block px-1 text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Cantidad
            </span>
            <div className="inline-flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-2">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Restar"
                className="w-12 h-12 min-h-[48px] rounded-xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
              >
                <Minus size={16} />
              </button>
              <span className="tabular-nums text-[20px] font-black w-10 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                aria-label="Sumar"
                className="w-12 h-12 min-h-[48px] rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)] text-[var(--brand)] flex items-center justify-center active:scale-95 transition-transform"
              >
                <Plus size={16} />
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <span className="block px-1 text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Nota para cocina · opcional
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, 200))}
              placeholder="Sin cebolla, término medio, alergia..."
              rows={2}
              maxLength={200}
              className="w-full resize-none rounded-2xl bg-white/5 border border-white/10 px-3 py-3 text-[13px] font-bold text-white outline-none placeholder:text-white/30 focus:border-[var(--brand)]"
            />
          </section>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-white/5 space-y-2 shrink-0 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          {validationError && (
            <p className="text-[12px] font-bold text-red-400">{validationError}</p>
          )}
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-black tracking-[0.2em] text-white/40 uppercase">
                Total
              </div>
              <div className="text-[12px] font-bold text-white/50 tabular-nums">
                ${unitPrice.toFixed(2)} c/u
              </div>
            </div>
            <span className="tabular-nums text-2xl font-black">${totalPrice.toFixed(2)}</span>
            <button
              type="button"
              onClick={confirm}
              disabled={!!validationError}
              className="h-14 min-h-[56px] px-6 rounded-2xl bg-[var(--brand)] text-[var(--brand-fg)] text-[12px] font-black uppercase tracking-[0.1em] active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
