"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const GREEN = "#25D366";

// Pasos para conectar WhatsApp.
const connectSteps = [
  {
    title: "Elige tu proveedor de WhatsApp",
    text: "Puedes usar Whapi (rápido de activar, recomendado para empezar) o la API oficial de Meta (WhatsApp Cloud API). Con cualquiera de los dos funciona el bot.",
  },
  {
    title: "Consigue tu token",
    text: "En el panel de tu proveedor, crea un canal con tu número de WhatsApp y copia el token de acceso. Si usas Meta, copia también el phoneNumberId y define un verify token.",
  },
  {
    title: "Pégalo en Integraciones",
    text: "Entra a Integraciones → WhatsApp, activa la integración y pega tu token (y phoneNumberId / verify token si usas Meta). Guarda los cambios.",
  },
  {
    title: "Configura el webhook",
    text: "En el panel de tu proveedor, pega la URL de webhook que aparece abajo (es única para tu restaurante). Con Meta, primero verifica con tu verify token.",
  },
];

const flowSteps = [
  { title: "Saludo", text: "El cliente escribe «hola» y el bot le da la bienvenida con el nombre de tu restaurante." },
  { title: "Tipo de pedido", text: "Elige entre entrega a domicilio o recoger en sucursal." },
  { title: "Menú numerado", text: "El bot muestra categorías y productos numerados; el cliente responde con números." },
  { title: "Datos y dirección", text: "Pide nombre y, si es a domicilio, la dirección (y ubicación para calcular el envío)." },
  { title: "Pago", text: "Efectivo, transferencia o pago en línea con tarjeta (si tienes pasarela)." },
  { title: "Confirmación", text: "Muestra el resumen con total y envío. Al confirmar, el pedido entra a tu cocina/TPV." },
];

const checklist = [
  "El menú tiene categorías y productos disponibles.",
  "Las sucursales están creadas y con sus tipos de pedido (domicilio / recoger).",
  "La integración de WhatsApp está activada con tu token.",
  "El webhook está configurado en tu proveedor con la URL de tu restaurante.",
  "Configuraste el costo de envío (tarifa fija o por distancia) en Tienda.",
  "Hiciste una prueba escribiendo «hola» a tu número de WhatsApp.",
];

const faqs = [
  {
    q: "El bot no responde a mis mensajes",
    a: "Revisa que la integración de WhatsApp esté activada con el token correcto y que el webhook en tu proveedor apunte exactamente a la URL de tu restaurante (abajo). El número que recibe los mensajes debe ser el del canal conectado.",
  },
  {
    q: "El cliente no puede pagar con tarjeta",
    a: "El pago en línea solo aparece si tienes MercadoPago o Stripe activado en Integraciones. Si no, el cliente paga en efectivo o por transferencia.",
  },
  {
    q: "¿Se pierden los pedidos si se reinicia el sistema?",
    a: "No. Las conversaciones se guardan y continúan donde quedaron. Una conversación inactiva se reinicia sola tras varias horas.",
  },
  {
    q: "¿Puedo dejar de enviar promociones a un cliente?",
    a: "Sí. En la pestaña Clientes verás quién acepta marketing. Los clientes marcados como «sin marketing» no reciben campañas.",
  },
];

export default function GuiaWhatsappPage() {
  const [restaurantId, setRestaurantId] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRestaurantId(localStorage.getItem("restaurantId") || "");
  }, []);

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || "https://api.mrtpvrest.com").replace(/\/+$/, "");
  const webhookUrl = `${apiBase}/api/whatsapp/webhook/${restaurantId || "<tu-id-de-restaurante>"}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard no disponible */ }
  };

  return (
    <div className="mx-auto max-w-7xl pb-12">
      {/* Hero */}
      <header
        className="overflow-hidden rounded-lg border"
        style={{
          background: `linear-gradient(135deg, ${GREEN}33, ${GREEN}0a), var(--surf)`,
          borderColor: "var(--border)",
        }}
      >
        <div className="p-5 md:p-8">
          <div className="mb-4 flex items-center gap-3">
            <Link
              href="/admin/guias"
              className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest"
              style={{ background: "var(--surf2)", color: "var(--muted)" }}
            >
              ← Guías
            </Link>
            <span className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest" style={{ background: `${GREEN}22`, color: GREEN }}>
              Chatbot de WhatsApp
            </span>
          </div>
          <h1 className="max-w-3xl text-4xl font-black leading-none md:text-6xl" style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}>
            Activa tu asistente de pedidos en WhatsApp
          </h1>
          <p className="mt-4 max-w-2xl text-sm md:text-base" style={{ color: "var(--muted)", lineHeight: 1.7 }}>
            En pocos pasos tu chatbot tomará pedidos solo: muestra el menú, calcula el envío, cobra y manda
            todo a tu cocina. Sigue esta guía de principio a fin.
          </p>
        </div>
      </header>

      {/* Webhook URL destacada */}
      <section className="mt-8">
        <div className="rounded-lg border p-5 md:p-6" style={{ background: "var(--surf)", borderColor: GREEN + "55" }}>
          <div className="text-xs font-black uppercase tracking-widest" style={{ color: GREEN }}>
            Tu URL de webhook
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
            Copia esta dirección y pégala en la configuración de webhook de tu proveedor de WhatsApp. Es única para tu restaurante.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code
              className="flex-1 overflow-x-auto rounded-lg px-4 py-3 text-xs sm:text-sm"
              style={{ background: "var(--surf2)", color: "var(--text)", border: "1px solid var(--border)" }}
            >
              {webhookUrl}
            </code>
            <button
              onClick={copy}
              className="rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest active:scale-95"
              style={{ background: GREEN, color: "#06231a" }}
            >
              {copied ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          {!restaurantId && (
            <p className="mt-3 text-xs" style={{ color: "#f59e0b" }}>
              Selecciona tu marca en el menú lateral para ver tu ID real.
            </p>
          )}
        </div>
      </section>

      {/* Paso a paso: conectar */}
      <Section title="1. Conecta WhatsApp" subtitle="Lo configuras una sola vez.">
        <div className="grid gap-4 md:grid-cols-2">
          {connectSteps.map((step, i) => (
            <NumberedCard key={step.title} index={i + 1} {...step} accent={GREEN} accentText="#06231a" />
          ))}
        </div>
      </Section>

      {/* Envío y pago */}
      <Section title="2. Configura envío y pago" subtitle="Para que el bot cobre correctamente.">
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard
            tag="Envío"
            title="Tarifa de entrega"
            text="En Tienda defines si el envío es una tarifa fija o se calcula por distancia (el bot pide la ubicación del cliente y cobra según los km). También puedes poner envío gratis desde cierto monto."
          />
          <InfoCard
            tag="Pago en línea (opcional)"
            title="Cobra con tarjeta"
            text="Si activas MercadoPago o Stripe en Integraciones, el bot ofrece «Pago en línea» y manda un link de pago. El pedido se confirma solo cuando el cliente paga."
          />
        </div>
      </Section>

      {/* Juegos y campañas */}
      <Section title="3. Vende más: juegos y campañas" subtitle="Desde el panel WhatsApp Bot.">
        <div className="grid gap-4 md:grid-cols-2">
          <LinkCard
            href="/admin/whatsapp"
            tag="Juegos"
            title="Ruleta de premios"
            text="Crea un juego con premios (descuentos o productos) y sus probabilidades. Tus clientes ganan cupones escribiendo «premio» o al terminar su pedido."
            accent={GREEN}
          />
          <LinkCard
            href="/admin/whatsapp"
            tag="Campañas"
            title="Remarketing"
            text="Envía ofertas por WhatsApp a segmentos de clientes (todos, inactivos, frecuentes). Personaliza con su nombre y respeta a quien no quiere marketing."
            accent={GREEN}
          />
        </div>
      </Section>

      {/* Cómo conversa el bot */}
      <Section title="4. Así conversa el bot con tu cliente" subtitle="Todo con menú numerado, fácil de responder.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {flowSteps.map((step, i) => (
            <NumberedCard key={step.title} index={i + 1} title={step.title} text={step.text} accent="var(--brand-primary)" accentText="#fff" />
          ))}
        </div>
      </Section>

      {/* Checklist */}
      <Section title="Checklist antes de activar" subtitle="Valida estos puntos.">
        <div className="grid gap-3 md:grid-cols-2">
          {checklist.map((item) => (
            <div key={item} className="flex gap-3 rounded-lg border p-4" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black" style={{ background: GREEN, color: "#06231a" }}>OK</span>
              <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{item}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section title="Problemas comunes" subtitle="Soluciones rápidas.">
        <div className="grid gap-3 md:grid-cols-2">
          {faqs.map((f) => (
            <article key={f.q} className="rounded-lg border p-5" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
              <h3 className="font-black" style={{ color: "var(--text)" }}>{f.q}</h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>{f.a}</p>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-2xl font-black md:text-3xl" style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}>{title}</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function NumberedCard({ index, title, text, accent, accentText }: { index: number; title: string; text: string; accent: string; accentText: string }) {
  return (
    <article className="rounded-lg border p-5" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
      <span className="mb-3 grid h-9 w-9 place-items-center rounded-full text-sm font-black" style={{ background: accent, color: accentText }}>{index}</span>
      <h3 className="text-lg font-black" style={{ color: "var(--text)" }}>{title}</h3>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>{text}</p>
    </article>
  );
}

function InfoCard({ tag, title, text }: { tag: string; title: string; text: string }) {
  return (
    <article className="rounded-lg border p-5" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
      <div className="mb-2 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest" style={{ background: "var(--surf2)", color: "var(--muted)" }}>{tag}</div>
      <h3 className="text-lg font-black" style={{ color: "var(--text)" }}>{title}</h3>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>{text}</p>
    </article>
  );
}

function LinkCard({ href, tag, title, text, accent }: { href: string; tag: string; title: string; text: string; accent: string }) {
  return (
    <Link href={href} className="block rounded-lg border p-5 transition-all hover:scale-[1.01]" style={{ background: "var(--surf)", borderColor: accent + "44" }}>
      <div className="mb-2 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest" style={{ background: accent + "22", color: accent }}>{tag}</div>
      <h3 className="text-lg font-black" style={{ color: "var(--text)" }}>{title}</h3>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>{text}</p>
      <div className="mt-3 text-xs font-black uppercase tracking-widest" style={{ color: accent }}>Abrir panel →</div>
    </Link>
  );
}
