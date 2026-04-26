import Link from 'next/link'

const REGISTER_URL = 'https://admin.mrtpvrest.com/register'
const LOGIN_URL = 'https://admin.mrtpvrest.com/login'

const features = [
  {
    name: 'TPV',
    headline: 'Cobra rápido en cualquier dispositivo',
    body: 'Terminal punto de venta para web, tablet y Android. Cuentas separadas, mesas, propinas y múltiples métodos de pago.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M3 17h18l-2 4H5z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    ),
  },
  {
    name: 'Pedidos online',
    headline: 'Tu propio menú digital',
    body: 'QR en mesa, tienda web y kiosco de auto-servicio. Tus clientes ordenan solos y los pedidos caen directo en cocina.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M9 18h6M9 6h6M9 10h6M9 14h6" />
      </svg>
    ),
  },
  {
    name: 'Delivery',
    headline: 'Repartidores con GPS en vivo',
    body: 'Asigna pedidos, rastrea rutas en tiempo real y controla la caja de cada repartidor al cierre del turno.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17h13V5H3zM16 9h4l3 3v5h-7" />
        <circle cx="7" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </svg>
    ),
  },
  {
    name: 'KDS',
    headline: 'La cocina ve los pedidos al instante',
    body: 'Kitchen Display System con tickets por estación, tiempos de preparación y notificaciones cuando algo está listo.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 18v3" />
        <path d="M6 9h12M6 13h8" />
      </svg>
    ),
  },
  {
    name: 'Reportes',
    headline: 'Datos accionables, no solo gráficas',
    body: 'Ventas por hora, productos estrella, mermas, márgenes y análisis con IA que te dice qué cambiar mañana.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21V3" />
        <path d="M7 17V11M12 17V7M17 17v-4" />
        <path d="M3 21h18" />
      </svg>
    ),
  },
  {
    name: 'Multi-sucursal',
    headline: 'Una marca, todas tus tiendas',
    body: 'Gestiona menú, precios, inventario y empleados en cada sucursal por separado, todo desde un solo panel.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21V10l9-7 9 7v11" />
        <path d="M9 21v-7h6v7" />
        <path d="M3 14h18" />
      </svg>
    ),
  },
] as const

const steps = [
  {
    n: '01',
    title: 'Regístrate',
    body: 'Crea tu cuenta en menos de 2 minutos. Sin tarjeta, sin contratos, sin instalaciones.',
  },
  {
    n: '02',
    title: 'Configura tu menú',
    body: 'Sube tus productos, categorías y precios. O importa con IA tomando una foto de tu menú actual.',
  },
  {
    n: '03',
    title: 'Empieza a vender',
    body: 'Activa tu TPV, comparte el QR con clientes y suma a tu equipo. Listo para operar el mismo día.',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen bg-ink text-white">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-line bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-display text-base font-black text-ink shadow-brand">
              M
            </div>
            <span className="font-display text-base font-extrabold tracking-tight">
              MRTPVREST
            </span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-sm font-medium text-white/60 transition hover:text-white">
              Producto
            </a>
            <a href="#como-funciona" className="text-sm font-medium text-white/60 transition hover:text-white">
              Cómo funciona
            </a>
            <a href={LOGIN_URL} className="text-sm font-medium text-white/60 transition hover:text-white">
              Iniciar sesión
            </a>
          </nav>
          <a
            href={REGISTER_URL}
            className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-ink shadow-brand transition hover:bg-brand-400"
          >
            Empezar gratis
          </a>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 glow-brand pointer-events-none" />
        <div className="absolute inset-0 grain pointer-events-none opacity-40" />

        <div className="relative mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-8 sm:pt-24 md:pb-32 md:pt-32">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-line2 bg-ink2/60 px-4 py-1.5 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
              </span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-white/70">
                El sistema todo-en-uno para restaurantes
              </span>
            </div>

            <h1 className="text-balance font-display text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
              Gestiona tu restaurante.
              <br />
              <span className="text-brand">Sin caos.</span>
            </h1>

            <p className="mx-auto mt-7 max-w-2xl text-balance text-lg text-white/60 sm:text-xl">
              TPV, pedidos online, delivery, KDS y reportes en tiempo real.
              Una sola plataforma para que dejes de pelear con tres apps que no se hablan.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <a
                href={REGISTER_URL}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-7 py-4 text-base font-bold text-ink shadow-brand transition hover:bg-brand-400 sm:w-auto"
              >
                Empezar gratis
                <svg className="h-4 w-4 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="#features"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line2 bg-ink2/40 px-7 py-4 text-base font-semibold text-white/80 backdrop-blur transition hover:bg-ink2 hover:text-white sm:w-auto"
              >
                Ver qué incluye
              </a>
            </div>

            <p className="mt-6 font-mono text-xs uppercase tracking-widest text-white/40">
              Sin tarjeta · Sin contratos · Listo el mismo día
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative border-t border-line bg-ink">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-brand">
              Producto
            </p>
            <h2 className="text-balance font-display text-4xl font-black leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Todo lo que tu restaurante necesita.
              <br />
              <span className="text-white/50">Cero integraciones.</span>
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.name}
                className="group relative flex flex-col gap-5 bg-ink p-7 transition hover:bg-ink2 sm:p-8"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-ink">
                  <div className="h-6 w-6">{f.icon}</div>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">
                    {f.name}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold tracking-tight sm:text-2xl">
                    {f.headline}
                  </h3>
                </div>
                <p className="text-[15px] leading-relaxed text-white/60">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como-funciona" className="relative border-t border-line bg-ink2/40">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-brand">
              Cómo funciona
            </p>
            <h2 className="text-balance font-display text-4xl font-black leading-tight tracking-tight sm:text-5xl md:text-6xl">
              De cero a vendiendo en{' '}
              <span className="text-brand">un día.</span>
            </h2>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="relative flex flex-col gap-5 rounded-2xl border border-line bg-ink p-7 transition hover:border-line2 sm:p-8"
              >
                <div className="font-display text-5xl font-black text-brand sm:text-6xl">
                  {s.n}
                </div>
                <div>
                  <h3 className="font-display text-2xl font-bold tracking-tight">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="absolute inset-0 bg-gradient-to-b from-ink via-ink to-brand/15" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-40" />

        <div className="relative mx-auto max-w-4xl px-5 py-24 text-center sm:px-8 sm:py-32">
          <h2 className="text-balance font-display text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
            Tu restaurante,{' '}
            <span className="text-brand">en orden.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-balance text-lg text-white/70 sm:text-xl">
            Crea tu cuenta gratis y empieza a operar hoy mismo.
            Sin instalaciones, sin compromisos.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <a
              href={REGISTER_URL}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-8 py-4 text-base font-bold text-ink shadow-brand transition hover:bg-brand-400 sm:w-auto"
            >
              Crear mi cuenta gratis
              <svg className="h-4 w-4 transition group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <a
              href={LOGIN_URL}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line2 bg-ink2/40 px-8 py-4 text-base font-semibold text-white/80 backdrop-blur transition hover:bg-ink2 hover:text-white sm:w-auto"
            >
              Ya tengo cuenta
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-line bg-ink">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand font-display text-base font-black text-ink">
                M
              </div>
              <div>
                <div className="font-display text-base font-extrabold">MRTPVREST</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                  Sistema para restaurantes
                </div>
              </div>
            </div>

            <nav className="flex flex-wrap gap-x-6 gap-y-2">
              <a href="#features" className="font-mono text-xs uppercase tracking-widest text-white/40 transition hover:text-white">
                Producto
              </a>
              <a href="#como-funciona" className="font-mono text-xs uppercase tracking-widest text-white/40 transition hover:text-white">
                Cómo funciona
              </a>
              <a href={LOGIN_URL} className="font-mono text-xs uppercase tracking-widest text-white/40 transition hover:text-white">
                Iniciar sesión
              </a>
              <a href={REGISTER_URL} className="font-mono text-xs uppercase tracking-widest text-white/40 transition hover:text-white">
                Registro
              </a>
            </nav>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-line pt-8 md:flex-row md:items-center">
            <p className="font-mono text-xs uppercase tracking-widest text-white/30">
              © {new Date().getFullYear()} MRTPVREST · Hecho en LATAM
            </p>
            <p className="font-mono text-xs uppercase tracking-widest text-white/30">
              mrtpvrest.com
            </p>
          </div>
        </div>
      </footer>
    </main>
  )
}
