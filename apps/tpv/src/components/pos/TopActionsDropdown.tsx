"use client";
import React, { useState, useRef, useEffect } from "react";
import { 
  MoreVertical, 
  Trash2, 
  Printer, 
  SplitSquareHorizontal, 
  ArrowRightLeft, 
  RefreshCw,
  Wallet,
  Receipt,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  onClearTicket: () => void;
  onOpenDrawer?: () => void;
  onReprintKitchen?: () => void;
  onReprintReceipt?: () => void;
  onSync?: () => void;
  onSplitTicket?: () => void;
  onMoveTicket?: () => void;
  onOpenCatalogSettings?: () => void;
  hasItems: boolean;
}

export default function TopActionsDropdown({
  onClearTicket,
  onOpenDrawer,
  onReprintKitchen,
  onReprintReceipt,
  onSync,
  onSplitTicket,
  onMoveTicket,
  onOpenCatalogSettings,
  hasItems
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAction = (action?: () => void) => {
    setIsOpen(false);
    if (action) {
      action();
    } else {
      toast.info("Función no implementada");
    }
  };

  return (
    <div className="relative z-50" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#6b5641] bg-[#1e1b18] text-[#f8e8d0] shadow-[0_4px_12px_rgba(44,31,19,0.22)] transition-all active:scale-95 hover:border-[#ff8400]/60 hover:text-[#ffb84d]"
      >
        <MoreVertical size={20} />
      </button>

      {isOpen && (
        <div className="absolute top-12 right-0 w-56 bg-[#121316] border border-white/10 rounded-2xl shadow-2xl p-2 flex flex-col gap-1 overflow-hidden origin-top-right animate-in fade-in zoom-in-95 duration-200">
          <button
            onClick={() => handleAction(onOpenCatalogSettings)}
            className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-amber-300 transition-all active:scale-95 hover:bg-amber-500/15"
          >
            <SlidersHorizontal size={16} />
            <span className="text-xs font-bold">Vista catálogo</span>
          </button>

          <button
            onClick={() => handleAction(onOpenDrawer)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all active:scale-95"
          >
            <Wallet size={16} />
            <span className="text-xs font-bold">Abrir cajón</span>
          </button>
          
          <button
            onClick={() => handleAction(onReprintKitchen)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all active:scale-95"
          >
            <Printer size={16} />
            <span className="text-xs font-bold">Reimprimir pedido</span>
          </button>

          <button
            onClick={() => handleAction(onReprintReceipt)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all active:scale-95"
          >
            <Receipt size={16} />
            <span className="text-xs font-bold">Reimprimir cuenta</span>
          </button>

          <button
            onClick={() => handleAction(onSync)}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all active:scale-95"
          >
            <RefreshCw size={16} />
            <span className="text-xs font-bold">Sincronizar</span>
          </button>

          <div className="h-[1px] w-full bg-white/5 my-1" />

          <button
            onClick={() => handleAction(onSplitTicket)}
            disabled={!hasItems}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            <SplitSquareHorizontal size={16} />
            <span className="text-xs font-bold">Dividir ticket</span>
          </button>

          <button
            onClick={() => handleAction(onMoveTicket)}
            disabled={!hasItems}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            <ArrowRightLeft size={16} />
            <span className="text-xs font-bold">Mover ticket</span>
          </button>

          <button
            onClick={() => handleAction(onClearTicket)}
            disabled={!hasItems}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-red-500 hover:bg-red-500/10 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 mt-1"
          >
            <Trash2 size={16} />
            <span className="text-xs font-bold">Despejar ticket</span>
          </button>
        </div>
      )}
    </div>
  );
}
