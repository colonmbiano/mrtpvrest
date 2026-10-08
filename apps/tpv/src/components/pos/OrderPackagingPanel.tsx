"use client";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

type Entry = { ingredientId: string; name: string; unit: string; quantity: number; unitCost: number; extraQuantity?: number };
type Plan = { pending: boolean; revision: string; orderType: string; editable: boolean; message: string | null; entries: Entry[]; packagingCost: number };
const unitLabel: Record<string, string> = { PIECE: "pzas", GRAM: "g", ML: "ml" };

export default function OrderPackagingPanel({ orderId, orderNumber, onClose }: {
  orderId: string; orderNumber: string; onClose: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [dirty, setDirty] = useState(false);
  const draftKey = `order-packaging-draft:v1:${orderId}`;

  const load = useCallback(() => api.get<Plan>(`/api/orders/${orderId}/packaging`).then(({ data }) => {
      setError(""); setPlan(data);
      const defaults = Object.fromEntries(data.entries.map(e => [e.ingredientId, e.quantity]));
      let restored = false;
      try {
        const saved = JSON.parse(localStorage.getItem(draftKey) || "null");
        if (saved?.revision === data.revision && data.editable) {
          for (const id of Object.keys(defaults)) {
            if (typeof saved.counts?.[id] === "number" && Number.isFinite(saved.counts[id])) defaults[id] = saved.counts[id];
          }
          restored = true;
        } else if (saved) setNotice("El pedido cambió. Revisa las cantidades actuales antes de volver a ajustar.");
      } catch { /* Storage can be unavailable on shared devices. */ }
      setCounts(defaults); setDirty(restored);
      if (restored) setNotice("Se recuperó tu borrador. Todavía no se ha guardado en el pedido.");
    }).catch((e: unknown) => {
      const error = e as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || "Sin conexión. Vuelve a intentar cuando el pedido esté sincronizado.");
    }).finally(() => setBusy(false)), [orderId, draftKey]);

  useEffect(() => { void load(); }, [load]);
  function change(id: string, quantity: number) {
    if (!Number.isFinite(quantity)) return;
    const next = { ...counts, [id]: Math.max(0, quantity) };
    setCounts(next); setDirty(true); setNotice("");
    try { localStorage.setItem(draftKey, JSON.stringify({ revision: plan?.revision, counts: next })); } catch { /* Saving to server remains available. */ }
  }
  async function save() {
    if (!plan?.editable) return;
    setBusy(true); setError("");
    try {
      const { data } = await api.put<Plan>(`/api/orders/${orderId}/packaging`, {
        revision: plan.revision,
        packaging: plan.entries.map(e => ({ ingredientId: e.ingredientId, quantity: counts[e.ingredientId] ?? e.quantity })),
      });
      setPlan(data); setCounts(Object.fromEntries(data.entries.map(e => [e.ingredientId, e.quantity])));
      setDirty(false); setNotice("Empaques guardados. Se descontarán del inventario al cobrar.");
      try { localStorage.removeItem(draftKey); } catch { /* Ignore blocked storage. */ }
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo guardar. Conservamos las cantidades para reintentar al recuperar conexión.");
    } finally { setBusy(false); }
  }
  const visible = plan?.entries.filter(e => showAll || e.quantity > 0 || (e.extraQuantity || 0) > 0 || (counts[e.ingredientId] ?? 0) > 0) || [];
  return (
    <div className="absolute inset-0 z-[30] bg-black/80 flex items-center justify-center p-3">
      <section role="dialog" aria-modal="true" aria-label={`Empaques del pedido ${orderNumber}`}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--surface-1)] text-white border border-white/15 p-5">
        <div className="flex justify-between items-center gap-3 mb-3">
          <h2 className="text-lg font-bold">Empaques · #{orderNumber}</h2>
          <button type="button" disabled={busy} onClick={onClose} className="min-h-11 px-3">Cerrar</button>
        </div>
        <p className="text-sm text-white/65 mb-3">Empaques incluidos en este pedido. Los extras vendidos se suman por separado. Para cambiar una caja por una charola, baja la caja a cero y agrega la charola. Captura las bolsas por pedido.</p>
        {plan?.message && <p className="mb-3 text-amber-200">{plan.message}</p>}
        {error && <p role="alert" className="mb-3 text-red-300">{error}</p>}
        {notice && <p role="status" className="mb-3 text-emerald-300">{notice}</p>}
        {!plan && busy && <p>Cargando empaques…</p>}
        {visible.map(e => (
          <label key={e.ingredientId} className="flex items-center justify-between gap-3 py-3 border-b border-white/10">
            <span className="text-sm">{e.name}<span className="block text-white/50">{unitLabel[e.unit] || e.unit}</span>{!!e.extraQuantity && <span className="block text-amber-200">+ {e.extraQuantity} extra(s) vendido(s)</span>}</span>
            <input aria-label={`Cantidad de ${e.name}`} type="number" inputMode="decimal" min={0} max={10000}
              step={e.unit === "PIECE" ? 1 : 0.001} value={counts[e.ingredientId] ?? e.quantity}
              onChange={event => change(e.ingredientId, Number(event.target.value))} disabled={busy || !plan?.editable}
              className="w-24 min-h-11 rounded-lg bg-white/10 border border-white/20 px-3 text-right" />
          </label>
        ))}
        {plan?.editable && <button type="button" onClick={() => setShowAll(!showAll)} className="min-h-11 mt-2 text-[var(--brand)]">{showAll ? "Mostrar usados" : "Agregar bolsa u otro empaque"}</button>}
        {plan && <p className="text-sm text-white/60 mt-3">Costo de empaques: ${plan.packagingCost.toFixed(2)}{dirty ? " · hay cambios sin guardar" : ""}</p>}
        <div className="flex gap-3 mt-4">
          <button type="button" onClick={() => { setBusy(true); void load(); }} disabled={busy} className="min-h-12 rounded-xl px-4 border border-white/20 disabled:opacity-40">Actualizar</button>
          {plan?.editable && <button type="button" onClick={() => void save()} disabled={busy || !dirty}
            className="flex-1 min-h-12 rounded-xl bg-[var(--brand)] text-[var(--brand-fg)] font-bold disabled:opacity-40">{busy ? "Guardando…" : "Guardar empaques"}</button>}
        </div>
      </section>
    </div>
  );
}
