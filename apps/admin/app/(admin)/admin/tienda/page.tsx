"use client";
import { useEffect, useState } from "react";
import { Store, Star, Ticket } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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

// QR por mesa: el comensal escanea → abre el menú en DINE_IN con su mesa fija.
// El enlace codifica el número de mesa (extraído del nombre) + la sucursal, que
// el storefront lee de ?mesa=&l= (ver apps/client/src/app/[slug]/page.tsx).
function MesasQrCard({ storeUrl }: { storeUrl: string }) {
  const [tables, setTables] = useState<Array<{ id: string; name: string; locationId: string }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/api/tables")
      .then((r) => setTables(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const mesaNum = (name: string) => (String(name).match(/\d+/) || [])[0] || "";
  const linkFor = (t: { name: string; locationId: string }) => {
    const num = mesaNum(t.name);
    if (!num || !storeUrl) return "";
    const sep = storeUrl.includes("?") ? "&" : "?";
    return `${storeUrl}${sep}mesa=${encodeURIComponent(num)}&l=${encodeURIComponent(t.locationId)}`;
  };
  const usable = tables.filter((t) => linkFor(t));

  return (
    <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-extrabold text-tx-hi">QR de mesas (autoservicio)</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-tx-mut">
            Pega un QR en cada mesa. El comensal escanea, ve el menú y su pedido entra al TPV con la mesa ya puesta.
          </p>
        </div>
        {usable.length > 0 && (
          <button type="button" onClick={() => window.print()} className="shrink-0 rounded-xl px-3 py-2 text-[12px] font-extrabold text-white" style={{ background: "var(--brand-primary)" }}>
            Imprimir
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[12px] text-tx-mut">Cargando mesas…</p>
      ) : usable.length === 0 ? (
        <p className="text-[12px] text-tx-mut">
          No hay mesas con número en esta sucursal. Crea mesas (con un número en el nombre, ej. «Mesa 1») desde el mapa del TPV.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {usable.map((t) => {
            const link = linkFor(t);
            return (
              <div key={t.id} className="flex flex-col items-center gap-2 rounded-2xl p-3" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
                <div className="rounded-xl bg-white p-2">
                  <QRCodeSVG value={link} size={112} marginSize={1} />
                </div>
                <p className="text-[12px] font-extrabold text-tx-hi">{t.name}</p>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); }}
                  className="text-[11px] font-bold text-tx-mut hover:text-tx-hi"
                >
                  Copiar enlace
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
    // Aviso al dueño por WhatsApp cuando entra un pedido web.
    orderAlertEnabled: false,
    orderAlertWhatsapp: "",
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
          orderAlertEnabled: d.orderAlertEnabled ?? false,
          orderAlertWhatsapp: d.orderAlertWhatsapp ?? "",
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

        {/* QR por mesa (autoservicio dine-in) — el comensal escanea y su pedido entra al TPV con la mesa puesta */}
        {storeUrl && (
          <SectionCard icon={Store} title="QR de mesas" subtitle="Autoservicio en mesa para tus comensales">
            <MesasQrCard storeUrl={storeUrl} />
          </SectionCard>
        )}

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
