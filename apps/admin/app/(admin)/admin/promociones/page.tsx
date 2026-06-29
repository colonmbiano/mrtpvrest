"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Sparkles, Bot, Trash2, Settings2, Zap, Store, Tag,
  TrendingUp, Percent, Target, X, Lightbulb, Utensils,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, StatTile, SectionHead, Pill, Toggle,
  PrimaryBtn, IconBadge, EmptyState, money,
} from "@/components/warmtech";

type Location = {
  id: string;
  name: string;
  autoPromoEnabled: boolean;
  autoPromoThreshold: number;
  autoPromoDiscount: number;
  autoPromoMaxItems: number;
};

type ConfigDraft = {
  autoPromoThreshold: number;
  autoPromoDiscount: number;
  autoPromoMaxItems: number;
};

type PromoItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  promoPrice: number | null;
  isPromo: boolean;
  soldLast7Days: number;
  category: { name: string };
  updatedAt: string;
};

export default function PromocionesPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [promoItems, setPromoItems] = useState<PromoItem[]>([]);
  const [menuItems, setMenuItems] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [togglingItem, setTogglingItem] = useState<string | null>(null);
  const [savingLoc, setSavingLoc] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ConfigDraft>>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [configLoc, setConfigLoc] = useState<Location | null>(null);
  const [clearing, setClearing] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/promos");
      const locs: Location[] = data.locations || [];
      setLocations(locs);
      setDrafts(Object.fromEntries(locs.map((l) => [l.id, {
        autoPromoThreshold: l.autoPromoThreshold,
        autoPromoDiscount: l.autoPromoDiscount,
        autoPromoMaxItems: l.autoPromoMaxItems ?? 0,
      }])));
      setPromoItems(data.promoItems || []);
      setMenuItems(data.menuItems || data.promoItems || []);
    } catch {
      showToast("Error al cargar promociones", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTrigger = async (locationId?: string) => {
    const key = locationId || "all";
    setTriggering(key);
    try {
      await api.post("/api/admin/promos/trigger", locationId ? { locationId } : {});
      showToast("Motor iniciado. Analizando ventas con IA…");
      setTimeout(() => fetchData(), 3000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Error al iniciar motor", false);
    } finally {
      setTriggering(null);
    }
  };

  const handleToggleItem = async (item: PromoItem) => {
    setTogglingItem(item.id);
    try {
      await api.put(`/api/admin/promos/${item.id}`, {
        isPromo: !item.isPromo,
        promoPrice: item.isPromo ? null : item.promoPrice,
      });
      showToast(item.isPromo ? "Promo desactivada" : "Promo activada");
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Error al actualizar", false);
    } finally {
      setTogglingItem(null);
    }
  };

  const updateLocation = async (loc: Location, patch: Partial<Location>) => {
    setSavingLoc(loc.id);
    try {
      await api.put(`/api/admin/locations/${loc.id}`, patch);
      setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, ...patch } : l)));
      showToast("Configuración guardada");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Error al guardar", false);
      fetchData(); // revertir al estado del servidor
    } finally {
      setSavingLoc(null);
    }
  };

  const handleToggleLocation = (loc: Location) =>
    updateLocation(loc, { autoPromoEnabled: !loc.autoPromoEnabled });

  const handleSaveConfig = async (loc: Location) => {
    const d = drafts[loc.id];
    if (!d) return;
    await updateLocation(loc, {
      autoPromoThreshold: Math.max(1, d.autoPromoThreshold || 0),
      autoPromoDiscount: Math.min(100, Math.max(1, d.autoPromoDiscount || 0)),
      autoPromoMaxItems: Math.max(0, d.autoPromoMaxItems || 0),
    });
    setConfigLoc(null);
  };

  const handleClearAll = async () => {
    if (!window.confirm("¿Quitar la promoción de TODOS los productos del restaurante? Esto desactiva todas las promos vigentes.")) return;
    setClearing(true);
    try {
      const { data } = await api.post("/api/admin/promos/clear");
      showToast(`${data.cleared ?? 0} promociones quitadas`);
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Error al quitar promociones", false);
    } finally {
      setClearing(false);
    }
  };

  const enabledLocations = locations.filter((l) => l.autoPromoEnabled);
  const disabledLocations = locations.filter((l) => !l.autoPromoEnabled);
  const visibleItems = menuItems.length > 0 ? menuItems : promoItems;
  const discount = (price: number, promo: number) =>
    Math.round(((price - promo) / price) * 100);

  const soldTotal = promoItems.reduce((s, i) => s + (i.soldLast7Days || 0), 0);
  const avgDiscount = promoItems.length > 0
    ? Math.round(promoItems.reduce((s, i) => s + (i.price > 0 && i.promoPrice ? discount(i.price, i.promoPrice) : 0), 0) / promoItems.length)
    : 0;

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Motor de descuentos"
        title="Promociones IA"
        subtitle="Descuentos automáticos impulsados por inteligencia artificial"
        actions={
          <>
            {promoItems.length > 0 && (
              <PrimaryBtn full={false} ghost danger icon={Trash2} onClick={handleClearAll}>
                {clearing ? "Quitando…" : "Quitar todas"}
              </PrimaryBtn>
            )}
            <PrimaryBtn
              full={false}
              icon={Bot}
              onClick={() => handleTrigger()}
              disabled={triggering === "all" || enabledLocations.length === 0}
            >
              {triggering === "all" ? "Analizando…" : "Analizar todas"}
            </PrimaryBtn>
          </>
        }
      />

      {/* AI hero banner */}
      <WtCard
        className="relative mb-4 overflow-hidden p-4 md:p-6"
        style={{ borderColor: "var(--iris-soft)" }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{ background: "var(--iris-glow)", filter: "blur(40px)" }}
        />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <IconBadge icon={Sparkles} tone="ac" size={42} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-extrabold text-tx-hi md:text-lg">
                  Motor inteligente de promos
                </h2>
                <Pill tone="ac" live>IA</Pill>
              </div>
              <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-tx-mid">
                La IA detecta productos con baja rotación y les aplica descuentos
                automáticos según el umbral y tope que definas por sucursal.
              </p>
            </div>
          </div>
          <div className="shrink-0 md:hidden">
            <PrimaryBtn
              icon={Bot}
              onClick={() => handleTrigger()}
              disabled={triggering === "all" || enabledLocations.length === 0}
            >
              {triggering === "all" ? "Analizando…" : "Analizar todas"}
            </PrimaryBtn>
          </div>
        </div>
      </WtCard>

      {/* stats */}
      {promoItems.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-3">
          <StatTile icon={Tag} value={promoItems.length} label="En promo ahora" />
          <StatTile icon={TrendingUp} value={soldTotal.toLocaleString("es-MX")} label="Vendidos (7 días)" />
          <StatTile icon={Percent} value={`${avgDiscount}%`} label="Descuento prom." />
        </div>
      )}

      {/* Sucursales */}
      <SectionHead title="Configuración por sucursal" />
      {loading && locations.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Sin sucursales"
          hint="Crea sucursales desde Mi Marca para activar el motor de promociones."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {locations.map((loc) => (
            <WtCard
              key={loc.id}
              className="p-4"
              style={loc.autoPromoEnabled ? { borderColor: "var(--brand-primary)" } : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display text-sm font-extrabold text-tx-hi">{loc.name}</div>
                  <div className="mt-1.5">
                    <Pill tone={loc.autoPromoEnabled ? "ac" : "neutral"} live={loc.autoPromoEnabled}>
                      {loc.autoPromoEnabled ? "IA activa" : "IA inactiva"}
                    </Pill>
                  </div>
                </div>
                <Toggle
                  checked={loc.autoPromoEnabled}
                  onChange={() => { if (savingLoc !== loc.id) handleToggleLocation(loc); }}
                  label={loc.autoPromoEnabled ? "Desactivar promociones con IA" : "Activar promociones con IA"}
                />
              </div>

              {loc.autoPromoEnabled ? (
                <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--bd-1)" }}>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl py-2" style={{ background: "var(--surf-2)" }}>
                      <div className="font-display text-base font-extrabold text-tx-hi">{loc.autoPromoThreshold}</div>
                      <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-tx-dim">Umbral/sem</div>
                    </div>
                    <div className="rounded-xl py-2" style={{ background: "var(--surf-2)" }}>
                      <div className="font-display text-base font-extrabold text-primary">{loc.autoPromoDiscount}%</div>
                      <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-tx-dim">Descuento</div>
                    </div>
                    <div className="rounded-xl py-2" style={{ background: "var(--surf-2)" }}>
                      <div className="font-display text-base font-extrabold text-info">
                        {loc.autoPromoMaxItems > 0 ? loc.autoPromoMaxItems : "∞"}
                      </div>
                      <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-tx-dim">Tope</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfigLoc(loc)}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-tx"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    >
                      <Settings2 size={15} /> Configurar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTrigger(loc.id)}
                      disabled={triggering === loc.id}
                      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-primary disabled:opacity-50"
                      style={{ background: "var(--iris-soft)" }}
                    >
                      <Zap size={15} /> {triggering === loc.id ? "…" : "Analizar"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-tx-mut">
                  Activa el switch para que la IA ajuste descuentos automáticamente en esta sucursal.
                </p>
              )}
            </WtCard>
          ))}
        </div>
      )}

      {/* Items en promo */}
      <SectionHead title={`Productos${visibleItems.length > 0 ? ` (${visibleItems.length})` : ""}`} />
      {loading && visibleItems.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Sin productos en promo"
          hint="Activa el motor IA en tus sucursales y presiona Analizar todas para que la IA identifique qué productos necesitan un empujón."
          action={
            enabledLocations.length > 0 ? (
              <PrimaryBtn
                full={false}
                icon={Bot}
                onClick={() => handleTrigger()}
                disabled={triggering === "all"}
              >
                {triggering === "all" ? "Analizando…" : "Ejecutar motor IA"}
              </PrimaryBtn>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleItems.map((item) => (
            <WtCard
              key={item.id}
              className="flex gap-3 p-4"
              style={item.isPromo ? { borderColor: "var(--iris-soft)" } : undefined}
            >
              {/* Imagen */}
              <div
                className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <Utensils size={22} className="text-tx-dim" />
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-extrabold text-tx-hi">{item.name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-tx-dim">
                      {item.category.name}
                    </div>
                  </div>
                  <Toggle
                    checked={item.isPromo}
                    onChange={() => { if (togglingItem !== item.id) handleToggleItem(item); }}
                    label={item.isPromo ? "Desactivar promo" : "Activar promo"}
                  />
                </div>

                {item.isPromo && item.promoPrice && (
                  <div className="mt-2 flex items-center gap-2.5">
                    <span className="text-xs text-tx-dim line-through">{money(item.price)}</span>
                    <span className="font-display text-sm font-extrabold text-primary">{money(item.promoPrice)}</span>
                    <Pill tone="ac">-{discount(item.price, item.promoPrice)}%</Pill>
                  </div>
                )}

                <div className="mt-2 flex items-center gap-5 border-t pt-2" style={{ borderColor: "var(--bd-1)" }}>
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-tx-dim">Vendidos 7d</div>
                    <div
                      className="font-display text-sm font-extrabold"
                      style={{ color: item.soldLast7Days < 5 ? "var(--err)" : "var(--ok)" }}
                    >
                      {item.soldLast7Days}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-tx-dim">Actualizado</div>
                    <div className="text-[10.5px] text-tx-mut">
                      {new Date(item.updatedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                    </div>
                  </div>
                </div>
              </div>
            </WtCard>
          ))}
        </div>
      )}

      {/* Sucursales sin IA */}
      {disabledLocations.length > 0 && (
        <WtCard className="mt-4 flex items-center gap-3 p-4">
          <IconBadge icon={Lightbulb} tone="warn" size={38} />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-tx">
              {disabledLocations.length} {disabledLocations.length === 1 ? "sucursal sin" : "sucursales sin"} IA activada
            </div>
            <div className="mt-0.5 text-[11px] text-tx-mut">
              Activa el switch de cada sucursal aquí arriba para encender el motor de promociones con IA.
            </div>
          </div>
        </WtCard>
      )}

      {/* Modal de configuración detallada por sucursal */}
      {configLoc && (() => {
        const loc = configLoc;
        const draft = drafts[loc.id] || {
          autoPromoThreshold: loc.autoPromoThreshold,
          autoPromoDiscount: loc.autoPromoDiscount,
          autoPromoMaxItems: loc.autoPromoMaxItems ?? 0,
        };
        const setField = (patch: Partial<ConfigDraft>) =>
          setDrafts((prev) => ({ ...prev, [loc.id]: { ...draft, ...patch } }));
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,.8)", backdropFilter: "blur(4px)" }}
            onClick={() => setConfigLoc(null)}
          >
            <WtCard className="w-full max-w-md p-6" onClick={undefined}>
              <div onClick={(e) => e.stopPropagation()}>
                <div className="mb-1 flex items-start justify-between">
                  <h3 className="font-display text-xl font-extrabold text-tx-hi">Configurar IA</h3>
                  <button
                    type="button"
                    onClick={() => setConfigLoc(null)}
                    aria-label="Cerrar"
                    className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
                    style={{ background: "var(--surf-2)" }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="mb-5 font-mono text-[10px] uppercase tracking-[.16em] text-primary">{loc.name}</div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                      Umbral ventas/semana
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={draft.autoPromoThreshold}
                      onChange={(e) => setField({ autoPromoThreshold: parseInt(e.target.value) || 0 })}
                      className="min-h-12 w-full rounded-xl px-4 font-display text-sm font-bold text-tx outline-none"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    />
                    <p className="ml-1 mt-1.5 text-[11px] text-tx-mut">
                      Productos que vendan menos de esto en la ventana entran en promo.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                      Descuento (%)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={draft.autoPromoDiscount}
                      onChange={(e) => setField({ autoPromoDiscount: parseInt(e.target.value) || 0 })}
                      className="min-h-12 w-full rounded-xl px-4 font-display text-sm font-bold text-primary outline-none"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    />
                    <p className="ml-1 mt-1.5 text-[11px] text-tx-mut">
                      Al guardar, se re-aplica de inmediato a las promos vigentes.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                      Tope máximo de productos
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={draft.autoPromoMaxItems}
                      onChange={(e) => setField({ autoPromoMaxItems: parseInt(e.target.value) || 0 })}
                      className="min-h-12 w-full rounded-xl px-4 font-display text-sm font-bold text-info outline-none"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                    />
                    <p className="ml-1 mt-1.5 text-[11px] text-tx-mut">
                      Máximo de productos en promo a la vez. 0 = sin tope. Evita que se active todo el menú.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-6">
                  <PrimaryBtn ghost onClick={() => setConfigLoc(null)}>Cancelar</PrimaryBtn>
                  <PrimaryBtn onClick={() => handleSaveConfig(loc)} disabled={savingLoc === loc.id}>
                    {savingLoc === loc.id ? "Guardando…" : "Guardar"}
                  </PrimaryBtn>
                </div>
              </div>
            </WtCard>
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2.5 text-[13px] font-semibold"
          style={{
            bottom: 96,
            color: toast.ok ? "var(--ok)" : "var(--err)",
            background: toast.ok ? "var(--ok-soft)" : "var(--err-soft)",
            border: `1px solid ${toast.ok ? "var(--ok)" : "var(--err)"}`,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </WtScreen>
  );
}
