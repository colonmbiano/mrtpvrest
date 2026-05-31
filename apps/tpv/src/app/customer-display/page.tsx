/**
 * customer-display/page.tsx
 * Pantalla orientada al cliente (segundo monitor). En reposo muestra un
 * carrusel de promos (o mensaje de bienvenida); durante una venta muestra el
 * carrito en vivo; al cobrar muestra el agradecimiento y el cambio.
 */
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCustomerDisplay } from "@/hooks/useCustomerDisplay";
import { CartSnapshot } from "@/lib/dual-screen/channel";
import {
  getDualScreenConfig,
  DualScreenConfig,
  PromoSlide,
  DUAL_SCREEN_CONFIG_EVENT,
  DUAL_SCREEN_CONFIG_KEY,
} from "@/lib/dual-screen/config";
import { getPromoImage } from "@/lib/dual-screen/promo-store";

const ACCENT = "#ff5c35";
const BG = "#0d0d0f";

function formatMoney(value: number, currency = "MXN"): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return `$${(value || 0).toFixed(2)}`;
  }
}

// ── Carrusel de promos (idle) ─────────────────────────────────────────────
function PromoCarousel({
  promos,
  intervalSec,
}: {
  promos: PromoSlide[];
  intervalSec: number;
}) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  const [index, setIndex] = useState(0);
  const urlsRef = useRef<string[]>([]);

  // Cargar blobs desde IndexedDB → object URLs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        promos.map(async (p) => {
          const blob = await getPromoImage(p.id);
          if (blob) return URL.createObjectURL(blob);
          return p.imageUrl ?? null; // fallback a la url remota si no hay cache
        })
      );
      if (cancelled) {
        resolved.forEach((u) => u && u.startsWith("blob:") && URL.revokeObjectURL(u));
        return;
      }
      // Revocar las anteriores antes de reemplazar.
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = resolved.filter(
        (u): u is string => !!u && u.startsWith("blob:")
      );
      setUrls(resolved);
      setIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [promos]);

  // Revocar al desmontar.
  useEffect(() => {
    return () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = [];
    };
  }, []);

  // Rotación.
  useEffect(() => {
    if (urls.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % urls.length);
    }, Math.max(2, intervalSec) * 1000);
    return () => clearInterval(id);
  }, [urls.length, intervalSec]);

  if (urls.length === 0) return null;

  return (
    <div className="absolute inset-0">
      {urls.map((url, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
          style={{ opacity: i === index ? 1 : 0 }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={promos[i]?.title ?? ""}
              className="w-full h-full object-cover"
            />
          ) : null}
          {(promos[i]?.title || promos[i]?.subtitle) && (
            <div className="absolute bottom-0 left-0 right-0 p-12 bg-gradient-to-t from-black/80 to-transparent">
              {promos[i]?.title && (
                <h2 className="text-5xl font-bold text-white">{promos[i].title}</h2>
              )}
              {promos[i]?.subtitle && (
                <p className="text-2xl text-white/80 mt-3">{promos[i].subtitle}</p>
              )}
            </div>
          )}
        </div>
      ))}
      {/* Dots */}
      {urls.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
          {urls.map((_, i) => (
            <span
              key={i}
              className="w-3 h-3 rounded-full transition-all"
              style={{
                background: i === index ? ACCENT : "rgba(255,255,255,0.35)",
                transform: i === index ? "scale(1.2)" : "scale(1)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vista en reposo ───────────────────────────────────────────────────────
function IdleView({ config }: { config: DualScreenConfig }) {
  const activePromos = useMemo(
    () => (config.promosEnabled ? config.promos : []),
    [config.promosEnabled, config.promos]
  );

  if (activePromos.length > 0) {
    return <PromoCarousel promos={activePromos} intervalSec={config.promoIntervalSec} />;
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-12">
      {config.showLogo && config.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.logoUrl} alt="logo" className="max-h-40 mb-10 object-contain" />
      )}
      <h1 className="text-7xl font-bold text-white">{config.welcomeMessage}</h1>
    </div>
  );
}

// ── Vista de carrito ──────────────────────────────────────────────────────
function CartView({ snapshot }: { snapshot: CartSnapshot }) {
  return (
    <div className="absolute inset-0 flex">
      {/* Líneas */}
      <div className="flex-1 p-10 overflow-y-auto">
        <h2 className="text-3xl font-bold text-white/60 mb-8 uppercase tracking-wider">
          Tu pedido
        </h2>
        <div className="flex flex-col gap-4">
          {snapshot.lines.map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-between border-b border-white/10 pb-4"
            >
              <div className="flex items-center gap-5">
                <span
                  className="text-3xl font-bold tabular-nums"
                  style={{ color: ACCENT }}
                >
                  {line.qty}×
                </span>
                <div>
                  <p className="text-3xl text-white font-medium">{line.name}</p>
                  {line.note && <p className="text-xl text-white/50 mt-1">{line.note}</p>}
                </div>
              </div>
              <span className="text-3xl text-white tabular-nums">
                {formatMoney(line.total, snapshot.currency)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totales */}
      <div className="w-[38%] bg-black/40 p-12 flex flex-col justify-end">
        <div className="flex justify-between text-2xl text-white/60 mb-4">
          <span>Subtotal</span>
          <span className="tabular-nums">
            {formatMoney(snapshot.subtotal, snapshot.currency)}
          </span>
        </div>
        {snapshot.discount > 0 && (
          <div className="flex justify-between text-2xl mb-4" style={{ color: ACCENT }}>
            <span>{snapshot.discountLabel || "Descuento"}</span>
            <span className="tabular-nums">
              −{formatMoney(snapshot.discount, snapshot.currency)}
            </span>
          </div>
        )}
        <div className="h-px bg-white/15 my-4" />
        <div className="flex justify-between items-end">
          <span className="text-4xl font-bold text-white">Total</span>
          <span className="text-6xl font-bold tabular-nums" style={{ color: ACCENT }}>
            {formatMoney(snapshot.total, snapshot.currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Vista de venta completada ─────────────────────────────────────────────
function CompleteView({
  config,
  total,
  change,
}: {
  config: DualScreenConfig;
  total: number;
  change?: number;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-12">
      <div
        className="w-32 h-32 rounded-full flex items-center justify-center mb-10"
        style={{ background: ACCENT }}
      >
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1 className="text-6xl font-bold text-white mb-6">{config.thankYouMessage}</h1>
      <p className="text-3xl text-white/60">Total: {formatMoney(total)}</p>
      {typeof change === "number" && change > 0 && (
        <p className="text-4xl mt-4 font-semibold" style={{ color: ACCENT }}>
          Su cambio: {formatMoney(change)}
        </p>
      )}
    </div>
  );
}

export default function CustomerDisplayPage() {
  const state = useCustomerDisplay();
  const [config, setConfig] = useState<DualScreenConfig>(() => getDualScreenConfig());
  const [needsFullscreen, setNeedsFullscreen] = useState(true);

  // Refrescar config con los eventos.
  useEffect(() => {
    const refresh = () => setConfig(getDualScreenConfig());
    const onStorage = (e: StorageEvent) => {
      if (e.key === DUAL_SCREEN_CONFIG_KEY) refresh();
    };
    window.addEventListener(DUAL_SCREEN_CONFIG_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DUAL_SCREEN_CONFIG_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const goFullscreen = useCallback(() => {
    setNeedsFullscreen(false);
    try {
      void document.documentElement.requestFullscreen?.();
    } catch {
      /* ignorar — algunos navegadores lo bloquean */
    }
  }, []);

  return (
    <div
      onClick={needsFullscreen ? goFullscreen : undefined}
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: BG, cursor: needsFullscreen ? "pointer" : "default" }}
    >
      {state.view === "idle" && <IdleView config={config} />}
      {state.view === "cart" && <CartView snapshot={state.snapshot} />}
      {state.view === "complete" && (
        <CompleteView config={config} total={state.total} change={state.change} />
      )}

      {needsFullscreen && (
        <div className="absolute bottom-4 right-4 text-white/30 text-sm">
          Toca para pantalla completa
        </div>
      )}
    </div>
  );
}
