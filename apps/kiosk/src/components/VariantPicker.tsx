"use client";
import { useMemo, useState } from "react";
import { IconClose } from "@/components/Icon";
import { fmt } from "@/lib/format";

type Variant = { id: string; name: string; price: number };
type Modifier = { id: string; name: string; priceAdd: number };
type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  minSelection: number;
  maxSelection: number;
  modifiers: Modifier[];
};
type MenuItem = {
  id: string; name: string; description?: string | null; price: number;
  promoPrice?: number | null; isPromo?: boolean; image?: string | null;
  variants: Variant[];
  modifierGroups?: ModifierGroup[];
};

export type PickerSelection = {
  variant: Variant | null;
  modifiers: Modifier[];
};

export function VariantPicker({ item, onClose, onAdd }: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (selection: PickerSelection) => void;
}) {
  const groups = item.modifierGroups || [];
  const hasVariants = item.variants.length > 0;
  const hasModifiers = groups.length > 0;

  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
    item.variants.length === 1 ? item.variants[0] : null,
  );
  // modifierIds seleccionados por groupId
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});

  function toggleModifier(group: ModifierGroup, mod: Modifier) {
    setSelectedByGroup((prev) => {
      const current = prev[group.id] || [];
      const isSelected = current.includes(mod.id);

      if (group.multiSelect) {
        // multi: toggle add/remove, respetando maxSelection
        if (isSelected) {
          return { ...prev, [group.id]: current.filter((id) => id !== mod.id) };
        }
        if (group.maxSelection > 0 && current.length >= group.maxSelection) {
          // no agregar si ya está en el límite
          return prev;
        }
        return { ...prev, [group.id]: [...current, mod.id] };
      } else {
        // single: reemplaza la selección
        return { ...prev, [group.id]: isSelected ? [] : [mod.id] };
      }
    });
  }

  // Validar required: cada grupo required debe tener al menos 1 selección
  const missingRequired = groups
    .filter((g) => g.required)
    .filter((g) => (selectedByGroup[g.id] || []).length === 0);

  const variantOk = !hasVariants || selectedVariant != null;
  const canAdd = variantOk && missingRequired.length === 0;

  const totalExtra = useMemo(() => {
    let extra = 0;
    for (const g of groups) {
      const selectedIds = selectedByGroup[g.id] || [];
      for (const id of selectedIds) {
        const mod = g.modifiers.find((m) => m.id === id);
        if (mod) extra += Number(mod.priceAdd || 0);
      }
    }
    return extra;
  }, [groups, selectedByGroup]);

  const basePrice = selectedVariant
    ? selectedVariant.price
    : (item.isPromo && item.promoPrice ? item.promoPrice : item.price);
  const totalPrice = basePrice + totalExtra;

  function confirm() {
    if (!canAdd) return;
    const modifierIds = Object.values(selectedByGroup).flat();
    const modifiers: Modifier[] = [];
    for (const g of groups) {
      for (const id of selectedByGroup[g.id] || []) {
        const m = g.modifiers.find((mm) => mm.id === id);
        if (m) modifiers.push(m);
      }
    }
    onAdd({ variant: selectedVariant, modifiers });
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 32 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", maxWidth: 620, width: "100%", maxHeight: "90vh", overflow: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--font-display)" }}>{item.name}</div>
            {item.description && <div style={{ color: "var(--muted)", marginTop: 4 }}>{item.description}</div>}
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "var(--muted)" }}><IconClose size={28} /></button>
        </div>

        {/* Variantes */}
        {hasVariants && (
          <>
            <div style={{ marginTop: 24, fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: ".1em" }}>
              Elige una opción
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {item.variants.map((v) => (
                <button key={v.id} onClick={() => setSelectedVariant(v)}
                  style={{ all: "unset", cursor: "pointer", padding: "16px 20px",
                    border: `2px solid ${selectedVariant?.id === v.id ? "var(--brand-primary)" : "var(--border)"}`,
                    borderRadius: "var(--radius-md)",
                    background: selectedVariant?.id === v.id ? "color-mix(in srgb, var(--brand-primary) 10%, transparent)" : "var(--surf2)",
                    display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700 }}>{v.name}</span>
                  <span style={{ fontWeight: 900, color: "var(--brand-primary)", fontFamily: "var(--font-mono)" }}>{fmt(v.price)}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Modificadores por grupo */}
        {hasModifiers && groups.map((group) => {
          const selectedIds = selectedByGroup[group.id] || [];
          const helperText = group.required
            ? group.multiSelect
              ? `Elige ${group.minSelection || 1}${group.maxSelection > 0 ? ` a ${group.maxSelection}` : "+"}`
              : "Requerido"
            : group.multiSelect
              ? group.maxSelection > 0 ? `Opcional · máx ${group.maxSelection}` : "Opcional · múltiples"
              : "Opcional";
          return (
            <div key={group.id} style={{ marginTop: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {group.name}
                </div>
                <span style={{ fontSize: 11, color: group.required ? "var(--brand-primary)" : "var(--muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
                  {helperText}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {group.modifiers.map((mod) => {
                  const isSelected = selectedIds.includes(mod.id);
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleModifier(group, mod)}
                      style={{
                        all: "unset", cursor: "pointer", padding: "12px 16px",
                        border: `2px solid ${isSelected ? "var(--brand-primary)" : "var(--border)"}`,
                        borderRadius: "var(--radius-md)",
                        background: isSelected ? "color-mix(in srgb, var(--brand-primary) 10%, transparent)" : "var(--surf2)",
                        display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: group.multiSelect ? 5 : "50%",
                          border: `2px solid ${isSelected ? "var(--brand-primary)" : "var(--muted)"}`,
                          background: isSelected ? "var(--brand-primary)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--bg)", fontSize: 14, fontWeight: 900,
                        }}>{isSelected ? "✓" : ""}</span>
                        <span style={{ fontWeight: 600 }}>{mod.name}</span>
                      </span>
                      {Number(mod.priceAdd) > 0 && (
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", fontSize: 14 }}>+{fmt(mod.priceAdd)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Total */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "2px solid var(--border2)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".1em", fontFamily: "var(--font-mono)" }}>Total</span>
          <span style={{ fontSize: 28, fontWeight: 900, color: "var(--brand-primary)", fontFamily: "var(--font-mono)" }}>{fmt(totalPrice)}</span>
        </div>

        <button
          disabled={!canAdd}
          onClick={confirm}
          style={{
            marginTop: 18, width: "100%", padding: 18,
            background: "var(--brand-primary)", color: "var(--bg)",
            border: "none", borderRadius: "var(--radius-md)",
            fontSize: 18, fontWeight: 900, cursor: canAdd ? "pointer" : "not-allowed",
            opacity: canAdd ? 1 : 0.4,
          }}
        >
          Agregar al pedido
        </button>
        {missingRequired.length > 0 && (
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--brand-primary)", textAlign: "center" }}>
            Elige una opción en: {missingRequired.map((g) => g.name).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
