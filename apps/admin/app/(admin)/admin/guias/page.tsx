"use client";
import {
  CheckCircle2, MessageCircle, UtensilsCrossed, Sparkles, ChevronRight,
} from "lucide-react";
import {
  WtScreen, PageHeader, WtCard, SectionHead, IconBadge,
} from "@/components/warmtech";
import Link from "next/link";

const manualSteps = [
  {
    title: "Entrar al panel",
    text: "Inicia sesion como administrador y confirma que estas trabajando en la marca o sucursal correcta.",
    route: "Admin",
    action: "Revisar marca / sucursal",
  },
  {
    title: "Crear categorias",
    text: "Organiza tu menu por secciones para que los productos sean faciles de encontrar en caja y tienda online.",
    route: "Menu -> Categorias",
    action: "+ Nueva categoria",
  },
  {
    title: "Crear variantes",
    text: "Usa variantes para tamanos, sabores o presentaciones que el cliente debe elegir al vender.",
    route: "Menu -> Variantes",
    action: "+ Nuevo grupo",
  },
  {
    title: "Agregar platillos",
    text: "Registra nombre, precio base, imagen y categoria. Despues puedes agregar opciones y extras.",
    route: "Menu -> Platillos",
    action: "+ Nuevo platillo",
  },
  {
    title: "Agregar modificadores",
    text: "Sirven para extras, ingredientes sin costo, instrucciones o complementos con precio adicional.",
    route: "Editar platillo",
    action: "+ Nuevo grupo de modificadores",
  },
  {
    title: "Probar en TPV",
    text: "Abre el TPV, toca el producto, elige sus opciones y confirma que el precio final sea correcto.",
    route: "TPV",
    action: "Agregar al ticket",
  },
];

const aiSteps = [
  {
    title: "Abrir Escaneo IA",
    text: "Entra a Menu -> Platillos y presiona el boton Escaneo IA.",
  },
  {
    title: "Subir fotos claras",
    text: "Usa imagenes bien iluminadas donde se vean completos los nombres, categorias y precios.",
  },
  {
    title: "Esperar el analisis",
    text: "La IA creara categorias, productos, variantes y algunos modificadores cuando los detecte.",
  },
  {
    title: "Revisar antes de vender",
    text: "Confirma precios, ortografia, categorias, variantes y disponibilidad de cada producto.",
  },
];

const examples = [
  {
    title: "Boneless",
    lines: [
      ["Categoria", "Boneless"],
      ["Platillo", "Boneless 500g - $120"],
      ["Variantes", "BBQ, Bufalo, Mango Habanero"],
      ["Modificador", "Extra aderezo +$15"],
    ],
  },
  {
    title: "Hamburguesa",
    lines: [
      ["Categoria", "Hamburguesas"],
      ["Platillo", "Hamburguesa Clasica - $89"],
      ["Extras", "Queso +$15, Tocino +$20"],
      ["Sin ingredientes", "Sin cebolla, sin tomate"],
    ],
  },
];

const checklist = [
  "Todas las categorias principales estan creadas.",
  "Cada platillo tiene nombre, precio y categoria.",
  "Las fotos se ven correctamente.",
  "Las variantes tienen precios correctos.",
  "Los extras aparecen al tocar el producto.",
  "Si usaste IA, revisaste nombres y precios importados.",
  "El producto aparece en el TPV.",
  "Se hizo una venta de prueba.",
];

const GREEN_GRADIENT = "linear-gradient(140deg,#39c46e,#1faa55)";

export default function GuiasUsoPage() {
  return (
    <WtScreen>
      <PageHeader
        eyebrow="Guías de uso"
        title="Registrar el menú"
        subtitle="Carga categorías, platillos, variantes, modificadores y crea un primer menú con IA."
      />

      {/* Hero / rutas */}
      <WtCard
        className="p-5 md:p-7"
        style={{
          background:
            "linear-gradient(135deg, var(--iris-soft), transparent), var(--surf-1)",
        }}
      >
        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-3 inline-flex rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[.14em] text-primary" style={{ background: "var(--iris-soft)" }}>
              Guía visual
            </div>
            <h2 className="font-display text-2xl font-extrabold tracking-[-.03em] text-tx-hi md:text-3xl">
              Registrar el menú en MRTPVREST
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-tx-mut" style={{ lineHeight: 1.7 }}>
              Carga categorías, platillos, variantes y modificadores manualmente, o genera un primer menú con IA.
            </p>
          </div>
          <div className="grid content-end gap-3">
            <div className="rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Ruta manual</div>
              <div className="mt-1.5 font-display text-base font-extrabold text-tx-hi">
                Categorías → Variantes → Platillos → Prueba en TPV
              </div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Ruta con IA</div>
              <div className="mt-1.5 font-display text-base font-extrabold text-tx-hi">
                Platillos → Escaneo IA → Revisar → Prueba en TPV
              </div>
            </div>
          </div>
        </div>
      </WtCard>

      {/* Todas las guías */}
      <SectionHead title="Todas las guías" />
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/admin/guias/whatsapp" className="block">
          <WtCard className="h-full p-5 transition-transform active:scale-[.99]" style={{ borderColor: "rgba(57,196,110,0.4)" }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-[12px] text-white" style={{ background: GREEN_GRADIENT }}>
                <MessageCircle size={20} strokeWidth={1.9} />
              </span>
              <span className="rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-white" style={{ background: "#1faa55" }}>
                Nuevo
              </span>
            </div>
            <h3 className="font-display text-lg font-extrabold text-tx-hi">Chatbot de WhatsApp</h3>
            <p className="mt-2 text-sm text-tx-mut" style={{ lineHeight: 1.6 }}>
              Activa tu asistente que toma pedidos solo: conexión, envío, pago en línea, juegos de premios y campañas.
            </p>
            <div className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.12em]" style={{ color: "#39c46e" }}>
              Abrir guía <ChevronRight size={13} />
            </div>
          </WtCard>
        </Link>

        <WtCard className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <IconBadge icon={UtensilsCrossed} tone="ac" size={44} />
            <span className="rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-primary" style={{ background: "var(--iris-soft)" }}>
              Esta guía
            </span>
          </div>
          <h3 className="font-display text-lg font-extrabold text-tx-hi">Registrar el menú</h3>
          <p className="mt-2 text-sm text-tx-mut" style={{ lineHeight: 1.6 }}>
            Carga categorías, platillos, variantes y modificadores (manual o con Escaneo IA). Continúa leyendo abajo.
          </p>
        </WtCard>
      </div>

      {/* Flujo manual */}
      <SectionHead title="Flujo manual paso a paso" />
      <p className="-mt-2 mb-3 text-sm text-tx-mut">Recomendado cuando quieres capturar el menú con control total.</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {manualSteps.map((step, index) => (
          <WtCard key={step.title} className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-full font-display text-sm font-extrabold text-white" style={{ background: "var(--brand-primary)" }}>
                {index + 1}
              </span>
              <span className="rounded-full px-3 py-1 font-mono text-[10px] tracking-[.04em] text-tx-mut" style={{ background: "var(--surf-2)" }}>
                {step.route}
              </span>
            </div>
            <h3 className="font-display text-base font-extrabold text-tx-hi">{step.title}</h3>
            <p className="mt-2 text-sm text-tx-mut" style={{ lineHeight: 1.6 }}>{step.text}</p>
            <div className="mt-4 rounded-xl px-3 py-2 text-sm font-bold text-tx" style={{ background: "var(--surf-2)" }}>
              {step.action}
            </div>
          </WtCard>
        ))}
      </div>

      {/* Menú con IA */}
      <SectionHead title="Crear el menú con IA" />
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <WtCard className="p-6" style={{ background: "linear-gradient(140deg, var(--iris-soft), var(--surf-2))" }}>
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-primary">
            <Sparkles size={14} /> Menú con IA
          </div>
          <h3 className="font-display text-2xl font-extrabold tracking-[-.03em] text-tx-hi md:text-3xl">
            Escaneo IA
          </h3>
          <p className="mt-3 text-sm text-tx-mut" style={{ lineHeight: 1.7 }}>
            Si ya tienes fotos del menú, la IA puede crear un primer borrador con categorías, productos, precios y algunas opciones.
          </p>
          <div className="mt-5 rounded-xl p-4 text-sm font-bold text-warn" style={{ background: "var(--warn-soft)" }}>
            Usa la IA para avanzar rápido, pero revisa todo antes de vender.
          </div>
        </WtCard>

        <div className="grid gap-3">
          {aiSteps.map((step, index) => (
            <WtCard key={step.title} className="grid grid-cols-[40px_1fr] gap-3 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-full font-display text-sm font-extrabold text-white" style={{ background: "var(--brand-primary)" }}>
                {index + 1}
              </span>
              <div>
                <h3 className="font-display font-extrabold text-tx-hi">{step.title}</h3>
                <p className="mt-1 text-sm text-tx-mut" style={{ lineHeight: 1.55 }}>{step.text}</p>
              </div>
            </WtCard>
          ))}
        </div>
      </div>

      {/* Ejemplos */}
      <SectionHead title="Ejemplos claros" />
      <p className="-mt-2 mb-3 text-sm text-tx-mut">Usa estos ejemplos para decidir si algo es categoría, variante o modificador.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {examples.map((example) => (
          <WtCard key={example.title} className="p-5">
            <h3 className="font-display text-base font-extrabold text-tx-hi">{example.title}</h3>
            <div className="mt-4 grid gap-2">
              {example.lines.map(([label, value]) => (
                <div
                  key={`${example.title}-${label}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm text-tx"
                  style={{ background: "var(--surf-2)" }}
                >
                  <span className="font-bold text-tx-mut">{label}</span>
                  <span className="text-right font-bold">{value}</span>
                </div>
              ))}
            </div>
          </WtCard>
        ))}
      </div>

      {/* Checklist */}
      <SectionHead title="Checklist final" />
      <p className="-mt-2 mb-3 text-sm text-tx-mut">Antes de empezar a vender, valida estos puntos.</p>
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
    </WtScreen>
  );
}
