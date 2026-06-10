"use client";
import { useState, useRef, useCallback } from "react";
import {
  ChevronLeft, FileSpreadsheet, Loader2, AlertTriangle, Check, CheckCircle2,
  X, ListChecks, FileText,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, SectionLabel, PrimaryBtn,
} from "@/components/warmtech";

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
    <WtScreen>
      <PageHeader
        eyebrow="Datos & migración"
        title="Importar histórico de ventas"
        subtitle="Sube tu archivo Excel o CSV para cargar ventas pasadas."
      />

      {/* back link (móvil + desktop) */}
      <a
        href="/admin"
        className="mb-4 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-primary"
      >
        <ChevronLeft size={15} /> Admin
      </a>

      {!result && (
        <div className="flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-[20px] p-8 text-center transition-all md:p-10"
            style={{
              border: `2px dashed ${dragOver ? "var(--brand-primary)" : "var(--bd-1)"}`,
              background: dragOver ? "var(--iris-soft)" : "var(--surf-1)",
            }}
          >
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-primary"
              style={{ background: "var(--iris-soft)" }}>
              <FileSpreadsheet size={28} strokeWidth={1.8} />
            </span>
            <p className="text-base font-bold text-tx-hi">
              {file ? file.name : "Arrastra tu archivo aquí o haz clic"}
            </p>
            <p className="mt-1 text-xs text-tx-mut">
              Excel (.xlsx) o CSV · max 25MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
          </div>

          {/* Instrucciones de columnas */}
          <WtCard className="p-4">
            <details>
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-tx">
                <ListChecks size={16} className="text-primary" />
                ¿Qué columnas debe tener mi archivo?
              </summary>
              <div className="mt-3 space-y-2 text-xs text-tx-mut">
                <p><strong className="text-tx">Obligatorias:</strong></p>
                <ul className="ml-4 list-disc space-y-1">
                  <li><code>fecha</code> / <code>date</code> — fecha de la venta (cualquier formato reconocible)</li>
                  <li><code>producto</code> / <code>plato</code> / <code>item</code> — nombre del plato (debe coincidir con un MenuItem ya creado)</li>
                </ul>
                <p><strong className="text-tx">Opcionales:</strong></p>
                <ul className="ml-4 list-disc space-y-1">
                  <li><code>cantidad</code> / <code>qty</code> — default 1</li>
                  <li><code>precio_unitario</code> o <code>total</code> — si solo hay total, se divide entre qty. Si no hay nada, se usa el precio actual del menú</li>
                  <li><code>metodo</code> / <code>payment</code> — Efectivo, Tarjeta, Transferencia (default Efectivo)</li>
                  <li><code>cliente</code>, <code>mesa</code>, <code>folio</code> — extra info. Si hay <code>folio</code>, varias filas con el mismo folio se agrupan en un Order.</li>
                </ul>
              </div>
            </details>
          </WtCard>

          {loading && !preview && (
            <WtCard className="p-6 text-center">
              <Loader2 size={24} className="mx-auto mb-2 animate-spin text-primary" />
              <p className="text-sm font-bold text-tx">Analizando archivo…</p>
            </WtCard>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-2xl p-4 text-sm"
              style={{ background: "var(--err-soft)", color: "var(--err)" }}>
              <AlertTriangle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="flex flex-col gap-4">
              {/* Columnas detectadas */}
              <WtCard className="p-4 md:p-5">
                <SectionLabel>Columnas detectadas</SectionLabel>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {Object.entries(preview.detectedColumns).map(([key, val]) => (
                    <div key={key} className="rounded-xl p-2 text-xs"
                      style={{
                        background: val ? "var(--ok-soft)" : "var(--surf-2)",
                        border: "1px solid var(--bd-1)",
                      }}>
                      <p className="flex items-center gap-1 font-bold"
                        style={{ color: val ? "var(--ok)" : "var(--tx-mut)" }}>
                        {val ? <Check size={12} /> : <X size={12} />}
                        {COL_LABELS[key] || key}
                      </p>
                      {val && <p className="mt-0.5 truncate text-[10px] text-tx-mut">{val}</p>}
                    </div>
                  ))}
                </div>
              </WtCard>

              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Filas leídas" value={preview.rowsRead} />
                <Stat label="Ordenes a crear" value={preview.ordersToCreate || 0} accent />
                <Stat label="Items a crear" value={preview.itemsToCreate || 0} />
              </div>

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <WtCard className="p-4" style={{ borderColor: "var(--warn)" }}>
                  <details>
                    <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"
                      style={{ color: "var(--warn)" }}>
                      <AlertTriangle size={15} />
                      {preview.warnings.length} fila(s) tendrán problemas — clic para ver
                    </summary>
                    <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs warmtech-scrollbar">
                      {preview.warnings.slice(0, 50).map((w, i) => (
                        <li key={i} className="text-tx-mut">• {w}</li>
                      ))}
                      {preview.warnings.length > 50 && (
                        <li className="italic text-tx-mut">
                          … y {preview.warnings.length - 50} más
                        </li>
                      )}
                    </ul>
                  </details>
                </WtCard>
              )}

              {/* Sample */}
              {preview.sample && preview.sample.length > 0 && (
                <WtCard className="p-4 md:p-5">
                  <SectionLabel>Muestra (primeros 5)</SectionLabel>
                  <div className="space-y-2">
                    {preview.sample.map((o, i) => (
                      <div key={i} className="rounded-xl p-3 text-xs"
                        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="font-bold text-tx">{new Date(o.date).toLocaleDateString()} · {o.paymentMethod}</span>
                          <span className="tabular-nums text-tx-mut">
                            {o.customer || (o.tableName ? `Mesa ${o.tableName}` : "—")}
                          </span>
                        </div>
                        {o.items.map((it, j) => (
                          <div key={j} className="flex justify-between text-tx-mut">
                            <span>{it.quantity}× {it.name}</span>
                            <span className="tabular-nums">${it.subtotal.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </WtCard>
              )}

              {/* Acciones */}
              <div className="flex gap-3">
                <PrimaryBtn ghost icon={X} onClick={reset}>
                  Cancelar
                </PrimaryBtn>
                <PrimaryBtn
                  icon={Check}
                  onClick={confirmImport}
                  disabled={loading || (preview.ordersToCreate || 0) === 0}
                >
                  {loading ? "Importando…" : `Confirmar e importar ${preview.ordersToCreate} órdenes`}
                </PrimaryBtn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resultado final */}
      {result && (
        <div className="flex flex-col gap-4">
          <WtCard className="p-6 text-center" style={{ borderColor: "var(--ok)" }}>
            <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl"
              style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
              <CheckCircle2 size={30} strokeWidth={1.8} />
            </span>
            <h2 className="font-display text-2xl font-extrabold" style={{ color: "var(--ok)" }}>
              Importación completa
            </h2>
            <p className="mt-1 text-sm text-tx-mut">
              {result.ordersCreated} orden{result.ordersCreated === 1 ? "" : "es"} · {result.itemsCreated} item{result.itemsCreated === 1 ? "" : "s"} creados
            </p>
          </WtCard>

          {result.warnings.length > 0 && (
            <WtCard className="p-4" style={{ borderColor: "var(--warn)" }}>
              <details>
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold"
                  style={{ color: "var(--warn)" }}>
                  <AlertTriangle size={15} />
                  {result.warnings.length} advertencia(s)
                </summary>
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs warmtech-scrollbar">
                  {result.warnings.slice(0, 50).map((w, i) => (
                    <li key={i} className="text-tx-mut">• {w}</li>
                  ))}
                </ul>
              </details>
            </WtCard>
          )}

          <div className="flex gap-3">
            <PrimaryBtn icon={FileSpreadsheet} onClick={reset}>
              Importar otro archivo
            </PrimaryBtn>
            <PrimaryBtn ghost icon={FileText} href="/admin/reportes-ia">
              Ver reportes
            </PrimaryBtn>
          </div>
        </div>
      )}
    </WtScreen>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <WtCard className="p-3 md:p-4" style={accent ? { borderLeft: "4px solid var(--brand-primary)" } : undefined}>
      <p className="font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tabular-nums text-tx-hi">{value}</p>
    </WtCard>
  );
}
