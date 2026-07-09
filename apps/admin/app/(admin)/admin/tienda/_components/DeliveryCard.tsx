"use client";
import type { Dispatch, SetStateAction } from "react";
import { Truck, Crosshair, MapPin } from "lucide-react";
import { Field, Input, Button } from "@/components/ds";
import { MapLocationPicker } from "@/components/MapLocationPicker";
import { SectionCard, FieldLabel } from "./ui";
import { DELIVERY_MODES, type TiendaConfig } from "./types";

type Props = {
  config: TiendaConfig;
  setConfig: Dispatch<SetStateAction<TiendaConfig>>;
  geoStatus: "" | "loading" | "ok" | "error";
  useMyLocation: () => void;
};

export function DeliveryCard({ config, setConfig, geoStatus, useMyLocation }: Props) {
  return (
    <SectionCard icon={Truck} title="Envíos y reglas de pedido" subtitle="Reglas que verá el cliente al pedir">
      {/* Modo de cobro de envío */}
      <FieldLabel>Modo de cobro de envío</FieldLabel>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DELIVERY_MODES.map((m) => {
          const active = config.deliveryMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setConfig((p) => ({ ...p, deliveryMode: m.id }))}
              className="rounded-2xl p-4 text-left transition-colors"
              style={{
                border: `2px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                background: active ? "var(--accent-soft)" : "var(--surf-2)",
              }}
            >
              <p className="font-display text-sm font-extrabold text-tx-hi">{m.name}</p>
              <p className="mt-0.5 text-[11px] text-tx-mut">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Campos comunes */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {config.deliveryMode === "FLAT" && (
          <Field label="Costo de envío ($)">
            <Input type="number" min="0" value={config.deliveryFee} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig((p) => ({ ...p, deliveryFee: v })); }} />
          </Field>
        )}
        <Field label="Compra mínima ($)">
          <Input type="number" min="0" value={config.minOrderAmount} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig((p) => ({ ...p, minOrderAmount: v })); }} />
        </Field>
        <Field label="Envío gratis desde ($)" hint="0 = sin envío gratis por monto">
          <Input type="number" min="0" value={config.freeDeliveryFrom} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig((p) => ({ ...p, freeDeliveryFrom: v })); }} />
        </Field>
        <Field label="Tiempo estimado (min)">
          <Input type="number" min="0" value={config.estimatedDelivery} onChange={(e) => { const v = parseInt(e.target.value) || 0; setConfig((p) => ({ ...p, estimatedDelivery: v })); }} />
        </Field>
      </div>

      {/* Configuración por distancia */}
      {config.deliveryMode === "DISTANCE" && (
        <div className="mt-4 space-y-5 rounded-3xl p-5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[.12em] text-primary">Origen de la tienda</p>
              <p className="mt-0.5 text-[11px] text-tx-mut">
                {config.originLat != null && config.originLng != null
                  ? `${config.originLat.toFixed(5)}, ${config.originLng.toFixed(5)}`
                  : "Sin ubicación — define el punto de salida"}
              </p>
            </div>
            <Button variant="ghost" icon={Crosshair} onClick={useMyLocation}>
              {geoStatus === "loading" ? "Obteniendo…" : "Usar mi ubicación"}
            </Button>
          </div>
          {geoStatus === "error" && <p className="text-[11px] font-bold text-err">No se pudo obtener la ubicación. Permite el acceso al GPS o ingrésala manualmente.</p>}
          <MapLocationPicker
            value={config.originLat != null && config.originLng != null ? { lat: config.originLat, lng: config.originLng } : null}
            onChange={({ lat, lng }) => setConfig((p) => ({ ...p, originLat: lat, originLng: lng }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Latitud">
              <Input type="number" step="any" value={config.originLat ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig((p) => ({ ...p, originLat: v })); }} />
            </Field>
            <Field label="Longitud">
              <Input type="number" step="any" value={config.originLng ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig((p) => ({ ...p, originLng: v })); }} />
            </Field>
            <Field label="Tarifa base ($)">
              <Input type="number" min="0" value={config.deliveryBaseFee} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig((p) => ({ ...p, deliveryBaseFee: v })); }} />
            </Field>
            <Field label="Costo por km ($)">
              <Input type="number" min="0" value={config.deliveryPerKm} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig((p) => ({ ...p, deliveryPerKm: v })); }} />
            </Field>
            <Field label="Radio gratis (km)" hint="Dentro de este radio el envío es gratis">
              <Input type="number" min="0" step="any" value={config.deliveryFreeRadiusKm ?? ""} placeholder="opcional" onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig((p) => ({ ...p, deliveryFreeRadiusKm: v })); }} />
            </Field>
            <Field label="Distancia máxima (km)" hint="Fuera de este radio no hay cobertura">
              <Input type="number" min="0" step="any" value={config.deliveryMaxKm ?? ""} placeholder="opcional" onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig((p) => ({ ...p, deliveryMaxKm: v })); }} />
            </Field>
          </div>
          <p className="text-[11px] leading-relaxed text-tx-mut">
            Fórmula: <span className="text-primary">tarifa base + (costo por km × distancia)</span>. La distancia se mide en línea recta desde el origen hasta la ubicación GPS del cliente en el checkout.
          </p>
        </div>
      )}

      {config.deliveryMode === "ZONES" && (
        <div className="mt-4 space-y-4 rounded-3xl p-5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.12em] text-primary">Zonas de entrega</p>
            <p className="mt-1 text-[11px] leading-relaxed text-tx-mut">
              Dibuja polígonos en el mapa y asigna una tarifa a cada uno. La ubicación GPS del cliente en el checkout decide la zona y su costo; si cae fuera de todas, el pedido queda <span className="text-primary">fuera de cobertura</span>.
            </p>
          </div>
          <Button href="/admin/zonas" icon={MapPin}>
            Administrar zonas en el mapa
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
