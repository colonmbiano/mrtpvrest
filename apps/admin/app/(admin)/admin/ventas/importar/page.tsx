"use client";
import { useState, useRef, useCallback } from "react";
import api from "@/lib/api";
import Link from "next/link";

// /admin/ventas/importar · Importador de histórico de ventas desde Excel/CSV.
//
// Flujo:
//   1. Drag-drop o seleccionar archivo
//   2. Auto: POST con ?dryRun=1 → preview (columnas detectadas, count, warnings)
//   3. Si OK, botón "Confirmar importación" → POST sin dryRun
//   4. Resumen final

interface PreviewResponse {
  dryRun?: boolean;
  ok?: boolean;
  detectedColumns: Record<string, string | undefined>;
  rowsRead: number;
  ordersToCreate?: number;
  itemsToCreate?: number;
  ordersCreated?: number;
  itemsCreated?: number;
  warnings: string[];
  sample?: Array<{ orderRef: string | null; date: string; paymentMethod: string; customer: string | null; tableName: string | null; items: Array<{ name: string; quantity: number; price: number; subtotal: number }> }>;
}

const COL_LABELS: Record<string, string> = {
  date: "Fecha", menuItem: "Producto", qty: "Cantidad",
  unitPrice: "Precio unit.", total: "Total", price: "Precio",
  paymentMethod: "Método pago", customer: "Cliente",
  table: "Mesa", orderRef: "Folio/Orden",
};

export default function ImportarVentasPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null); setPreview(null); setResult(null); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const handleFile = useCallback(async (f: File) => {
    setFile(f); setPreview(null); setResult(null); setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const { data } = await api.post<PreviewResponse>("/api/sales/import?dryRun=1", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Error al analizar archivo");
    } finally {
      setLoading(false);
    }
  }, []);

  async function confirmImport() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post<PreviewResponse>("/api/sales/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Error al importar");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <Link href="/admin" className="text-sm font-bold" style={{ color: "var(--muted)" }}>
          ← Admin
        </Link>
        <h1 className="font-syne text-3xl font-black">Importar histórico de ventas</h1>
      </div>

      {!result && (
        <div className="space-y-6">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="rounded-3xl p-10 text-center cursor-pointer transition-all"
            style={{
              border: `2px dashed ${dragOver ? "var(--gold)" : "var(--border)"}`,
              background: dragOver ? "rgba(245,166,35,0.05)" : "var(--surf)",
            }}
          >
            <div className="text-5xl mb-3">📊</div>
            <p className="text-base font-bold mb-1">
              {file ? file.name : "Arrastra tu archivo aquí o haz clic"}
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Excel (.xlsx, .xls) o CSV · max 25MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
          </div>

          {/* Instrucciones de columnas */}
          <details className="rounded-2xl p-4" style={{ background: "var(--surf)", border: "1px solid var(--border)" }}>
            <summary className="cursor-pointer text-sm font-bold">
              📋 ¿Qué columnas debe tener mi archivo?
            </summary>
            <div className="mt-3 text-xs space-y-2" style={{ color: "var(--muted)" }}>
              <p><strong style={{ color: "var(--text)" }}>Obligatorias:</strong></p>
              <ul className="ml-4 list-disc space-y-1">
                <li><code>fecha</code> / <code>date</code> — fecha de la venta (cualquier formato reconocible)</li>
                <li><code>producto</code> / <code>plato</code> / <code>item</code> — nombre del plato (debe coincidir con un MenuItem ya creado)</li>
              </ul>
              <p><strong style={{ color: "var(--text)" }}>Opcionales:</strong></p>
              <ul className="ml-4 list-disc space-y-1">
                <li><code>cantidad</code> / <code>qty</code> — default 1</li>
                <li><code>precio_unitario</code> o <code>total</code> — si solo hay total, se divide entre qty. Si no hay nada, se usa el precio actual del menú</li>
                <li><code>metodo</code> / <code>payment</code> — Efectivo, Tarjeta, Transferencia (default Efectivo)</li>
                <li><code>cliente</code>, <code>mesa</code>, <code>folio</code> — extra info. Si hay <code>folio</code>, varias filas con el mismo folio se agrupan en un Order.</li>
              </ul>
            </div>
          </details>

          {loading && !preview && (
            <div className="rounded-2xl p-6 text-center" style={{ background: "var(--surf)", border: "1px solid var(--border)" }}>
              <div className="text-2xl mb-2">⏳</div>
              <p className="text-sm font-bold">Analizando archivo…</p>
            </div>
          )}

          {error && (
            <div className="rounded-2xl p-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}>
              ⚠️ {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-4">
              {/* Columnas detectadas */}
              <div className="rounded-2xl p-5" style={{ background: "var(--surf)", border: "1px solid var(--border)" }}>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                  Columnas detectadas
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(preview.detectedColumns).map(([key, val]) => (
                    <div key={key} className="rounded-xl p-2 text-xs" style={{ background: val ? "rgba(16,185,129,0.1)" : "var(--surf2)" }}>
                      <p className="font-bold" style={{ color: val ? "#10b981" : "var(--muted)" }}>
                        {val ? "✓" : "—"} {COL_LABELS[key] || key}
                      </p>
                      {val && <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--muted)" }}>{val}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Filas leídas" value={preview.rowsRead} />
                <Stat label="Ordenes a crear" value={preview.ordersToCreate || 0} accent="var(--gold)" />
                <Stat label="Items a crear" value={preview.itemsToCreate || 0} />
              </div>

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <details className="rounded-2xl p-4" style={{ background: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.3)" }}>
                  <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--gold)" }}>
                    ⚠️ {preview.warnings.length} fila(s) tendrán problemas — clic para ver
                  </summary>
                  <ul className="mt-3 text-xs space-y-1 max-h-48 overflow-y-auto">
                    {preview.warnings.slice(0, 50).map((w, i) => (
                      <li key={i} style={{ color: "var(--muted)" }}>• {w}</li>
                    ))}
                    {preview.warnings.length > 50 && (
                      <li className="italic" style={{ color: "var(--muted)" }}>
                        … y {preview.warnings.length - 50} más
                      </li>
                    )}
                  </ul>
                </details>
              )}

              {/* Sample */}
              {preview.sample && preview.sample.length > 0 && (
                <div className="rounded-2xl p-5" style={{ background: "var(--surf)", border: "1px solid var(--border)" }}>
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                    Muestra (primeros 5)
                  </h3>
                  <div className="space-y-2">
                    {preview.sample.map((o, i) => (
                      <div key={i} className="rounded-xl p-3 text-xs" style={{ background: "var(--surf2)" }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold">{new Date(o.date).toLocaleDateString()} · {o.paymentMethod}</span>
                          <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                            {o.customer || (o.tableName ? `Mesa ${o.tableName}` : "—")}
                          </span>
                        </div>
                        {o.items.map((it, j) => (
                          <div key={j} className="flex justify-between" style={{ color: "var(--muted)" }}>
                            <span>{it.quantity}× {it.name}</span>
                            <span className="tabular-nums">${it.subtotal.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-3">
                <button onClick={reset} className="px-5 py-3 rounded-xl text-sm font-bold" style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--muted)" }}>
                  Cancelar
                </button>
                <button
                  onClick={confirmImport}
                  disabled={loading || (preview.ordersToCreate || 0) === 0}
                  className="flex-1 py-3 rounded-xl text-sm font-syne font-black"
                  style={{
                    background: (preview.ordersToCreate || 0) > 0 ? "var(--gold)" : "var(--muted)",
                    color: "#000",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? "Importando…" : `✓ Confirmar e importar ${preview.ordersToCreate} órdenes`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resultado final */}
      {result && (
        <div className="space-y-4">
          <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-2xl font-black mb-1" style={{ color: "#10b981" }}>
              Importación completa
            </h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {result.ordersCreated} orden{result.ordersCreated === 1 ? "" : "es"} · {result.itemsCreated} item{result.itemsCreated === 1 ? "" : "s"} creados
            </p>
          </div>

          {result.warnings.length > 0 && (
            <details className="rounded-2xl p-4" style={{ background: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.3)" }}>
              <summary className="cursor-pointer text-sm font-bold" style={{ color: "var(--gold)" }}>
                ⚠️ {result.warnings.length} advertencia(s)
              </summary>
              <ul className="mt-3 text-xs space-y-1 max-h-48 overflow-y-auto">
                {result.warnings.slice(0, 50).map((w, i) => (
                  <li key={i} style={{ color: "var(--muted)" }}>• {w}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex gap-3">
            <button onClick={reset} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{ background: "var(--gold)", color: "#000" }}>
              Importar otro archivo
            </button>
            <Link href="/admin/reportes-ia" className="flex-1 py-3 rounded-xl text-sm font-bold text-center" style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}>
              Ver reportes →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--surf)", border: "1px solid var(--border)", borderLeft: accent ? `4px solid ${accent}` : undefined }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-2xl font-black tabular-nums mt-1">{value}</p>
    </div>
  );
}
