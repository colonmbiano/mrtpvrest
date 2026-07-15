"use client";
// Botón de "me gusta" para un platillo. Optimista: pinta el cambio al instante
// y lo reconcilia con el conteo real del server; si falla, revierte. Se usa en
// las tarjetas de los temas y en el modal del producto (superficie compartida).

import { useEffect, useState } from "react";
import { hasReacted, toggleReaction } from "@/lib/reactions";

export function ReactionButton({
  slug,
  itemId,
  initialCount = 0,
  accent = "#ef4444",
  size = "sm",
}: {
  slug: string;
  itemId: string;
  initialCount?: number;
  accent?: string;
  size?: "sm" | "md";
}) {
  const [count, setCount] = useState(initialCount);
  const [reacted, setReacted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReacted(hasReacted(itemId));
  }, [itemId]);

  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    setBusy(true);

    const wasReacted = reacted;
    // Optimista.
    setReacted(!wasReacted);
    setCount((c) => Math.max(0, c + (wasReacted ? -1 : 1)));

    const data = await toggleReaction(slug, itemId);
    if (data) {
      setCount(data.reactionCount);
      setReacted(data.reacted);
    } else {
      // Revertir en caso de error de red.
      setReacted(wasReacted);
      setCount((c) => Math.max(0, c + (wasReacted ? 1 : -1)));
    }
    setBusy(false);
  }

  const px = size === "md" ? 20 : 16;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={reacted}
      aria-label={reacted ? "Quitar me gusta" : "Me gusta"}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition-transform active:scale-90"
      style={{
        background: reacted ? accent : "rgba(0,0,0,0.06)",
        color: reacted ? "#fff" : "inherit",
        backdropFilter: "blur(4px)",
      }}
    >
      <svg width={px} height={px} viewBox="0 0 24 24"
        fill={reacted ? "#fff" : "none"} stroke={reacted ? "#fff" : "currentColor"}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
