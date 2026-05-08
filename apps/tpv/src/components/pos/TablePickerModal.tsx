"use client";

import { useEffect, useState } from "react";
import { X, MapPin, Users } from "lucide-react";
import api from "@/lib/api";

export interface TableLite {
  id: string;
  name: string;
  capacity?: number | null;
  status?: "AVAILABLE" | "OCCUPIED" | "RESERVED" | string;
  zone?: { id: string; name: string } | null;
}

interface TablePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPick: (table: TableLite) => void;
  /** Cuando true, también muestra mesas ocupadas (para gestionar comanda existente). */
  showOccupied?: boolean;
}

export default function TablePickerModal({
  isOpen,
  onClose,
  onPick,
  showOccupied = false,
}: TablePickerModalProps) {
  const [tables, setTables] = useState<TableLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const { data } = await api.get<TableLite[]>("/api/tables");
        if (cancelled) return;
        setTables(Array.isArray(data) ? data : []);
      } catch (err) {
        const e = err as { response?: { data?: { error?: string } } };
        if (!cancelled) setError(e.response?.data?.error || "No pudimos cargar las mesas");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  const visible = showOccupied ? tables : tables.filter((t) => t.status !== "OCCUPIED");
  const grouped = visible.reduce<Record<string, TableLite[]>>((acc, t) => {
    const key = t.zone?.name || "Sin zona";
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#0a0a0c]/80 backdrop-blur-sm"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-white/10 bg-white/5">
          <div>
            <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d]">ASIGNAR</span>
            <h3 className="text-2xl font-black text-white tracking-tight mt-1">Mesa para los comensales</h3>
            <p className="text-xs font-medium text-white/55 mt-1">
              Solo se muestran mesas disponibles. Toca una para asignarla al ticket actual.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 min-h-[44px] rounded-2xl flex items-center justify-center bg-white/5 border border-white/10 active:scale-95 transition-transform text-white/85 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {loading ? (
            <p className="text-white/40 text-sm font-bold py-12 text-center">Cargando mesas…</p>
          ) : error ? (
            <div className="rounded-2xl p-4 text-sm font-semibold text-center"
                 style={{ background: "rgba(255,92,51,0.10)", border: "1px solid rgba(255,92,51,0.30)", color: "#FF8B6E" }}>
              {error}
            </div>
          ) : visible.length === 0 ? (
            <p className="text-white/40 text-sm font-bold py-12 text-center">
              {showOccupied
                ? "No hay mesas configuradas en esta sucursal."
                : "Todas las mesas están ocupadas. Activa 'mostrar todas' para ver el resto."}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(grouped).map(([zone, list]) => (
                <div key={zone}>
                  <p className="text-[10px] font-black tracking-[0.25em] text-white/40 mb-3 px-1">
                    {zone}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {list.map((t) => {
                      const occupied = t.status === "OCCUPIED";
                      const reserved = t.status === "RESERVED";
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={occupied}
                          onClick={() => onPick(t)}
                          className="relative flex flex-col items-center justify-center gap-2 p-4 min-h-[100px] rounded-2xl bg-white/5 border border-white/10 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            borderColor: occupied
                              ? "rgba(255,92,51,0.35)"
                              : reserved
                                ? "rgba(255,184,77,0.35)"
                                : "rgba(136,214,108,0.25)",
                          }}
                        >
                          <MapPin
                            size={20}
                            style={{
                              color: occupied
                                ? "#FF8B6E"
                                : reserved
                                  ? "#ffb84d"
                                  : "#88D66C",
                            }}
                          />
                          <span className="text-base font-black text-white tracking-tight">{t.name}</span>
                          {t.capacity && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white/55">
                              <Users size={10} /> {t.capacity}
                            </span>
                          )}
                          {occupied && (
                            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest bg-red-500/20 text-red-300">
                              OCUPADA
                            </span>
                          )}
                          {reserved && (
                            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest bg-amber-500/20 text-amber-300">
                              RESERV
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
