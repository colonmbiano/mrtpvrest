"use client";
import { useRef, useState } from "react";
import api from "@/lib/api";

// Modal de importación de plantillas Excel (insumos o recetas).
// Flujo: seleccionar archivo → preview (no escribe) → confirmar (escribe).

type Mode = "insumos" | "recetas";

interface InsumoRow {
  name: string; type?: string; category?: string; supplier?: string;
  purchaseUnit?: string; purchaseCost?: number | null; purchaseQty?: number | null;
  baseUnit?: string; pesoBruto?: number | null; pesoNeto?: number | null;
  stock?: number | null; minStock?: number | null; cost?: number; status: "new" | "update";
}
interface RecetaItem { component: string; isSub: boolean; qty?: number | null; unit?: string; wastage?: number; status: string; }
interface PlatoRow { name: string; menuItemId: string | null; status: string; priceMesa?: number | null; priceDelivery?: number | null; commission?: number | null; items: RecetaItem[]; }
interface SubRow { name: string; status: string; yieldQty?: number | null; yieldUnit?: string; marginErrorPct?: number; items: RecetaItem[]; }

interface PreviewInsumos { insumos: InsumoRow[]; summary: { total: number; nuevos: number; actualizar: number }; }
interface PreviewRecetas {
  platos: PlatoRow[]; subrecetas: SubRow[];
  summary: { platos: number; platosSinMatch: number; subrecetas: number; ingredientesNuevos: number; subrecetasNuevas: number };
}

const UNIT_LABEL: Record<string, string> = { GRAM: "g", ML: "ml", PIECE: "pz" };
const u = (x?: string) => (x ? UNIT_LABEL[x] || x : "");

function Chip({ label, tone }: { label: string; tone: "new" | "ok" | "warn" }) {
  const colors = {
    new: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    ok: "bg-white/5 text-gray-400 border-white/10",
    warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  } as const;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${colors[tone]}`}>{label}</span>;
}

export default function ImportTemplateModal({ mode, open, onClose, onDone }: {
  mode: Mode; open: boolean; onClose: () => void; onDone?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewI, setPreviewI] = useState<PreviewInsumos | null>(null);
  const [previewR, setPreviewR] = useState<PreviewRecetas | null>(null);
  const [result, setResult] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setPreviewI(null); setPreviewR(null); setError(null); setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function close() { reset(); onClose(); }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await api.post(`/api/recipes/import/${mode}/preview`, fd);
      if (mode === "insumos") setPreviewI(res.data); else setPreviewR(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || "No se pudo leer el archivo.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    setConfirming(true); setError(null);
    try {
      if (mode === "insumos" && previewI) {
        const res = await api.post("/api/recipes/import/insumos/confirm", { items: previewI.insumos });
        setResult(`Listo: ${res.data.created} insumos nuevos, ${res.data.updated} actualizados.`);
      } else if (mode === "recetas" && previewR) {
        const res = await api.post("/api/recipes/import/recetas/confirm", { platos: previewR.platos, subrecetas: previewR.subrecetas });
        setResult(`Listo: ${res.data.recetasGuardadas} recetas, ${res.data.subrecetasGuardadas} subrecetas, ${res.data.ingredientesCreados} insumos nuevos${res.data.platosSinMatch ? `, ${res.data.platosSinMatch} platillos sin coincidencia (omitidos)` : ""}.`);
      }
      setPreviewI(null); setPreviewR(null);
      onDone?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || "No se pudo guardar.");
    } finally {
      setConfirming(false);
    }
  }

  const hasPreview = previewI || previewR;
  const title = mode === "insumos" ? "Importar insumos" : "Importar recetas";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border flex flex-col"
        style={{ background: "var(--surf)", borderColor: "var(--border)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-syne text-xl font-black" style={{ color: "var(--text)" }}>{title}</h2>
          <button onClick={close} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto">
          {!hasPreview && !result && (
            <div className="text-center py-8">
              <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
                Sube la plantilla <b>.xlsx</b> que descargaste y editaste. Te mostraremos una vista previa antes de guardar nada.
              </p>
              <button onClick={() => fileRef.current?.click()} disabled={loading}
                className="px-5 py-3 rounded-xl text-sm font-black bg-orange-500 text-white disabled:opacity-50">
                {loading ? "Leyendo archivo…" : "📤 Seleccionar archivo .xlsx"}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
            </div>
          )}

          {error && <p className="text-sm text-red-400 mb-3 text-center">{error}</p>}
          {result && (
            <div className="text-center py-8">
              <p className="text-emerald-400 font-bold mb-4">✓ {result}</p>
              <button onClick={close} className="px-5 py-2 rounded-xl text-sm font-bold bg-white text-black">Cerrar</button>
            </div>
          )}

          {/* PREVIEW INSUMOS */}
          {previewI && (
            <div>
              <div className="flex gap-3 mb-3 text-xs">
                <Chip label={`${previewI.summary.nuevos} nuevos`} tone="new" />
                <Chip label={`${previewI.summary.actualizar} a actualizar`} tone="ok" />
                <span className="text-gray-500">de {previewI.summary.total} insumos</span>
              </div>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                <table className="w-full text-xs">
                  <thead><tr style={{ background: "var(--surf2)" }}>
                    {["Insumo", "Tipo", "Unidad", "Costo/u", "Stock", ""].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-bold uppercase" style={{ color: "var(--muted)" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {previewI.insumos.map((it, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-1.5" style={{ color: "var(--text)" }}>{it.name}</td>
                        <td className="px-3 py-1.5 text-gray-500">{it.type || "—"}</td>
                        <td className="px-3 py-1.5 text-gray-500">{u(it.baseUnit)}</td>
                        <td className="px-3 py-1.5 text-gray-400">${(it.cost ?? 0).toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-gray-500">{it.stock ?? "—"}</td>
                        <td className="px-3 py-1.5">{it.status === "new" ? <Chip label="NUEVO" tone="new" /> : <Chip label="ACTUALIZA" tone="ok" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PREVIEW RECETAS */}
          {previewR && (
            <div>
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                <Chip label={`${previewR.summary.platos} platillos`} tone="ok" />
                {previewR.summary.platosSinMatch > 0 && <Chip label={`${previewR.summary.platosSinMatch} sin coincidencia`} tone="warn" />}
                <Chip label={`${previewR.summary.subrecetas} subrecetas`} tone="ok" />
                {previewR.summary.ingredientesNuevos > 0 && <Chip label={`${previewR.summary.ingredientesNuevos} insumos nuevos`} tone="new" />}
                {previewR.summary.subrecetasNuevas > 0 && <Chip label={`${previewR.summary.subrecetasNuevas} subrecetas nuevas`} tone="new" />}
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {previewR.platos.map((d, i) => (
                  <div key={i} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surf2)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm" style={{ color: "var(--text)" }}>{d.name}</span>
                      {d.status === "no-match"
                        ? <Chip label="NO ESTÁ EN EL MENÚ — SE OMITE" tone="warn" />
                        : <Chip label="OK" tone="ok" />}
                      {d.priceMesa != null && <span className="text-[11px] text-gray-500 ml-auto">${d.priceMesa} mesa</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {d.items.map((it, j) => (
                        <span key={j} className="text-[11px] px-2 py-0.5 rounded-md border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                          {it.component} {it.qty}{u(it.unit)}{it.isSub ? " (sub)" : ""}
                          {it.status?.startsWith("new") ? " 🆕" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {previewR.subrecetas.map((s, i) => (
                  <div key={`s${i}`} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm text-amber-400">{s.name}</span>
                      <Chip label={s.status === "new" ? "SUBRECETA NUEVA" : "ACTUALIZA"} tone={s.status === "new" ? "new" : "ok"} />
                      {s.yieldQty != null && <span className="text-[11px] text-gray-500 ml-auto">rinde {s.yieldQty}{u(s.yieldUnit)}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {s.items.map((it, j) => (
                        <span key={j} className="text-[11px] px-2 py-0.5 rounded-md border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                          {it.component} {it.qty}{u(it.unit)}{it.isSub ? " (sub)" : ""}{it.status?.startsWith("new") ? " 🆕" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {hasPreview && (
          <div className="px-5 py-4 border-t flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
            <button onClick={reset} className="px-4 py-2 rounded-xl text-sm font-bold border" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              ← Otro archivo
            </button>
            <button onClick={confirm} disabled={confirming}
              className="px-5 py-2 rounded-xl text-sm font-black bg-emerald-500 text-black disabled:opacity-50">
              {confirming ? "Guardando…" : "✓ Confirmar e importar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
