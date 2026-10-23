"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Truck } from "lucide-react";
import api from "@/lib/api";
import { Button, Card } from "@/components/ds";
import { createPolicyEditor, DELIVERY_POLICIES, initialPolicyState } from "@/lib/marketplaceDeliveryPolicy";

const inputClass = "w-full rounded-xl px-3 py-2.5 text-sm outline-none";
const inputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;
const labelClass = "mb-1 block text-xs font-semibold text-tx-mut";

export function MarketplaceDeliveryPolicyCard() {
  const [state, setState] = useState(initialPolicyState);
  const editor = useRef<ReturnType<typeof createPolicyEditor> | null>(null);
  useEffect(() => {
    const controller = createPolicyEditor({ api, onChange: setState,
      getScope: () => JSON.stringify([localStorage.getItem("restaurantId"), localStorage.getItem("locationId")]) });
    editor.current = controller;
    const reload = () => { void controller.load(); };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === "restaurantId" || event.key === "locationId") reload();
    };
    reload();
    window.addEventListener("locationChanged", reload);
    window.addEventListener("storage", storageChanged);
    return () => {
      controller.dispose(); editor.current = null;
      window.removeEventListener("locationChanged", reload); window.removeEventListener("storage", storageChanged);
    };
  }, []);

  return (
    <Card className="mb-4 p-5">
      <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-extrabold text-tx-hi">
        <Truck size={16} className="text-primary" aria-hidden="true" /> Política de Despacho Híbrido Marketplace
      </h2>
      <p className="mb-4 text-xs text-tx-mut">Configura quién recibe los pedidos de la sucursal seleccionada.</p>
      {state.loading && <p role="status" className="mb-3 text-sm text-tx-mut">Cargando política de despacho…</p>}
      {state.loadError ? (
        <div>
          <p role="alert" className="mb-3 text-sm text-tx">{state.loadError}</p>
          <Button variant="secondary" full={false} onClick={() => { void editor.current?.load(); }}>Reintentar carga</Button>
        </div>
      ) : (
        <form onSubmit={event => { event.preventDefault(); void editor.current?.save(); }}>
          <fieldset disabled={state.loading || state.saving || !state.merchantId} className="grid gap-4 disabled:opacity-60 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Política de despacho de la sucursal</legend>
            <div>
              <label htmlFor="marketplace-delivery-policy" className={labelClass}>Política</label>
              <select id="marketplace-delivery-policy" className={inputClass} style={inputStyle} value={state.draft.deliveryPolicy}
                onChange={event => editor.current?.setField("deliveryPolicy", event.target.value)}>
                {DELIVERY_POLICIES.map(policy => <option key={policy.value} value={policy.value}>{policy.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="marketplace-fallback-seconds" className={labelClass}>Segundos antes de compartir a red</label>
              <input id="marketplace-fallback-seconds" type="number" min="0" max="3600" step="1" required
                className={inputClass} style={inputStyle} value={state.draft.fallbackSeconds}
                onChange={event => editor.current?.setField("fallbackSeconds", event.target.value)} aria-describedby="marketplace-fallback-hint" />
              <p id="marketplace-fallback-hint" className="mt-1 text-xs text-tx-mut">Aplica a propios y fallback a red. Con 0, se comparte inmediatamente.</p>
            </div>
            <div>
              <label htmlFor="marketplace-max-distance" className={labelClass}>Radio máximo (km)</label>
              <input id="marketplace-max-distance" type="number" min="0" max="100" step="any" required
                className={inputClass} style={inputStyle} value={state.draft.maxDistanceKm}
                onChange={event => editor.current?.setField("maxDistanceKm", event.target.value)} />
            </div>
          </fieldset>
          {state.error && <p role="alert" className="mt-3 text-sm text-tx">{state.error}</p>}
          {state.message && <p role="status" className="mt-3 text-sm text-tx">{state.message}</p>}
          <Button type="submit" icon={Save} full={false} className="mt-4" loading={state.saving}
            disabled={state.loading || !state.merchantId}>Guardar política</Button>
        </form>
      )}
    </Card>
  );
}
