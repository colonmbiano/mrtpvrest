import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { APKS, FUNCIONES, WHATSAPP_SALES_DEMO } from '../lib/links'
import { siteUrl, registerUrl, loginUrl, contactEmail } from './_data/site'
import { testimonials } from '../lib/testimonials'
import styles from './page.module.css'

// ---------------------------------------------------------------------------
// Iconos inline (sin dependencias — la landing no trae lucide). Estilo Lucide.
// ---------------------------------------------------------------------------
type IconName =
  | 'monitor' | 'chefHat' | 'tablet' | 'bike' | 'smartphone' | 'barChart'
  | 'zap' | 'cloud' | 'headphones' | 'shield'
  | 'calendar' | 'play' | 'arrowRight' | 'check'

const ICON_PATHS: Record<IconName, ReactNode> = {
  monitor: (<><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></>),
  chefHat: (<><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" /><line x1="6" x2="18" y1="17" y2="17" /></>),
  tablet: (<><rect width="16" height="20" x="4" y="2" rx="2" ry="2" /><line x1="12" x2="12.01" y1="18" y2="18" /></>),
  bike: (<><circle cx="18.5" cy="17.5" r="3.5" /><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="15" cy="5" r="1" /><path d="M12 17.5V14l-3-3 4-3 2 3h2" /></>),
  smartphone: (<><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></>),
  barChart: (<><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>),
  zap: (<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />),
  cloud: (<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />),
  headphones: (<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />),
  shield: (<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" /><path d="m9 12 2 2 4-4" /></>),
  calendar: (<><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></>),
  play: (<><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></>),
  arrowRight: (<path d="M5 12h14M12 5l7 7-7 7" />),
  check: (<path d="M20 6 9 17l-5-5" />),
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------
const modules: { icon: IconName; name: string; text: string; href: string }[] = [
  { icon: 'monitor', name: 'TPV', text: 'Vende más rápido y cobra de forma segura. Mesas, cuentas, comandas y caja en una sola pantalla.', href: FUNCIONES.tpv },
  { icon: 'chefHat', name: 'KDS Cocina', text: 'Órdenes claras y en tiempo real para una cocina más eficiente y sin tickets perdidos.', href: FUNCIONES.kds },
  { icon: 'tablet', name: 'Kiosko', text: 'Autoservicio que aumenta el ticket promedio y mejora la experiencia en horas pico.', href: FUNCIONES.kiosko },
  { icon: 'bike', name: 'Delivery', text: 'Gestiona pedidos a domicilio y repartidores conectados con la operación y la caja.', href: FUNCIONES.delivery },
  { icon: 'smartphone', name: 'App Cliente', text: 'Pedidos por QR y en línea, con tu marca al frente y sin comisiones de terceros.', href: FUNCIONES.appCliente },
  { icon: 'barChart', name: 'Administración', text: 'Reportes inteligentes, inventario, usuarios y sucursales bajo control desde la nube.', href: FUNCIONES.admin },
]

const trust: { icon: IconName; label: string }[] = [
  { icon: 'zap', label: 'Implementación rápida' },
  { icon: 'cloud', label: 'Acceso en la nube' },
  { icon: 'headphones', label: 'Soporte en español' },
  { icon: 'shield', label: 'Sin contratos forzosos' },
]

// Números REALES de producción (Master Burguer's, 30 días, corte 2026-07-03).
// Detalle y fuente en /casos/master-burguers — mantener ambos en sincronía.
const stats: { num: string; label: string }[] = [
  { num: '+1,000', label: 'pedidos al mes procesa un solo restaurante con MRTPVREST' },
  { num: '3', label: 'canales de venta en una caja: mostrador, WhatsApp y tienda en línea' },
  { num: '6', label: 'apps conectadas en un solo ecosistema' },
  { num: '14 días', label: 'gratis para probar, sin tarjeta' },
]

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
  ['¿Tengo que contratar todos los módulos desde el inicio?', 'No. Puedes empezar solo con el TPV para ordenar caja y ventas, y activar cocina (KDS), reparto propio, WhatsApp o tienda en línea cuando tu operación los pida. Todo se conecta a la misma caja.'],
  ['¿El precio es en dólares?', 'Los planes se muestran en USD con equivalentes aproximados en MXN para que puedas comparar rápido.'],
  ['¿Qué pasa cuando termina el trial?', 'Decides si sigues con un plan. No necesitas tarjeta para probar y no hay bloqueo de datos al evaluar.'],
] as const

const realTestimonials = testimonials.filter((item) => item.real)
const featuredTestimonial = testimonials[0]

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'MRTPVREST',
      url: siteUrl,
      logo: `${siteUrl}/brand/mrtpvrest-logo-current.png`,
      email: contactEmail,
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
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    },
  ],
}

export default function HomePage() {
  return (
    <div className={styles.page} id="inicio">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* NAV */}
      <nav className={styles.nav}>
        <a className={styles.navBrand} href="#inicio" aria-label="MRTPVREST inicio">
          <Image src="/brand/mrtpvrest-logo-current.png" alt="MRTPVREST" width={2400} height={810} priority />
        </a>
        <div className={styles.navLinks} aria-label="Navegación principal">
          <a href="#modulos">Módulos</a>
          <Link href="/funciones">Funciones</Link>
          <a href="#precios">Precios</a>
          <Link href="/comparativa/parrot">Comparativas</Link>
          <Link href="/blog">Recursos</Link>
        </div>
        <div className={styles.navActions}>
          <a className={styles.navLogin} href={loginUrl}>Iniciar sesión</a>
          <a className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} href={registerUrl}>Solicitar demo</a>
        </div>
      </nav>

      {/* HERO */}
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.badge}>
              <span className={styles.badgeDot} /> Todo tu restaurante, conectado y bajo control
            </span>
            <h1 className={styles.heroTitle}>
              Software punto de venta para <span className={styles.accent}>restaurantes</span>
            </h1>
            <p className={styles.heroSub}>
              Gestiona pedidos, cocina, kiosko, delivery y administración desde una sola plataforma.
              Más control, más ventas, mejor experiencia.
            </p>
            <div className={styles.heroCtas}>
              <a className={`${styles.btn} ${styles.btnPrimary}`} href={registerUrl}><Icon name="calendar" /> Solicitar demo</a>
              <a className={`${styles.btn} ${styles.btnGhostDark}`} href="#modulos"><Icon name="play" /> Ver módulos</a>
            </div>
            <div className={styles.trust}>
              {trust.map((item) => (
                <span className={styles.trustItem} key={item.label}>
                  <Icon name={item.icon} /> {item.label}
                </span>
              ))}
            </div>
          </div>

          {/* Collage de producto — construido en código */}
          <div className={styles.heroArt}>
            <div className={styles.heroGlow} aria-hidden="true" />
            <div className={styles.screen}>
              <div className={styles.screenBar} aria-hidden="true">
                <span className={styles.screenDot} /><span className={styles.screenDot} /><span className={styles.screenDot} />
              </div>
              <div className={styles.screenShot}>
                <Image src="/showcase-warm/tpv.png" alt="Pantalla del TPV MRTPVREST cobrando una mesa" fill sizes="(max-width: 980px) 90vw, 520px" priority />
              </div>
            </div>

            <div className={styles.receipt} aria-hidden="true">
              <div className={styles.receiptBrand}>MRTPVREST</div>
              <div className={styles.receiptMeta}>Pedido #1023 · Mesa 12</div>
              <div className={styles.receiptRow}><span>2× Hamburguesa</span><span>$236</span></div>
              <div className={styles.receiptRow}><span>1× Papas</span><span>$69</span></div>
              <div className={styles.receiptRow}><span>1× Limonada</span><span>$45</span></div>
              <div className={styles.receiptRule} />
              <div className={styles.receiptTotal}><span>TOTAL</span><span>$408.32</span></div>
              <div className={styles.receiptBars} />
            </div>

            <div className={styles.phone} aria-hidden="true">
              <div className={styles.phoneNotch} />
              <div className={styles.phoneScreen}>
                <div className={styles.phoneLabel}>Pedido en camino</div>
                <div className={styles.phoneOrder}>#1023</div>
                <div className={styles.phoneMap}>
                  <svg viewBox="0 0 168 74" preserveAspectRatio="none">
                    <path d="M10 62 Q60 52 78 34 T154 12" fill="none" stroke="#f97316" strokeWidth="3" strokeDasharray="5 5" strokeLinecap="round" />
                    <circle cx="10" cy="62" r="4" fill="#ffffff" />
                    <circle cx="154" cy="12" r="5" fill="#f97316" />
                  </svg>
                </div>
                <div className={styles.phoneEta}>Entrega estimada <b>25–30 min</b></div>
                <div className={styles.phoneDriver}>
                  <span className={styles.phoneAvatar}>C</span>
                  <div>
                    <div className={styles.phoneDriverName}>Carlos M.</div>
                    <div className={styles.phoneRating}>★ 4.9 · Repartidor</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MÓDULOS */}
      <section className={styles.modules} id="modulos">
        <div className={styles.modulesInner}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Módulos</span>
            <h2 className={styles.sectionTitle}>Una plataforma, todos los módulos de tu restaurante</h2>
            <p className={styles.sectionLede}>
              Cada pantalla trabaja para un rol distinto y todas comparten la misma información en tiempo real.
            </p>
          </div>
          <div className={styles.moduleGrid}>
            {modules.map((mod) => (
              <Link className={styles.moduleCard} href={mod.href} key={mod.name}>
                <span className={styles.moduleIcon}><Icon name={mod.icon} /></span>
                <span className={styles.moduleName}>{mod.name}</span>
                <span className={styles.moduleText}>{mod.text}</span>
                <span className={styles.moduleLink}>Ver módulo <Icon name="arrowRight" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PRUEBA SOCIAL */}
      <section className={styles.proof} aria-label="Prueba social e indicadores">
        <div className={styles.proofInner}>
          <div className={styles.stats}>
            {stats.map((item) => (
              <div className={styles.stat} key={item.label}>
                <div className={styles.statNum}>{item.num}</div>
                <div className={styles.statLabel}>{item.label}</div>
              </div>
            ))}
          </div>
          {featuredTestimonial ? (
            <figure className={styles.quoteCard}>
              {!featuredTestimonial.real ? <span className={styles.exampleTag}>Ejemplo ilustrativo</span> : null}
              <div className={styles.quoteStars} aria-label="Calificación 5 de 5 estrellas">★★★★★</div>
              <blockquote className={styles.quoteText}>“{featuredTestimonial.quote}”</blockquote>
              <figcaption className={styles.quoteAuthor}>
                <span className={styles.quoteAvatar} aria-hidden="true">{featuredTestimonial.name.charAt(0)}</span>
                <span>
                  <span className={styles.quoteName}>{featuredTestimonial.name}</span>
                  <span className={styles.quoteMeta}>{featuredTestimonial.business} · {featuredTestimonial.city}</span>
                </span>
              </figcaption>
              {featuredTestimonial.real ? (
                <Link className={styles.quoteLink} href="/casos/master-burguers">
                  Lee el caso completo con números reales <Icon name="arrowRight" />
                </Link>
              ) : null}
            </figure>
          ) : null}
        </div>
      </section>

      {/* PRECIOS */}
      <section className={styles.pricing} id="precios">
        <div className={styles.pricingInner}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>Precios</span>
            <h2 className={styles.sectionTitle}>Empieza sin tarjeta y escala cuando lo pidas</h2>
            <p className={styles.sectionLede}>
              Empieza solo con el TPV y activa módulos — cocina, reparto, WhatsApp, tienda en línea —
              conforme tu operación los pida. Todos los planes incluyen 14 días gratis y soporte en
              español durante el arranque.
            </p>
          </div>
          <div className={styles.plans}>
            {plans.map((plan) => (
              <article className={`${styles.plan} ${plan.featured ? styles.planFeatured : ''}`} key={plan.name}>
                {plan.featured ? <span className={styles.planTag}>Más elegido</span> : null}
                <div className={styles.planName}>{plan.name}</div>
                <div className={styles.planPrice}><b>{plan.price}</b><span>/mes</span></div>
                <div className={styles.planLocal}>{plan.local}</div>
                <p className={styles.planText}>{plan.text}</p>
                <a className={`${styles.btn} ${plan.featured ? styles.btnPrimary : styles.btnGhostLight}`} href={registerUrl}>
                  Probar {plan.name}
                </a>
                <ul className={styles.planFeatures}>
                  {plan.features.map((feature) => (
                    <li key={feature}><Icon name="check" /> {feature}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faq} id="faq">
        <div className={styles.faqInner}>
          <div className={styles.sectionHead}>
            <span className={styles.kicker}>FAQ</span>
            <h2 className={styles.sectionTitle}>Preguntas antes de encender cocina</h2>
          </div>
          {faqs.map(([question, answer], index) => (
            <details className={styles.faqItem} key={question} open={index === 0}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className={styles.finalCta}>
        <h2 className={styles.finalTitle}>Tu restaurante merece tecnología de verdad</h2>
        <p className={styles.finalSub}>
          Registra tu negocio, conecta tus pantallas y toma decisiones con datos desde el primer turno.
        </p>
        <div className={styles.finalCtas}>
          <a className={`${styles.btn} ${styles.btnPrimary}`} href={registerUrl}><Icon name="calendar" /> Solicitar demo</a>
          <a className={`${styles.btn} ${styles.btnGhostDark}`} href={WHATSAPP_SALES_DEMO} target="_blank" rel="noopener">Hablar con ventas por WhatsApp</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Image src="/brand/mrtpvrest-logo-current.png" alt="MRTPVREST" width={2400} height={810} />
            <p className={styles.footerTag}>
              Tu restaurante, siempre conectado. Punto de venta para restaurantes en México y LATAM.
            </p>
          </div>
          <div className={styles.footerCols}>
            <div className={styles.footerCol}>
              <h4>Producto</h4>
              <Link href="/funciones/punto-de-venta">TPV</Link>
              <Link href="/funciones/kds-cocina">KDS Cocina</Link>
              <Link href="/funciones/kiosko">Kiosko</Link>
              <Link href="/funciones/delivery">Delivery</Link>
              <Link href="/funciones/administracion">Administración</Link>
            </div>
            <div className={styles.footerCol}>
              <h4>Recursos</h4>
              <Link href="/casos/master-burguers">Caso Master Burguer&apos;s</Link>
              <Link href="/funciones">Funciones</Link>
              <Link href="/punto-de-venta">Giros</Link>
              <Link href="/moda">Tienda de ropa</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/comparativa/parrot">Comparativas</Link>
            </div>
            <div className={styles.footerCol}>
              <h4>Apps</h4>
              <a href={APKS.tpv}>Descargar TPV</a>
              <a href={APKS.kiosko}>Descargar Kiosko</a>
              <a href={APKS.kds}>Descargar KDS</a>
              <a href={APKS.delivery}>Descargar Delivery</a>
            </div>
            <div className={styles.footerCol}>
              <h4>Empresa</h4>
              <a href={loginUrl}>Iniciar sesión</a>
              <a href={registerUrl}>Solicitar demo</a>
              <a href={`mailto:${contactEmail}`}>Contacto</a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>© 2026 MRTPVREST · Punto de venta para restaurantes</div>
      </footer>
    </div>
  )
}
