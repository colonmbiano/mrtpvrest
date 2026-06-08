"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AlertTriangle, Loader2, Plus, Trash2, X } from "lucide-react";
import api from "@/lib/api";
import { getLocationId } from "@/lib/tenant";

interface WasteRow {
  id: string;
  reason: WasteReason;
  reasonDetail: string | null;
  photoUrl: string | null;
  createdAt: string;
  quantity: number;
  unit: string;
  costImpact: number;
  ingredient: { id: string; name: string; unit: string; cost: number };
  registeredBy: { id: string; name: string } | null;
}

type WasteReason =
  | "EXPIRED"
  | "DAMAGED"
  | "COURTESY"
  | "OVERPREP"
  | "CONTAMINATION"
  | "STAFF_MEAL"
  | "TEST_KITCHEN"
  | "OTHER";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stock: number;
  cost: number;
}

const REASON_LABELS: Record<WasteReason, string> = {
  EXPIRED: "Caducidad",
  DAMAGED: "Daño / derrame",
  COURTESY: "Cortesía",
  OVERPREP: "Sobre-preparación",
  CONTAMINATION: "Contaminación",
  STAFF_MEAL: "Comida staff",
  TEST_KITCHEN: "Prueba cocina",
  OTHER: "Otro",
};

const REASON_TONES: Record<WasteReason, string> = {
  EXPIRED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  DAMAGED: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  COURTESY: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  OVERPREP: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  CONTAMINATION: "bg-red-500/15 text-red-300 border-red-500/30",
  STAFF_MEAL: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  TEST_KITCHEN: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  OTHER: "bg-white/10 text-white/70 border-white/20",
};

const fmtMoney = (n: number) =>
  n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function CentroMermasPage() {
  const [rows, setRows] = useState<WasteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // bump → fuerza re-run del effect tras registrar una merma nueva.
  const [reloadTick, setReloadTick] = useState(0);
  const load = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { data } = await api.get<WasteRow[]>("/api/inventory/waste");
        if (!cancel) setRows(data);
      } catch (e: any) {
        if (!cancel) setError(e?.response?.data?.error || e.message);
      }
    })();
    return () => { cancel = true; };
  }, [reloadTick]);

  const totalCost = useMemo(() => (rows || []).reduce((s, r) => s + r.costImpact, 0), [rows]);

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-4 relative">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-5">
          <div className="flex flex-col">
            <span className="text-[9px] font-black tracking-[0.25em] text-white/40 uppercase">Total registros</span>
            <span className="text-xl font-black text-white tabular-nums">{rows?.length ?? "—"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black tracking-[0.25em] text-white/40 uppercase">Costo acumulado</span>
            <span className="text-xl font-black text-rose-300 tabular-nums">{fmtMoney(totalCost)}</span>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-black text-[#0a0a0c] bg-amber-400 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
        >
          <Plus size={14} strokeWidth={3} /> Registrar merma
        </button>
      </section>

      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm font-semibold flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!rows ? (
        <div className="flex flex-col items-center justify-center py-20 text-white/40">
          <Loader2 className="animate-spin mb-3" size={26} />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Cargando mermas…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-10 text-center text-white/40">
          <Trash2 size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-semibold">Sin mermas registradas todavía.</p>
          <p className="text-[11px] mt-1">Pulsa &quot;Registrar merma&quot; para empezar.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-white/10 bg-white/5">
                <tr className="text-[10px] font-black tracking-[0.18em] uppercase text-white/40">
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Ingrediente</th>
                  <th className="px-3 py-3">Cantidad</th>
                  <th className="px-3 py-3">Razón</th>
                  <th className="px-3 py-3">$ Impacto</th>
                  <th className="px-3 py-3">Empleado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-3 text-[12px] text-white/60 tabular-nums">{fmtDate(r.createdAt)}</td>
                    <td className="px-3 py-3">
                      <div className="text-sm font-bold text-white">{r.ingredient?.name}</div>
                      {r.reasonDetail && (
                        <div className="text-[10px] text-white/40 mt-0.5">{r.reasonDetail}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-white tabular-nums">
                      {r.quantity} {r.ingredient?.unit || r.unit}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest ${REASON_TONES[r.reason]}`}>
                        {REASON_LABELS[r.reason] || r.reason}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm font-black text-rose-300 tabular-nums">{fmtMoney(r.costImpact)}</td>
                    <td className="px-3 py-3 text-[12px] text-white/60">{r.registeredBy?.name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <RegisterWasteModal
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function RegisterWasteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Ingredient | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<WasteReason>("DAMAGED");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const locationId = getLocationId();
        if (!locationId) {
          setErr("Sucursal no identificada");
          return;
        }
        const { data } = await api.get<Ingredient[]>("/api/inventory/ingredients", {
          params: { locationId },
        });
        setIngredients(data);
      } catch (e: any) {
        setErr(e?.response?.data?.error || e.message);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!ingredients) return [];
    const q = search.trim().toLowerCase();
    return ingredients
      .filter((i) => i.stock > 0 && (q === "" || i.name.toLowerCase().includes(q)))
      .slice(0, 30);
  }, [ingredients, search]);

  const qtyNum = Number(quantity);
  const canSubmit =
    selected &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    qtyNum <= selected.stock &&
    Object.keys(REASON_LABELS).includes(reason);

  const submit = async () => {
    if (!canSubmit || !selected) return;
    setSubmitting(true);
    setErr(null);
    try {
      await api.post("/api/inventory/waste", {
        ingredientId: selected.id,
        quantity: qtyNum,
        reason,
        reasonDetail: detail.trim() || undefined,
      });
      onSuccess();
    } catch (e: any) {
      setErr(e?.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-3xl bg-[#0e0e11] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.6)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black text-white">Registrar merma</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 active:scale-95"
            aria-label="Cerrar"
          >
            <X size={16} className="text-white/60" />
          </button>
        </header>

        {/* Ingrediente */}
        <section className="mb-4">
          <label className="text-[10px] font-black tracking-[0.22em] text-white/40 uppercase mb-1.5 block">
            Ingrediente
          </label>
          {selected ? (
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div>
                <div className="text-sm font-bold text-white">{selected.name}</div>
                <div className="text-[11px] text-white/50 tabular-nums">
                  Stock: {selected.stock} {selected.unit} · Costo {fmtMoney(selected.cost)} / {selected.unit}
                </div>
              </div>
              <button
                onClick={() => { setSelected(null); setQuantity(""); }}
                className="text-[11px] font-bold text-amber-300 hover:text-amber-200"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ingrediente…"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400/60"
              />
              <ul className="mt-1.5 max-h-48 overflow-auto rounded-xl border border-white/5 divide-y divide-white/5">
                {!ingredients ? (
                  <li className="p-3 text-[11px] text-white/40 text-center">Cargando…</li>
                ) : filtered.length === 0 ? (
                  <li className="p-3 text-[11px] text-white/40 text-center">
                    Sin coincidencias o sin stock.
                  </li>
                ) : (
                  filtered.map((i) => (
                    <li key={i.id}>
                      <button
                        onClick={() => setSelected(i)}
                        className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-white/5 active:bg-white/10"
                      >
                        <span className="text-sm font-bold text-white">{i.name}</span>
                        <span className="text-[11px] text-white/40 tabular-nums">{i.stock} {i.unit}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </section>

        {/* Cantidad */}
        <section className="mb-4">
          <label className="text-[10px] font-black tracking-[0.22em] text-white/40 uppercase mb-1.5 block">
            Cantidad ({selected?.unit || "unidad"})
          </label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            disabled={!selected}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-lg font-bold tabular-nums focus:outline-none focus:border-amber-400/60 disabled:opacity-50"
          />
          {selected && qtyNum > selected.stock && (
            <p className="text-[11px] text-rose-300 mt-1">
              Excede el stock disponible ({selected.stock} {selected.unit}).
            </p>
          )}
        </section>

        {/* Razón */}
        <section className="mb-4">
          <label className="text-[10px] font-black tracking-[0.22em] text-white/40 uppercase mb-1.5 block">
            Razón
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {(Object.keys(REASON_LABELS) as WasteReason[]).map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all ${
                  reason === r
                    ? "text-[#0a0a0c] bg-amber-400"
                    : "text-white/70 bg-white/5 border border-white/10 hover:bg-white/10"
                }`}
              >
                {REASON_LABELS[r]}
              </button>
            ))}
          </div>
        </section>

        {/* Detalle */}
        <section className="mb-5">
          <label className="text-[10px] font-black tracking-[0.22em] text-white/40 uppercase mb-1.5 block">
            Nota (opcional)
          </label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="Ej: bolsa de chiles abierta sin sellar correctamente"
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400/60 resize-none"
          />
        </section>

        {err && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-[12px] font-semibold">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-full text-[12px] font-bold text-white/70 bg-white/5 border border-white/10 hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            disabled={!canSubmit || submitting}
            onClick={submit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-black text-[#0a0a0c] bg-amber-400 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={3} />}
            {submitting ? "Registrando…" : "Registrar merma"}
          </button>
        </div>
      </div>
    </div>
  );
}
