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

export default function GuiasUsoPage() {
  return (
    <div className="mx-auto max-w-7xl pb-12">
      <header
        className="overflow-hidden rounded-lg border"
        style={{
          background:
            "linear-gradient(135deg, rgba(245,166,35,0.22), rgba(255,92,53,0.08)), var(--surf)",
          borderColor: "var(--border)",
        }}
      >
        <div className="grid gap-6 p-5 md:grid-cols-[1.1fr_0.9fr] md:p-8">
          <div>
            <div
              className="mb-4 inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest"
              style={{ background: "var(--surf2)", color: "var(--brand-primary)" }}
            >
              Guias de uso
            </div>
            <h1
              className="max-w-3xl text-4xl font-black leading-none md:text-6xl"
              style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}
            >
              Registrar el menu en MRTPVREST
            </h1>
            <p className="mt-4 max-w-2xl text-sm md:text-base" style={{ color: "var(--muted)", lineHeight: 1.7 }}>
              Guia visual para cargar categorias, platillos, variantes, modificadores y tambien crear un primer menu con IA.
            </p>
          </div>

          <div className="grid content-end gap-3">
            <div className="rounded-lg border p-4" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
              <div className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                Ruta manual
              </div>
              <div className="mt-2 text-lg font-black" style={{ color: "var(--text)" }}>
                {"Categorias -> Variantes -> Platillos -> Prueba en TPV"}
              </div>
            </div>
            <div className="rounded-lg border p-4" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
              <div className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                Ruta con IA
              </div>
              <div className="mt-2 text-lg font-black" style={{ color: "var(--text)" }}>
                {"Platillos -> Escaneo IA -> Revisar -> Prueba en TPV"}
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-8">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-black md:text-3xl" style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}>
              Flujo manual paso a paso
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              Recomendado cuando quieres capturar el menu con control total.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {manualSteps.map((step, index) => (
            <article
              key={step.title}
              className="rounded-lg border p-5"
              style={{ background: "var(--surf)", borderColor: "var(--border)" }}
            >
              <div className="mb-4 flex items-center justify-between">
                <span
                  className="grid h-9 w-9 place-items-center rounded-full text-sm font-black"
                  style={{ background: "var(--brand-primary)", color: "#fff" }}
                >
                  {index + 1}
                </span>
                <span className="rounded-full px-3 py-1 text-[11px] font-black" style={{ background: "var(--surf2)", color: "var(--muted)" }}>
                  {step.route}
                </span>
              </div>
              <h3 className="text-xl font-black" style={{ color: "var(--text)" }}>
                {step.title}
              </h3>
              <p className="mt-2 text-sm" style={{ color: "var(--muted)", lineHeight: 1.6 }}>
                {step.text}
              </p>
              <div className="mt-4 rounded-lg px-3 py-2 text-sm font-black" style={{ background: "var(--surf2)", color: "var(--text)" }}>
                {step.action}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <article
          className="rounded-lg border p-6"
          style={{ background: "#171717", borderColor: "rgba(255,255,255,0.1)", color: "#fff" }}
        >
          <div className="mb-3 inline-flex rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest" style={{ background: "rgba(245,166,35,0.16)", color: "#f5a623" }}>
            Menu con IA
          </div>
          <h2 className="text-3xl font-black leading-none md:text-5xl" style={{ fontFamily: "Syne, sans-serif" }}>
            Escaneo IA
          </h2>
          <p className="mt-4 text-sm" style={{ color: "rgba(255,255,255,0.72)", lineHeight: 1.7 }}>
            Si ya tienes fotos del menu, la IA puede crear un primer borrador con categorias, productos, precios y algunas opciones.
          </p>
          <div className="mt-5 rounded-lg border p-4 text-sm font-bold" style={{ borderColor: "rgba(245,166,35,0.35)", background: "rgba(245,166,35,0.08)", color: "#ffe4ad" }}>
            Usa la IA para avanzar rapido, pero revisa todo antes de vender.
          </div>
        </article>

        <div className="grid gap-3">
          {aiSteps.map((step, index) => (
            <article
              key={step.title}
              className="grid grid-cols-[42px_1fr] gap-3 rounded-lg border p-4"
              style={{ background: "var(--surf)", borderColor: "var(--border)" }}
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-full text-sm font-black"
                style={{ background: "var(--gold, #f5a623)", color: "#000" }}
              >
                {index + 1}
              </span>
              <div>
                <h3 className="font-black" style={{ color: "var(--text)" }}>
                  {step.title}
                </h3>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)", lineHeight: 1.55 }}>
                  {step.text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-2xl font-black md:text-3xl" style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}>
            Ejemplos claros
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Usa estos ejemplos para decidir si algo es categoria, variante o modificador.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {examples.map((example) => (
            <article key={example.title} className="rounded-lg border p-5" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
              <h3 className="text-xl font-black" style={{ color: "var(--text)" }}>
                {example.title}
              </h3>
              <div className="mt-4 grid gap-2">
                {example.lines.map(([label, value]) => (
                  <div
                    key={`${example.title}-${label}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm"
                    style={{ background: "var(--surf2)", color: "var(--text)" }}
                  >
                    <span className="font-black" style={{ color: "var(--muted)" }}>
                      {label}
                    </span>
                    <span className="text-right font-bold">{value}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4">
          <h2 className="text-2xl font-black md:text-3xl" style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}>
            Checklist final
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Antes de empezar a vender, valida estos puntos.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {checklist.map((item) => (
            <div key={item} className="flex gap-3 rounded-lg border p-4" style={{ background: "var(--surf)", borderColor: "var(--border)" }}>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black" style={{ background: "#22c55e", color: "#fff" }}>
                OK
              </span>
              <span className="text-sm font-bold" style={{ color: "var(--text)" }}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
