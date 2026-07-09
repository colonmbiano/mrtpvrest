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
    new: { color: "var(--ok)", background: "var(--ok-soft)" },
    ok: { color: "var(--tx-mut)", background: "var(--surf-2)" },
    warn: { color: "var(--warn)", background: "var(--warn-soft)" },
  } as const;
  const s = colors[tone];
  return <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: s.color, background: s.background }}>{label}</span>;
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
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-ds-xl border"
        style={{ background: "var(--surf-1)", borderColor: "var(--bd-1)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--bd-1)" }}>
          <h2 className="font-display text-xl font-black" style={{ color: "var(--tx-hi)" }}>{title}</h2>
          <button onClick={close} className="text-xl leading-none text-tx-mut transition-colors hover:text-tx-hi">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5">
          {!hasPreview && !result && (
            <div className="py-8 text-center">
              <p className="mb-4 text-sm" style={{ color: "var(--tx-mut)" }}>
                Sube la plantilla <b>.xlsx</b> que descargaste y editaste. Te mostraremos una vista previa antes de guardar nada.
              </p>
              <button onClick={() => fileRef.current?.click()} disabled={loading}
                className="rounded-ds-md px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", color: "var(--accent-contrast)" }}>
                {loading ? "Leyendo archivo…" : "📤 Seleccionar archivo .xlsx"}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
            </div>
          )}

          {error && <p className="mb-3 text-center text-sm text-err">{error}</p>}
          {result && (
            <div className="py-8 text-center">
              <p className="mb-4 font-bold text-ok">✓ {result}</p>
              <button onClick={close} className="rounded-ds-md px-5 py-2 text-sm font-bold"
                style={{ background: "var(--surf-2)", color: "var(--tx-hi)", border: "1px solid var(--bd-2)" }}>Cerrar</button>
            </div>
          )}

          {/* PREVIEW INSUMOS */}
          {previewI && (
            <div>
              <div className="mb-3 flex gap-3 text-xs">
                <Chip label={`${previewI.summary.nuevos} nuevos`} tone="new" />
                <Chip label={`${previewI.summary.actualizar} a actualizar`} tone="ok" />
                <span className="text-tx-mut">de {previewI.summary.total} insumos</span>
              </div>
              <div className="overflow-hidden rounded-ds-md border" style={{ borderColor: "var(--bd-1)" }}>
                <table className="w-full text-xs">
                  <thead><tr style={{ background: "var(--surf-2)" }}>
                    {["Insumo", "Tipo", "Unidad", "Costo/u", "Stock", ""].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-bold uppercase" style={{ color: "var(--tx-mut)" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {previewI.insumos.map((it, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--bd-1)" }}>
                        <td className="px-3 py-1.5" style={{ color: "var(--tx)" }}>{it.name}</td>
                        <td className="px-3 py-1.5 text-tx-mut">{it.type || "—"}</td>
                        <td className="px-3 py-1.5 text-tx-mut">{u(it.baseUnit)}</td>
                        <td className="px-3 py-1.5 text-tx-mut">${(it.cost ?? 0).toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-tx-mut">{it.stock ?? "—"}</td>
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
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <Chip label={`${previewR.summary.platos} platillos`} tone="ok" />
                {previewR.summary.platosSinMatch > 0 && <Chip label={`${previewR.summary.platosSinMatch} sin coincidencia`} tone="warn" />}
                <Chip label={`${previewR.summary.subrecetas} subrecetas`} tone="ok" />
                {previewR.summary.ingredientesNuevos > 0 && <Chip label={`${previewR.summary.ingredientesNuevos} insumos nuevos`} tone="new" />}
                {previewR.summary.subrecetasNuevas > 0 && <Chip label={`${previewR.summary.subrecetasNuevas} subrecetas nuevas`} tone="new" />}
              </div>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {previewR.platos.map((d, i) => (
                  <div key={i} className="rounded-ds-md border p-3" style={{ borderColor: "var(--bd-1)", background: "var(--surf-2)" }}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: "var(--tx)" }}>{d.name}</span>
                      {d.status === "no-match"
                        ? <Chip label="NO ESTÁ EN EL MENÚ — SE OMITE" tone="warn" />
                        : <Chip label="OK" tone="ok" />}
                      {d.priceMesa != null && <span className="ml-auto text-[11px] text-tx-mut">${d.priceMesa} mesa</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {d.items.map((it, j) => (
                        <span key={j} className="rounded-ds-sm border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--bd-1)", color: "var(--tx-mut)" }}>
                          {it.component} {it.qty}{u(it.unit)}{it.isSub ? " (sub)" : ""}
                          {it.status?.startsWith("new") ? " 🆕" : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {previewR.subrecetas.map((s, i) => (
                  <div key={`s${i}`} className="rounded-ds-md border p-3" style={{ borderColor: "var(--bd-1)" }}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-bold text-warn">{s.name}</span>
                      <Chip label={s.status === "new" ? "SUBRECETA NUEVA" : "ACTUALIZA"} tone={s.status === "new" ? "new" : "ok"} />
                      {s.yieldQty != null && <span className="ml-auto text-[11px] text-tx-mut">rinde {s.yieldQty}{u(s.yieldUnit)}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {s.items.map((it, j) => (
                        <span key={j} className="rounded-ds-sm border px-2 py-0.5 text-[11px]" style={{ borderColor: "var(--bd-1)", color: "var(--tx-mut)" }}>
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
          <div className="flex items-center justify-between gap-3 border-t px-5 py-4" style={{ borderColor: "var(--bd-1)" }}>
            <button onClick={reset} className="rounded-ds-md border px-4 py-2 text-sm font-bold" style={{ borderColor: "var(--bd-2)", color: "var(--tx-mut)" }}>
              ← Otro archivo
            </button>
            <button onClick={confirm} disabled={confirming}
              className="rounded-ds-md px-5 py-2 text-sm font-black text-white disabled:opacity-50"
              style={{ background: "var(--ok)" }}>
              {confirming ? "Guardando…" : "✓ Confirmar e importar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
