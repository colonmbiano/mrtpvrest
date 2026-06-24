"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ImagePlus, Images, Check, X, Search, UtensilsCrossed, Loader2,
  UploadCloud, Trash2, Crop, Maximize2, AlertTriangle, Sparkles, ChevronLeft,
} from "lucide-react";
import api from "@/lib/api";
import { uploadMenuImage } from "@/lib/supabaseUpload";
import { extractErrorMessage } from "@/lib/errors";
import {
  WtScreen, PageHeader, WtCard, PrimaryBtn, EmptyState, Pill, ProgressBar,
} from "@/components/warmtech";

// ── Tipos laxos (igual que la pantalla de Menú) ──────────────────────────
type Item = {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  category?: { name?: string } | null;
  imageUrl?: string | null;
  imageFit?: "cover" | "contain" | null;
};
type Cat = { id: string; name: string };

type UploadStatus = "idle" | "uploading" | "saved" | "error";

// ── Emparejado por nombre de archivo ─────────────────────────────────────
// Normaliza quitando acentos, extensión y todo lo no alfanumérico para que
// "Hamburguesa-Clásica (1).JPG" empareje con "Hamburguesa Clasica".
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function stripExt(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "");
}
function matchScore(fileNorm: string, prodNorm: string): number {
  if (!fileNorm || !prodNorm) return 0;
  if (fileNorm === prodNorm) return 1;
  const fileTokens = new Set(fileNorm.split(" ").filter(Boolean));
  const prodTokens = prodNorm.split(" ").filter(Boolean);
  if (prodTokens.length === 0 || fileTokens.size === 0) return 0;
  let shared = 0;
  for (const t of prodTokens) if (fileTokens.has(t)) shared++;
  let score = shared / Math.max(fileTokens.size, prodTokens.length);
  if (fileNorm.includes(prodNorm) || prodNorm.includes(fileNorm)) score += 0.3;
  return Math.min(1, score);
}
function bestMatch(fileName: string, products: Item[]): { id: string; score: number } | null {
  const fn = normalize(stripExt(fileName));
  let best: { id: string; score: number } | null = null;
  for (const p of products) {
    const sc = matchScore(fn, normalize(p.name));
    if (!best || sc > best.score) best = { id: p.id, score: sc };
  }
  return best;
}

// Ejecuta `worker` sobre `arr` con un máximo de `limit` en paralelo.
async function runPool<T>(arr: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (idx < arr.length) {
      const cur = idx++;
      await worker(arr[cur] as T);
    }
  });
  await Promise.all(runners);
}

type BulkRow = { file: File; url: string; targetId: string; score: number };

export default function MenuPhotosPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"missing" | "has" | "all">("missing");

  const [status, setStatus] = useState<Record<string, UploadStatus>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [bulkDragOver, setBulkDragOver] = useState(false);

  // Objetivo de "pegar" (Ctrl+V): el producto sobre el que está el cursor.
  const hoverRef = useRef<string | null>(null);

  // Modal de carga en lote (auto-emparejado por nombre de archivo)
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  const bulkInputRef = useRef<HTMLInputElement | null>(null);

  async function fetchData() {
    try {
      const [i, c] = await Promise.all([
        api.get("/api/menu/items?admin=true"),
        api.get("/api/menu/categories?admin=true"),
      ]);
      setItems(Array.isArray(i.data) ? i.data : []);
      setCats(Array.isArray(c.data) ? c.data : []);
    } catch {
      /* sin datos */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  // ── Subida individual (clic / arrastrar / pegar) ───────────────────────
  async function uploadForItem(id: string, file: File) {
    if (!file || !file.type.startsWith("image/")) return;
    setStatus(p => ({ ...p, [id]: "uploading" }));
    try {
      const url = await uploadMenuImage(file);
      await api.put(`/api/menu/items/${id}`, { imageUrl: url });
      setItems(prev => prev.map(it => (it.id === id ? { ...it, imageUrl: url } : it)));
      setStatus(p => ({ ...p, [id]: "saved" }));
    } catch (err) {
      setStatus(p => ({ ...p, [id]: "error" }));
      alert(extractErrorMessage(err, "No se pudo subir la imagen"));
    }
  }

  async function setFit(id: string, fit: "cover" | "contain") {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, imageFit: fit } : it)));
    try { await api.put(`/api/menu/items/${id}`, { imageFit: fit }); } catch { /* visual */ }
  }

  async function removeImage(id: string) {
    if (!confirm("¿Quitar la foto de este producto?")) return;
    setItems(prev => prev.map(it => (it.id === id ? { ...it, imageUrl: "" } : it)));
    setStatus(p => ({ ...p, [id]: "idle" }));
    try { await api.put(`/api/menu/items/${id}`, { imageUrl: "" }); } catch { /* visual */ }
  }

  // ── Pegar (Ctrl+V) sobre el producto bajo el cursor ────────────────────
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = hoverRef.current;
      if (!target) return;
      const list = e.clipboardData?.items;
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (it && it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) { e.preventDefault(); uploadForItem(target, file); }
          break;
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Carga en lote ──────────────────────────────────────────────────────
  function startBulk(files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (arr.length === 0) return;
    const rows: BulkRow[] = arr.map(f => {
      const m = bestMatch(f.name, items);
      return {
        file: f,
        url: URL.createObjectURL(f),
        targetId: m && m.score >= 0.5 ? m.id : "",
        score: m?.score ?? 0,
      };
    });
    setBulkRows(rows);
    setBulkProgress({ done: 0, total: 0 });
  }

  function closeBulk() {
    if (bulkBusy) return;
    bulkRows?.forEach(r => URL.revokeObjectURL(r.url));
    setBulkRows(null);
  }

  async function applyBulk() {
    if (!bulkRows) return;
    const assigned = bulkRows.filter(r => r.targetId);
    if (assigned.length === 0) { alert("Asigna al menos una foto a un producto."); return; }
    setBulkBusy(true);
    setBulkProgress({ done: 0, total: assigned.length });
    let done = 0;
    const failed: string[] = [];
    await runPool(assigned, 3, async (row) => {
      try {
        const url = await uploadMenuImage(row.file);
        await api.put(`/api/menu/items/${row.targetId}`, { imageUrl: url });
        setItems(prev => prev.map(it => (it.id === row.targetId ? { ...it, imageUrl: url } : it)));
      } catch {
        failed.push(row.file.name);
      } finally {
        done++;
        setBulkProgress({ done, total: assigned.length });
      }
    });
    setBulkBusy(false);
    bulkRows.forEach(r => URL.revokeObjectURL(r.url));
    setBulkRows(null);
    if (failed.length > 0) {
      alert(`No se pudieron subir ${failed.length} imagen(es):\n${failed.join("\n")}`);
    }
  }

  // ── Derivados ──────────────────────────────────────────────────────────
  const withPhoto = items.filter(i => i.imageUrl).length;
  const total = items.length;
  const pct = total ? Math.round((withPhoto / total) * 100) : 0;
  const missingCount = total - withPhoto;

  const filtered = items.filter(it => {
    if (statusFilter === "missing" && it.imageUrl) return false;
    if (statusFilter === "has" && !it.imageUrl) return false;
    if (catFilter !== "all" && it.categoryId !== catFilter) return false;
    if (search.trim() && !(it.name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Productos agrupados por categoría para los <select> del modal de lote.
  const catName = (id: string | null) => cats.find(c => c.id === id)?.name || "Sin categoría";

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Catálogo"
        title="Fotos de productos"
        subtitle="Sube imágenes en lote sin abrir cada platillo. Arrastra, pega o toma una foto."
        actions={
          <>
            <button
              type="button"
              onClick={() => bulkInputRef.current?.click()}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[13px] px-4 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
              style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 6px 18px var(--iris-glow)" }}
            >
              <Images size={16} strokeWidth={2} /> Subir varias fotos
            </button>
            <PrimaryBtn full={false} ghost icon={ChevronLeft} href="/admin/menu">
              Menú
            </PrimaryBtn>
          </>
        }
      />
      <input
        ref={bulkInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files?.length) startBulk(e.target.files); e.target.value = ""; }}
      />

      {/* Acciones (móvil) */}
      <div className="mb-4 md:hidden">
        <button
          type="button"
          onClick={() => bulkInputRef.current?.click()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] px-3 text-sm font-bold text-white transition-transform active:scale-[.98]"
          style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 6px 18px var(--iris-glow)" }}
        >
          <Images size={16} strokeWidth={2} /> Subir varias fotos
        </button>
      </div>

      {/* Zona de arrastrar varias + progreso */}
      <WtCard
        className="mb-4 p-4"
        style={bulkDragOver ? { borderColor: "var(--brand-primary)", background: "var(--iris-soft)" } : undefined}
      >
        <div
          onDragOver={e => { e.preventDefault(); setBulkDragOver(true); }}
          onDragLeave={() => setBulkDragOver(false)}
          onDrop={e => { e.preventDefault(); setBulkDragOver(false); if (e.dataTransfer.files?.length) startBulk(e.dataTransfer.files); }}
          onClick={() => bulkInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-all"
          style={{ borderColor: bulkDragOver ? "var(--brand-primary)" : "var(--bd-2)" }}
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl text-primary" style={{ background: "var(--iris-soft)" }}>
            <UploadCloud size={24} strokeWidth={1.8} />
          </span>
          <div className="font-display text-sm font-extrabold text-tx-hi">
            Arrastra aquí una carpeta de fotos
          </div>
          <p className="max-w-md text-xs text-tx-mut">
            Las emparejamos solas con cada producto por el nombre del archivo
            (ej. <span className="font-bold text-tx">hamburguesa-clasica.jpg</span> → Hamburguesa Clásica).
            Revisas y confirmas antes de aplicar.
          </p>
        </div>

        {/* Resumen de cobertura */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-bold text-tx">{withPhoto} de {total} con foto</span>
              <span className="font-mono text-tx-mut">{pct}%</span>
            </div>
            <ProgressBar pct={pct} />
          </div>
          {missingCount > 0 && (
            <Pill tone="warn">{missingCount} sin foto</Pill>
          )}
        </div>
      </WtCard>

      {/* Filtros */}
      <WtCard className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[160px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="min-h-11 w-full rounded-xl pl-9 pr-3 text-sm text-tx outline-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          />
        </div>
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="min-h-11 rounded-xl px-3 text-sm font-bold text-tx outline-none"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          <option value="all">Todas las categorías</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-xl" style={{ border: "1px solid var(--bd-1)" }}>
          {([
            ["missing", "Sin foto"],
            ["has", "Con foto"],
            ["all", "Todos"],
          ] as const).map(([val, label]) => {
            const active = statusFilter === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className="min-h-11 px-3 text-xs font-bold transition-all"
                style={{
                  background: active ? "var(--brand-primary)" : "transparent",
                  color: active ? "#fffaf4" : "var(--tx-mut)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span className="px-1 text-xs font-bold text-tx-mut">{filtered.length} productos</span>
      </WtCard>

      {/* Grid de productos */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={statusFilter === "missing" && missingCount === 0 ? "¡Todos los productos tienen foto!" : "Sin productos"}
          hint={
            statusFilter === "missing" && missingCount === 0
              ? "Cambia el filtro a “Todos” para reemplazar fotos."
              : search.trim() ? "Prueba con otra búsqueda." : "Agrega productos desde el Menú."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(it => {
            const st = status[it.id] || "idle";
            const uploading = st === "uploading";
            const isDrag = dragId === it.id;
            const fit = it.imageFit === "contain" ? "contain" : "cover";
            return (
              <WtCard
                key={it.id}
                className="flex flex-col overflow-hidden p-0"
                style={isDrag ? { borderColor: "var(--brand-primary)", boxShadow: "0 0 0 2px var(--brand-primary)" } : undefined}
              >
                {/* Área de imagen: clic = elegir archivo (cámara en móvil) */}
                <div
                  onMouseEnter={() => { hoverRef.current = it.id; }}
                  onMouseLeave={() => { if (hoverRef.current === it.id) hoverRef.current = null; }}
                  onDragOver={e => { e.preventDefault(); setDragId(it.id); }}
                  onDragLeave={() => setDragId(d => (d === it.id ? null : d))}
                  onDrop={e => {
                    e.preventDefault();
                    setDragId(null);
                    const f = e.dataTransfer.files?.[0];
                    if (f) uploadForItem(it.id, f);
                  }}
                  className="relative"
                >
                  <label className="relative block aspect-[4/3] w-full cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadForItem(it.id, f);
                        e.target.value = "";
                      }}
                    />
                    {it.imageUrl ? (
                      <Image
                        src={it.imageUrl}
                        alt={it.name}
                        fill
                        sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 20vw"
                        className={fit === "contain" ? "object-contain" : "object-cover"}
                      />
                    ) : (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-tx-mut" style={{ background: "var(--surf-2)" }}>
                        <ImagePlus size={26} strokeWidth={1.6} />
                        <span className="text-[11px] font-bold">Toca para subir</span>
                      </span>
                    )}

                    {/* Estado de subida / guardado */}
                    {uploading && (
                      <span className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
                        <Loader2 size={26} className="animate-spin text-white" />
                      </span>
                    )}
                    {st === "saved" && !uploading && (
                      <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-white shadow" style={{ background: "var(--ok)" }}>
                        <Check size={15} strokeWidth={3} />
                      </span>
                    )}
                    {st === "error" && !uploading && (
                      <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-white shadow" style={{ background: "var(--err)" }}>
                        <AlertTriangle size={14} strokeWidth={2.4} />
                      </span>
                    )}
                  </label>
                </div>

                {/* Info + controles */}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-sm font-extrabold leading-tight text-tx-hi" title={it.name}>{it.name}</h3>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="truncate text-[11px] text-tx-mut">{it.category?.name || catName(it.categoryId)}</span>
                      <span className="ml-auto font-mono text-xs font-bold text-primary">${it.price}</span>
                    </div>
                  </div>

                  {it.imageUrl && (
                    <div className="mt-auto flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setFit(it.id, "cover")}
                        title="Rellenar (recorta para llenar)"
                        className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition-all"
                        style={{
                          background: fit === "cover" ? "var(--brand-primary)" : "transparent",
                          color: fit === "cover" ? "#fffaf4" : "var(--tx-mut)",
                          border: `1px solid ${fit === "cover" ? "var(--brand-primary)" : "var(--bd-1)"}`,
                        }}
                      >
                        <Crop size={12} /> Rellenar
                      </button>
                      <button
                        type="button"
                        onClick={() => setFit(it.id, "contain")}
                        title="Ajustar (muestra la foto completa)"
                        className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition-all"
                        style={{
                          background: fit === "contain" ? "var(--brand-primary)" : "transparent",
                          color: fit === "contain" ? "#fffaf4" : "var(--tx-mut)",
                          border: `1px solid ${fit === "contain" ? "var(--brand-primary)" : "var(--bd-1)"}`,
                        }}
                      >
                        <Maximize2 size={12} /> Ajustar
                      </button>
                      <button
                        type="button"
                        onClick={() => removeImage(it.id)}
                        aria-label="Quitar foto"
                        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg"
                        style={{ background: "var(--err-soft)", color: "var(--err)" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </WtCard>
            );
          })}
        </div>
      )}

      {/* Pista de "pegar" */}
      <p className="mt-4 hidden items-center justify-center gap-1.5 text-center text-xs text-tx-mut md:flex">
        <Sparkles size={13} className="text-primary" />
        Tip: pasa el cursor sobre un producto y pega una imagen con <span className="font-bold text-tx">Ctrl + V</span>.
      </p>

      {/* ── Modal: carga en lote (auto-emparejado) ─────────────────────── */}
      {bulkRows && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <WtCard className="my-4 w-full max-w-2xl p-0">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <div>
                <h2 className="font-display text-xl font-extrabold text-tx-hi">Revisar emparejado</h2>
                <p className="text-xs text-tx-mut">{bulkRows.length} foto(s). Confirma a qué producto va cada una.</p>
              </div>
              <button onClick={closeBulk} disabled={bulkBusy} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut disabled:opacity-40" style={{ background: "var(--surf-2)" }}>
                <X size={16} />
              </button>
            </div>

            <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto p-4">
              {bulkRows.map((row, idx) => {
                const target = items.find(i => i.id === row.targetId);
                const willOverwrite = target?.imageUrl;
                return (
                  <div key={idx} className="flex items-center gap-3 rounded-xl p-2" style={{ background: "var(--surf-2)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.url} alt={row.file.name} className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-tx-mut" title={row.file.name}>{row.file.name}</div>
                      <select
                        value={row.targetId}
                        onChange={e => {
                          const v = e.target.value;
                          setBulkRows(rows => rows ? rows.map((r, i) => (i === idx ? { ...r, targetId: v } : r)) : rows);
                        }}
                        disabled={bulkBusy}
                        className="mt-1 min-h-9 w-full rounded-lg px-2 text-sm font-bold text-tx outline-none"
                        style={{ background: "var(--surf-1)", border: `1.5px solid ${row.targetId ? "var(--brand-primary)" : "var(--bd-1)"}` }}
                      >
                        <option value="">— Sin asignar (omitir) —</option>
                        {cats.map(c => (
                          <optgroup key={c.id} label={c.name}>
                            {items.filter(i => i.categoryId === c.id).map(i => (
                              <option key={i.id} value={i.id}>{i.name}{i.imageUrl ? " · (ya tiene)" : ""}</option>
                            ))}
                          </optgroup>
                        ))}
                        {/* Productos sin categoría (o categoría desconocida): que sigan siendo asignables */}
                        {(() => {
                          const known = new Set(cats.map(c => c.id));
                          const others = items.filter(i => !i.categoryId || !known.has(i.categoryId));
                          if (others.length === 0) return null;
                          return (
                            <optgroup label="Otros">
                              {others.map(i => (
                                <option key={i.id} value={i.id}>{i.name}{i.imageUrl ? " · (ya tiene)" : ""}</option>
                              ))}
                            </optgroup>
                          );
                        })()}
                      </select>
                    </div>
                    <div className="flex w-16 flex-shrink-0 justify-end">
                      {!row.targetId ? (
                        <Pill tone="neutral">omitir</Pill>
                      ) : willOverwrite ? (
                        <Pill tone="warn">reemplaza</Pill>
                      ) : (
                        <Pill tone="ok">nueva</Pill>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 px-6 py-4" style={{ borderTop: "1px solid var(--bd-1)" }}>
              {bulkBusy && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-bold text-tx">Subiendo…</span>
                    <span className="font-mono text-tx-mut">{bulkProgress.done}/{bulkProgress.total}</span>
                  </div>
                  <ProgressBar pct={bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0} />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-tx-mut">
                  {bulkRows.filter(r => r.targetId).length} asignada(s) · {bulkRows.filter(r => !r.targetId).length} omitida(s)
                </span>
                <div className="flex gap-2">
                  <button onClick={closeBulk} disabled={bulkBusy} className="min-h-11 rounded-xl px-4 text-sm font-bold text-tx-mut disabled:opacity-40" style={{ border: "1px solid var(--bd-1)" }}>
                    Cancelar
                  </button>
                  <PrimaryBtn full={false} icon={Check} onClick={applyBulk} disabled={bulkBusy}>
                    {bulkBusy ? "Subiendo…" : `Aplicar ${bulkRows.filter(r => r.targetId).length} foto(s)`}
                  </PrimaryBtn>
                </div>
              </div>
            </div>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}
