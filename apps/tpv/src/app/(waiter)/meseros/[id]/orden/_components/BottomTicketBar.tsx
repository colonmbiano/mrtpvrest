"use client";
import { ChevronLeft, Send } from "lucide-react";
import Button from "@/components/ui/Button";

type Props = {
  count: number;
  total: number;
  submitting: boolean;
  onOpenSheet: () => void;
  onSend: () => void;
};

export default function BottomTicketBar({ count, total, submitting, onOpenSheet, onSend }: Props) {
  const empty = count === 0;
  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-bd bg-surf-1 flex flex-col gap-3 shadow-2xl backdrop-blur-xl">
      <button
        onClick={onOpenSheet}
        disabled={empty}
        className="h-12 bg-surf-2 border border-bd rounded-2xl flex items-center px-4 gap-3 active:scale-95 transition-all disabled:opacity-50"
      >
        <div className="w-7 h-7 rounded-lg bg-iris-soft text-iris-500 flex items-center justify-center font-black text-xs">
          {count}
        </div>
        <div className="flex-1 text-left">
          <div className="text-[10px] font-bold text-tx-dis uppercase tracking-tighter leading-none">
            Comanda
          </div>
          <div className="mono tnum text-[14px] font-black">${total.toFixed(2)}</div>
        </div>
        <ChevronLeft className="rotate-90 text-tx-dis" size={16} />
      </button>

      <Button
        variant="primary"
        fullWidth
        size="xl"
        className="h-14 font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-lg shadow-iris-glow disabled:opacity-50"
        disabled={empty || submitting}
        onClick={onSend}
      >
        <Send size={18} />
        {submitting ? "Enviando..." : "Enviar a cocina"}
      </Button>
    </div>
  );
}
