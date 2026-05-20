"use client";
import React from "react";
import Image from "next/image";

const APPS = [
  {
    id: "tpv",
    title: "Punto de Venta (TPV)",
    description: "App principal para tomar órdenes, cobrar e imprimir tickets. Ideal para tablets y terminales POS Android.",
    image: "/tpv.png",
    apkUrl: "/apks/tpv-debug.apk",
  },
  {
    id: "kds",
    title: "Pantalla de Cocina (KDS)",
    description: "Visualiza y gestiona las órdenes directamente en la cocina sin tickets de papel. Mejora los tiempos de entrega.",
    image: "/app-kds.png",
    apkUrl: "/apks/kds-debug.apk",
  },
  {
    id: "delivery",
    title: "App para Repartidores",
    description: "Tus repartidores podrán ver los pedidos asignados, la ruta de entrega y confirmar el pago en efectivo o tarjeta.",
    image: "/delivery.jpg",
    apkUrl: "/apks/delivery-debug.apk",
  },
  {
    id: "kiosk",
    title: "Kiosko de Auto-servicio",
    description: "Permite a tus clientes realizar sus propios pedidos y pagos directamente en una tablet instalada en tu local.",
    image: "/kiosko.png",
    apkUrl: "/apks/kiosk-debug.apk",
  },
];

export default function DescargasPage() {
  const [origin, setOrigin] = React.useState("https://admin.mrtpvrest.com");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);
  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}>
          Aplicaciones Android
        </h1>
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
          Descarga e instala las aplicaciones oficiales en tus dispositivos Android (Tablets, Celulares o Terminales POS). 
          Escanea el código QR desde el dispositivo donde quieres instalar la app.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {APPS.map((app) => (
          <div
            key={app.id}
            className="flex flex-col sm:flex-row gap-6 p-6 rounded-2xl transition-all hover:scale-[1.01]"
            style={{
              background: "var(--surf)",
              border: "1px solid var(--border)",
              boxShadow: "0 10px 30px -10px rgba(0,0,0,0.1)",
            }}
          >
            {/* Imagen ilustrativa */}
            <div className="w-full sm:w-1/3 flex-shrink-0 flex flex-col items-center justify-center gap-4">
              <div
                className="w-full aspect-square relative rounded-xl overflow-hidden bg-black/5"
                style={{ border: "1px solid var(--border)" }}
              >
                <Image
                  src={app.image}
                  alt={app.title}
                  fill
                  className="object-cover"
                />
              </div>
              <a
                href={app.apkUrl}
                download
                className="w-full py-2.5 rounded-lg text-xs font-black uppercase tracking-widest text-center transition-all hover:brightness-110 active:scale-95"
                style={{
                  background: "var(--brand-primary, #ff5c35)",
                  color: "#fff",
                }}
              >
                Descargar APK
              </a>
            </div>

            {/* Info y QR */}
            <div className="flex-1 flex flex-col">
              <h2 className="text-lg font-black mb-2" style={{ color: "var(--text)" }}>
                {app.title}
              </h2>
              <p className="text-xs mb-6 flex-1" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                {app.description}
              </p>

              <div className="flex items-center gap-4 mt-auto p-4 rounded-xl" style={{ background: "var(--surf2)" }}>
                <div className="w-20 h-20 flex-shrink-0 bg-white p-1.5 rounded-lg shadow-sm">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(origin + app.apkUrl)}`}
                    alt={`QR Code para ${app.title}`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>
                  Apunta la cámara de tu dispositivo Android a este código QR para descargar directamente el instalador (.apk).
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
