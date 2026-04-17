"use client";
import { useState } from "react";
import { IconClose } from "@/components/Icon";
import { fmt } from "@/lib/format";

type Variant = { id: string; name: string; price: number };
type MenuItem = {
  id: string; name: string; description?: string | null; price: number;
  promoPrice?: number | null; isPromo?: boolean; image?: string | null;
  variants: Variant[];
};

export function VariantPicker({ item, onClose, onAdd }: {
  item: MenuItem;
  onClose: () => void;
  onAdd: (variant: Variant | null) => void;
}) {
  const [selected, setSelected] = useState<Variant | null>(item.variants.length === 1 ? item.variants[0] : null);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 32 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surf)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", maxWidth: 560, width: "100%", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--font-display)" }}>{item.name}</div>
            {item.description && <div style={{ color: "var(--muted)", marginTop: 4 }}>{item.description}</div>}
          </div>
          <button onClick={onClose} style={{ all: "unset", cursor: "pointer", color: "var(--muted)" }}><IconClose size={28} /></button>
        </div>

        <div style={{ marginTop: 24, fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", letterSpacing: ".1em" }}>
          Elige una opción
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {item.variants.map((v) => (
            <button key={v.id} onClick={() => setSelected(v)}
              style={{ all: "unset", cursor: "pointer", padding: "16px 20px",
                border: `2px solid ${selected?.id === v.id ? "var(--brand-primary)" : "var(--border)"}`,
                borderRadius: "var(--radius-md)",
                background: selected?.id === v.id ? "color-mix(in srgb, var(--brand-primary) 10%, transparent)" : "var(--surf2)",
                display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700 }}>{v.name}</span>
              <span style={{ fontWeight: 900, color: "var(--brand-primary)", fontFamily: "var(--font-mono)" }}>{fmt(v.price)}</span>
            </button>
          ))}
        </div>

        <button
          disabled={!selected && item.variants.length > 0}
          onClick={() => onAdd(selected)}
          style={{
            marginTop: 24, width: "100%", padding: 18,
            background: "var(--brand-primary)", color: "var(--bg)",
            border: "none", borderRadius: "var(--radius-md)",
            fontSize: 18, fontWeight: 900, cursor: "pointer",
            opacity: !selected && item.variants.length > 0 ? 0.4 : 1,
          }}
        >
          Agregar al pedido
        </button>
      </div>
    </div>
  );
}
