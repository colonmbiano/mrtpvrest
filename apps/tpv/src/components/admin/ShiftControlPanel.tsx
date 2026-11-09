"use client";
import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

export type DriverReceiptInput = { driverId: string; countedCash: number; differenceReason?: string };
type Review = {
  driverReceipts: { driverId: string; name: string; expectedCash: number }[];
  warnings: { code: string; label: string; count: number; amount?: number }[];
  unverifiedPayments: { id: string; orderNumber: string; method: string; amount: number }[];
  unassignedDeliveries: { id: string; orderNumber: string; total: number }[];
  responsibles: { id: string; name: string; role: string }[];
  missingReceipts: { id: string; driverId: string; amount: number; description: string }[];
};
type Props = { shiftId: string; onChange: (receipts: DriverReceiptInput[], reason: string, valid: boolean) => void };
const inputClass = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--text)]";

export default function ShiftControlPanel({ shiftId, onChange }: Props) {
  const [review, setReview] = useState<Review | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const { data } = await api.get<Review>(`/api/shifts/${shiftId}/preclose`); setReview(data); setError(""); }
    catch { setError("No se pudo revisar el cierre. Actualiza cuando haya conexión; el cierre definitivo requiere esta revisión."); }
  }, [shiftId]);
  useEffect(() => { let cancelled = false; queueMicrotask(() => { if (!cancelled) void load(); }); return () => { cancelled = true; }; }, [load]);
  useEffect(() => {
    const drivers = review?.driverReceipts || [];
    const receipts = drivers.filter((d) => (counts[d.driverId] || "").trim() !== "").map((d) => ({
      driverId: d.driverId, countedCash: Number(counts[d.driverId]), differenceReason: reasons[d.driverId] || "",
    }));
    const valid = Boolean(review) && drivers.every((d) => {
      const raw = counts[d.driverId]; const n = Number(raw);
      return raw != null && raw.trim() !== "" && Number.isFinite(n) && n >= 0
        && (Math.abs(n - d.expectedCash) < 0.01 || (reasons[d.driverId] || "").trim().length >= 5);
    }) && (!review?.warnings.length || reason.trim().length >= 5);
    onChange(receipts, reason, valid);
  }, [review, counts, reasons, reason, onChange]);

  async function verify(p: Review["unverifiedPayments"][number]) {
    const key = `${p.id}:${p.method}`;
    if ((references[key] || "").trim().length < 5) { setError("Escribe la referencia del banco o terminal (mínimo 5 caracteres)."); return; }
    setBusy(key);
    try {
      await api.patch(`/api/driver-cash/payments/${p.id}/verify`, { method: p.method, verified: true, reference: references[key] });
      await load();
    } catch (e: unknown) { setError((e as { response?: { data?: { error?: string } } }).response?.data?.error || "No se pudo verificar el pago."); }
    finally { setBusy(null); }
  }

  async function assign(orderId: string, employeeId: string) {
    if (!employeeId) return;
    setBusy(orderId);
    try {
      await api.put(`/api/orders/${orderId}/responsible`, { employeeId, reason: "Responsable confirmado en la revisión del cierre" });
      await load();
    } catch (e: unknown) { setError((e as { response?: { data?: { error?: string } } }).response?.data?.error || "No se pudo asignar al responsable."); }
    finally { setBusy(null); }
  }

  return <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surf2)] p-4">
    <div className="flex items-center justify-between gap-2"><h3 className="font-bold">Revisión del cierre</h3>
      <button type="button" onClick={() => void load()} className="text-sm underline">Actualizar</button></div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {!review && !error && <p className="text-sm">Revisando pendientes…</p>}
    {review?.driverReceipts.map((d) => <div key={d.driverId} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
      <p className="text-sm font-bold">{d.name} · esperado ${d.expectedCash.toFixed(2)}</p>
      <label className="block text-sm" htmlFor={`cash-${d.driverId}`}>Efectivo que recibiste</label>
      <input id={`cash-${d.driverId}`} className={inputClass} type="number" inputMode="decimal" min="0" step="0.01"
        value={counts[d.driverId] || ""} onChange={(e) => setCounts((v) => ({ ...v, [d.driverId]: e.target.value }))} />
      {counts[d.driverId]?.trim() && Number.isFinite(Number(counts[d.driverId])) && <p className="text-sm">
        Diferencia: ${(Number(counts[d.driverId]) - d.expectedCash).toFixed(2)}
      </p>}
      {counts[d.driverId]?.trim() && Math.abs(Number(counts[d.driverId]) - d.expectedCash) >= 0.01 && <>
        <label htmlFor={`difference-${d.driverId}`} className="block text-sm">Motivo de la diferencia</label>
        <input id={`difference-${d.driverId}`} className={inputClass} maxLength={500} value={reasons[d.driverId] || ""}
          onChange={(e) => setReasons((v) => ({ ...v, [d.driverId]: e.target.value }))} />
      </>}
    </div>)}
    {review && review.driverReceipts.length === 0 && <p className="text-sm">Repartidores: sin entregas de efectivo pendientes de corte.</p>}
    {review?.warnings.map((w) => <p key={w.code} className="text-sm text-amber-400">{w.label}: {w.count}{w.amount != null ? ` · $${w.amount.toFixed(2)}` : ""}</p>)}
    {review?.unverifiedPayments.map((p) => {
      const key = `${p.id}:${p.method}`;
      return <div key={key} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
        <p className="text-sm font-bold">#{p.orderNumber} · {p.method === "CARD" ? "Tarjeta" : "Transferencia"} · ${p.amount.toFixed(2)}</p>
        <label htmlFor={`ref-${key}`} className="block text-sm">Referencia bancaria o de terminal</label>
        <input id={`ref-${key}`} className={inputClass} maxLength={500} value={references[key] || ""}
          onChange={(e) => setReferences((v) => ({ ...v, [key]: e.target.value }))} />
        <button type="button" disabled={busy === key} onClick={() => void verify(p)} className="text-sm font-bold underline disabled:opacity-50">{busy === key ? "Guardando…" : "Confirmar contra banco / terminal"}</button>
      </div>;
    })}
    {review?.unassignedDeliveries.map((o) => <div key={o.id} className="space-y-2">
      <label htmlFor={`responsible-${o.id}`} className="text-sm">Responsable del domicilio #{o.orderNumber}</label>
      <select id={`responsible-${o.id}`} className={inputClass} disabled={busy === o.id} defaultValue="" onChange={(e) => void assign(o.id, e.target.value)}>
        <option value="">Selecciona quién hizo la entrega</option>
        {review.responsibles.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.role}</option>)}
      </select>
    </div>)}
    {!!review?.missingReceipts.length && <p className="text-sm">Los comprobantes pendientes se adjuntan o justifican en Movimientos del repartidor. El gasto ya está descontado de caja.</p>}
    {!!review?.warnings.length && <>
      <label htmlFor="close-review-reason" className="block text-sm font-bold">Si quedan pendientes, explica por qué autorizas el cierre</label>
      <textarea id="close-review-reason" className={inputClass} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
    </>}
  </section>;
}
