"use client";
import {
  ArrowLeft, ChevronRight, CheckCircle2, Layers, Flame, CupSoda,
  UtensilsCrossed, ArrowRight, Sparkles,
} from "lucide-react";
import {
  WtScreen, PageHeader, WtCard, SectionHead,
} from "@/components/warmtech";
import Link from "next/link";

// Colores de estación (ejemplo ilustrativo — cada negocio define las suyas en
// Ajustes → Impresoras). Semánticos, no el acento del tenant.
const ST_PARRILLA = "#cf4429";
const ST_FREIDORA = "#c07d00";
const ST_BARRA = "#0d7490";

// Anatomía: cada componente (slot) del combo y sus opciones (productos reales).
const componentes = [
  {
    slot: "Principal",
    opciones: "Hamburguesa de Res, Hamburguesa Doble (+$25)",
    nota: "El cliente elige uno. El «+$» solo se suma si elige la opción cara.",
  },
  {
    slot: "Guarnición",
    opciones: "Papas a la Francesa, Papas Gajo",
    nota: "Un producto real de tu menú por opción.",
  },
  {
    slot: "Bebida",
    opciones: "Refresco 600ml, Agua de Sabor",
    nota: "Elige cuántas se incluyen (ej. 2 bebidas).",
  },
];

// Cómo se rutea a cocina: cada componente hereda la estación de SU categoría.
const ruteo = [
  { item: "Hamburguesa de Res", estacion: "Parrilla", color: ST_PARRILLA, icon: UtensilsCrossed },
  { item: "Papas a la Francesa", estacion: "Freidora", color: ST_FREIDORA, icon: Flame },
  { item: "Refresco 600ml", estacion: "Barra", color: ST_BARRA, icon: CupSoda },
];

const pasos = [
  {
    title: "Crea el producto del combo",
    text: "Menú → Platillos → Nuevo. Ponle nombre y el precio base (el de la combinación más común). Ej: «Combo de la Casa · $149».",
    route: "Menú → Platillos",
  },
  {
    title: "Actívalo como combo configurable",
    text: "Dentro del producto, enciende el interruptor «Es un combo configurable». Guarda: aparecerá el armador de componentes.",
    route: "Editar platillo",
  },
  {
    title: "Agrega los componentes (slots)",
    text: "Uno por cada elección del cliente: Principal, Guarnición, Bebida… Marca si es obligatorio y cuántos puede elegir (mín/máx).",
    route: "+ Componente",
  },
  {
    title: "Llena cada componente con opciones",
    text: "Elige de tu menú los productos reales que caben en ese slot. Aquí el combo hereda automáticamente la estación de cada producto.",
    route: "+ Opción",
  },
  {
    title: "Ajusta los upgrades con «+$»",
    text: "Si una opción cuesta más (ej. carne doble), ponle su diferencia (+$25). Se suma al precio base solo si el cliente la elige.",
    route: "Opción → +$",
  },
  {
    title: "Prueba en el TPV",
    text: "Abre el TPV, toca el combo, arma las opciones y confirma que el precio final y las estaciones sean correctos.",
    route: "TPV",
  },
];

const reglas = [
  { ok: true, text: "El precio es base + upgrades. El cliente ve un solo precio; los «+$» solo suman con las opciones caras." },
  { ok: true, text: "El inventario se descuenta solo: cada opción es un producto real con su receta, así se rebaja lo que el cliente eligió." },
  { ok: true, text: "La estación viene de la categoría del producto. ¿Un refresco sale en cocina por error? Revisa su categoría, no el combo." },
  { ok: false, text: "La opción debe existir como producto. Para ofrecer «Papas Gajo» en un combo, primero debe existir «Papas Gajo» en tu menú." },
  { ok: false, text: "No mezcles combo con variantes de tamaño en el mismo producto. El combo elige QUÉ trae; las variantes eligen el TAMAÑO." },
];

const checklist = [
  "Los productos que irán en el combo ya existen por separado en el menú.",
  "Cada producto está en la categoría correcta (define su estación de cocina).",
  "El combo tiene precio base y el interruptor «Es un combo configurable» activo.",
  "Cada componente tiene sus opciones y, si aplica, su «+$».",
  "Se hizo una venta de prueba en el TPV y el ticket salió correcto.",
];

const IRIS_GRADIENT = "linear-gradient(140deg, var(--iris-soft), var(--surf-2))";

export default function GuiaCombosPage() {
  return (
    <WtScreen>
      <Link
        href="/admin/guias"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[.12em] text-tx-mut transition-colors hover:text-tx-hi"
      >
        <ArrowLeft size={14} /> Volver a guías
      </Link>

      <PageHeader
        eyebrow="Guías de uso"
        title="Combos que se cocinan en su estación"
        subtitle="Arma combos configurables: se cobran como un solo producto, pero cada parte sale en la estación de cocina correcta."
      />

      {/* Hero: la idea */}
      <WtCard
        className="p-5 md:p-7"
        style={{ background: "linear-gradient(135deg, var(--iris-soft), transparent), var(--surf-1)" }}
      >
        <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-3 inline-flex rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[.14em] text-primary" style={{ background: "var(--iris-soft)" }}>
              La idea en una frase
            </div>
            <h2 className="font-display text-2xl font-extrabold tracking-[-.03em] text-tx-hi md:text-3xl">
              Un combo es un producto que contiene otros productos reales
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-tx-mut" style={{ lineHeight: 1.7 }}>
              No escribes «hamburguesa + papas + refresco» como texto: eliges productos que ya existen en tu menú.
              Por eso el sistema sabe el precio, descuenta el inventario de cada uno y —lo importante— conoce a qué
              estación de cocina va cada parte.
            </p>
          </div>
          <div className="grid content-end gap-3">
            <div className="rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">En caja</div>
              <div className="mt-1.5 font-display text-base font-extrabold text-tx-hi">Una línea, un precio</div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">En cocina</div>
              <div className="mt-1.5 font-display text-base font-extrabold text-tx-hi">Cada parte en su estación</div>
            </div>
          </div>
        </div>
      </WtCard>

      {/* Ruteo por estación */}
      <SectionHead title="Cómo llega cada parte a su estación" />
      <p className="-mt-2 mb-3 text-sm text-tx-mut">
        La estación la decide la <b>categoría</b> de cada producto (se configura en Ajustes → Impresoras).
        Como las opciones del combo son productos reales, cada una hereda su estación. No configuras nada extra en el combo.
      </p>
      <WtCard className="p-5 md:p-6">
        <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1.4fr]">
          {/* Ticket de caja */}
          <div className="rounded-2xl p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
            <div className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Caja · 1 línea</div>
            <div className="mt-2 font-display text-base font-extrabold text-tx-hi">Combo de la Casa</div>
            <div className="mt-1 font-mono text-sm text-primary">$149.00</div>
          </div>

          <div className="grid place-items-center text-tx-mut">
            <ArrowRight size={22} className="hidden md:block" />
            <span className="font-mono text-[9px] uppercase tracking-[.14em]">se parte</span>
          </div>

          {/* Estaciones */}
          <div className="grid gap-2.5">
            {ruteo.map((r) => (
              <div
                key={r.item}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "var(--surf-2)", borderLeft: `3px solid ${r.color}` }}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: r.color }}>
                  <r.icon size={15} />
                </span>
                <span className="flex-1 text-sm font-bold text-tx">{r.item}</span>
                <span className="font-mono text-[11px] font-bold uppercase tracking-[.06em]" style={{ color: r.color }}>
                  {r.estacion}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-4 text-[12.5px] text-tx-mut">
          Un solo combo tocó tres estaciones — sin que configuraras ninguna ruta en él. Todo vino de la categoría de cada producto.
        </p>
      </WtCard>

      {/* Anatomía */}
      <SectionHead title="Anatomía de un combo" />
      <div className="grid gap-4 md:grid-cols-3">
        {componentes.map((c, i) => (
          <WtCard key={c.slot} className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-[12px] text-white" style={{ background: "var(--brand-primary)" }}>
                <Layers size={18} strokeWidth={1.9} />
              </span>
              <span className="rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-tx-mut" style={{ background: "var(--surf-2)" }}>
                Componente {i + 1}
              </span>
            </div>
            <h3 className="font-display text-lg font-extrabold text-tx-hi">{c.slot}</h3>
            <div className="mt-2 rounded-xl px-3 py-2 text-sm font-semibold text-tx" style={{ background: "var(--surf-2)" }}>
              {c.opciones}
            </div>
            <p className="mt-2 text-[12.5px] text-tx-mut" style={{ lineHeight: 1.55 }}>{c.nota}</p>
          </WtCard>
        ))}
      </div>

      {/* Paso a paso */}
      <SectionHead title="Armar un combo, paso a paso" />
      <p className="-mt-2 mb-3 text-sm text-tx-mut">
        Todo se hace desde <b>Menú → Platillos</b>. Antes de empezar, asegúrate de que los productos que vas a incluir ya existan por separado.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pasos.map((step, index) => (
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
          </WtCard>
        ))}
      </div>

      {/* Reglas */}
      <SectionHead title="Reglas de oro" />
      <div className="grid gap-3 md:grid-cols-2">
        {reglas.map((r) => (
          <WtCard key={r.text} className="flex items-start gap-3 p-4">
            <span
              className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-sm font-black"
              style={r.ok
                ? { background: "var(--ok-soft)", color: "var(--ok)" }
                : { background: "var(--warn-soft)", color: "var(--warn)" }}
            >
              {r.ok ? "✓" : "!"}
            </span>
            <span className="text-sm font-semibold text-tx" style={{ lineHeight: 1.5 }}>{r.text}</span>
          </WtCard>
        ))}
      </div>

      {/* Ejemplo cerrado */}
      <SectionHead title="Ejemplo completo" />
      <WtCard className="p-6" style={{ background: IRIS_GRADIENT }}>
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-primary">
          <Sparkles size={14} /> Combo de la Casa · $149
        </div>
        <div className="grid gap-2.5 md:grid-cols-3">
          {ruteo.map((r) => (
            <div key={r.item} className="rounded-xl bg-surf-1 px-4 py-3" style={{ border: "1px solid var(--bd-1)" }}>
              <div className="text-sm font-extrabold text-tx-hi">{r.item}</div>
              <div className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[.06em]" style={{ color: r.color }}>
                → {r.estacion}
              </div>
            </div>
          ))}
        </div>
      </WtCard>

      {/* Checklist */}
      <SectionHead title="Checklist final" />
      <p className="-mt-2 mb-3 text-sm text-tx-mut">Antes de vender el combo, valida estos puntos.</p>
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
