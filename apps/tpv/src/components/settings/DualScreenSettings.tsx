/**
 * DualScreenSettings.tsx
 * Bloque de configuración del doble pantalla. Va en la pestaña "Pantalla" del
 * TPVConfigModal. Gestiona el encendido, los mensajes, la publicidad en reposo
 * (promos locales + sincronización de promos del negocio) y abre la ventana de
 * cliente.
 */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDualScreen } from "@/hooks/useDualScreen";
import {
  getDualScreenConfig,
  setDualScreenConfig,
  DualScreenConfig,
  PromoSlide,
  newPromoId,
  isLocal,
  DUAL_SCREEN_CONFIG_EVENT,
} from "@/lib/dual-screen/config";
import {
  fileToOptimizedBlob,
  savePromoImage,
  deletePromoImage,
  getPromoImage,
} from "@/lib/dual-screen/promo-store";
import { syncRemotePromos } from "@/lib/dual-screen/sync";

const ACCENT = "#ff5c35";

// Pequeño switch con el look del modal.
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-12 h-6 rounded-full transition-all relative shrink-0"
      style={{ background: on ? ACCENT : "var(--surf2)" }}
    >
      <div
        className="w-5 h-5 rounded-full absolute top-0.5 transition-all bg-white"
        style={{ left: on ? "26px" : "2px" }}
      />
    </button>
  );
}

// Preview de una promo: carga el blob desde IndexedDB (o usa la url remota).
function PromoThumb({ promo }: { promo: PromoSlide }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await getPromoImage(promo.id);
      if (cancelled) return;
      if (blob) {
        const objUrl = URL.createObjectURL(blob);
        revoked = objUrl;
        setUrl(objUrl);
      } else if (promo.imageUrl) {
        setUrl(promo.imageUrl);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [promo.id, promo.imageUrl]);

  return (
    <div
      className="w-16 h-16 rounded-xl overflow-hidden shrink-0"
      style={{ background: "var(--surf)" }}
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={promo.title ?? ""} className="w-full h-full object-cover" />
      )}
    </div>
  );
}

export default function DualScreenSettings() {
  const { openDisplay } = useDualScreen();
  const [config, setConfig] = useState<DualScreenConfig>(() => getDualScreenConfig());
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mantener sincronizado con cambios externos.
  useEffect(() => {
    const refresh = () => setConfig(getDualScreenConfig());
    window.addEventListener(DUAL_SCREEN_CONFIG_EVENT, refresh);
    return () => window.removeEventListener(DUAL_SCREEN_CONFIG_EVENT, refresh);
  }, []);

  const patch = useCallback((p: Partial<DualScreenConfig>) => {
    setConfig(setDualScreenConfig(p));
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncRemotePromos();
      setConfig(getDualScreenConfig());
      toast.success("Promos del negocio sincronizadas");
    } catch {
      toast.error("No se pudieron sincronizar las promos");
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleAddLocal = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) e.target.value = "";
      if (!file) return;
      setUploading(true);
      try {
        const blob = await fileToOptimizedBlob(file, 1920, 0.85);
        const id = newPromoId();
        await savePromoImage(id, blob);
        const slide: PromoSlide = {
          id,
          source: "local",
          updatedAt: new Date().toISOString(),
        };
        patch({ promos: [...getDualScreenConfig().promos, slide] });
        toast.success("Imagen agregada a esta terminal");
      } catch {
        toast.error("No se pudo procesar la imagen");
      } finally {
        setUploading(false);
      }
    },
    [patch]
  );

  const handleDeleteLocal = useCallback(
    async (promo: PromoSlide) => {
      try {
        await deletePromoImage(promo.id);
      } catch {
        /* la imagen pudo no existir — continuar */
      }
      patch({
        promos: getDualScreenConfig().promos.filter((p) => p.id !== promo.id),
      });
    },
    [patch]
  );

  const updateLocalField = useCallback(
    (id: string, field: "title" | "subtitle", value: string) => {
      patch({
        promos: getDualScreenConfig().promos.map((p) =>
          p.id === id ? { ...p, [field]: value } : p
        ),
      });
    },
    [patch]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Encendido */}
      <div
        className="rounded-2xl border p-4 flex items-center justify-between"
        style={{ background: "var(--surf2)", borderColor: "var(--border)" }}
      >
        <div>
          <div className="text-sm font-bold">Pantalla de cliente (doble pantalla)</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Segunda pantalla con el carrito en vivo y publicidad en reposo
          </div>
        </div>
        <Toggle on={config.enabled} onClick={() => patch({ enabled: !config.enabled })} />
      </div>

      {config.enabled && (
        <>
          {/* Mensajes */}
          <div
            className="rounded-2xl border p-4 flex flex-col gap-3"
            style={{ background: "var(--surf2)", borderColor: "var(--border)" }}
          >
            <div
              className="text-xs font-black uppercase tracking-wider"
              style={{ color: ACCENT }}
            >
              Mensajes
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Mensaje de bienvenida
              </span>
              <input
                value={config.welcomeMessage}
                onChange={(e) => patch({ welcomeMessage: e.target.value })}
                className="rounded-xl px-3 py-2 text-sm outline-none border"
                style={{
                  background: "var(--surf)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Mensaje de agradecimiento
              </span>
              <input
                value={config.thankYouMessage}
                onChange={(e) => patch({ thankYouMessage: e.target.value })}
                className="rounded-xl px-3 py-2 text-sm outline-none border"
                style={{
                  background: "var(--surf)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </label>
          </div>

          {/* Publicidad en reposo */}
          <div
            className="rounded-2xl border p-4 flex flex-col gap-3"
            style={{ background: "var(--surf2)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-xs font-black uppercase tracking-wider"
                  style={{ color: ACCENT }}
                >
                  Publicidad en reposo
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  Rota imágenes cuando no hay venta activa
                </div>
              </div>
              <Toggle
                on={config.promosEnabled}
                onClick={() => patch({ promosEnabled: !config.promosEnabled })}
              />
            </div>

            {config.promosEnabled && (
              <>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm">Segundos por imagen</span>
                  <input
                    type="number"
                    min={2}
                    max={120}
                    value={config.promoIntervalSec}
                    onChange={(e) =>
                      patch({
                        promoIntervalSec: Math.max(2, Number(e.target.value) || 8),
                      })
                    }
                    className="w-20 rounded-xl px-3 py-2 text-sm outline-none border text-center"
                    style={{
                      background: "var(--surf)",
                      borderColor: "var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    {syncing ? "Sincronizando…" : "↻ Sincronizar del negocio"}
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    {uploading ? "Procesando…" : "+ Agregar imagen local"}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAddLocal}
                  />
                </div>

                {/* Lista de promos */}
                <div className="flex flex-col gap-2">
                  {config.promos.length === 0 && (
                    <p className="text-xs text-center py-3" style={{ color: "var(--muted)" }}>
                      Sin promos. Sincroniza las del negocio o agrega imágenes locales.
                    </p>
                  )}
                  {config.promos.map((promo) => {
                    const local = isLocal(promo);
                    return (
                      <div
                        key={promo.id}
                        className="flex items-center gap-3 rounded-xl border p-2"
                        style={{ background: "var(--surf)", borderColor: "var(--border)" }}
                      >
                        <PromoThumb promo={promo} />
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <span
                            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full self-start"
                            style={{
                              background: local ? "rgba(255,92,53,0.15)" : "rgba(255,255,255,0.08)",
                              color: local ? ACCENT : "var(--muted)",
                            }}
                          >
                            {local ? "Esta terminal" : "Del negocio"}
                          </span>
                          <input
                            value={promo.title ?? ""}
                            disabled={!local}
                            placeholder="Título (opcional)"
                            onChange={(e) => updateLocalField(promo.id, "title", e.target.value)}
                            className="rounded-lg px-2 py-1 text-xs outline-none border disabled:opacity-60"
                            style={{
                              background: "var(--surf2)",
                              borderColor: "var(--border)",
                              color: "var(--text)",
                            }}
                          />
                          <input
                            value={promo.subtitle ?? ""}
                            disabled={!local}
                            placeholder="Subtítulo (opcional)"
                            onChange={(e) => updateLocalField(promo.id, "subtitle", e.target.value)}
                            className="rounded-lg px-2 py-1 text-xs outline-none border disabled:opacity-60"
                            style={{
                              background: "var(--surf2)",
                              borderColor: "var(--border)",
                              color: "var(--text)",
                            }}
                          />
                        </div>
                        <button
                          onClick={() => handleDeleteLocal(promo)}
                          disabled={!local}
                          title={local ? "Eliminar" : "Las promos del negocio se gestionan desde el admin"}
                          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
                          style={{ color: "#ef4444" }}
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Abrir pantalla */}
          <button
            onClick={openDisplay}
            className="w-full py-3 rounded-2xl font-syne font-black text-white"
            style={{ background: ACCENT }}
          >
            🖥️ Abrir pantalla de cliente
          </button>
        </>
      )}
    </div>
  );
}
