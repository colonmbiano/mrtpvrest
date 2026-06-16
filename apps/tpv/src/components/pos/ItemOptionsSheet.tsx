"use client";
import React from "react";
import { Star, EyeOff, Eye, X } from "lucide-react";
import type { Product } from "@/store/ticketStore";

interface ItemOptionsSheetProps {
  product: Product;
  onClose: () => void;
  onToggleAvailable: (next: boolean) => void | Promise<void>;
  onToggleFavorite: (next: boolean) => void | Promise<void>;
}

/**
 * ItemOptionsSheet — bottom-sheet contextual que abre el cajero con
 * long-press sobre una tarjeta de producto. Permite acciones rápidas
 * sin salir del catálogo:
 *
 *  - Toggle disponibilidad (isAvailable). Cuando un platillo se acaba,
 *    el cajero lo marca agotado en 2 toques sin entrar a admin/menu.
 *  - Toggle favorito (isFavorite). Pinea el item en el atajo "Top".
 *
 * El sheet se cierra al ejecutar cualquier acción y al tocar el backdrop.
 */
export default function ItemOptionsSheet({
  product,
  onClose,
  onToggleAvailable,
  onToggleFavorite,
}: ItemOptionsSheetProps) {
  const available = product.isAvailable !== false;
  const favorite = !!product.isFavorite;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-md bg-[var(--bg)] border-t border-white/10 rounded-t-3xl shadow-2xl flex flex-col p-5 gap-3 animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-black tracking-[0.25em] text-white/40 uppercase">
              Acciones rápidas
            </span>
            <h3 className="text-lg font-black text-white truncate">
              {product.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 min-h-[44px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={async () => {
            await onToggleAvailable(!available);
            onClose();
          }}
          className="flex items-center gap-3 px-4 py-4 min-h-[56px] rounded-2xl border active:scale-[0.99] transition-transform"
          style={{
            background: available
              ? "rgba(239,68,68,0.08)"
              : "rgba(34,197,94,0.08)",
            borderColor: available
              ? "rgba(239,68,68,0.25)"
              : "rgba(34,197,94,0.25)",
            color: available ? "#ef4444" : "#22c55e",
          }}
        >
          {available ? <EyeOff size={18} /> : <Eye size={18} />}
          <span className="font-black text-sm tracking-tight">
            {available ? "Marcar agotado" : "Marcar disponible"}
          </span>
        </button>

        <button
          type="button"
          onClick={async () => {
            await onToggleFavorite(!favorite);
            onClose();
          }}
          className="flex items-center gap-3 px-4 py-4 min-h-[56px] rounded-2xl border active:scale-[0.99] transition-transform"
          style={{
            background: favorite
              ? "var(--brand-soft)"
              : "rgba(255,255,255,0.04)",
            borderColor: favorite
              ? "var(--brand)"
              : "rgba(255,255,255,0.10)",
            color: favorite ? "var(--brand)" : "rgba(255,255,255,0.85)",
          }}
        >
          <Star
            size={18}
            strokeWidth={2.5}
            fill={favorite ? "currentColor" : "none"}
          />
          <span className="font-black text-sm tracking-tight">
            {favorite ? "Quitar de favoritos" : "Marcar como favorito"}
          </span>
        </button>

        <p className="text-[10px] font-bold text-white/30 px-1 leading-relaxed mt-1">
          Mantén presionada cualquier tarjeta para abrir este menú.
        </p>
      </div>
    </div>
  );
}
