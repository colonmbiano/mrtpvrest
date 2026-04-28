"use client";
import { Minus, Plus, X } from "lucide-react";
import type { CartLine } from "../_lib/types";

type Props = {
  tableId: string;
  cart: CartLine[];
  total: number;
  onClose: () => void;
  onChangeQty: (menuItemId: string, delta: number) => void;
  onRemove: (menuItemId: string) => void;
};

export default function CartSheet({ tableId, cart, total, onClose, onChangeQty, onRemove }: Props) {
  return (
    <div
      className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="absolute bottom-0 left-0 right-0 max-h-[80%] bg-surf-1 border-t border-bd rounded-t-3xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-bd flex items-center justify-between">
          <div>
            <div className="eyebrow !text-[10px]">COMANDA</div>
            <div className="text-[16px] font-black">Mesa {tableId}</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-surf-2 border border-bd flex items-center justify-center text-tx-sec"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
          {cart.map((l) => (
            <div
              key={l.menuItemId}
              className="flex items-center gap-3 p-3 rounded-2xl bg-surf-2 border border-bd"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold truncate">{l.name}</div>
                <div className="mono tnum text-[12px] text-tx-mut">${l.price.toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onChangeQty(l.menuItemId, -1)}
                  className="w-8 h-8 rounded-lg bg-surf-3 border border-bd flex items-center justify-center"
                >
                  <Minus size={14} />
                </button>
                <span className="mono tnum text-[14px] font-black w-6 text-center">
                  {l.quantity}
                </span>
                <button
                  onClick={() => onChangeQty(l.menuItemId, 1)}
                  className="w-8 h-8 rounded-lg bg-iris-soft border border-iris-500 text-iris-500 flex items-center justify-center"
                >
                  <Plus size={14} />
                </button>
                <button
                  onClick={() => onRemove(l.menuItemId)}
                  className="ml-1 w-8 h-8 rounded-lg bg-surf-3 border border-bd flex items-center justify-center text-tx-mut"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-bd flex items-center justify-between">
          <div className="eyebrow !text-[10px]">TOTAL</div>
          <div className="mono tnum text-2xl font-black">${total.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
