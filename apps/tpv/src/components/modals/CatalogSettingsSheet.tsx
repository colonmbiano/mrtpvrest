"use client";
import React from "react";
import { X, LayoutGrid, List } from "lucide-react";
import {
  useCatalogPrefs,
  type CatalogDensity,
} from "@/store/catalogPrefsStore";

interface Props {
  onClose: () => void;
}

export default function CatalogSettingsSheet({ onClose }: Props) {
  const { viewMode, density, setViewMode, setDensity } = useCatalogPrefs();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-sm bg-surf-1 border border-bd rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-bd flex items-center justify-between">
          <div className="min-w-0">
            <span className="eyebrow">VISTA DEL CATÁLOGO</span>
            <h2 className="text-[16px] font-black">Ajustes</h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-surf-2 hover:bg-surf-3 flex items-center justify-center text-tx-mut transition-pos"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-2">
            <h3 className="text-[12px] font-black uppercase tracking-[0.15em] text-tx-pri">
              Navegación
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <ViewModeBtn
                active={viewMode === "drilldown"}
                label="Categorías"
                hint="Drill-down"
                onClick={() => setViewMode("drilldown")}
                icon={<LayoutGrid size={18} />}
              />
              <ViewModeBtn
                active={viewMode === "flat"}
                label="Solo items"
                hint="Chip-rail"
                onClick={() => setViewMode("flat")}
                icon={<List size={18} />}
              />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-[12px] font-black uppercase tracking-[0.15em] text-tx-pri">
              Densidad
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {([3, 4, 6] as CatalogDensity[]).map((d) => (
                <DensityBtn
                  key={d}
                  active={density === d}
                  value={d}
                  onClick={() => setDensity(d)}
                />
              ))}
            </div>
            <p className="text-[10px] text-tx-mut font-bold pt-1">
              Columnas en tablet/desktop. Mobile usa 2 columnas fijas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewModeBtn({
  active,
  label,
  hint,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 py-4 px-2 rounded-xl border transition-pos active:scale-95 ${
        active
          ? "border-iris-500 bg-iris-500/10 text-iris-500"
          : "border-bd bg-surf-2 hover:bg-surf-3 text-tx-pri"
      }`}
    >
      {icon}
      <span className="text-[13px] font-black">{label}</span>
      <span className="text-[9px] uppercase tracking-widest text-tx-mut">
        {hint}
      </span>
    </button>
  );
}

function DensityBtn({
  active,
  value,
  onClick,
}: {
  active: boolean;
  value: CatalogDensity;
  onClick: () => void;
}) {
  const label = `${value} col`;
  const cellCount = value === 3 ? 9 : value === 4 ? 12 : 12;
  const gridClass =
    value === 3 ? "grid-cols-3" : value === 4 ? "grid-cols-4" : "grid-cols-6";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 py-4 rounded-xl border transition-pos active:scale-95 ${
        active
          ? "border-iris-500 bg-iris-500/10"
          : "border-bd bg-surf-2 hover:bg-surf-3"
      }`}
    >
      <div className={`grid gap-0.5 w-12 ${gridClass}`}>
        {Array.from({ length: cellCount }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square rounded-[1px] ${
              active ? "bg-iris-500" : "bg-tx-mut/50"
            }`}
          />
        ))}
      </div>
      <span
        className={`text-[11px] font-black ${
          active ? "text-iris-500" : "text-tx-pri"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
