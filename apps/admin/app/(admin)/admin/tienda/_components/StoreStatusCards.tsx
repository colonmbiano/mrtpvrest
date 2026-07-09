"use client";
import type { Dispatch, SetStateAction } from "react";
import { Power, AlertTriangle, Wallet, Mail } from "lucide-react";
import { Field, Input } from "@/components/ds";
import { ToggleCard } from "./ui";
import type { TiendaConfig } from "./types";

type Props = {
  config: TiendaConfig;
  setConfig: Dispatch<SetStateAction<TiendaConfig>>;
};

export function StoreStatusCards({ config, setConfig }: Props) {
  return (
    <>
      {/* Estado de la tienda */}
      <ToggleCard
        icon={Power}
        title="Estado de la tienda"
        description={config.isOpen ? "Abierta — recibiendo pedidos" : "Cerrada — pedidos bloqueados"}
        checked={config.isOpen}
        onChange={(v) => setConfig((p) => ({ ...p, isOpen: v }))}
        label="Estado de la tienda"
      >
        {!config.isOpen && (
          <div className="mt-4">
            <Field label="Mensaje al cliente (tienda cerrada)">
              <Input
                type="text"
                value={config.closedMessage}
                placeholder="Ej. Volvemos mañana a las 9:00 am"
                onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, closedMessage: v })); }}
              />
            </Field>
          </div>
        )}
      </ToggleCard>

      {/* Freno de saturación — tope de pedidos remotos cuando la cocina va al tope */}
      <ToggleCard
        icon={AlertTriangle}
        title="Freno de saturación"
        description={
          config.maxOpenOrders > 0
            ? `Al llegar a ${config.maxOpenOrders} pedidos abiertos en cocina, la tienda online y el bot de WhatsApp dejan de aceptar pedidos. El TPV nunca se bloquea.`
            : "Apagado — la tienda online y el bot aceptan pedidos sin límite aunque la cocina vaya al tope."
        }
        checked={config.maxOpenOrders > 0}
        onChange={(v) => setConfig((p) => ({ ...p, maxOpenOrders: v ? 25 : 0 }))}
        label="Freno de saturación"
      >
        {config.maxOpenOrders > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Tope de pedidos abiertos" hint="Se cuentan los pedidos pendientes, confirmados y en preparación de las últimas 2 horas (de todos los canales).">
              <Input
                type="number"
                min="1"
                value={config.maxOpenOrders}
                onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); setConfig((p) => ({ ...p, maxOpenOrders: v })); }}
              />
            </Field>
            <Field label="Mensaje al cliente (saturados)">
              <Input
                type="text"
                value={config.saturatedMessage}
                placeholder="Ej. Cocina al tope 🔥 inténtalo en 30 min"
                onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, saturatedMessage: v })); }}
              />
            </Field>
          </div>
        )}
      </ToggleCard>

      {/* Corte de caja — visibilidad del efectivo esperado */}
      <ToggleCard
        icon={Wallet}
        title="Corte de caja"
        description={
          config.adminCanViewExpectedCash
            ? "Admins y gerentes ven el efectivo esperado al hacer el corte."
            : "Corte ciego estricto: ni los admins ven el esperado (solo empleados con permiso explícito)."
        }
        checked={config.adminCanViewExpectedCash}
        onChange={(v) => setConfig((p) => ({ ...p, adminCanViewExpectedCash: v }))}
        label="Admins ven el efectivo esperado"
      />

      {/* Corte de caja — envío automático por correo al cierre */}
      <ToggleCard
        icon={Mail}
        title="Corte por correo"
        description={
          config.cashCutEmailEnabled
            ? "Al cerrar la caja (restaurante y tienda) se envía el resumen del corte por correo."
            : "Recibe el corte de caja en tu correo cada vez que se cierra la caja, tanto del restaurante como de la tienda."
        }
        checked={config.cashCutEmailEnabled}
        onChange={(v) => setConfig((p) => ({ ...p, cashCutEmailEnabled: v }))}
        label="Enviar el corte por correo"
      >
        {config.cashCutEmailEnabled && (
          <div className="mt-4">
            <Field
              label="Correo(s) destino"
              hint="Separa varios correos con coma. Si lo dejas vacío, se envía a los administradores del restaurante."
            >
              <Input
                type="text"
                value={config.cashCutEmails}
                placeholder="dueño@correo.com, contador@correo.com"
                onChange={(e) => { const v = e.target.value; setConfig((p) => ({ ...p, cashCutEmails: v })); }}
              />
            </Field>
          </div>
        )}
      </ToggleCard>
    </>
  );
}
