"use client";

import React from "react";
import {
  Smartphone, ChefHat, ConciergeBell, Bike, Monitor, QrCode, Download,
  type LucideIcon,
} from "lucide-react";
import {
  WtScreen, PageHeader, WtCard, SectionLabel, IconBadge,
  type Tone,
} from "@/components/warmtech";
import api from "@/lib/api";

const DELIVERY_URL = "https://delivery.mrtpvrest.com";
interface LocationRow { id: string; name: string; }

const APPS: {
  id: string;
  title: string;
  description: string;
  image: string;
  apkUrl: string;
  icon: LucideIcon;
  tone: Tone;
}[] = [
  {
    id: "tpv",
    title: "Punto de Venta (TPV)",
    description: "App principal para tomar órdenes, cobrar e imprimir tickets. Ideal para tablets y terminales POS Android.",
    image: "/tpv.png",
    apkUrl: "/apks/tpv-debug.apk",
    icon: Smartphone,
    tone: "ac",
  },
  {
    id: "kds",
    title: "Pantalla de Cocina (KDS)",
    description: "Visualiza y gestiona las órdenes directamente en la cocina sin tickets de papel. Mejora los tiempos de entrega.",
    image: "/app-kds.png",
    apkUrl: "/apks/kds-debug.apk",
    icon: ChefHat,
    tone: "warn",
  },
  {
    id: "meseros-lite",
    title: "Meseros Lite",
    description: "App ligera para meseros: toma pedidos desde mesa, consulta menu y sincroniza la orden con cocina y caja.",
    image: "/app-cliente.png",
    apkUrl: "/apks/meseros-lite-debug.apk",
    icon: ConciergeBell,
    tone: "info",
  },
  {
    id: "delivery",
    title: "App para Repartidores",
    description: "Tus repartidores podrán ver los pedidos asignados, la ruta de entrega y confirmar el pago en efectivo o tarjeta.",
    image: "/delivery.jpg",
    apkUrl: "/apks/delivery-debug.apk",
    icon: Bike,
    tone: "ok",
  },
  {
    id: "kiosk",
    title: "Kiosko de Auto-servicio",
    description: "Permite a tus clientes realizar sus propios pedidos y pagos directamente en una tablet instalada en tu local.",
    image: "/kiosko.png",
    apkUrl: "/apks/kiosk-debug.apk",
    icon: Monitor,
    tone: "ac",
  },
];

export default function DescargasPage() {
  const [origin, setOrigin] = React.useState("https://admin.mrtpvrest.com");
  const [restaurantId, setRestaurantId] = React.useState("");
  const [locations, setLocations] = React.useState<LocationRow[]>([]);
  const [selectedLoc, setSelectedLoc] = React.useState("");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      setRestaurantId(localStorage.getItem("restaurantId") || "");
    }
    api.get("/api/admin/locations")
      .then((res) => {
        const list: LocationRow[] = res.data || [];
        setLocations(list);
        if (list[0]) setSelectedLoc(list[0].id);
      })
      .catch(() => {});
  }, []);

  const loc = locations.find((l) => l.id === selectedLoc);
  const linkUrl =
    restaurantId && loc
      ? `${DELIVERY_URL}/?rid=${encodeURIComponent(restaurantId)}&lid=${encodeURIComponent(loc.id)}&ln=${encodeURIComponent(loc.name)}`
      : "";

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Instaladores"
        title="Aplicaciones Android"
        subtitle="Descarga e instala las apps oficiales en tus dispositivos Android. Escanea el QR desde el dispositivo donde quieres instalar."
      />

      <SectionLabel>Apps disponibles</SectionLabel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {APPS.map((app) => (
          <WtCard key={app.id} className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <IconBadge icon={app.icon} tone={app.tone} size={46} />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-base font-extrabold leading-tight text-tx-hi">
                  {app.title}
                </h2>
                <p className="mt-1.5 text-[12px] leading-relaxed text-tx-mut">
                  {app.description}
                </p>
              </div>
            </div>

            {/* preview image */}
            <div
              className="mt-4 aspect-[16/9] w-full overflow-hidden rounded-2xl"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={app.image} alt={app.title} className="h-full w-full object-cover" />
            </div>

            {/* QR + install */}
            <div
              className="mt-4 flex items-center gap-4 rounded-2xl p-3"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
            >
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-white p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(origin + app.apkUrl)}`}
                  alt={`QR para ${app.title}`}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="flex items-start gap-1.5 text-[11px] leading-snug text-tx-mut">
                <QrCode size={14} className="mt-0.5 shrink-0 text-tx-dim" />
                Apunta la cámara de tu dispositivo Android a este código QR para descargar el instalador (.apk).
              </div>
            </div>

            <a
              href={app.apkUrl}
              download
              className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] px-4 text-[13px] font-bold transition-transform active:scale-[.98]"
              style={{
                background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
                color: "#fffaf4",
                boxShadow: "0 6px 18px var(--iris-glow)",
              }}
            >
              <Download size={16} strokeWidth={2} />
              Instalar APK
            </a>
          </WtCard>
        ))}
      </div>

      {/* Vinculación de la app de repartidor (PWA iPhone / Web) por QR */}
      <SectionLabel>Vincular repartidor (iPhone / Web)</SectionLabel>
      <WtCard className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <IconBadge icon={Bike} tone="ok" size={46} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-extrabold leading-tight text-tx-hi">
              Vincular dispositivo del repartidor
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-tx-mut">
              Para iPhone (PWA): el repartidor abre <span className="font-semibold text-tx-dim">{DELIVERY_URL.replace("https://", "")}</span> en
              Safari, la agrega a inicio, y dentro de la app toca <span className="font-semibold">“Escanear QR”</span> y apunta a este código.
              Vincula el celular a la sucursal sin teclear nada.
            </p>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-tx-mut">
            Sucursal
          </label>
          <select
            value={selectedLoc}
            onChange={(e) => setSelectedLoc(e.target.value)}
            className="w-full rounded-2xl px-4 py-3 text-sm text-tx-hi outline-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            {locations.length === 0 && <option value="">Cargando sucursales…</option>}
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div
          className="flex items-center gap-4 rounded-2xl p-4"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          <div className="grid h-32 w-32 shrink-0 place-items-center rounded-xl bg-white p-2">
            {linkUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(linkUrl)}`}
                alt="QR de vinculación del repartidor"
                className="h-full w-full object-contain"
              />
            ) : (
              <QrCode size={36} className="text-gray-300" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-[11px] leading-snug text-tx-mut">
            <p className="font-semibold text-tx-dim">{loc ? loc.name : "Selecciona una sucursal"}</p>
            <p className="mt-1.5">
              El QR lleva solo el ID de restaurante y sucursal (no son contraseñas; el repartidor igual entra con su PIN).
            </p>
            {linkUrl && (
              <p className="mt-2 break-all font-mono text-[9px] text-tx-dim/70">{linkUrl}</p>
            )}
          </div>
        </div>
      </WtCard>
    </WtScreen>
  );
}
