"use client";
import { usePOSStore, type Palette } from "@/store/usePOSStore";

const PALETTES: { id: Palette; label: string; color: string }[] = [
  { id: "green",  label: "Verde",   color: "#10b981" },
  { id: "purple", label: "Morado",  color: "#7c3aed" },
  { id: "orange", label: "Naranja", color: "#ff5c35" },
];

export default function PaletteSwitcher({
  layout = "row",
  size = "md",
}: {
  layout?: "row" | "col";
  size?: "sm" | "md";
}) {
  const palette = usePOSStore((s) => s.palette);
  const setPalette = usePOSStore((s) => s.setPalette);
  const sm = size === "sm";
  const dim = sm ? 24 : 32;

  return (
    <div
      className={`flex gap-2 ${layout === "col" ? "flex-col" : "flex-row"}`}
      role="radiogroup"
      aria-label="Paleta de color"
    >
      {PALETTES.map((p) => {
        const active = palette === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setPalette(p.id)}
            title={p.label}
            role="radio"
            aria-checked={active}
            aria-label={p.label}
            className="rounded-full transition-all"
            style={{
              width: dim,
              height: dim,
              background: p.color,
              border: active ? "2px solid var(--text-primary)" : "2px solid var(--border)",
              outline: active ? `3px solid ${p.color}33` : "none",
              outlineOffset: 2,
            }}
          />
        );
      })}
    </div>
  );
}
