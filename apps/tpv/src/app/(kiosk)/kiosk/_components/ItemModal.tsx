"use client";
import { useState } from "react";
import type { CartItem, MenuItem } from "../_lib/types";
import { formatPrice } from "../_lib/format";

type Props = {
  item: MenuItem;
  onClose: () => void;
  onAdd: (mods: CartItem["modifiers"]) => void;
};

export default function ItemModal({ item, onClose, onAdd }: Props) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  function toggleMod(groupId: string, modId: string, maxSel: number) {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(modId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== modId) };
      }
      if (maxSel === 1) return { ...prev, [groupId]: [modId] };
      if (current.length >= maxSel) return prev;
      return { ...prev, [groupId]: [...current, modId] };
    });
  }

  function buildModifiers(): CartItem["modifiers"] {
    const mods: CartItem["modifiers"] = [];
    for (const group of item.modifierGroups) {
      for (const modId of selected[group.id] ?? []) {
        const mod = group.modifiers.find((m) => m.id === modId);
        if (mod) mods.push({ modifierId: mod.id, name: mod.name, price: mod.price });
      }
    }
    return mods;
  }

  const extraTotal = buildModifiers().reduce((s, m) => s + m.price, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.name} className="w-full h-48 object-cover rounded-t-3xl" />
        )}
        <div className="p-5">
          <h2 className="text-xl font-black text-white">{item.name}</h2>
          {item.description && <p className="text-gray-400 text-sm mt-1">{item.description}</p>}
          <p className="text-green-400 font-black text-xl mt-2">
            {formatPrice(item.price + extraTotal)}
          </p>

          {item.modifierGroups.map((group) => (
            <div key={group.id} className="mt-4">
              <p className="font-bold text-white text-sm mb-2">
                {group.name}
                {group.required && <span className="ml-1 text-red-400 text-xs">*requerido</span>}
              </p>
              <div className="flex flex-col gap-1.5">
                {group.modifiers.map((mod) => {
                  const isSelected = (selected[group.id] ?? []).includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleMod(group.id, mod.id, group.maxSelections || 1)}
                      className="flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
                      style={{
                        background: isSelected ? "#22c55e22" : "#1f2937",
                        border: `2px solid ${isSelected ? "#22c55e" : "transparent"}`,
                      }}
                    >
                      <span className="text-white text-sm">{mod.name}</span>
                      <span className="text-gray-400 text-sm">
                        {mod.price > 0 ? `+${formatPrice(mod.price)}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-2xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onAdd(buildModifiers())}
              className="flex-1 py-3 bg-green-500 hover:bg-green-400 text-black font-black rounded-2xl transition-colors"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
