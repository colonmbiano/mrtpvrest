import Image from 'next/image'
import Link from 'next/link'

const adminUrl = 'https://admin.mrtpvrest.com'
const registerUrl = `${adminUrl}/register`
const loginUrl = `${adminUrl}/login`
const apkUrls = {
  tpv: `${adminUrl}/apks/tpv-debug.apk`,
  kiosk: `${adminUrl}/apks/kiosk-debug.apk`,
  kds: `${adminUrl}/apks/kds-debug.apk`,
  delivery: `${adminUrl}/apks/delivery-debug.apk`,
  meseros: `${adminUrl}/apks/meseros-lite-debug.apk`,
} as const
const apkUrl = apkUrls.tpv

const apps = [
  { src: '/showcase-warm/app-cliente.png', title: 'App Cliente', text: 'Pedidos QR y online sin perder control.', tone: 'sage', href: '#apps' },
  { src: '/showcase-warm/kiosko.png', title: 'Kiosko', text: 'Autoservicio rápido para horas pico.', tone: 'amber', href: apkUrls.kiosk },
  { src: '/showcase-warm/tpv.png', title: 'TPV', text: 'Cobro, mesas, tickets y caja en una pantalla.', tone: 'orange', href: apkUrls.tpv },
  { src: '/showcase-warm/kds.png', title: 'KDS', text: 'Cocina recibe ordenes al instante.', tone: 'ember', href: apkUrls.kds },
  { src: '/showcase-warm/delivery.png', title: 'Delivery', text: 'Reparto conectado con operación y caja.', tone: 'steel', href: apkUrls.delivery },
  { src: '/showcase-warm/admin.png', title: 'Admin', text: 'Reportes, inventario y permisos por rol.', tone: 'gold', href: loginUrl },
] as const

const apkDownloads = [
  ['TPV', apkUrls.tpv],
  ['Kiosko', apkUrls.kiosk],
  ['KDS', apkUrls.kds],
  ['Delivery', apkUrls.delivery],
  ['Meseros Lite', apkUrls.meseros],
] as const

const pains = [
  ['Cuentas dispersas', 'Ventas en cuaderno, Excel y memoria.', 'Dashboard vivo con ventas, caja y turnos al minuto.'],
  ['Pedidos perdidos', 'Meseros, cocina y delivery hablan por separado.', 'TPV, KDS y apps sincronizadas en tiempo real.'],
  ['Poco control', 'Empleados sin roles claros ni historial confiable.', 'Permisos, auditoria y operación multi-sucursal.'],
] as const

const steps = [
  ['01', 'Registra tu restaurante', 'Crea cuenta, define sucursal y activa módulos clave.'],
  ['02', 'Instala pantallas', 'TPV en tablet, KDS en cocina, admin en web y apps por rol.'],
  ['03', 'Cobra la primera orden', 'Pedidos, pagos, delivery y reportes fluyen desde el primer día.'],
] as const

const testimonials = [
  {
    name: 'María García',
    business: 'Tacos El Güero · CDMX',
    avatar: '/people/testimonial-maria.png',
    quote: 'Pasamos de cerrar caja a ciegas a ver ventas, pedidos y cocina desde el mismo lugar.',
  },
  {
    name: 'Carlos Mendoza',
    business: 'Pollos Don Carlos · Monterrey',
    avatar: '/people/testimonial-carlos.png',
    quote: 'El KDS nos bajó los errores en cocina y los turnos dejaron de depender de notas sueltas.',
  },
  {
    name: 'Valentina Ríos',
    business: 'Café Andino · Bogotá',
    avatar: '/people/testimonial-valentina.png',
    quote: 'Se siente hecho para restaurantes reales: rápido, claro y sin pantallas llenas de ruido.',
  },
] as const

const plans = [
  {
    name: 'Básico',
    price: '$29',
    local: '~$580 MXN / mes',
    text: 'Para locales que quieren ordenar caja, ventas y reportes.',
    features: ['1 sucursal', 'TPV + Admin', 'Reportes esenciales', 'Soporte por correo'],
    featured: false,
  },
  {
    name: 'Pro',
    price: '$59',
    local: '~$1,180 MXN / mes',
    text: 'Para restaurantes con cocina, roles y operación diaria activa.',
    features: ['Apps conectadas', 'KDS + Delivery', 'Roles y permisos', 'Onboarding asistido'],
    featured: true,
  },
  {
    name: 'Unlimited',
    price: '$99',
    local: '~$1,980 MXN / mes',
    text: 'Para grupos con múltiples pantallas, equipos y sucursales.',
    features: ['Sucursales ilimitadas', 'Automatizaciones', 'Soporte prioritario', 'Integraciones avanzadas'],
    featured: false,
  },
] as const

const faqs = [
  ['¿Necesito saber de tecnología?', 'No. MRTPVREST está pensado para operar con pantallas táctiles, flujos claros y acompañamiento en español.'],
  ['¿En cuánto tiempo puedo estar vendiendo?', 'La primera operación puede quedar lista el mismo día si ya tienes menú, usuarios y conexión a internet.'],
  ['¿Qué pasa si ya tengo un POS?', 'Puedes migrar por etapas: empezar por reportes, cocina o TPV sin apagar tu operación actual de golpe.'],
  ['¿El precio es en dólares?', 'Los planes se muestran en USD con equivalentes aproximados en MXN para que puedas comparar rápido.'],
  ['¿Qué pasa cuando termina el trial?', 'Decides si sigues con un plan. No necesitas tarjeta para probar y no hay bloqueo de datos al evaluar.'],
] as const

export default function HomePage() {
  return (
    <>
      <nav className="site-nav" id="inicio">
        <a className="brand" href="#inicio" aria-label="MRTPVREST inicio">
          <Image src="/brand/mrtpvrest-logo-current.png" alt="MRTPVREST" width={2400} height={810} priority unoptimized />
        </a>
        <div className="nav-links" aria-label="Navegación principal">
          <a href="#plataforma">Plataforma</a>
          <a href="#apps">Apps</a>
          <a href="#precios">Precios</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="nav-actions">
          <a className="nav-login" href={loginUrl}>Entrar</a>
          <a className="nav-cta" href={registerUrl}>Registrar</a>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Plataforma POS para restaurantes LATAM</div>
            <h1>
              <span className="hero-brand-word">MRTPVREST</span> controla tu restaurante en tiempo real
            </h1>
            <p>
              Conecta caja, cocina, delivery, kiosko, clientes y administración en una sola operación rápida,
              cálida y lista para turnos intensos.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={registerUrl}>Registrar mi restaurante</a>
              <Link className="btn btn-soft" href="/demo">Ver demo</Link>
              <a className="btn btn-line" href={apkUrl} download>Descargar TPV</a>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>14 días gratis</span>
              <span>Sin tarjeta</span>
              <span>Soporte en español</span>
              <span>Operación multi-app</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="logo-plate">
              <Image src="/brand/mrtpvrest-logo-current.png" alt="Logotipo MRTPVREST" width={2400} height={810} priority unoptimized />
            </div>
            <div className="hero-photo">
              <Image src="/people/hero-owner.png" alt="Dueño de restaurante usando MRTPVREST en una tablet" fill priority unoptimized sizes="(max-width: 900px) 100vw, 48vw" />
              <div className="live-badge"><span /> Sistema en operación real</div>
            </div>
          </div>
        </section>

        <section className="proof-strip" aria-label="Indicadores principales">
          <div><strong>6</strong><span>apps conectadas</span></div>
          <div><strong>0 lag</strong><span>flujo operativo</span></div>
          <div><strong>24/7</strong><span>lectura de negocio</span></div>
          <div><strong>LATAM</strong><span>diseño para restaurantes reales</span></div>
        </section>

        <section className="section" id="plataforma">
          <div className="section-head">
            <span className="section-kicker">Problema a solución</span>
            <h2>De operación improvisada a restaurante medible</h2>
            <p>MRTPVREST está diseñado para bajar fricción en piso, cocina y caja sin perder calidez humana.</p>
          </div>
          <div className="pain-grid">
            {pains.map(([title, bad, good]) => (
              <article className="pain-card" key={title}>
                <span className="pain-title">{title}</span>
                <p className="pain-bad">{bad}</p>
                <p className="pain-good">{good}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section apps-section" id="apps">
          <div className="section-head">
            <span className="section-kicker">Ecosistema completo</span>
            <h2>Una app para cada punto de la operación</h2>
            <p>Cada pantalla trabaja para un rol distinto, todas comparten la misma verdad del restaurante.</p>
          </div>
          <div className="apps-grid">
            {apps.map((app, index) => (
              <a className={`app-card ${app.tone}`} href={app.href} key={app.title}>
                <Image src={app.src} alt={`${app.title}: ${app.text}`} width={1536} height={672} loading="eager" unoptimized sizes="(max-width: 900px) 100vw, 50vw" />
                <span>
                  <strong>{app.title}</strong>
                  <small>{app.text}</small>
                </span>
              </a>
            ))}
          </div>
          <div className="apk-downloads" aria-label="Descargas Android">
            {apkDownloads.map(([label, href]) => (
              <a href={href} download key={label}>
                Descargar {label}
              </a>
            ))}
          </div>
        </section>

        <section className="section steps-section">
          <div className="section-head">
            <span className="section-kicker">Cómo funciona</span>
            <h2>Activa el sistema sin detener tu servicio</h2>
          </div>
          <div className="steps">
            {steps.map(([number, title, text]) => (
              <article className="step" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section operation-section">
          <div className="operation-grid">
            <div className="operation-copy">
              <span className="section-kicker">En el restaurante</span>
              <h2>Tecnología que se siente como parte del equipo</h2>
              <p>
                Pantallas claras, botones táctiles grandes y datos visibles para quien toma decisiones en caliente:
                caja, cocina, meseros, repartidores y dueños.
              </p>
              <a className="btn btn-primary" href={registerUrl}>Crear mi cuenta gratis</a>
            </div>
            <div className="photo-wall">
              <div className="photo-main">
                <Image src="/people/restaurant-team.png" alt="Equipo de restaurante coordinando operación con MRTPVREST" fill loading="eager" unoptimized sizes="(max-width: 900px) 100vw, 52vw" />
              </div>
              <div className="photo-small">
                <Image src="/people/kitchen-kds.png" alt="Cocina usando una pantalla KDS conectada" fill loading="eager" unoptimized sizes="(max-width: 900px) 50vw, 24vw" />
              </div>
              <div className="photo-small warm">
                <Image src="/people/hero-owner.png" alt="Dueño revisando ventas en una tablet" fill loading="eager" unoptimized sizes="(max-width: 900px) 50vw, 24vw" />
              </div>
            </div>
          </div>
        </section>

        <section className="section testimonials-section">
          <div className="section-head">
            <span className="section-kicker">Prueba social</span>
            <h2>Operadores que quieren claridad, no más ruido</h2>
          </div>
          <div className="testimonial-grid">
            {testimonials.map((item) => (
              <article className="testimonial" key={item.name}>
                <div className="stars">★★★★★</div>
                <p>“{item.quote}”</p>
                <div className="author">
                  <Image src={item.avatar} alt={item.name} width={56} height={56} loading="eager" unoptimized />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.business}</small>
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section pricing-section" id="precios">
          <div className="section-head">
            <span className="section-kicker">Precios públicos</span>
            <h2>Empieza sin tarjeta y escala cuando tu operación lo pida</h2>
            <p>Todos los planes incluyen 14 días gratis y soporte en español durante el arranque.</p>
          </div>
          <div className="plans">
            {plans.map((plan) => (
              <article className={`plan ${plan.featured ? 'featured' : ''}`} key={plan.name}>
                {plan.featured ? <span className="plan-badge">Más elegido</span> : null}
                <h3>{plan.name}</h3>
                <div className="price"><strong>{plan.price}</strong><span>/mes</span></div>
                <p className="local-price">{plan.local}</p>
                <p>{plan.text}</p>
                <a className={plan.featured ? 'btn btn-primary' : 'btn btn-soft'} href={registerUrl}>Probar {plan.name}</a>
                <ul>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="section faq-section" id="faq">
          <div className="section-head">
            <span className="section-kicker">FAQ</span>
            <h2>Preguntas antes de encender cocina</h2>
          </div>
          <div className="faq-list">
            {faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MRTPVREST</span>
          <h2>Tu restaurante merece tecnología de verdad</h2>
          <p>Registra tu negocio, conecta tus pantallas y toma decisiones con datos desde el primer turno.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={registerUrl}>Registrar mi restaurante</a>
            <a className="btn btn-line" href="mailto:contacto@mrtpvrest.com">Hablar con ventas</a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <span>© 2026 MRTPVREST</span>
        <div>
          <a href="#apps">Apps</a>
          <a href="#precios">Precios</a>
          <a href="mailto:contacto@mrtpvrest.com">Contacto</a>
          <a href={apkUrl} download>APK</a>
        </div>
      </footer>
    </>
  )
}
