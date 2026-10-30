"use client";
import { useEffect, useState, useCallback } from "react";
import { Sparkles, Bot, Trash2, Zap, Store, Tag, TrendingUp, Percent, Target, Lightbulb, Clock, Eye, Check } from "lucide-react";
import api from "@/lib/api";
import {
  PageShell,
  PageHeader,
  Card,
  StatTile,
  SectionHead,
  Pill,
  Button,
  IconBadge,
  EmptyState,
  useToast,
  useConfirm,
  Modal,
} from "@/components/ds";
import { LocationCard } from "./_components/LocationCard";
import { LocationConfigModal } from "./_components/LocationConfigModal";
import { PromoItemCard } from "./_components/PromoItemCard";
import { type Location, type ConfigDraft, type PromoItem, type DryRunResult, type PromoSettings, discountPct, ALL_DAYS } from "./_components/types";

export default function PromocionesPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [promoItems, setPromoItems] = useState<PromoItem[]>([]);
  const [menuItems, setMenuItems] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [togglingItem, setTogglingItem] = useState<string | null>(null);
  const [savingLoc, setSavingLoc] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ConfigDraft>>({});
  const [configLoc, setConfigLoc] = useState<Location | null>(null);
  const [clearing, setClearing] = useState(false);
  const [promoWindow, setPromoWindow] = useState<{ startTime: string; endTime: string }>({ startTime: "", endTime: "" });
  const [savingWindow, setSavingWindow] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [dryRunLocation, setDryRunLocation] = useState<Location | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [applyingDryRun, setApplyingDryRun] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/promos");
      const locs: Location[] = data.locations || [];
      setLocations(locs);
      setDrafts(
        Object.fromEntries(
          locs.map((l) => [
            l.id,
            {
              autoPromoThreshold: l.autoPromoThreshold,
              autoPromoDiscount: l.autoPromoDiscount,
              autoPromoMaxItems: l.autoPromoMaxItems ?? 0,
              activeDays: l.activeDays ?? ALL_DAYS,
            },
          ]),
        ),
      );
      setPromoItems(data.promoItems || []);
      setMenuItems(data.menuItems || data.promoItems || []);
      try {
        const { data: cfg } = await api.get("/api/admin/config");
        setPromoWindow({
          startTime: cfg?.promoStartTime || "",
          endTime: cfg?.promoEndTime || "",
        });
      } catch {
        /* config opcional: sin ventana configurada */
      }
    } catch {
      toast.error("Error al cargar promociones");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSaveWindow = async () => {
    setSavingWindow(true);
    try {
      await api.put("/api/admin/config", {
        promoStartTime: promoWindow.startTime || null,
        promoEndTime: promoWindow.endTime || null,
      });
      toast.success("Horario de promociones guardado");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al guardar horario");
    } finally {
      setSavingWindow(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTrigger = async (locationId?: string) => {
    const key = locationId || "all";
    setTriggering(key);
    try {
      await api.post("/api/admin/promos/trigger", locationId ? { locationId } : {});
      toast.success("Motor iniciado. Analizando ventas con IA…");
      setTimeout(() => fetchData(), 3000);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al iniciar motor");
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
      toast.success(item.isPromo ? "Promo desactivada" : "Promo activada");
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al actualizar");
    } finally {
      setTogglingItem(null);
    }
  };

  const updateLocation = async (loc: Location, patch: Partial<Location>) => {
    setSavingLoc(loc.id);
    try {
      await api.put(`/api/admin/locations/${loc.id}`, patch);
      setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, ...patch } : l)));
      toast.success("Configuración guardada");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al guardar");
      fetchData(); // revertir al estado del servidor
    } finally {
      setSavingLoc(null);
    }
  };

  const handleToggleLocation = (loc: Location) => updateLocation(loc, { autoPromoEnabled: !loc.autoPromoEnabled });

  const handleSaveConfig = async (loc: Location) => {
    const d = drafts[loc.id];
    if (!d) return;
    const promoSettings: PromoSettings = {
      autoPromoThreshold: Math.max(1, d.autoPromoThreshold || 0),
      autoPromoDiscount: Math.min(100, Math.max(1, d.autoPromoDiscount || 0)),
      autoPromoMaxItems: Math.max(0, d.autoPromoMaxItems || 0),
      activeDays: d.activeDays,
    };
    setSavingLoc(loc.id);
    try {
      await api.put(`/api/locations/${loc.id}/promo-settings`, promoSettings);
      setLocations((prev) =>
        prev.map((l) => (l.id === loc.id ? { ...l, ...promoSettings, activeDays: promoSettings.activeDays } : l)),
      );
      toast.success("Configuración guardada");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al guardar");
      fetchData();
    } finally {
      setSavingLoc(null);
    }
    setConfigLoc(null);
  };

  const handleDryRun = async (loc: Location) => {
    setDryRunLoading(true);
    setDryRunLocation(loc);
    try {
      const { data } = await api.post(`/api/locations/${loc.id}/run-promo-engine`, { dryRun: true });
      setDryRunResult(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error en la previsualización");
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleApplyDryRun = async () => {
    if (!dryRunLocation) return;
    setApplyingDryRun(true);
    try {
      await api.post(`/api/locations/${dryRunLocation.id}/run-promo-engine`, { dryRun: false });
      toast.success("Promociones aplicadas");
      setDryRunResult(null);
      setDryRunLocation(null);
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al aplicar");
    } finally {
      setApplyingDryRun(false);
    }
  };

  const handleClearAll = async () => {
    if (
      !(await confirm({
        title: "¿Quitar la promoción de TODOS los platillos?",
        body: "Esto desactiva todas las promos vigentes del restaurante.",
        danger: true,
        confirmLabel: "Quitar todas",
      }))
    )
      return;
    setClearing(true);
    try {
      const { data } = await api.post("/api/admin/promos/clear");
      toast.success(`${data.cleared ?? 0} promociones quitadas`);
      fetchData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error(err?.response?.data?.error || "Error al quitar promociones");
    } finally {
      setClearing(false);
    }
  };

  const enabledLocations = locations.filter((l) => l.autoPromoEnabled);
  const disabledLocations = locations.filter((l) => !l.autoPromoEnabled);
  const visibleItems = menuItems.length > 0 ? menuItems : promoItems;

  const soldTotal = promoItems.reduce((s, i) => s + (i.soldLast7Days || 0), 0);
  const avgDiscount =
    promoItems.length > 0
      ? Math.round(
          promoItems.reduce((s, i) => s + (i.price > 0 && i.promoPrice ? discountPct(i.price, i.promoPrice) : 0), 0) /
            promoItems.length,
        )
      : 0;

  const timeInputStyle = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Motor de descuentos"
        title="Promociones IA"
        subtitle="Descuentos automáticos impulsados por inteligencia artificial"
        actions={
          <>
            {promoItems.length > 0 && (
              <Button variant="danger" icon={Trash2} onClick={handleClearAll}>
                {clearing ? "Quitando…" : "Quitar todas"}
              </Button>
            )}
            <Button
              icon={Bot}
              onClick={() => handleTrigger()}
              disabled={triggering === "all" || enabledLocations.length === 0}
            >
              {triggering === "all" ? "Analizando…" : "Analizar todas"}
            </Button>
          </>
        }
      />

      {/* AI hero banner */}
      <Card className="relative mb-4 overflow-hidden p-4 md:p-6" style={{ borderColor: "var(--accent-soft)" }}>
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full"
          style={{ background: "var(--accent-glow)", filter: "blur(40px)" }}
        />
        <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <IconBadge icon={Sparkles} tone="ac" size={42} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-extrabold text-tx-hi md:text-lg">
                  Motor inteligente de promos
                </h2>
                <Pill tone="ac" live>
                  IA
                </Pill>
              </div>
              <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-tx-mid">
                La IA detecta platillos con baja rotación y les aplica descuentos automáticos según el umbral y tope que
                definas por sucursal.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 md:hidden">
            <Button
              icon={Bot}
              full
              onClick={() => handleTrigger()}
              disabled={triggering === "all" || enabledLocations.length === 0}
            >
              {triggering === "all" ? "Analizando…" : "Analizar todas"}
            </Button>
            {promoItems.length > 0 && (
              <Button variant="danger" full icon={Trash2} onClick={handleClearAll}>
                {clearing ? "Quitando…" : "Quitar todas"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Horario de promociones */}
      <Card className="mb-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-3">
            <IconBadge icon={Clock} tone="ac" size={38} />
            <div className="min-w-0">
              <h3 className="font-display text-sm font-extrabold text-tx-hi md:text-base">Horario de promociones</h3>
              <p className="mt-0.5 max-w-lg text-[12px] leading-relaxed text-tx-mid">
                Fuera de este horario, los platillos en promo se ocultan del TPV, la tienda y el bot, y se cobran a
                precio normal. Vacío = todo el día.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Desde</label>
              <input
                type="time"
                value={promoWindow.startTime}
                onChange={(e) => setPromoWindow((w) => ({ ...w, startTime: e.target.value }))}
                className="min-h-11 rounded-ds-md px-3 font-display text-sm font-bold text-tx outline-none"
                style={timeInputStyle}
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Hasta</label>
              <input
                type="time"
                value={promoWindow.endTime}
                onChange={(e) => setPromoWindow((w) => ({ ...w, endTime: e.target.value }))}
                className="min-h-11 rounded-ds-md px-3 font-display text-sm font-bold text-tx outline-none"
                style={timeInputStyle}
              />
            </div>
            <Button onClick={handleSaveWindow} disabled={savingWindow}>
              {savingWindow ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </Card>

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
            <div key={i} className="h-44 animate-pulse rounded-ds-xl bg-surf-2" />
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
            <LocationCard
              key={loc.id}
              loc={loc}
              savingLoc={savingLoc}
              triggering={triggering}
              dryRunLoading={dryRunLoading && dryRunLocation?.id === loc.id}
              onToggle={handleToggleLocation}
              onConfigure={setConfigLoc}
              onTrigger={handleTrigger}
              onDryRun={handleDryRun}
            />
          ))}
        </div>
      )}

      {/* Items en promo */}
      <SectionHead title={`Platillos${visibleItems.length > 0 ? ` (${visibleItems.length})` : ""}`} />
      {loading && visibleItems.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-ds-xl bg-surf-2" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Sin platillos en promo"
          hint="Activa el motor IA en tus sucursales y presiona Analizar todas para que la IA identifique qué platillos necesitan un empujón."
          action={
            enabledLocations.length > 0 ? (
              <Button icon={Bot} onClick={() => handleTrigger()} disabled={triggering === "all"}>
                {triggering === "all" ? "Analizando…" : "Ejecutar motor IA"}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleItems.map((item) => (
            <PromoItemCard key={item.id} item={item} togglingItem={togglingItem} onToggle={handleToggleItem} />
          ))}
        </div>
      )}

      {/* Sucursales sin IA */}
      {disabledLocations.length > 0 && (
        <Card className="mt-4 flex items-center gap-3 p-4">
          <IconBadge icon={Lightbulb} tone="warn" size={38} />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-tx">
              {disabledLocations.length} {disabledLocations.length === 1 ? "sucursal sin" : "sucursales sin"} IA activada
            </div>
            <div className="mt-0.5 text-[11px] text-tx-mut">
              Activa el switch de cada sucursal aquí arriba para encender el motor de promociones con IA.
            </div>
          </div>
        </Card>
      )}

      {/* Modal de configuración detallada por sucursal */}
      {configLoc &&
        (() => {
          const loc = configLoc;
          const draft = drafts[loc.id] || {
            autoPromoThreshold: loc.autoPromoThreshold,
            autoPromoDiscount: loc.autoPromoDiscount,
            autoPromoMaxItems: loc.autoPromoMaxItems ?? 0,
            activeDays: loc.activeDays ?? ALL_DAYS,
          };
          return (
            <LocationConfigModal
              loc={loc}
              draft={draft}
              saving={savingLoc === loc.id}
              onChange={(patch) => setDrafts((prev) => ({ ...prev, [loc.id]: { ...draft, ...patch } }))}
              onSave={() => handleSaveConfig(loc)}
              onClose={() => setConfigLoc(null)}
            />
          );
        })()}

      {/* Modal de previsualización (Dry Run) */}
      {dryRunResult && dryRunLocation && (
        <Modal
          open
          onClose={() => {
            setDryRunResult(null);
            setDryRunLocation(null);
          }}
          title="Previsualizar promociones"
          subtitle={dryRunLocation.name}
          size="md"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setDryRunResult(null);
                  setDryRunLocation(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                icon={Check}
                onClick={handleApplyDryRun}
                loading={applyingDryRun}
                disabled={applyingDryRun}
              >
                {applyingDryRun ? "Aplicando…" : "Aplicar ahora"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-ds-md bg-surf-2 p-3">
              <p className="text-[13px] font-semibold text-tx">
                {dryRunResult.estimatedImpact.itemsInPromo} platillos en promo
              </p>
              <p className="mt-0.5 text-[11px] text-tx-mut">
                Descuento promedio: {dryRunResult.estimatedImpact.averageDiscount}%
              </p>
            </div>

            {dryRunResult.recommendedItems.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[12px] font-bold uppercase text-tx-mut">Platillos recomendados</p>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {dryRunResult.recommendedItems.map((item) => (
                    <div key={item.id} className="rounded-ds-md border p-3" style={{ borderColor: "var(--bd-1)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-tx-hi">{item.name}</p>
                          <p className="mt-0.5 text-[11px] text-tx-mut">
                            Vendidos: {item.soldLast7Days} unidades
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="line-through text-[11px] text-tx-mut">
                            ${item.currentPrice.toFixed(2)}
                          </p>
                          <p className="font-bold text-primary">
                            ${item.recommendedPrice.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-tx-mut">-{item.discount}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-ds-md bg-surf-2 p-4 text-center">
                <p className="text-[12px] text-tx-mut">No hay platillos que cumplan los criterios para promo</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
