"use client";
import React from "react";
import { X } from "lucide-react";
import type { Product, MenuItemVariant } from "@/store/ticketStore";

interface VariantPickerModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (variant: MenuItemVariant) => void;
}

export default function VariantPickerModal({
  product,
  onClose,
  onConfirm,
}: VariantPickerModalProps) {
  const variants = product.variants ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg bg-surf-1 border border-bd rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-bd flex items-center justify-between shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="eyebrow">ELIGE TAMAÑO</span>
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

        <div className="flex-1 overflow-y-auto p-5">
          {variants.length === 0 ? (
            <p className="text-center text-tx-mut text-[13px] font-bold py-8">
              Este producto no tiene variantes configuradas.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onConfirm(v)}
                  className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-2xl border border-bd bg-surf-2 hover:bg-surf-3 active:scale-95 transition-pos"
                >
                  <span className="text-[15px] font-black text-tx-pri text-center">
                    {v.name}
                  </span>
                  <span className="text-[18px] font-black mono tnum tracking-tighter text-iris-500">
                    ${v.price.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
