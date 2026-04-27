"use client";
import React from "react";
import { ChevronLeft, Plus, Banknote, Bell, Split, Move, Flame, Clock } from "lucide-react";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import TableIcon from "@/components/pos/TableIcon";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function WaiterTableDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const tableId = params.id;

  const MOCK_TABLE = {
    id: tableId,
    zone: 'Terraza',
    seats: 4,
    state: 'occupied',
    elapsed: 42,
    ticket: 542,
    since: '14:00',
    status: 'Ocupada',
    items: [
      { name: 'Taco al Pastor', qty: 3, price: 105 },
      { name: 'Agua de Jamaica', qty: 2, price: 76 },
      { name: 'Bowl de Pollo', qty: 1, price: 165 },
    ],
    alert: 'Pidió cuenta'
  };

  return (
    <div className="h-full flex flex-col bg-surf-0">
      {/* HEADER ESPECÍFICO */}
      <div className="p-4 border-b border-bd bg-surf-1 flex items-center gap-4 shrink-0">
        <button 
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl bg-surf-2 border border-bd flex items-center justify-center text-tx-sec active:scale-95 transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex flex-col">
          <span className="eyebrow !text-[10px]">{MOCK_TABLE.zone}</span>
          <h2 className="text-[18px] font-black leading-none">Mesa {MOCK_TABLE.id}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32 scrollbar-hide">
        {/* HERO CARD */}
        <div className="p-6 rounded-[2rem] bg-info-soft border-2 border-info flex items-center gap-6">
          <div className="w-20 h-20 bg-surf-1 rounded-3xl border-2 border-info flex items-center justify-center text-info font-black text-2xl shadow-xl shadow-info/10 shrink-0">
            {MOCK_TABLE.id}
          </div>
          <div className="flex-1 space-y-1">
            <div className="text-info font-black uppercase tracking-widest text-xs">Ocupada</div>
            <div className="text-[13px] font-bold text-tx-sec">
              {MOCK_TABLE.seats} comensales · desde {MOCK_TABLE.since}
            </div>
            <div className="mono tnum text-[12px] font-black text-info">
              {MOCK_TABLE.elapsed} min en mesa
            </div>
          </div>
        </div>

        {/* ALERTS */}
        {MOCK_TABLE.alert && (
          <div className="p-4 rounded-2xl bg-iris-soft border border-iris-500 flex items-center gap-3 animate-pulse">
            <Bell size={18} className="text-iris-500" />
            <span className="text-[13px] font-black text-iris-500 uppercase tracking-tight">
              {MOCK_TABLE.alert}
            </span>
          </div>
        )}

        {/* ACCOUNT SUMMARY */}
        <div className="p-6 rounded-[2rem] bg-surf-1 border border-bd space-y-6">
          <div className="flex justify-between items-end">
             <span className="eyebrow !text-[10px]">CUENTA ACUMULADA</span>
             <div className="mono tnum text-3xl font-black">${MOCK_TABLE.ticket}</div>
          </div>
          
          <div className="space-y-3">
            {MOCK_TABLE.items.map((item, i) => (
              <div key={i} className="flex justify-between items-baseline gap-4 text-[13px] font-bold">
                <span className="text-tx-sec truncate flex-1">
                  <span className="text-iris-500 mr-2">{item.qty}×</span>
                  {item.name}
                </span>
                <span className="mono tnum text-tx-pri">${item.price}</span>
              </div>
            ))}
          </div>
          
          <p className="text-[10px] text-tx-dis font-bold uppercase tracking-widest text-center pt-2">
            Los items se modifican desde el TPV principal
          </p>
        </div>

        {/* ACTIONS GRID */}
        <div className="grid grid-cols-2 gap-3">
           <Button variant="soft" className="flex-col h-20 gap-2 rounded-2xl group">
             <Banknote size={20} className="group-active:scale-110 transition-transform" />
             <span className="text-[11px] font-black uppercase tracking-tighter">Pedir cuenta</span>
           </Button>
           <Button variant="soft" className="flex-col h-20 gap-2 rounded-2xl group">
             <Bell size={20} className="group-active:scale-110 transition-transform" />
             <span className="text-[11px] font-black uppercase tracking-tighter">Llamar TPV</span>
           </Button>
           <Button variant="soft" className="flex-col h-20 gap-2 rounded-2xl group">
             <Split size={20} className="group-active:scale-110 transition-transform" />
             <span className="text-[11px] font-black uppercase tracking-tighter">Dividir cuenta</span>
           </Button>
           <Button variant="soft" className="flex-col h-20 gap-2 rounded-2xl group">
             <Move size={20} className="group-active:scale-110 transition-transform" />
             <span className="text-[11px] font-black uppercase tracking-tighter">Cambiar mesa</span>
           </Button>
        </div>
      </div>

      {/* STICKY BOTTOM CTA */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-surf-0 border-t border-bd backdrop-blur-xl">
        <Button 
          variant="primary" 
          fullWidth 
          size="xl" 
          className="h-14 font-black uppercase tracking-[0.1em] text-sm gap-3 shadow-2xl shadow-iris-glow"
          onClick={() => router.push(`/meseros/${tableId}/orden`)}
        >
          <Plus size={20} />
          Agregar a la comanda
        </Button>
      </div>
    </div>
  );
}
