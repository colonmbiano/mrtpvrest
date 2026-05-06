"use client";
import React, { useState, useEffect, useMemo } from "react";
import { LayoutGrid, LayoutList } from "lucide-react";
import Chip from "@/components/ui/Chip";
import Link from "next/link";
import api from "@/lib/api";

type ZoneRef = { id: string; name: string; icon: string | null };

interface TableRow {
  id: string;
  name: string;
  status: "AVAILABLE" | "OCCUPIED" | "DIRTY";
  zoneId: string | null;
  zone: ZoneRef | null;
  activeOrder: { total: number } | null;
}

interface Zone extends ZoneRef {
  order: number;
  tablesCount: number;
}

const NO_ZONE = "__none__";

export default function WaiterFloorPlanPage() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZone, setActiveZone] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, z] = await Promise.all([
          api.get<TableRow[]>("/api/tables"),
          api.get<Zone[]>("/api/zones").catch(() => ({ data: [] as Zone[] })),
        ]);
        setTables(t.data);
        setZones(z.data || []);
      } catch (error) {
        console.error("Error loading tables:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "AVAILABLE": return { label: "Libre", color: "text-zinc-500", dot: "bg-zinc-500" };
      case "OCCUPIED": return { label: "Ocupada", color: "text-amber-500", dot: "bg-amber-500" };
      case "DIRTY": return { label: "Sucia", color: "text-red-500", dot: "bg-red-500" };
      default: return { label: "???", color: "text-zinc-600", dot: "bg-zinc-600" };
    }
  };

  const hasOrphans = useMemo(() => tables.some(t => !t.zoneId), [tables]);

  const filteredTables = useMemo(() => {
    if (activeZone === "all") return tables;
    if (activeZone === NO_ZONE) return tables.filter(t => !t.zoneId);
    return tables.filter(t => t.zoneId === activeZone);
  }, [tables, activeZone]);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0c] font-sans">
      {/* HEADER WARM TECH */}
      <div className="p-6 sm:p-8 border-b border-white/5 bg-[#0a0a0c] flex flex-col gap-8 shrink-0 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-amber-500/5 blur-[80px] rounded-full" />
        </div>

        <div className="relative z-10 flex justify-between items-start gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="eyebrow text-amber-500/80">Gestión de Salón</span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white truncate leading-none">
              {activeZone === "all"
                ? "Planta Completa"
                : activeZone === NO_ZONE
                ? "Mesas Libres"
                : zones.find(z => z.id === activeZone)?.name || "Salón"}
            </h1>
          </div>
          <div className="flex bg-[#121316] p-1.5 rounded-2xl border border-white/5 shrink-0 shadow-inner">
            <button className="w-12 h-12 flex items-center justify-center rounded-xl bg-amber-500 text-black shadow-[0_5px_15px_rgba(255,184,77,0.2)] transition-all active:scale-90"><LayoutGrid size={22} /></button>
            <button className="w-12 h-12 flex items-center justify-center rounded-xl text-zinc-600 active:text-white active:bg-white/5 transition-all active:scale-90"><LayoutList size={22} /></button>
          </div>
        </div>

        {/* Legend */}
        <div className="relative z-10 flex items-center gap-3 overflow-x-auto scrollbar-hide">
          <Chip variant="info" size="md" className="!bg-amber-500/10 !text-amber-500 border-amber-500/20" dot>Ocupadas</Chip>
          <Chip variant="success" size="md" className="!bg-zinc-800 !text-zinc-400 border-white/5" dot>Disponibles</Chip>
          <Chip variant="warning" size="md" className="!bg-red-500/10 !text-red-500 border-red-500/20" dot>Limpieza</Chip>
        </div>

        {/* Zone Filters - TOUCH OPTIMIZED */}
        {(zones.length > 0 || hasOrphans) && (
          <div className="relative z-10 flex items-center gap-3 overflow-x-auto scrollbar-hide -mx-2 px-2">
            <button
              onClick={() => setActiveZone("all")}
              className={`shrink-0 h-12 px-6 rounded-2xl border text-[11px] font-black uppercase tracking-[0.15em] transition-all active:scale-95 ${
                activeZone === "all"
                  ? "bg-amber-500 border-amber-500 text-[#0a0a0c] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
                  : "bg-[#121316] border-white/5 text-zinc-500 active:bg-white/5 active:text-white"
              }`}
            >
              General · {tables.length}
            </button>
            {zones.map(z => {
              const count = tables.filter(t => t.zoneId === z.id).length;
              const isActive = activeZone === z.id;
              return (
                <button
                  key={z.id}
                  onClick={() => setActiveZone(z.id)}
                  className={`shrink-0 h-12 px-6 rounded-2xl border text-[11px] font-black uppercase tracking-[0.15em] transition-all flex items-center gap-2 active:scale-95 ${
                    isActive
                      ? "bg-amber-500 border-amber-500 text-[#0a0a0c] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
                      : "bg-[#121316] border-white/5 text-zinc-500 active:bg-white/5 active:text-white"
                  }`}
                >
                  {z.icon && <span className="text-sm">{z.icon}</span>}
                  <span>{z.name}</span>
                  <span className="opacity-50">/ {count}</span>
                </button>
              );
            })}
            {hasOrphans && (
              <button
                onClick={() => setActiveZone(NO_ZONE)}
                className={`shrink-0 h-12 px-6 rounded-2xl border text-[11px] font-black uppercase tracking-[0.15em] transition-all active:scale-95 ${
                  activeZone === NO_ZONE
                    ? "bg-zinc-700 border-zinc-600 text-white"
                    : "bg-[#121316] border-white/5 text-zinc-500 active:bg-white/5 active:text-white"
                }`}
              >
                Otros · {tables.filter(t => !t.zoneId).length}
              </button>
            )}
          </div>
        )}
      </div>

      {/* TABLES GRID - OBSIDIAN STYLE */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 scrollbar-hide bg-[#0a0a0c]">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 sm:gap-8">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-square bg-[#121316] animate-pulse rounded-[2.5rem] border border-white/5" />
            ))}
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4 py-20 text-center">
            <LayoutGrid size={80} className="text-zinc-600" />
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-zinc-500">
              Zona sin mesas configuradas
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 sm:gap-8 pb-32">
            {filteredTables.map((table) => {
              const cfg = getStatusConfig(table.status);
              const isOccupied = table.status === "OCCUPIED";
              
              return (
                <Link
                  key={table.id}
                  href={`/meseros/${table.id}`}
                  className={`
                    aspect-square rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-6 lg:p-7 flex flex-col items-start justify-between
                    transition-all active:scale-95 group relative overflow-hidden border
                    ${isOccupied 
                      ? "bg-[#121316] border-amber-500/50 shadow-[0_10px_30px_-10px_rgba(255,184,77,0.15)]" 
                      : "bg-[#121316] border-white/5 shadow-xl"}
                  `}
                >
                  <div className="flex justify-between items-start w-full relative z-10">
                    <span className={`text-2xl sm:text-3xl font-black tracking-tighter transition-all group-active:scale-90 ${isOccupied ? "text-amber-500" : "text-white"}`}>
                      {table.name.replace("Mesa ", "M")}
                    </span>
                    <span className={`w-3 h-3 rounded-full shrink-0 ${cfg.dot} shadow-lg ${isOccupied ? "animate-pulse" : ""}`} />
                  </div>

                  <div className="space-y-1.5 min-w-0 w-full relative z-10">
                    <div className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-600 truncate">
                      {cfg.label}
                      {table.zone && (
                        <span className="opacity-50"> · {table.zone.name}</span>
                      )}
                    </div>
                    {table.activeOrder && (
                      <div className="mono tnum text-lg font-black tracking-tight text-white">
                        ${Number(table.activeOrder.total).toFixed(0)}
                      </div>
                    )}
                  </div>
                  
                  {isOccupied && (
                    <div className="absolute inset-0 bg-amber-500/[0.02] pointer-events-none" />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
