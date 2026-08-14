"use client";
import type { Dispatch, SetStateAction } from "react";
import { Timer } from "lucide-react";
import { Field, Input } from "@/components/ds";
import { ToggleCard } from "./ui";
import type { TiendaConfig } from "./types";

// Minutos que usa el backend cuando el restaurante no configura los suyos
// (TABLE_PENDING_TTL_MIN en el backend). Solo se muestra como referencia.
const DEFAULT_TTL_MIN = 180;

type Props = {
  config: TiendaConfig;
  setConfig: Dispatch<SetStateAction<TiendaConfig>>;
};

/**
 * Barrido de mesas con pedido de QR sin aceptar.
 *
 * Tres estados en un solo campo (`tablePendingTtlMin`):
 *   · 0     → barrido apagado para este restaurante.
 *   · null  → encendido con el default del sistema (180 min).
 *   · N > 0 → encendido con N minutos.
 */
export function TableSweepCard({ config, setConfig }: Props) {
  const ttl = config.tablePendingTtlMin;
  const enabled = ttl !== 0;
  const effective = ttl ?? DEFAULT_TTL_MIN;

  return (
    <ToggleCard
      icon={Timer}
      title="Liberar mesas automáticamente"
      description={
        enabled
          ? `Un pedido de QR que nadie acepte en ${effective} min se cancela y su mesa vuelve a quedar libre. Los pedidos ya aceptados o pagados nunca se tocan.`
          : "Apagado — una mesa con pedido de QR sin aceptar seguirá ocupada hasta que alguien lo acepte o lo cancele a mano."
      }
      checked={enabled}
      onChange={(v) => setConfig((p) => ({ ...p, tablePendingTtlMin: v ? null : 0 }))}
      label="Liberar mesas automáticamente"
    >
      {enabled && (
        <div className="mt-4">
          <Field
            label="Minutos sin aceptar antes de liberar la mesa"
            hint={`El reloj se reinicia con cualquier movimiento en la cuenta (agregar productos, editarla). Déjalo vacío para usar el predeterminado (${DEFAULT_TTL_MIN} min). Mínimo 15, máximo 1440.`}
          >
            <Input
              type="number"
              min="15"
              max="1440"
              step="15"
              value={ttl ?? ""}
              placeholder={String(DEFAULT_TTL_MIN)}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const n = parseInt(raw, 10);
                setConfig((p) => ({
                  ...p,
                  tablePendingTtlMin: raw === "" || Number.isNaN(n) ? null : Math.min(1440, Math.max(15, n)),
                }));
              }}
            />
          </Field>
        </div>
      )}
    </ToggleCard>
  );
}
