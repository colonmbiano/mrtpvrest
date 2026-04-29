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
    <div className="h-full flex flex-col bg-surf-0">
      {/* HEADER ESPECÍFICO */}
      <div className="p-4 sm:p-5 lg:p-6 border-b border-bd bg-surf-1 flex flex-col gap-4 sm:gap-5 lg:gap-6 shrink-0">
        <div className="flex justify-between items-start gap-3">
          <div className="space-y-1 min-w-0">
            <span className="eyebrow">DISTRIBUCIÓN EN VIVO</span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tx-pri truncate">Salón Principal</h1>
          </div>
          <div className="flex bg-surf-2 p-1 rounded-xl border border-bd shrink-0">
            <button className="p-2 rounded-lg bg-surf-3 text-tx-pri shadow-sm"><LayoutGrid size={18} /></button>
            <button className="p-2 rounded-lg text-tx-mut hover:text-tx-pri"><LayoutList size={18} /></button>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide">
          <Chip variant="info" size="sm" dot>Ocupadas</Chip>
          <Chip variant="success" size="sm" dot>Disponibles</Chip>
          <Chip variant="warning" size="sm" dot>Sucia / Cuenta</Chip>
        </div>
      </div>

      {/* TABLES GRID */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 scrollbar-hide">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 lg:gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-[2rem]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 lg:gap-6 pb-24">
            {tables.map((table) => {
              const cfg = getStatusConfig(table.status);
              return (
                <Link
                  key={table.id}
                  href={`/meseros/${table.id}`}
                  className={`
                    aspect-square rounded-[1.5rem] sm:rounded-[2rem] bg-surf-1 border border-bd p-3 sm:p-4 lg:p-5 flex flex-col items-start justify-between
                    transition-all active:scale-95 hover:bg-surf-2 group relative overflow-hidden
                    ${table.status === "OCCUPIED" ? "border-info/20 shadow-lg shadow-info/5" : ""}
                  `}
                >
                  <div className="flex justify-between items-start w-full">
                    <span className={`text-xl sm:text-2xl font-black group-hover:scale-110 transition-transform ${table.status === "OCCUPIED" ? "text-info" : "text-tx-pri"}`}>
                      {table.name.replace("Mesa ", "M")}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                  </div>

                  <div className="space-y-1 min-w-0 w-full">
                    <div className="eyebrow !text-[10px] !text-tx-dis truncate">{cfg.label} · 4p</div>
                    {table.activeOrder && (
                      <div className="mono tnum text-[15px] font-black tracking-tight text-tx-pri">
                        ${Number(table.activeOrder.total).toFixed(0)}
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
