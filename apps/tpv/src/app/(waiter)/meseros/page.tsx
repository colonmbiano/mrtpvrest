"use client";
import React, { useState, useEffect } from "react";
import Chip from "@/components/ui/Chip";
import Link from "next/link";
import api from "@/lib/api";

type Table = {
  id: string;
  name: string;
  status: string;
  seats?: number | null;
  activeOrder?: { total: number | string } | null;
};

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  AVAILABLE: { label: "Libre",       dot: "bg-tx-dis"  },
  OCCUPIED:  { label: "Ocupada",     dot: "bg-info"    },
  DIRTY:     { label: "Sucia",       dot: "bg-warning" },
  RESERVED:  { label: "Reservada",   dot: "bg-iris-500"},
  CLEANING:  { label: "Limpiándose", dot: "bg-warning" },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status || "Desconocido", dot: "bg-tx-dis" };
}

export default function WaiterFloorPlanPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const { data } = await api.get<Table[]>("/api/tables");
        setTables(data);
      } catch {
        setError("No se pudieron cargar las mesas.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchTables();
  }, []);

  return (
    <div className="h-full flex flex-col bg-surf-0">
      {/* HEADER ESPECÍFICO */}
      <div className="p-6 border-b border-bd bg-surf-1 flex flex-col gap-6 shrink-0">
        <div className="space-y-1">
          <span className="eyebrow">DISTRIBUCIÓN EN VIVO</span>
          <h1 className="text-3xl font-black tracking-tight text-tx-pri">Salón Principal</h1>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
          <Chip variant="info" size="sm" dot>Ocupadas</Chip>
          <Chip variant="success" size="sm" dot>Disponibles</Chip>
          <Chip variant="warning" size="sm" dot>Sucia / Cuenta</Chip>
        </div>
      </div>

      {/* TABLES GRID */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {error ? (
          <div className="text-center py-20 text-tx-mut text-[13px]">{error}</div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-square bg-surf-1 animate-pulse rounded-[2rem]" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <div className="text-center py-20 text-tx-mut text-[13px]">No hay mesas configuradas en esta sucursal.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 pb-24">
            {tables.map((table) => {
              const cfg = getStatusConfig(table.status);
              const seatsLabel = table.seats ? `${table.seats}p` : "—";
              return (
                <Link
                  key={table.id}
                  href={`/meseros/${table.id}`}
                  className={`
                    aspect-square rounded-[2rem] bg-surf-1 border border-bd p-5 flex flex-col items-start justify-between
                    transition-all active:scale-95 hover:bg-surf-2 group relative overflow-hidden
                    ${table.status === "OCCUPIED" ? "border-info/20 shadow-lg shadow-info/5" : ""}
                  `}
                >
                  <div className="flex justify-between items-start w-full">
                    <span className={`text-2xl font-black group-hover:scale-110 transition-transform ${table.status === "OCCUPIED" ? "text-info" : "text-tx-pri"}`}>
                      {table.name.replace("Mesa ", "M")}
                    </span>
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                  </div>

                  <div className="space-y-1">
                    <div className="eyebrow !text-[10px] !text-tx-dis">{cfg.label} · {seatsLabel}</div>
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
