"use client";
import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Clock, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Chip from "@/components/ui/Chip";
import api from "@/lib/api";
import { readTablesCache, writeTablesCache, type TableRow } from "@/lib/tables-cache";

function elapsedMinutes(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function WaiterMyTablesPage() {
  const [tables, setTables] = useState<TableRow[]>(() => {
    const cached = readTablesCache();
    return cached?.tables || [];
  });
  const [loading, setLoading] = useState(() => {
    const cached = readTablesCache();
    return !cached || cached.tables.length === 0;
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.get<TableRow[]>("/api/tables")
      .then(({ data }) => {
        if (!mounted) return;
        const fetched = Array.isArray(data) ? data : [];
        setTables(fetched);
        const cached = readTablesCache();
        writeTablesCache(fetched, cached?.zones || []);
        setError(null);
      })
      .catch((e) => {
        if (!mounted) return;
        const cached = readTablesCache();
        if (cached && cached.tables.length > 0) {
          setTables(cached.tables);
          setError(null);
        } else {
          setError(e?.response?.data?.error || "Error al cargar mesas");
        }
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const myTables = useMemo(
    () => tables.filter((t) => t.activeOrder !== null),
    [tables]
  );

  return (
    <div className="h-full flex flex-col bg-surf-0">
      <div className="p-6 border-b border-bd bg-surf-1/30">
        <span className="eyebrow">PRIORIZADAS POR URGENCIA</span>
        <h2 className="text-2xl font-black mt-1">Mis mesas activas</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-20 scrollbar-hide">
        {loading && (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-tx-mut">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-xs font-bold uppercase tracking-widest">Cargando mesas…</p>
          </div>
        )}

        {!loading && error && (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-warning">
            <AlertTriangle size={28} />
            <p className="text-xs font-bold uppercase tracking-widest">{error}</p>
          </div>
        )}

        {!loading && !error && myTables.map((table) => {
          const order = table.activeOrder!;
          const elapsed = elapsedMinutes(order.createdAt);
          const isLong = elapsed > 60;
          return (
            <button
              key={table.id}
              onClick={() => { window.location.href = `/meseros/detalle/?id=${table.id}`; }}
              className="w-full p-5 rounded-3xl bg-surf-1 border border-bd flex gap-5 text-left transition-all active:scale-[0.98] relative overflow-hidden group"
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${isLong ? "bg-iris-500" : "bg-info"}`} />

              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 border-2 bg-surf-2 border-bd text-tx-pri">
                {table.name}
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold">
                    {table.zone?.name || "Sin zona"} · {table.capacity}p
                  </span>
                  {isLong && <Chip variant="brand" className="h-5">+1H</Chip>}
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-bold text-tx-dis uppercase tracking-wider">
                      {order.customerName || "Sin nombre"} · DESDE {fmtTime(order.createdAt)}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-tx-mut">
                        <Clock size={12} />
                        <span className="mono tnum text-[11px] font-bold">{elapsed}m</span>
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-tighter text-tx-mut">
                        {order._count.items} ítems
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="mono tnum text-[18px] font-black tracking-tight">
                      ${order.total.toFixed(0)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center text-tx-dis group-hover:text-tx-pri transition-colors">
                <ChevronRight size={20} />
              </div>
            </button>
          );
        })}

        {!loading && !error && myTables.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center opacity-20 gap-4">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-tx-pri flex items-center justify-center">
              <CheckCircle2 size={32} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest">No hay mesas activas</p>
          </div>
        )}
      </div>
    </div>
  );
}
