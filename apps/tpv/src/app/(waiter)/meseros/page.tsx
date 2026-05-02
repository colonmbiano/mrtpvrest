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

// Sentinela para el filtro "Sin zona". El backend usa null.
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
      case "AVAILABLE": return { label: "Libre", color: "text-tx-dis", dot: "bg-tx-dis" };
      case "OCCUPIED": return { label: "Ocupada", color: "text-info", dot: "bg-info" };
      case "DIRTY": return { label: "Sucia", color: "text-warning", dot: "bg-warning" };
      default: return { label: "Desconocido", color: "text-tx-dis", dot: "bg-tx-dis" };
    }
  };

  // Determinar si hay mesas "sin zona" para mostrar el chip extra.
  const hasOrphans = useMemo(() => tables.some(t => !t.zoneId), [tables]);

  const filteredTables = useMemo(() => {
    if (activeZone === "all") return tables;
    if (activeZone === NO_ZONE) return tables.filter(t => !t.zoneId);
    return tables.filter(t => t.zoneId === activeZone);
  }, [tables, activeZone]);

  return (
    <div className="h-full flex flex-col bg-surf-0">
      {/* HEADER ESPECÍFICO */}
      <div className="p-4 sm:p-5 lg:p-6 border-b border-bd bg-surf-1 flex flex-col gap-4 sm:gap-5 lg:gap-6 shrink-0">
        <div className="flex justify-between items-start gap-3">
          <div className="space-y-1 min-w-0">
            <span className="eyebrow">DISTRIBUCIÓN EN VIVO</span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tx-pri truncate">
              {activeZone === "all"
                ? "Salón completo"
                : activeZone === NO_ZONE
                ? "Sin zona"
                : zones.find(z => z.id === activeZone)?.name || "Salón"}
            </h1>
          </div>
          <div className="flex bg-surf-2 p-1 rounded-xl border border-bd shrink-0">
            <button className="p-2 rounded-lg bg-surf-3 text-tx-pri shadow-sm"><LayoutGrid size={18} /></button>
            <button className="p-2 rounded-lg text-tx-mut hover:text-tx-pri"><LayoutList size={18} /></button>
          </div>
        </div>

        {/* Leyenda de estados */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide">
          <Chip variant="info" size="sm" dot>Ocupadas</Chip>
          <Chip variant="success" size="sm" dot>Disponibles</Chip>
          <Chip variant="warning" size="sm" dot>Sucia / Cuenta</Chip>
        </div>

        {/* Filtros por zona */}
        {(zones.length > 0 || hasOrphans) && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
            <button
              onClick={() => setActiveZone("all")}
              className={`shrink-0 h-9 px-4 rounded-full border text-[12px] font-bold uppercase tracking-wider transition-pos ${
                activeZone === "all"
                  ? "bg-brand border-brand text-brand-fg shadow-[0_0_15px_color-mix(in_srgb,var(--brand)_40%,transparent)]"
                  : "bg-surf-2 border-bd text-tx-sec hover:text-tx-pri"
              }`}
            >
              Todas · {tables.length}
            </button>
            {zones.map(z => {
              const count = tables.filter(t => t.zoneId === z.id).length;
              const isActive = activeZone === z.id;
              return (
                <button
                  key={z.id}
                  onClick={() => setActiveZone(z.id)}
                  className={`shrink-0 h-9 px-4 rounded-full border text-[12px] font-bold uppercase tracking-wider transition-pos flex items-center gap-1.5 ${
                    isActive
                      ? "bg-brand border-brand text-brand-fg shadow-[0_0_15px_color-mix(in_srgb,var(--brand)_40%,transparent)]"
                      : "bg-surf-2 border-bd text-tx-sec hover:text-tx-pri"
                  }`}
                >
                  {z.icon && <span className="text-sm">{z.icon}</span>}
                  <span>{z.name}</span>
                  <span className="opacity-70">· {count}</span>
                </button>
              );
            })}
            {hasOrphans && (
              <button
                onClick={() => setActiveZone(NO_ZONE)}
                className={`shrink-0 h-9 px-4 rounded-full border text-[12px] font-bold uppercase tracking-wider transition-pos ${
                  activeZone === NO_ZONE
                    ? "bg-tx-mut/20 border-tx-mut text-tx-pri"
                    : "bg-surf-2 border-bd text-tx-sec hover:text-tx-pri"
                }`}
              >
                Sin zona · {tables.filter(t => !t.zoneId).length}
              </button>
            )}
          </div>
        )}
      </div>

      {/* TABLES GRID */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 scrollbar-hide">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 lg:gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-[2rem]" />
            ))}
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 gap-3 py-16 text-center">
            <span className="text-5xl">🪑</span>
            <p className="text-[12px] font-bold uppercase tracking-widest">
              No hay mesas en esta zona
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 lg:gap-6 pb-24">
            {filteredTables.map((table) => {
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
                    <div className="eyebrow !text-[10px] !text-tx-dis truncate">
                      {cfg.label}
                      {table.zone && (
                        <> · {table.zone.icon ? table.zone.icon + " " : ""}{table.zone.name}</>
                      )}
                    </div>
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
