"use client";
import React, { useState } from "react";
import TableIcon from "@/components/pos/TableIcon";
import { Bell, Clock, Zap } from "lucide-react";

const M_TABLES = [
  { id: 'M1', shape: 'round', seats: 2, zone: 'Terraza', state: 'free' },
  { id: 'M2', shape: 'round', seats: 2, zone: 'Terraza', state: 'occupied', elapsed: 28, ticket: 320, since: '20:14', mine: true },
  { id: 'M3', shape: 'square', seats: 4, zone: 'Terraza', state: 'kitchen', elapsed: 12, ticket: 645, since: '20:30', kitchenAlert: 'Plato listo', mine: true },
  { id: 'M4', shape: 'square', seats: 4, zone: 'Terraza', state: 'served', elapsed: 41, ticket: 712, since: '20:01' },
  { id: 'M5', shape: 'rect', seats: 6, zone: 'Terraza', state: 'bill', elapsed: 78, ticket: 1840, since: '19:24', alert: 'Pidió cuenta', mine: true },
];

const M_FLOOR_POS: Record<string, any> = {
  M1: { x: 6, y: 6, w: 30, h: 30 }, 
  M2: { x: 38, y: 6, w: 30, h: 30 },
  M3: { x: 6, y: 38, w: 62, h: 36 }, 
  M4: { x: 70, y: 38, w: 30, h: 36 },
  M5: { x: 6, y: 76, w: 94, h: 22 }
};

const STATE_META: Record<string, any> = {
  free:     { color: "var(--text-muted)", bg: "transparent", border: "var(--border-strong)", label: "Libre" },
  occupied: { color: "var(--info)", bg: "var(--info-soft)", border: "var(--info)", label: "Ocupada" },
  kitchen:  { color: "var(--warning)", bg: "var(--warning-soft)", border: "var(--warning)", label: "En cocina" },
  served:   { color: "var(--success)", bg: "var(--success-soft)", border: "var(--success)", label: "Servida" },
  bill:     { color: "var(--brand)", bg: "var(--brand-soft)", border: "var(--brand)", label: "Cuenta" },
  dirty:    { color: "var(--danger)", bg: "var(--danger-soft)", border: "var(--danger)", label: "Sucia" }
};

export default function WaiterFloorPage() {
  const [zone, setZone] = useState("Terraza");

  return (
    <div className="h-full flex flex-col">
      {/* STATS STRIP */}
      <div className="grid grid-cols-4 gap-2 p-4 border-b border-bd bg-surf-1/50 shrink-0">
        {[
          { l: 'Libres', v: 4, c: 'text-tx-mut' },
          { l: 'Ocupadas', v: 8, c: 'text-info' },
          { l: 'Avisos', v: 2, c: 'text-iris-500' },
          { l: 'Cuenta', v: 1, c: 'text-warning' }
        ].map((s) => (
          <div key={s.l} className="bg-surf-2 border border-bd rounded-xl p-2 text-center">
            <div className={`mono tnum text-[18px] font-black ${s.c}`}>{s.v}</div>
            <div className="eyebrow !text-[8px] mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>

      {/* FLOOR PLAN */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
        <div className="relative w-full aspect-[4/5] bg-surf-1 border border-bd rounded-2xl overflow-hidden shadow-inner">
          {/* GRID BACKGROUND */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
               style={{ backgroundImage: 'linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)', backgroundSize: '32px 32px' }} 
          />
          
          <div className="absolute left-4 top-4 eyebrow opacity-40">{zone}</div>

          {M_TABLES.map((t) => {
            const pos = M_FLOOR_POS[t.id];
            if (!pos) return null;
            const meta = STATE_META[t.state];

            return (
              <button 
                key={t.id}
                className="absolute transition-all active:scale-95 group"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  width: `${pos.w}%`,
                  height: `${pos.h}%`,
                }}
              >
                <TableIcon 
                  color={meta.border} 
                  fill={t.state === 'free' ? 'transparent' : meta.bg} 
                />
                
                {/* INFO DENTRO DE LA MESA */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pt-[10%] pointer-events-none">
                  <span className="text-[14px] font-black leading-none drop-shadow-md" style={{ color: meta.color }}>
                    {t.id}
                  </span>
                  <span className="text-[9px] font-bold text-tx-mut opacity-80">{t.seats}p</span>
                  {t.elapsed && (
                    <span className="mono tnum text-[10px] font-bold mt-0.5" style={{ color: meta.color }}>
                      {t.elapsed}m
                    </span>
                  )}
                </div>

                {/* BADGES DE ALERTA */}
                {(t.alert || t.kitchenAlert) && (
                  <div className={`
                    absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-surf-1
                    ${t.alert ? "bg-iris-500 text-white" : "bg-warning text-black"}
                  `}>
                    {t.alert ? <Bell size={10} strokeWidth={3} /> : <Zap size={10} strokeWidth={3} />}
                  </div>
                )}

                {/* BADGE "MÍA" */}
                {t.mine && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-iris-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter">
                    MÍA
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* LEYENDA */}
        <div className="flex flex-wrap gap-2 mt-6 pb-10">
          {Object.entries(STATE_META).map(([key, meta]: [string, any]) => (
            <div key={key} className="flex items-center gap-1.5 bg-surf-2 px-3 py-1.5 rounded-full border border-bd">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
              <span className="text-[10px] font-bold text-tx-sec uppercase tracking-wider">{meta.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
