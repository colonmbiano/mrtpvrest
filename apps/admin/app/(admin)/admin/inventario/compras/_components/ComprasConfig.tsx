"use client";
import { AlertTriangle } from "lucide-react";
import { Card, Pill, Toggle } from "@/components/ds";
import { cellCls, cellStyle, type LocationRow } from "./shared";

// Tres tarjetas de configuración de abastecimiento: bloqueo por stock, etapa de
// empaque y modelo de bodega central (con asignación de sucursal central).
export function ComprasConfig({
  blockStock,
  packingStage,
  centralEnabled,
  savingCfg,
  locations,
  centralLoc,
  onToggleBlockStock,
  onTogglePackingStage,
  onToggleCentral,
  onSetAsCentral,
}: {
  blockStock: boolean;
  packingStage: boolean;
  centralEnabled: boolean;
  savingCfg: boolean;
  locations: LocationRow[];
  centralLoc: LocationRow | null;
  onToggleBlockStock: (next: boolean) => void;
  onTogglePackingStage: (next: boolean) => void;
  onToggleCentral: (next: boolean) => void;
  onSetAsCentral: (locationId: string) => void;
}) {
  return (
    <>
      {/* Bloqueo por stock insuficiente */}
      <Card className="mb-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-extrabold text-tx-hi">Bloquear venta sin stock</p>
            <p className="mt-1 max-w-xl text-xs text-tx-mut">
              Apagado (recomendado para TPV con red intermitente): se cobra aunque el inventario no alcance.
              Encendido: la orden se rechaza si algún insumo de la receta no tiene stock suficiente.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Pill tone={blockStock ? "ok" : "neutral"}>{blockStock ? "Activado" : "Desactivado"}</Pill>
            <Toggle checked={blockStock} onChange={(n) => !savingCfg && onToggleBlockStock(n)} label="Bloquear venta sin stock" />
          </div>
        </div>
      </Card>

      {/* Etapa de empaque */}
      <Card className="mb-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-extrabold text-tx-hi">Etapa de empaque</p>
            <p className="mt-1 max-w-xl text-xs text-tx-mut">
              Apagado: cocina marca el pedido “Listo” directo. Encendido: los pedidos pasan por
              “En empaque” (checklist de verificación en el KDS) antes de quedar listos.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Pill tone={packingStage ? "ok" : "neutral"}>{packingStage ? "Activado" : "Desactivado"}</Pill>
            <Toggle checked={packingStage} onChange={(n) => !savingCfg && onTogglePackingStage(n)} label="Etapa de empaque" />
          </div>
        </div>
      </Card>

      {/* Configuración Bodega Central */}
      <Card className="mb-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-extrabold text-tx-hi">Modelo de Bodega Central</p>
            <p className="mt-1 max-w-xl text-xs text-tx-mut">
              Apagado: cada compra entra directo a la bodega de la sucursal.
              Encendido: las compras entran a la Bodega Central y luego se reparten a las sucursales.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Pill tone={centralEnabled ? "ok" : "neutral"}>{centralEnabled ? "Activado" : "Desactivado"}</Pill>
            <Toggle checked={centralEnabled} onChange={(n) => !savingCfg && onToggleCentral(n)} label="Bodega central" />
          </div>
        </div>
        {centralEnabled && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
            <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Sucursal como Bodega Central</span>
            <select
              value={centralLoc?.id || ""}
              onChange={e => e.target.value && onSetAsCentral(e.target.value)}
              disabled={savingCfg}
              className={cellCls}
              style={cellStyle}
            >
              <option value="">— elegir —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {!centralLoc && (
              <span className="flex items-center gap-1 text-xs font-bold text-err">
                <AlertTriangle size={13} /> Falta asignar la Bodega Central
              </span>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
