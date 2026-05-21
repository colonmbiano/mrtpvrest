"use client";
import React, { useMemo, useState } from "react";
import { X, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import type {
  Modifier,
  ModifierGroup,
  ModifierSelection,
  Product,
} from "@/store/ticketStore";

const COMPLEMENTS_GROUP_ID = "__complements";
export const COMPLEMENT_MODIFIER_PREFIX = "complement:";

interface ModifierPickerModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (mods: ModifierSelection[], unitExtra: number, notes?: string) => void;
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
  const groups = useMemo(() => {
    const baseGroups = product.modifierGroups || [];
    const complements = (product.complements || []).filter((c) => c.isAvailable !== false);
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

  // Nota libre para cocina (ej. "sin cebolla", "término medio"). Vive en
  // el item ya creado y la imprime el printer service junto al modificador.
  const [notes, setNotes] = useState("");

  // Reset cuando cambia el producto. Render-phase (ver CategoryModal):
  // equivalente al efecto pero sin set-state-in-effect.
  const [prevGroups, setPrevGroups] = useState(groups);
  if (prevGroups !== groups) {
    setPrevGroups(groups);
    const init: Record<string, Modifier[]> = {};
    for (const g of groups) {
      const defaults = g.modifiers.filter((m) => m.isDefault);
      init[g.id] = g.multiSelect ? defaults : defaults.slice(0, 1);
    }
    setSelections(init);
    setNotes("");
  }

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
    onConfirm(flat, unitExtra, notes.trim() || undefined);
  }

  return (
    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-[#0a0a0c]/95 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg bg-[#121316] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
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
          {/* Nota para cocina — siempre visible al final del scroll. La
              cocina la imprime en la comanda resaltada y el cajero puede
              dejarla vacía para items sin instrucciones especiales. */}
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
                      <span className="ml-1 text-amber-500 text-[12px]">*</span>
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
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all active:scale-95 duration-150 min-h-[64px] ${
                          isOn
                            ? "border-amber-500 bg-amber-500/10 text-amber-500"
                            : "border-white/5 bg-[#121316] text-zinc-300"
                        }`}
                      >
                        <div
                          className={`w-5 h-5 ${
                            g.multiSelect ? "rounded-md" : "rounded-full"
                          } flex items-center justify-center shrink-0 ${
                            isOn
                              ? "bg-amber-500 text-black"
                              : "bg-[#0a0a0c] border border-white/10"
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

          <div className="space-y-2">
            <h3 className="text-[14px] font-black text-tx-pri">
              Nota para cocina
              <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-tx-mut">
                Opcional
              </span>
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 200))}
              placeholder="Sin cebolla, término medio, alergia a..."
              rows={2}
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-lg text-[13px] resize-none outline-none bg-[#0a0a0c] border border-white/10 text-white placeholder:text-zinc-600 focus:border-amber-500 transition-colors"
            />
            {notes.length > 0 && (
              <p className="text-[10px] font-bold text-tx-mut text-right tabular-nums">
                {notes.length}/200
              </p>
            )}
          </div>
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
            className="min-h-[64px] text-xs font-black uppercase tracking-widest bg-amber-500 text-black shadow-[0_8px_32px_-10px_rgba(255,184,77,0.4)] active:scale-[0.97] transition-transform border-none"
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
