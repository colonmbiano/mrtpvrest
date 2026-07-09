"use client";
import { useEffect, useState } from "react";
import { Store, Star, Ticket } from "lucide-react";
import api from "@/lib/api";
import { getStoreUrl } from "@/lib/config";
import { PageShell, PageHeader, Button, Field, Input, Skeleton, useToast } from "@/components/ds";
import { SectionCard } from "./_components/ui";
import { StoreLinkCard } from "./_components/StoreLinkCard";
import { StoreStatusCards } from "./_components/StoreStatusCards";
import { ScheduleCard } from "./_components/ScheduleCard";
import { ContactThemeCard } from "./_components/ContactThemeCard";
import { DeliveryCard } from "./_components/DeliveryCard";
import { RewardsSection } from "./_components/RewardsSection";
import { CouponsSection } from "./_components/CouponsSection";
import type { BusinessHour, TiendaConfig } from "./_components/types";

export default function TiendaConfigPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"" | "loading" | "ok" | "error">("");
  const [config, setConfig] = useState<TiendaConfig>({
    slug: "",
    phone: "",
    address: "",
    whatsappNumber: "",
    countryCode: "MX",
    deliveryFee: 0,
    minOrderAmount: 0,
    freeDeliveryFrom: 0,
    estimatedDelivery: 40,
    storefrontTheme: "KAWAII",
    storefrontHeroUrl: "",
    // Módulo OlaClick
    whatsappOrderingEnabled: false,
    hasWhatsappOrdersModule: false,
    // Estado de la tienda
    isOpen: true,
    closedMessage: "",
    // Freno de saturación: tope de pedidos abiertos en cocina a partir del
    // cual la tienda online y el bot de WhatsApp rechazan pedidos nuevos.
    // 0 = sin freno. El TPV nunca se bloquea.
    maxOpenOrders: 0,
    saturatedMessage: "",
    // Corte de caja: ¿los admins ven el efectivo esperado en corte ciego?
    adminCanViewExpectedCash: true,
    // Corte de caja por correo: enviar el resumen del corte al cerrar el turno.
    cashCutEmailEnabled: false,
    cashCutEmails: "",
    // Horario de atención automático
    scheduleEnabled: false,
    timezone: "America/Mexico_City",
    businessHours: [] as BusinessHour[],
    // Envío por distancia
    deliveryMode: "FLAT",
    originLat: null,
    originLng: null,
    deliveryBaseFee: 0,
    deliveryPerKm: 0,
    deliveryFreeRadiusKm: null,
    deliveryMaxKm: null,
    // Programa de puntos
    pointsPerTen: 1,
    pointsValuePesos: 0.1,
  });

  const [heroUploading, setHeroUploading] = useState(false);

  // Sube la imagen de portada (hero) sin recorte (mode=hero conserva la
  // proporción panorámica). Guarda la URL en config.storefrontHeroUrl.
  async function uploadHero(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeroUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post("/api/upload/image?mode=hero", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.url) setConfig((p) => ({ ...p, storefrontHeroUrl: data.url }));
    } catch (err: any) {
      toast.error("No se pudo subir la imagen: " + (err?.response?.data?.error || err?.message || ""));
    } finally {
      setHeroUploading(false);
      e.target.value = "";
    }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoStatus("error"); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setConfig((p) => ({ ...p, originLat: pos.coords.latitude, originLng: pos.coords.longitude }));
        setGeoStatus("ok");
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const storeUrl = config.slug ? getStoreUrl(config.slug) : "";

  const copyStoreUrl = async () => {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("No se pudo copiar el enlace"); }
  };

  useEffect(() => {
    api.get("/api/admin/config")
      .then((res) => {
        const d = res.data || {};
        setConfig((prev) => ({
          ...prev,
          ...d,
          freeDeliveryFrom: d.freeDeliveryFrom ?? 0,
          closedMessage: d.closedMessage ?? "",
          maxOpenOrders: d.maxOpenOrders ?? 0,
          saturatedMessage: d.saturatedMessage ?? "",
          deliveryMode: d.deliveryMode === "DISTANCE" ? "DISTANCE" : "FLAT",
          whatsappOrderingEnabled: d.whatsappOrderingEnabled ?? false,
          hasWhatsappOrdersModule: d.hasWhatsappOrdersModule ?? false,
          isOpen: d.isOpen ?? true,
          adminCanViewExpectedCash: d.adminCanViewExpectedCash ?? true,
          cashCutEmailEnabled: d.cashCutEmailEnabled ?? false,
          cashCutEmails: d.cashCutEmails ?? "",
          scheduleEnabled: d.scheduleEnabled ?? false,
          countryCode: d.countryCode || "MX",
          timezone: d.timezone || "America/Mexico_City",
          businessHours: (() => {
            try {
              const parsed = JSON.parse(d.businessHours || "[]");
              return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
          })(),
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const { slug: _slug, hasWhatsappOrdersModule: _hwom, ...rest } = config;
      await api.put("/api/admin/config", {
        ...rest,
        freeDeliveryFrom: config.freeDeliveryFrom > 0 ? config.freeDeliveryFrom : null,
        // businessHours viaja como JSON serializado (mismo patrón que Banners).
        businessHours: JSON.stringify(config.businessHours),
      });
      window.location.reload();
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Error desconocido";
      toast.error(`Error al guardar (${status ?? "sin respuesta"}): ${msg}`);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <PageHeader eyebrow="Tienda online" title="Tienda" subtitle="Configura tu tienda online y reglas de pedido" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-ds-lg" />
          ))}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Tienda online"
        title="Tienda"
        subtitle="Configura tu tienda online y reglas de pedido"
        actions={
          <Button icon={Store} onClick={handleSave} disabled={saving} loading={saving}>
            {saving ? "Guardando…" : "Guardar tienda"}
          </Button>
        }
      />

      {/* Card destacada de la tienda online: URL + estado */}
      {storeUrl && (
        <StoreLinkCard
          storeUrl={storeUrl}
          isOpen={config.isOpen}
          estimatedDelivery={config.estimatedDelivery}
          copied={copied}
          onCopy={copyStoreUrl}
        />
      )}

      <div className="space-y-4">
        <StoreStatusCards config={config} setConfig={setConfig} />

        <ScheduleCard config={config} setConfig={setConfig} />

        <ContactThemeCard config={config} setConfig={setConfig} heroUploading={heroUploading} uploadHero={uploadHero} />

        <DeliveryCard config={config} setConfig={setConfig} geoStatus={geoStatus} useMyLocation={useMyLocation} />

        {/* Programa de puntos */}
        <SectionCard icon={Star} title="Programa de puntos" subtitle="Lealtad de tus clientes">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Puntos por cada $10">
              <Input type="number" min="0" value={config.pointsPerTen} onChange={(e) => { const v = parseInt(e.target.value) || 0; setConfig((p) => ({ ...p, pointsPerTen: v })); }} />
            </Field>
            <Field label="Valor del punto ($)">
              <Input type="number" min="0" step="any" value={config.pointsValuePesos} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig((p) => ({ ...p, pointsValuePesos: v })); }} />
            </Field>
          </div>
          <RewardsSection />
        </SectionCard>

        {/* Cupones de descuento (exclusivos de la tienda online) */}
        <SectionCard icon={Ticket} title="Cupones de descuento" subtitle="Códigos que el cliente escribe al pagar en la tienda online">
          <CouponsSection />
        </SectionCard>

        <Button icon={Store} full onClick={handleSave} disabled={saving} loading={saving}>
          {saving ? "Guardando…" : "Guardar tienda"}
        </Button>
      </div>
    </PageShell>
  );
}
