"use client";
import React, { useEffect, useMemo, useState } from "react";
import { X, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import type {
  Modifier,
  ModifierGroup,
  ModifierSelection,
  Product,
} from "@/store/ticketStore";

interface ModifierPickerModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (mods: ModifierSelection[], unitExtra: number) => void;
}

function computeUnitExtra(
  groups: ModifierGroup[],
  selectionsByGroup: Record<string, Modifier[]>
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

export default function ModifierPickerModal({
  product,
  onClose,
  onConfirm,
}: ModifierPickerModalProps) {
  const groups = useMemo(() => product.modifierGroups || [], [product]);

  // Inicializa con los modificadores marcados como isDefault, respetando
  // single-select (toma el primer default) y multi-select (todos los defaults).
  const [selections, setSelections] = useState<Record<string, Modifier[]>>(
    () => {
      const init: Record<string, Modifier[]> = {};
      for (const g of groups) {
        const defaults = g.modifiers.filter((m) => m.isDefault);
        if (g.multiSelect) init[g.id] = defaults;
        else init[g.id] = defaults.slice(0, 1);
      }
      return init;
    }
  );

  // Reset cuando cambia el producto
  useEffect(() => {
    const init: Record<string, Modifier[]> = {};
    for (const g of groups) {
      const defaults = g.modifiers.filter((m) => m.isDefault);
      init[g.id] = g.multiSelect ? defaults : defaults.slice(0, 1);
    }
    setSelections(init);
  }, [groups]);

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
      // single-select: si está ya marcado y no es required → permite des-marcar
      if (isSelected) {
        return group.required ? prev : { ...prev, [group.id]: [] };
      }
      return { ...prev, [group.id]: [mod] };
    });
  }

  const validationError = useMemo(() => {
    for (const g of groups) {
      const count = (selections[g.id] || []).length;
      const min = Math.max(g.required ? 1 : 0, g.minSelection || 0);
      if (count < min) {
        return `Selecciona ${min} en "${g.name}"`;
      }
      if (g.maxSelection > 0 && count > g.maxSelection) {
        return `Máx ${g.maxSelection} en "${g.name}"`;
      }
    }
    return null;
  }, [groups, selections]);

  const unitExtra = useMemo(
    () => computeUnitExtra(groups, selections),
    [groups, selections]
  );

  const basePrice = product.promoPrice || product.price;

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
    onConfirm(flat, unitExtra);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg bg-surf-1 border border-bd rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-bd flex items-center justify-between shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="eyebrow">PERSONALIZAR</span>
            <h2 className="text-[18px] font-black truncate">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-surf-2 hover:bg-surf-3 flex items-center justify-center text-tx-mut transition-pos"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {groups.map((g) => {
            const selected = selections[g.id] || [];
            const selectedIds = new Set(selected.map((m) => m.id));
            const min = Math.max(g.required ? 1 : 0, g.minSelection || 0);
            const max = g.maxSelection || 0;
            const free = g.freeModifiersLimit || 0;

            return (
              <div key={g.id} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[14px] font-black text-tx-pri">
                    {g.name}
                    {g.required && (
                      <span className="ml-1 text-iris-500 text-[12px]">*</span>
                    )}
                  </h3>
                  <span className="eyebrow text-tx-mut">
                    {g.multiSelect
                      ? `${min > 0 ? `Min ${min} · ` : ""}${
                          max > 0 ? `Máx ${max}` : "Varios"
                        }`
                      : "Elige 1"}
                    {free > 0 ? ` · ${free} sin costo` : ""}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  {g.modifiers.map((m) => {
                    const isOn = selectedIds.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(g, m)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-pos ${
                          isOn
                            ? "border-iris-500 bg-iris-500/10"
                            : "border-bd bg-surf-2 hover:bg-surf-3"
                        }`}
                      >
                        <div
                          className={`w-5 h-5 ${
                            g.multiSelect ? "rounded-md" : "rounded-full"
                          } flex items-center justify-center shrink-0 ${
                            isOn
                              ? "bg-iris-500 text-white"
                              : "bg-surf-1 border border-bd"
                          }`}
                        >
                          {isOn && <Check size={12} strokeWidth={3} />}
                        </div>
                        <span className="flex-1 text-[14px] font-bold">
                          {m.name}
                        </span>
                        <span
                          className={`text-[12px] font-black mono tnum shrink-0 ${
                            m.priceAdd > 0 ? "text-tx-sec" : "text-success"
                          }`}
                        >
                          {m.priceAdd > 0
                            ? `+$${m.priceAdd.toFixed(2)}`
                            : "Sin costo"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-bd bg-surf-2/50 shrink-0 flex flex-col gap-3">
          {validationError && (
            <p className="text-[12px] font-bold text-danger">
              {validationError}
            </p>
          )}
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">TOTAL UNIDAD</span>
            <span className="text-[24px] font-black mono tnum tracking-tighter">
              ${(basePrice + unitExtra).toFixed(2)}
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
