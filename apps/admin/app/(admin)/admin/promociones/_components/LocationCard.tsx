"use client";
import { Settings2, Zap } from "lucide-react";
import { Card, Pill, Toggle } from "@/components/ds";
import { type Location } from "./types";

export function LocationCard({
  loc,
  savingLoc,
  triggering,
  onToggle,
  onConfigure,
  onTrigger,
}: {
  loc: Location;
  savingLoc: string | null;
  triggering: string | null;
  onToggle: (loc: Location) => void;
  onConfigure: (loc: Location) => void;
  onTrigger: (locationId: string) => void;
}) {
  return (
    <Card className="p-4" style={loc.autoPromoEnabled ? { borderColor: "var(--brand-primary)" } : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-extrabold text-tx-hi">{loc.name}</div>
          <div className="mt-1.5">
            <Pill tone={loc.autoPromoEnabled ? "ac" : "neutral"} live={loc.autoPromoEnabled}>
              {loc.autoPromoEnabled ? "IA activa" : "IA inactiva"}
            </Pill>
          </div>
        </div>
        <Toggle
          checked={loc.autoPromoEnabled}
          onChange={() => {
            if (savingLoc !== loc.id) onToggle(loc);
          }}
          label={loc.autoPromoEnabled ? "Desactivar promociones con IA" : "Activar promociones con IA"}
        />
      </div>

      {loc.autoPromoEnabled ? (
        <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--bd-1)" }}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-ds-md py-2" style={{ background: "var(--surf-2)" }}>
              <div className="font-display text-base font-extrabold text-tx-hi">{loc.autoPromoThreshold}</div>
              <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-tx-dim">Umbral/sem</div>
            </div>
            <div className="rounded-ds-md py-2" style={{ background: "var(--surf-2)" }}>
              <div className="font-display text-base font-extrabold text-primary">{loc.autoPromoDiscount}%</div>
              <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-tx-dim">Descuento</div>
            </div>
            <div className="rounded-ds-md py-2" style={{ background: "var(--surf-2)" }}>
              <div className="font-display text-base font-extrabold" style={{ color: "var(--info)" }}>
                {loc.autoPromoMaxItems > 0 ? loc.autoPromoMaxItems : "∞"}
              </div>
              <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-tx-dim">Tope</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onConfigure(loc)}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-ds-md text-xs font-bold text-tx"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <Settings2 size={15} /> Configurar
            </button>
            <button
              type="button"
              onClick={() => onTrigger(loc.id)}
              disabled={triggering === loc.id}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-ds-md px-4 text-xs font-bold text-primary disabled:opacity-50"
              style={{ background: "var(--accent-soft)" }}
            >
              <Zap size={15} /> {triggering === loc.id ? "…" : "Analizar"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-tx-mut">
          Activa el switch para que la IA ajuste descuentos automáticamente en esta sucursal.
        </p>
      )}
    </Card>
  );
}
