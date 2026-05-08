"use client";

/**
 * TablePickerModal — selector de mesa para iniciar una orden DINE_IN.
 *
 * Por defecto solo muestra las mesas AVAILABLE / DIRTY (las que
 * razonablemente puede asignarse). Con el toggle "Mostrar todas" se
 * incluyen también las OCCUPIED, que aparecen con un botón inline
 * "Liberar" para reasignarlas en sitio sin tener que ir al panel admin
 * — el caso de uso típico es una mesa cuya orden quedó colgada por un
 * cierre de caja anterior y la cuenta nunca se cerró formalmente.
 */

import { useEffect, useState } from "react";
import { X, MapPin, Users, Eye, EyeOff, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

export interface TableLite {
  id: string;
  name: string;
  capacity?: number | null;
  status?: "AVAILABLE" | "OCCUPIED" | "DIRTY" | string;
  zone?: { id: string; name: string } | null;
}

interface TablePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPick: (table: TableLite) => void;
  /** Empieza mostrando todas (incluye OCUPADAS). Por defecto false. */
  initialShowOccupied?: boolean;
}

export default function TablePickerModal({
  isOpen,
  onClose,
  onPick,
  initialShowOccupied = false,
}: TablePickerModalProps) {
  const [tables, setTables]   = useState<TableLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [showOccupied, setShowOccupied] = useState(initialShowOccupied);
  const [busyId, setBusyId]   = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchTables();
  }, [isOpen]);

  async function fetchTables() {
    let cancelled = false;
    setLoading(true);
    setError("");
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
    return () => { cancelled = true; };
  }

  async function handleRelease(t: TableLite) {
    if (busyId) return;
    setBusyId(t.id);
    try {
      await api.patch(`/api/tables/${t.id}`, { status: "AVAILABLE" }, { timeout: 15000 });
      toast.success(`"${t.name}" liberada`);
      // Optimismo local antes de refetch para feedback instantáneo.
      setTables((curr) => curr.map((x) => x.id === t.id ? { ...x, status: "AVAILABLE" } : x));
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || "No se pudo liberar");
    } finally {
      setBusyId(null);
    }
  }

  if (!isOpen) return null;

  const visible = showOccupied ? tables : tables.filter((t) => t.status !== "OCCUPIED");
  const grouped = visible.reduce<Record<string, TableLite[]>>((acc, t) => {
    const key = t.zone?.name || "Sin zona";
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  const occupiedHidden = !showOccupied
    ? tables.filter((t) => t.status === "OCCUPIED").length
    : 0;

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
              {showOccupied
                ? "Todas las mesas. Las ocupadas se pueden liberar manualmente."
                : "Solo se muestran mesas disponibles. Toca una para asignarla."}
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

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-white/5">
          <button
            type="button"
            onClick={() => setShowOccupied((v) => !v)}
            className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-white/85 active:scale-95"
          >
            {showOccupied ? <EyeOff size={14} /> : <Eye size={14} />}
            {showOccupied ? "Solo libres" : "Mostrar todas"}
          </button>
          {occupiedHidden > 0 && (
            <span className="text-[10px] font-bold text-white/40">
              {occupiedHidden} mesa{occupiedHidden !== 1 ? "s" : ""} ocupada{occupiedHidden !== 1 ? "s" : ""} oculta{occupiedHidden !== 1 ? "s" : ""}
            </span>
          )}
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
            <div className="py-12 text-center">
              <p className="text-white/40 text-sm font-bold mb-3">
                {tables.length === 0
                  ? "No hay mesas configuradas en esta sucursal."
                  : showOccupied
                    ? "No hay mesas configuradas en esta sucursal."
                    : "Todas las mesas están ocupadas."}
              </p>
              {tables.length === 0 ? (
                <p className="text-white/30 text-xs font-medium">
                  Crea mesas desde <span className="text-[#ffb84d] font-bold">Admin → Mesas</span>.
                </p>
              ) : !showOccupied && occupiedHidden > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowOccupied(true)}
                  className="inline-flex items-center gap-2 px-5 h-11 rounded-2xl bg-[#ffb84d] text-[#0a0a0c] text-xs font-black uppercase tracking-widest active:scale-95"
                >
                  <Eye size={14} /> Ver ocupadas y liberar
                </button>
              ) : null}
            </div>
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
                      const dirty    = t.status === "DIRTY";
                      const accent = occupied
                        ? "#FF8B6E"
                        : dirty
                          ? "#ffb84d"
                          : "#88D66C";
                      return (
                        <div
                          key={t.id}
                          className="relative flex flex-col items-stretch gap-2 p-4 min-h-[120px] rounded-2xl bg-white/5 border"
                          style={{ borderColor: accent + "40" }}
                        >
                          <button
                            type="button"
                            onClick={() => !occupied && onPick(t)}
                            disabled={occupied}
                            className="flex flex-col items-center justify-center gap-1 flex-1 active:scale-95 transition-transform disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <MapPin size={20} style={{ color: accent }} />
                            <span className="text-base font-black text-white tracking-tight">{t.name}</span>
                            {t.capacity ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white/55">
                                <Users size={10} /> {t.capacity}
                              </span>
                            ) : null}
                          </button>

                          {occupied && (
                            <button
                              type="button"
                              onClick={() => handleRelease(t)}
                              disabled={busyId === t.id}
                              className="inline-flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest active:scale-95 disabled:opacity-40"
                            >
                              <RotateCcw size={11} /> {busyId === t.id ? "…" : "Liberar"}
                            </button>
                          )}

                          {(occupied || dirty) && (
                            <span
                              className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest"
                              style={{ background: accent + "20", color: accent }}
                            >
                              {occupied ? "OCUPADA" : "POR LIMPIAR"}
                            </span>
                          )}
                        </div>
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
