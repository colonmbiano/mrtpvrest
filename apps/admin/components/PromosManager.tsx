"use client";
/**
 * PromosManager.tsx
 * Gestión de las promos del negocio que se muestran en la pantalla de cliente
 * del TPV (en reposo). Subir, editar título/subtítulo, activar/ocultar,
 * eliminar y reordenar con drag & drop nativo. Las promos se sincronizan a
 * todas las terminales del tenant.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical, ImagePlus, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Button, Pill } from "@/components/ds";

interface Promo {
  id: string;
  imageUrl: string;
  title?: string | null;
  subtitle?: string | null;
  order: number;
  active: boolean;
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

  const inputCls =
    "w-full rounded-ds-sm px-3 py-1.5 text-sm outline-none transition-shadow focus:shadow-[0_0_0_3px_var(--accent-soft)]";
  const inputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-extrabold text-tx-hi">Pantalla de cliente · Publicidad</h3>
        <Button size="sm" icon={ImagePlus} onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? "Subiendo…" : "Subir imagen"}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </div>
      <p className="mb-5 text-sm text-tx-mut">
        Estas imágenes rotan en la pantalla de cliente de todas las terminales cuando no hay venta activa.
        Arrastra para reordenar.
      </p>

      {error && (
        <div
          className="mb-4 rounded-ds-md px-4 py-2 text-sm"
          style={{ background: "var(--err-soft)", border: "1px solid var(--err)", color: "var(--err)" }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-tx-dim">Cargando…</p>
      ) : promos.length === 0 ? (
        <p className="py-8 text-center text-sm text-tx-dim">
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
              className="flex items-center gap-4 rounded-ds-lg border p-3 transition-colors"
              style={{
                background: "var(--surf-1)",
                borderColor: dragOver === index ? "var(--brand-primary)" : "var(--bd-1)",
              }}
            >
              <span className="cursor-grab text-tx-dim transition-colors hover:text-tx-mid" title="Arrastrar">
                <GripVertical size={16} />
              </span>

              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-ds-md" style={{ background: "var(--surf-3)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={promo.imageUrl} alt={promo.title ?? ""} className="h-full w-full object-cover" />
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  defaultValue={promo.title ?? ""}
                  placeholder="Título (opcional)"
                  onBlur={(e) => {
                    if (e.target.value !== (promo.title ?? "")) {
                      patchPromo(promo.id, { title: e.target.value });
                    }
                  }}
                  className={inputCls}
                  style={inputStyle}
                />
                <input
                  defaultValue={promo.subtitle ?? ""}
                  placeholder="Subtítulo (opcional)"
                  onBlur={(e) => {
                    if (e.target.value !== (promo.subtitle ?? "")) {
                      patchPromo(promo.id, { subtitle: e.target.value });
                    }
                  }}
                  className={inputCls}
                  style={inputStyle}
                />
              </div>

              {/* Activar / ocultar */}
              <button
                type="button"
                onClick={() => patchPromo(promo.id, { active: !promo.active })}
                className="shrink-0"
                aria-label={promo.active ? "Ocultar promo" : "Activar promo"}
              >
                <Pill tone={promo.active ? "ok" : "neutral"} live={promo.active}>
                  {promo.active ? "Activa" : "Oculta"}
                </Pill>
              </button>

              <button
                type="button"
                onClick={() => deletePromo(promo.id)}
                aria-label="Eliminar"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-ds-md transition-transform active:scale-95"
                style={{ background: "var(--err-soft)", color: "var(--err)" }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
