"use client";
import React, { useState, useEffect } from "react";
import { LayoutGrid, LayoutList } from "lucide-react";
import Chip from "@/components/ui/Chip";
import Link from "next/link";
import api from "@/lib/api";

export default function WaiterFloorPlanPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const { data } = await api.get("/api/tables");
        setTables(data);
      } catch (error) {
        console.error("Error loading tables:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTables();
  }, []);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "AVAILABLE": return { label: "Libre", color: "text-tx-dis", dot: "bg-tx-dis" };
      case "OCCUPIED": return { label: "Ocupada", color: "text-info", dot: "bg-info" };
      case "DIRTY": return { label: "Sucia", color: "text-warning", dot: "bg-warning" };
      default: return { label: "Desconocido", color: "text-tx-dis", dot: "bg-tx-dis" };
    }
  };

  return (
    <div className="h-full flex flex-col bg-bgApp">
      {/* HEADER ESPECÍFICO */}
      <div className="p-8 border-b border-bd bg-surf-1 flex flex-col gap-8 shrink-0">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-iris-500">
              DISTRIBUCIÓN EN VIVO
            </span>
            <h1 className="text-4xl md:text-5xl font-display font-black tracking-tighter text-tx-pri leading-none uppercase">
              Salón <span className="text-iris-500">Principal</span>
            </h1>
          </div>
          <div className="flex bg-surf-2 p-1 rounded-2xl border border-bd">
            <button className="p-3 rounded-xl bg-surf-3 text-tx-pri shadow-glow shadow-iris-glow/10"><LayoutGrid size={20} /></button>
            <button className="p-3 rounded-xl text-tx-mut hover:text-tx-pri transition-colors"><LayoutList size={20} /></button>
          </div>
        </div>

        <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
          <Chip variant="info" size="md" dot>Ocupadas</Chip>
          <Chip variant="success" size="md" dot>Disponibles</Chip>
          <Chip variant="warning" size="md" dot>Sucia / Cuenta</Chip>
        </div>
      </div>

      {/* TABLES GRID */}
      <div className="flex-1 overflow-y-auto p-8 scrollbar-hide bg-bgApp/50">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-[2.5rem] border border-bd/50" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 pb-32">
            {tables.map((table) => {
              const cfg = getStatusConfig(table.status);
              const isOccupied = table.status === "OCCUPIED";
              
              return (
                <Link 
                  key={table.id} 
                  href={`/meseros/${table.id}`}
                  className={`
                    aspect-square rounded-[2.5rem] bg-surf-1 border p-6 flex flex-col items-start justify-between
                    transition-all duration-300 active:scale-95 hover:bg-surf-2 group relative overflow-hidden
                    ${isOccupied 
                      ? "border-iris-500/30 shadow-lg shadow-iris-glow/5" 
                      : "border-bd hover:border-tx-mut/20"}
                  `}
                >
                  {/* GLOW EFFECT FOR OCCUPIED */}
                  {isOccupied && (
                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-iris-500/10 blur-3xl rounded-full" />
                  )}

                  <div className="flex justify-between items-start w-full relative z-10">
                    <span className={`
                      text-4xl font-display font-black tracking-tighter transition-all duration-300
                      group-hover:scale-110 group-hover:rotate-[-4deg]
                      ${isOccupied ? "text-iris-500" : "text-tx-pri"}
                    `}>
                      {table.name.replace("Mesa ", "M")}
                    </span>
                    <span className={`w-3 h-3 rounded-full shadow-sm ${cfg.dot} ${isOccupied ? "animate-pulse" : ""}`} />
                  </div>

                  <div className="space-y-1.5 relative z-10 w-full">
                    <div className="text-[10px] font-black uppercase tracking-widest text-tx-dis flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-tx-dis" />
                      {cfg.label} · 4p
                    </div>
                    {table.activeOrder && (
                      <div className="flex items-center justify-between w-full">
                        <div className="font-mono tnum text-xl font-black tracking-tight text-tx-pri">
                          ${Number(table.activeOrder.total).toFixed(0)}
                        </div>
                        <div className="text-[10px] font-black text-iris-500 bg-iris-soft px-2 py-0.5 rounded-full">
                          ACTIVA
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
