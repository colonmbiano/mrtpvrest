"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft, Check, Copy, CheckCircle2, ChevronRight, Truck, CreditCard,
  Gamepad2, Megaphone, MessageCircle, AlertTriangle,
} from "lucide-react";
import {
  WtScreen, PageHeader, WtCard, SectionHead,
} from "@/components/warmtech";
import Link from "next/link";

const GREEN = "#39c46e";
const GREEN_GRADIENT = "linear-gradient(140deg,#39c46e,#1faa55)";

// Ruta rápida: Whapi.
const whapiSteps = [
  { title: "Crea tu canal en Whapi", text: "Entra a whapi.cloud, crea un canal y escanea el QR con el WhatsApp de tu negocio (igual que WhatsApp Web)." },
  { title: "Copia el token del canal", text: "En el panel de Whapi, copia el token de acceso de tu canal." },
  { title: "Pégalo en Integraciones", text: "Aquí en el panel: Integraciones → Mensajería (Chatbot). Proveedor = Whapi, pega el token y activa la integración." },
  { title: "Configura el webhook", text: "En Whapi → Settings → Webhooks, pega tu URL de webhook (la de arriba) y activa el evento de mensajes (messages)." },
];

// Ruta oficial: WhatsApp Cloud API de Meta.
const metaSteps = [
  { title: "Crea una app en Meta for Developers", text: "Entra a developers.facebook.com → My Apps → Create App → tipo «Business». Necesitas una cuenta de Meta Business." },
  { title: "Agrega el producto «WhatsApp»", text: "Dentro de la app, en «Add products», agrega WhatsApp. Esto crea un número de prueba y tu WhatsApp Business Account (WABA)." },
  { title: "Toma tu Phone number ID", text: "En WhatsApp → API Setup verás el «Phone number ID» (un número largo). Cópialo. Aquí también puedes registrar tu número real más adelante." },
  { title: "Genera un token permanente", text: "En Business Settings → Usuarios → Usuarios del sistema, crea un usuario del sistema, asígnale la app y genera un token con permisos whatsapp_business_messaging y whatsapp_business_management. Usa el token permanente (no el temporal de 24 h)." },
  { title: "Inventa un Verify token", text: "Es un texto secreto que tú eliges (ej. mrtpv-verify-2026). Lo usarás en dos lugares: aquí y en el webhook de Meta. Deben ser idénticos." },
  { title: "Llena Integraciones aquí", text: "Integraciones → Mensajería (Chatbot): Proveedor = Meta, pega el Token, el Phone number ID y tu Verify token. Activa la integración y guarda." },
  { title: "Configura el webhook en Meta", text: "En WhatsApp → Configuration → Webhook: pega tu URL de webhook (la de arriba como Callback URL) y el mismo Verify token. Dale «Verify and save»." },
  { title: "Suscríbete a «messages»", text: "En esa misma sección de Webhook, en «Webhook fields», activa la suscripción al campo messages. Sin esto, Meta no te envía los mensajes entrantes." },
  { title: "Pasa a producción", text: "Registra tu número real y pon la app en modo Live. Mientras esté en modo de prueba, solo responde a números agregados como testers." },
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
    <WtScreen>
      <PageHeader
        eyebrow="Chatbot de WhatsApp"
        title="Activa tu asistente de pedidos"
        subtitle="En pocos pasos tu chatbot toma pedidos solo: muestra el menú, calcula el envío, cobra y manda todo a tu cocina."
      />

      {/* Volver a guías (móvil + desktop) */}
      <Link
        href="/admin/guias"
        className="mb-4 inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 font-mono text-[11px] uppercase tracking-[.12em] text-tx-mut"
        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
      >
        <ArrowLeft size={13} /> Guías
      </Link>

      {/* Hero verde */}
      <WtCard
        className="p-5 md:p-7"
        style={{ background: "linear-gradient(135deg, rgba(57,196,110,0.18), transparent), var(--surf-1)", borderColor: "rgba(57,196,110,0.4)" }}
      >
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-white" style={{ background: GREEN_GRADIENT }}>
            <MessageCircle size={24} strokeWidth={1.9} />
          </span>
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-[-.03em] text-tx-hi md:text-3xl">
              Activa tu asistente de pedidos en WhatsApp
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-tx-mut" style={{ lineHeight: 1.7 }}>
              En pocos pasos tu chatbot tomará pedidos solo: muestra el menú, calcula el envío, cobra y manda todo a tu cocina. Sigue esta guía de principio a fin.
            </p>
          </div>
        </div>
      </WtCard>

      {/* Webhook URL destacada */}
      <WtCard className="mt-4 p-5 md:p-6" style={{ borderColor: "rgba(57,196,110,0.45)" }}>
        <div className="font-mono text-[11px] uppercase tracking-[.14em]" style={{ color: GREEN }}>
          Tu URL de webhook
        </div>
        <p className="mt-2 text-sm text-tx-mut">
          Copia esta dirección y pégala en la configuración de webhook de tu proveedor de WhatsApp. Es única para tu restaurante.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code
            className="flex-1 overflow-x-auto rounded-xl px-4 py-3 font-mono text-xs text-tx sm:text-sm"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            {webhookUrl}
          </code>
          <button
            onClick={copy}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[13px] px-4 text-[13px] font-bold text-white transition-transform active:scale-[.98]"
            style={{ background: GREEN_GRADIENT, boxShadow: "0 6px 18px rgba(57,196,110,0.3)" }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
        {!restaurantId && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-warn">
            <AlertTriangle size={13} /> Selecciona tu marca en el menú lateral para ver tu ID real.
          </p>
        )}
      </WtCard>

      {/* 1. Conecta WhatsApp */}
      <Section title="1. Conecta WhatsApp" subtitle="Elige UNA de las dos rutas. Lo configuras una sola vez.">
        <div className="mb-3 inline-flex rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[.12em] text-white" style={{ background: "#1faa55" }}>
          Opción A · Whapi (rápido, recomendado)
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {whapiSteps.map((step, i) => (
            <NumberedCard key={step.title} index={i + 1} {...step} accent={GREEN_GRADIENT} />
          ))}
        </div>

        <div className="mb-3 mt-8 inline-flex rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[.12em] text-white" style={{ background: "#1877F2" }}>
          Opción B · WhatsApp Cloud API (Meta, oficial)
        </div>
        <p className="mb-4 text-sm text-tx-mut" style={{ lineHeight: 1.6 }}>
          Más pasos, pero es la API oficial de Meta (mejor a gran escala). Necesitas una cuenta de Meta Business.
          Sigue el orden exacto — el <strong className="text-tx">Verify token</strong> debe ser idéntico aquí y en Meta.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metaSteps.map((step, i) => (
            <NumberedCard key={step.title} index={i + 1} {...step} accent="#1877F2" />
          ))}
        </div>

        <WtCard className="mt-5 p-4 text-sm text-tx" style={{ background: "var(--info-soft)", borderColor: "rgba(24,119,242,0.3)" }}>
          <strong className="text-info">Resumen Meta:</strong> en <em>Integraciones → Mensajería (Chatbot)</em> pones
          Proveedor = <strong className="text-tx">Meta</strong>, Token, Phone number ID y Verify token. En
          <em> Meta → WhatsApp → Configuration</em> pegas tu URL de webhook (arriba) + el mismo
          Verify token y te suscribes al campo <strong className="text-tx">messages</strong>.
        </WtCard>
      </Section>

      {/* 2. Envío y pago */}
      <Section title="2. Configura envío y pago" subtitle="Para que el bot cobre correctamente.">
        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard
            icon={<Truck size={18} strokeWidth={1.9} />}
            tag="Envío"
            title="Tarifa de entrega"
            text="En Tienda defines si el envío es una tarifa fija o se calcula por distancia (el bot pide la ubicación del cliente y cobra según los km). También puedes poner envío gratis desde cierto monto."
          />
          <InfoCard
            icon={<CreditCard size={18} strokeWidth={1.9} />}
            tag="Pago en línea (opcional)"
            title="Cobra con tarjeta"
            text="Si activas MercadoPago o Stripe en Integraciones, el bot ofrece «Pago en línea» y manda un link de pago. El pedido se confirma solo cuando el cliente paga."
          />
        </div>
      </Section>

      {/* 3. Juegos y campañas */}
      <Section title="3. Vende más: juegos y campañas" subtitle="Desde el panel WhatsApp Bot.">
        <div className="grid gap-4 md:grid-cols-2">
          <LinkCard
            href="/admin/whatsapp"
            icon={<Gamepad2 size={18} strokeWidth={1.9} />}
            tag="Juegos"
            title="Ruleta de premios"
            text="Crea un juego con premios (descuentos o productos) y sus probabilidades. Tus clientes ganan cupones escribiendo «premio» o al terminar su pedido."
          />
          <LinkCard
            href="/admin/whatsapp"
            icon={<Megaphone size={18} strokeWidth={1.9} />}
            tag="Campañas"
            title="Remarketing"
            text="Envía ofertas por WhatsApp a segmentos de clientes (todos, inactivos, frecuentes). Personaliza con su nombre y respeta a quien no quiere marketing."
          />
        </div>
      </Section>

      {/* 4. Cómo conversa el bot */}
      <Section title="4. Así conversa el bot con tu cliente" subtitle="Todo con menú numerado, fácil de responder.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {flowSteps.map((step, i) => (
            <NumberedCard key={step.title} index={i + 1} title={step.title} text={step.text} accent="var(--brand-primary)" />
          ))}
        </div>
      </Section>

      {/* Checklist */}
      <Section title="Checklist antes de activar" subtitle="Valida estos puntos.">
        <div className="grid gap-3 md:grid-cols-2">
          {checklist.map((item) => (
            <WtCard key={item} className="flex items-center gap-3 p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
                <CheckCircle2 size={16} />
              </span>
              <span className="text-sm font-semibold text-tx">{item}</span>
            </WtCard>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section title="Problemas comunes" subtitle="Soluciones rápidas.">
        <div className="grid gap-3 md:grid-cols-2">
          {faqs.map((f) => (
            <WtCard key={f.q} className="p-5">
              <h3 className="font-display font-extrabold text-tx-hi">{f.q}</h3>
              <p className="mt-2 text-sm text-tx-mut" style={{ lineHeight: 1.6 }}>{f.a}</p>
            </WtCard>
          ))}
        </div>
      </Section>
    </WtScreen>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section>
      <SectionHead title={title} />
      <p className="-mt-2 mb-3 text-sm text-tx-mut">{subtitle}</p>
      {children}
    </section>
  );
}

function NumberedCard({ index, title, text, accent }: { index: number; title: string; text: string; accent: string }) {
  return (
    <WtCard className="p-5">
      <span className="mb-3 grid h-9 w-9 place-items-center rounded-full font-display text-sm font-extrabold text-white" style={{ background: accent }}>{index}</span>
      <h3 className="font-display text-base font-extrabold text-tx-hi">{title}</h3>
      <p className="mt-2 text-sm text-tx-mut" style={{ lineHeight: 1.6 }}>{text}</p>
    </WtCard>
  );
}

function InfoCard({ icon, tag, title, text }: { icon: ReactNode; tag: string; title: string; text: string }) {
  return (
    <WtCard className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] text-primary" style={{ background: "var(--iris-soft)" }}>{icon}</span>
        <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">{tag}</span>
      </div>
      <h3 className="font-display text-base font-extrabold text-tx-hi">{title}</h3>
      <p className="mt-2 text-sm text-tx-mut" style={{ lineHeight: 1.6 }}>{text}</p>
    </WtCard>
  );
}

function LinkCard({ href, icon, tag, title, text }: { href: string; icon: ReactNode; tag: string; title: string; text: string }) {
  return (
    <Link href={href} className="block">
      <WtCard className="h-full p-5 transition-transform active:scale-[.99]">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] text-primary" style={{ background: "var(--iris-soft)" }}>{icon}</span>
          <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">{tag}</span>
        </div>
        <h3 className="font-display text-base font-extrabold text-tx-hi">{title}</h3>
        <p className="mt-2 text-sm text-tx-mut" style={{ lineHeight: 1.6 }}>{text}</p>
        <div className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.12em] text-primary">
          Abrir panel <ChevronRight size={13} />
        </div>
      </WtCard>
    </Link>
  );
}
