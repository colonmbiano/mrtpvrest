import Image from 'next/image'
import Link from 'next/link'
import { APKS, FUNCIONES } from '../lib/links'
import { siteUrl, registerUrl, loginUrl } from './_data/site'
import { DownloadButton } from './_components/DownloadButton'
import { testimonials } from '../lib/testimonials'
import { Badge } from './_components/Badge'

const apps = [
  { src: '/showcase-warm/app-cliente.png', title: 'App Cliente', text: 'Pedidos QR y online sin perder control.', tone: 'sage', href: FUNCIONES.appCliente },
  { src: '/showcase-warm/kiosko.png', title: 'Kiosko', text: 'Autoservicio rápido para horas pico.', tone: 'amber', href: FUNCIONES.kiosko },
  { src: '/showcase-warm/tpv.png', title: 'TPV', text: 'Cobro, mesas, tickets y caja en una pantalla.', tone: 'orange', href: FUNCIONES.tpv, badge: 'Más usado' },
  { src: '/showcase-warm/kds.png', title: 'KDS', text: 'Cocina recibe órdenes al instante.', tone: 'ember', href: FUNCIONES.kds },
  { src: '/showcase-warm/delivery.png', title: 'Delivery', text: 'Reparto conectado con operación y caja.', tone: 'steel', href: FUNCIONES.delivery },
  { src: '/showcase-warm/admin.png', title: 'Admin', text: 'Reportes, inventario y permisos por rol.', tone: 'gold', href: FUNCIONES.admin },
] as const

const apkDownloads = [
  ['TPV', APKS.tpv],
  ['Kiosko', APKS.kiosko],
  ['KDS', APKS.kds],
  ['Delivery', APKS.delivery],
  ['Meseros Lite', APKS.meserosLite],
] as const

const pains = [
  ['Cuentas dispersas', 'Ventas en cuaderno, Excel y memoria.', 'Dashboard vivo con ventas, caja y turnos al minuto.'],
  ['Pedidos perdidos', 'Meseros, cocina y delivery hablan por separado.', 'TPV, KDS y apps sincronizadas en tiempo real.'],
  ['Poco control', 'Empleados sin roles claros ni historial confiable.', 'Permisos, auditoría y operación multi-sucursal.'],
] as const

const steps = [
  ['01', 'Registra tu restaurante', 'Crea cuenta, define sucursal y activa módulos clave.'],
  ['02', 'Instala pantallas', 'TPV en tablet, KDS en cocina, admin en web y apps por rol.'],
  ['03', 'Cobra la primera orden', 'Pedidos, pagos, delivery y reportes fluyen desde el primer día.'],
] as const

// Solo cuentan para el rating los testimonios reales (con permiso).
const realTestimonials = testimonials.filter((item) => item.real)

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

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'MRTPVREST',
      url: siteUrl,
      logo: `${siteUrl}/brand/mrtpvrest-logo-current.png`,
      email: 'contacto@mrtpvrest.com',
      description:
        'Software de punto de venta para restaurantes que conecta caja, cocina, delivery, kiosko y administración en tiempo real.',
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'MRTPVREST',
      inLanguage: 'es-MX',
      publisher: { '@id': `${siteUrl}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#software`,
      name: 'MRTPVREST',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, Android',
      inLanguage: 'es-MX',
      url: siteUrl,
      description:
        'Punto de venta para restaurantes con TPV, KDS de cocina, delivery, kiosko de autoservicio, app de cliente y administración en tiempo real.',
      publisher: { '@id': `${siteUrl}/#organization` },
      offers: plans.map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        price: plan.price.replace('$', ''),
        priceCurrency: 'USD',
        url: `${siteUrl}/#precios`,
      })),
      ...(realTestimonials.length > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '5',
              reviewCount: realTestimonials.length,
            },
          }
        : {}),
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteUrl}/#faq`,
      mainEntity: faqs.map(([question, answer]) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      })),
    },
  ],
}

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <nav className="site-nav" id="inicio">
        <a className="brand" href="#inicio" aria-label="MRTPVREST inicio">
          <Image src="/brand/mrtpvrest-logo-current.png" alt="MRTPVREST" width={2400} height={810} priority />
        </a>
        <div className="nav-links" aria-label="Navegación principal">
          <Link href="/funciones">Funciones</Link>
          <Link href="/punto-de-venta">Giros</Link>
          <Link href="/blog">Blog</Link>
          <a href="#precios">Precios</a>
          <Link href="/comparativa/parrot">Comparativas</Link>
        </div>
        <div className="nav-actions">
          <a className="nav-login" href={loginUrl}>Entrar</a>
          <a className="nav-cta" href={registerUrl}>Registrar</a>
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Punto de venta para restaurantes LATAM</div>
            <h1>
              <span className="hero-brand-word">MRTPVREST</span> es el punto de venta que controla tu restaurante en tiempo real
            </h1>
            <p>
              Caja, cocina, delivery, kiosko y administración en una sola plataforma. Cobra en segundos,
              controla tu inventario en vivo y cierra el día cuadrado — sin apps sueltas ni cuentas a mano.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={registerUrl}>Registrar mi restaurante</a>
              <Link className="btn btn-soft" href="/demo">Ver demo</Link>
              <DownloadButton apkUrl={APKS.tpv} label="Descargar TPV" requestLabel="Solicitar acceso" className="btn btn-line" />
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>14 días gratis</span>
              <span>Sin tarjeta</span>
              <span>Autofactura por QR</span>
              <span>Soporte en español</span>
              <span>Operación multi-app</span>
            </div>
            {realTestimonials.length > 0 ? (
              <div className="hero-proof">
                <span className="hero-proof-avatar" aria-hidden="true">
                  {realTestimonials[0].name.charAt(0)}
                </span>
                <div className="hero-proof-text">
                  <div className="hero-proof-stars" aria-label="Calificación 5 de 5 estrellas">★★★★★</div>
                  <span>
                    Operando en vivo con restaurantes reales como <strong>{realTestimonials[0].name}</strong>
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="hero-visual">
            <div className="logo-plate">
              <Image src="/brand/mrtpvrest-logo-current.png" alt="Logotipo MRTPVREST" width={2400} height={810} priority />
            </div>
            <div className="hero-photo">
              <Image src="/people/hero-owner.png" alt="Dueño de restaurante usando MRTPVREST en una tablet" fill priority sizes="(max-width: 900px) 100vw, 48vw" />
              <div className="live-badge"><span /> Sistema en operación real</div>
            </div>
          </div>
        </section>

        <section className="proof-strip" aria-label="Indicadores principales">
          <div><strong>6</strong><span>apps conectadas</span></div>
          <div><strong>Sin esperas</strong><span>flujo operativo</span></div>
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
            {apps.map((app) => (
              <Link className={`app-card ${app.tone}`} href={app.href} key={app.title}>
                {'badge' in app ? <b className="app-flag">{app.badge}</b> : null}
                <Image src={app.src} alt={`${app.title}: ${app.text}`} width={1536} height={672} loading="lazy" sizes="(max-width: 900px) 100vw, 50vw" />
                <span>
                  <strong>{app.title}</strong>
                  <small>{app.text}</small>
                </span>
              </Link>
            ))}
          </div>
          <div className="apk-downloads" aria-label="Descargas Android">
            {apkDownloads.map(([label, href]) => (
              <DownloadButton apkUrl={href} label={`Descargar ${label}`} requestLabel={`Solicitar ${label}`} key={label} />
            ))}
          </div>
          <div className="apk-downloads" aria-label="Explora las funciones">
            <Link href="/funciones/punto-de-venta">Punto de venta</Link>
            <Link href="/funciones/asistente-de-voz">Asistente de voz</Link>
            <Link href="/funciones/kds-cocina">KDS de cocina</Link>
            <Link href="/funciones/delivery">Delivery</Link>
            <Link href="/funciones/kiosko">Kiosko</Link>
            <Link href="/funciones/app-cliente">App de cliente</Link>
            <Link href="/funciones/administracion">Administración</Link>
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
                <Image src="/people/restaurant-team.png" alt="Equipo de restaurante coordinando operación con MRTPVREST" fill loading="lazy" sizes="(max-width: 900px) 100vw, 52vw" />
              </div>
              <div className="photo-small">
                <Image src="/people/kitchen-kds.png" alt="Cocina usando una pantalla KDS conectada" fill loading="lazy" sizes="(max-width: 900px) 50vw, 24vw" />
              </div>
              <div className="photo-small warm">
                <Image src="/people/hero-owner.png" alt="Dueño revisando ventas en una tablet" fill loading="lazy" sizes="(max-width: 900px) 50vw, 24vw" />
              </div>
            </div>
          </div>
        </section>

        {testimonials.length > 0 ? (
          <section className="section testimonials-section">
            <div className="section-head">
              <span className="section-kicker">Prueba social</span>
              <h2>Operadores que quieren claridad, no más ruido</h2>
            </div>
            <div className={`testimonial-grid${testimonials.length === 1 ? ' single' : ''}`}>
              {testimonials.map((item) => (
                <article className="testimonial" key={item.name}>
                  <div className="stars">★★★★★</div>
                  {!item.real ? <Badge>Ejemplo ilustrativo</Badge> : null}
                  <p>“{item.quote}”</p>
                  <div className="author">
                    {item.avatar ? (
                      <Image src={item.avatar} alt={item.name} width={56} height={56} loading="lazy" />
                    ) : (
                      <span className="avatar-fallback" aria-hidden="true">{item.name.charAt(0)}</span>
                    )}
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.business} · {item.city}</small>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

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
          <Link href="/funciones">Funciones</Link>
          <Link href="/punto-de-venta">Giros</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/comparativa/parrot">Comparativas</Link>
          <a href="#precios">Precios</a>
          <a href="mailto:contacto@mrtpvrest.com">Contacto</a>
          <DownloadButton apkUrl={APKS.tpv} label="APK" requestLabel="Solicitar acceso" />
        </div>
      </footer>
    </>
  )
}
