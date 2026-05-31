"use client";
/**
 * PromosManager.tsx
 * Gestión de las promos del negocio que se muestran en la pantalla de cliente
 * del TPV (en reposo). Subir, editar título/subtítulo, activar/ocultar,
 * eliminar y reordenar con drag & drop nativo. Las promos se sincronizan a
 * todas las terminales del tenant.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";

const ACCENT = "#ff5c35";

interface Promo {
  id: string;
  imageUrl: string;
  title?: string | null;
  subtitle?: string | null;
  order: number;
  active: boolean;
}

// Manija de arrastre (GripVertical) como SVG inline — el admin no usa lucide.
function GripVertical() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function PromosManager() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Promo[]>("/api/promos/all");
      setPromos(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudieron cargar las promos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) e.target.value = "";
      if (!file) return;
      setUploading(true);
      setError(null);
      try {
        const imageBase64 = await fileToBase64(file);
        const { data } = await api.post<Promo>("/api/promos", { imageBase64 });
        setPromos((prev) => [...prev, data]);
      } catch (e: any) {
        setError(e?.response?.data?.error || "No se pudo subir la imagen");
      } finally {
        setUploading(false);
      }
    },
    []
  );

  const patchPromo = useCallback(
    async (id: string, patch: Partial<Pick<Promo, "title" | "subtitle" | "active">>) => {
      // Optimista.
      setPromos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      try {
        await api.patch(`/api/promos/${id}`, patch);
      } catch (e: any) {
        setError(e?.response?.data?.error || "No se pudo guardar el cambio");
        load();
      }
    },
    [load]
  );

  const deletePromo = useCallback(async (id: string) => {
    setPromos((prev) => prev.filter((p) => p.id !== id));
    try {
      await api.delete(`/api/promos/${id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo eliminar");
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drag & drop nativo ──────────────────────────────────────────────────
  const handleDrop = useCallback(
    async (targetIndex: number) => {
      const from = dragIndex.current;
      dragIndex.current = null;
      setDragOver(null);
      if (from === null || from === targetIndex) return;

      const reordered = [...promos];
      const [moved] = reordered.splice(from, 1);
      if (!moved) return;
      reordered.splice(targetIndex, 0, moved);
      setPromos(reordered);

      try {
        await api.put("/api/promos/reorder", { ids: reordered.map((p) => p.id) });
      } catch (e: any) {
        setError(e?.response?.data?.error || "No se pudo reordenar");
        load();
      }
    },
    [promos, load]
  );

  return (
    <div className="bg-[#0f0f1c] border border-white/10 rounded-[1.5rem] p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-white">Pantalla de cliente · Publicidad</h2>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {uploading ? "Subiendo…" : "+ Subir imagen"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
      <p className="text-sm text-white/50 mb-5">
        Estas imágenes rotan en la pantalla de cliente de todas las terminales cuando no
        hay venta activa. Arrastra para reordenar.
      </p>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-xl text-sm bg-red-500/10 border border-red-500/30 text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-white/40 text-sm py-8 text-center">Cargando…</p>
      ) : promos.length === 0 ? (
        <p className="text-white/40 text-sm py-8 text-center">
          Aún no hay imágenes. Sube la primera con “Subir imagen”.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {promos.map((promo, index) => (
            <div
              key={promo.id}
              draggable
              onDragStart={() => (dragIndex.current = index)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(index);
              }}
              onDragLeave={() => setDragOver((d) => (d === index ? null : d))}
              onDrop={() => handleDrop(index)}
              className="flex items-center gap-4 rounded-2xl border p-3 transition-colors"
              style={{
                background: "#15152a",
                borderColor: dragOver === index ? ACCENT : "rgba(255,255,255,0.08)",
              }}
            >
              <span className="cursor-grab text-white/40 hover:text-white/70" title="Arrastrar">
                <GripVertical />
              </span>

              <div className="w-24 h-16 rounded-xl overflow-hidden bg-black/40 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={promo.imageUrl} alt={promo.title ?? ""} className="w-full h-full object-cover" />
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <input
                  defaultValue={promo.title ?? ""}
                  placeholder="Título (opcional)"
                  onBlur={(e) => {
                    if (e.target.value !== (promo.title ?? "")) {
                      patchPromo(promo.id, { title: e.target.value });
                    }
                  }}
                  className="bg-[#0f0f1c] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
                />
                <input
                  defaultValue={promo.subtitle ?? ""}
                  placeholder="Subtítulo (opcional)"
                  onBlur={(e) => {
                    if (e.target.value !== (promo.subtitle ?? "")) {
                      patchPromo(promo.id, { subtitle: e.target.value });
                    }
                  }}
                  className="bg-[#0f0f1c] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
                />
              </div>

              {/* Activar / ocultar */}
              <button
                onClick={() => patchPromo(promo.id, { active: !promo.active })}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors shrink-0"
                style={{
                  borderColor: promo.active ? "rgba(136,214,108,0.4)" : "rgba(255,255,255,0.12)",
                  color: promo.active ? "#88d66c" : "rgba(255,255,255,0.5)",
                  background: promo.active ? "rgba(136,214,108,0.08)" : "transparent",
                }}
              >
                {promo.active ? "Activa" : "Oculta"}
              </button>

              <button
                onClick={() => deletePromo(promo.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-300 border border-red-500/30 hover:bg-red-500/10 shrink-0"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
