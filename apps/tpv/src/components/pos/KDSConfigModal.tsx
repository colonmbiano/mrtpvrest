"use client";
import React, { useEffect, useState } from "react";
import BaseModal from "@/components/ui/BaseModal";
import Button from "@/components/ui/Button";
import { Monitor, Info } from "lucide-react";

/**
 * KDSConfigModal — vincula una pantalla KDS al TPV.
 *
 * Una pantalla KDS puede operar como:
 *  - "Cocina central" (multi-estación): muestra pedidos de todas las
 *    estaciones que el operador active. Útil para locales pequeños
 *    donde una sola pantalla atiende todo.
 *  - Estación específica (single o multi): solo muestra los pedidos
 *    de las estaciones marcadas. Permite que un local con
 *    cocina/barra/freidora separadas tenga una pantalla por área.
 *
 * El array de estaciones se persiste en `Printer.stations` (backend) y
 * se replica al APK KDS al login (lee del backend al canjear el
 * deviceToken por JWT máquina).
 */

const STATIONS: Array<{ code: string; label: string; color: string }> = [
  { code: "KITCHEN", label: "Cocina",   color: "#ef4444" },
  { code: "BAR",     label: "Barra",    color: "#3b82f6" },
  { code: "GRILL",   label: "Plancha",  color: "#f59e0b" },
  { code: "FRYER",   label: "Freidora", color: "#f97316" },
];

type Mode = "central" | "specific";

interface KDSConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initialData?: any;
}

export default function KDSConfigModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: KDSConfigModalProps) {
  const [name, setName] = useState(initialData?.name || "KDS Principal");
  const [ip, setIp] = useState(initialData?.ip || "");
  const [port, setPort] = useState<number>(initialData?.port || 9100);
  const [mode, setMode] = useState<Mode>("central");
  const [stations, setStations] = useState<string[]>(STATIONS.map((s) => s.code));
  const [loading, setLoading] = useState(false);

  // Pre-llena modo + estaciones desde initialData (modo edición).
  useEffect(() => {
    if (!initialData) return;
    const incoming: string[] = Array.isArray(initialData.stations) ? initialData.stations : [];
    if (incoming.length === 0) {
      // Sin stations: derivamos de `type`. Si type=KITCHEN tratamos como
      // central (toda la cocina). Caso contrario, single específica.
      const t = String(initialData.type || "KITCHEN").toUpperCase();
      if (STATIONS.some((s) => s.code === t)) {
        if (t === "KITCHEN") {
          setMode("central");
          setStations(STATIONS.map((s) => s.code));
        } else {
          setMode("specific");
          setStations([t]);
        }
      }
    } else if (incoming.length === STATIONS.length) {
      setMode("central");
      setStations([...incoming]);
    } else {
      setMode("specific");
      setStations([...incoming]);
    }
  }, [initialData]);

  const toggleStation = (code: string) => {
    setStations((curr) => {
      if (curr.includes(code)) {
        const next = curr.filter((c) => c !== code);
        // Forzar al menos una estación seleccionada en modo específico.
        return next.length === 0 ? curr : next;
      }
      return [...curr, code];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Resolver array final + type "primario" para retrocompatibilidad
    // con clientes que aún leen `Printer.type` en vez de `stations[]`.
    const finalStations = mode === "central"
      ? STATIONS.map((s) => s.code)
      : stations;
    const primaryType = finalStations[0] || "KITCHEN";

    setLoading(true);
    try {
      await onSave({
        ...initialData,
        name,
        type: primaryType,
        stations: finalStations,
        connectionType: "NETWORK",
        ip: ip || "0.0.0.0",
        port: Number.isFinite(port) && port > 0 ? port : 9100,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseModal
      open={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Monitor size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight">Vincular Pantalla KDS</span>
            <span className="text-[10px] uppercase tracking-widest text-amber-500/80 font-black">App Nativa · TCP 9100</span>
          </div>
        </div>
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex gap-4 items-start">
          <Info size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-zinc-400">
            Usa la <strong className="text-amber-500">IP local de la tablet KDS</strong> (visible en KDS → Diagnóstico → IP local). El TPV mandará comandas a esa IP por TCP igual que a una impresora térmica.
          </p>
        </div>

        <div className="space-y-4">
          {/* Nombre */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 ml-1">
              Nombre de la pantalla
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 transition-all"
              placeholder="Ej. KDS Parrilla"
            />
          </div>

          {/* IP + Puerto */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 ml-1">
                IP local
              </label>
              <input
                required
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 transition-all"
                placeholder="192.168.1.x"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 ml-1">
                Puerto
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10) || 9100)}
                className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 transition-all"
              />
            </div>
          </div>

          {/* Modo de operación */}
          <div className="space-y-2.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-zinc-500 ml-1">
              Estaciones que vigila
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("central")}
                className="flex flex-col items-start gap-1 p-4 rounded-2xl border transition-all active:scale-95 text-left"
                style={{
                  background:  mode === "central" ? "rgba(255,184,77,0.10)" : "#121316",
                  borderColor: mode === "central" ? "#ffb84d"               : "rgba(255,255,255,0.05)",
                }}
              >
                <span className="text-sm font-black text-white">Cocina central</span>
                <span className="text-[10px] font-bold text-zinc-500">
                  Todos los pedidos en una sola pantalla
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("specific")}
                className="flex flex-col items-start gap-1 p-4 rounded-2xl border transition-all active:scale-95 text-left"
                style={{
                  background:  mode === "specific" ? "rgba(255,184,77,0.10)" : "#121316",
                  borderColor: mode === "specific" ? "#ffb84d"               : "rgba(255,255,255,0.05)",
                }}
              >
                <span className="text-sm font-black text-white">Estación específica</span>
                <span className="text-[10px] font-bold text-zinc-500">
                  Solo las áreas que elijas
                </span>
              </button>
            </div>

            {mode === "specific" && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                {STATIONS.map((s) => {
                  const active = stations.includes(s.code);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => toggleStation(s.code)}
                      className="flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-95"
                      style={{
                        background:  active ? s.color + "20" : "#121316",
                        borderColor: active ? s.color        : "rgba(255,255,255,0.05)",
                        color:       active ? "#ffffff"      : "rgba(255,255,255,0.55)",
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ background: active ? s.color : "rgba(255,255,255,0.10)" }}
                      />
                      <span className="text-sm font-black">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-xs"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={loading}
            className="flex-[2] h-14 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-widest text-xs shadow-lg shadow-amber-500/20"
          >
            Vincular KDS
          </Button>
        </div>
      </form>
    </BaseModal>
  );
}
