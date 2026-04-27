"use client";
import React from "react";
import { ChevronRight, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import Chip from "@/components/ui/Chip";

const MOCK_MY_TABLES = [
  { id: 'M2', zone: 'Terraza', seats: 2, state: 'occupied', elapsed: 28, ticket: 320, since: '20:14', status: 'Ocupada' },
  { id: 'M3', zone: 'Terraza', seats: 4, state: 'kitchen', elapsed: 12, ticket: 645, since: '20:30', status: 'En cocina', kitchenAlert: 'Plato listo' },
  { id: 'M5', zone: 'Terraza', seats: 6, state: 'bill', elapsed: 78, ticket: 1840, since: '19:24', status: 'Pidió cuenta', alert: 'Pidió cuenta' },
  { id: 'M7', zone: 'Salón', seats: 4, state: 'occupied', elapsed: 52, ticket: 480, since: '19:50', status: 'Ocupada', warn: 'Sin postre 45m' },
];

export default function WaiterMyTablesPage() {
  return (
    <div className="h-full flex flex-col bg-surf-0">
      <div className="p-6 border-b border-bd bg-surf-1/30">
        <span className="eyebrow">PRIORIZADAS POR URGENCIA</span>
        <h2 className="text-2xl font-black mt-1">Mis mesas activas</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-20 scrollbar-hide">
        {MOCK_MY_TABLES.map((table) => (
          <button 
            key={table.id}
            className={`
              w-full p-5 rounded-3xl bg-surf-1 border border-bd flex gap-5 text-left transition-all active:scale-[0.98]
              relative overflow-hidden group
            `}
          >
            {/* Indicador lateral de estado */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${table.alert ? "bg-iris-500" : table.kitchenAlert ? "bg-warning" : "bg-info"}`} />

            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 border-2
              ${table.alert ? "bg-iris-soft border-iris-500 text-iris-500" : "bg-surf-2 border-bd text-tx-pri"}
            `}>
              {table.id}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-black">{table.zone} · {table.seats}p</span>
                {table.alert && <Chip variant="brand" size="sm" className="h-5">CUENTA</Chip>}
                {table.kitchenAlert && <Chip variant="warning" size="sm" className="h-5">LISTO</Chip>}
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-bold text-tx-dis uppercase tracking-wider">
                    {table.status} · DESDE {table.since}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-tx-mut">
                      <Clock size={12} />
                      <span className="mono tnum text-[11px] font-bold">{table.elapsed}m</span>
                    </div>
                    {table.warn && (
                      <div className="flex items-center gap-1.5 text-warning">
                        <AlertTriangle size={12} />
                        <span className="text-[10px] font-black uppercase tracking-tighter">{table.warn}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                   <div className="mono tnum text-[18px] font-black tracking-tight">${table.ticket}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center text-tx-dis group-hover:text-tx-pri transition-colors">
              <ChevronRight size={20} />
            </div>
          </button>
        ))}

        {MOCK_MY_TABLES.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center opacity-20 gap-4">
             <div className="w-16 h-16 rounded-full border-2 border-dashed border-tx-pri flex items-center justify-center">
               <CheckCircle2 size={32} />
             </div>
             <p className="text-xs font-black uppercase tracking-widest">No tienes mesas asignadas</p>
          </div>
        )}
      </div>
    </div>
  );
}
