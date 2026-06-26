import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment, type CSSProperties } from 'react'
import { siteUrl, modaUrl } from '../_data/site'
import { SiteNav, SiteFooter } from '../_components/SiteChrome'

const metaTitle = 'Punto de Venta para Tienda de Ropa | MODA+'
const metaDescription =
  'Punto de venta para tienda de ropa y boutique: inventario por talla y color, etiquetas de código de barras y corte de caja. 15 días gratis, sin tarjeta.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: { canonical: '/moda' },
  openGraph: {
    title: metaTitle,
    description: metaDescription,
    url: `${siteUrl}/moda`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: metaTitle,
    description: metaDescription,
  },
}

const highlights: { title: string; text: string }[] = [
  {
    title: 'Inventario por talla y color',
    text: 'Cada prenda con su matriz real de tallas y colores, no una lista plana. Sabes al instante qué te queda de cada variante.',
  },
  {
    title: 'Etiquetas con código de barras',
    text: 'Imprime etiquetas y cobra escaneando. Sin teclear precios ni equivocarte de modelo en la caja.',
  },
  {
    title: 'Corte de caja que cuadra',
    text: 'Abre turno, registra entradas, salidas y gastos, y cierra con esperado vs. contado. Adiós a cuadrar a ojo.',
  },
  {
    title: 'En tu compu o celular, sin depender del internet',
    text: 'Instálalo en Windows o Android, o úsalo en la web. Sigue vendiendo aunque se caiga la conexión.',
  },
]

const pains: [string, string, string][] = [
  [
    'Inventario en cuaderno o Excel',
    'No sabes qué tallas y colores te quedan hasta que revisas a mano.',
    'Matriz de talla y color en vivo, con aviso de stock bajo.',
  ],
  [
    'Un POS genérico que no entiende la ropa',
    'Las apps de restaurante o gratuitas no manejan variantes ni etiquetas.',
    'Hecho para ropa: variantes, etiquetas y código de barras de serie.',
  ],
  [
    'Caja descuadrada al cierre',
    'Mucho efectivo y cero claridad de cuánto debería haber.',
    'Corte por turno con esperado, contado y diferencia.',
  ],
]

const faqs: [string, string][] = [
  [
    '¿Maneja tallas y colores?',
    'Sí. Cada producto tiene su matriz de tallas y colores (un SKU por variante), con su stock, precio y etiqueta propios. Es la diferencia central frente a un punto de venta genérico.',
  ],
  [
    '¿Funciona sin internet?',
    'Sí. MODA+ se instala en Windows y Android y sigue cobrando aunque se caiga la conexión; sincroniza cuando vuelve.',
  ],
  [
    '¿Imprime etiquetas con código de barras?',
    'Sí: etiquetas con código de barras (CODE128) e impresión de tickets en impresora térmica por red.',
  ],
  [
    '¿En qué equipos corre?',
    'En PC con Windows (instalador .exe), en tablet o celular Android, y en la web. La misma cuenta funciona en todos.',
  ],
  [
    '¿Cuánto cuesta? ¿Necesito tarjeta?',
    'Puedes probarlo 15 días gratis, sin tarjeta. Creas tu tienda desde la app en minutos.',
  ],
]

// Mini-mockup de la matriz talla×color para el hero (no requiere imagen).
const SIZES = ['XS', 'S', 'M', 'L', 'XL']
const MATRIX: [string, number[]][] = [
  ['Beige', [6, 12, 24, 18, 8]],
  ['Blanco', [4, 8, 16, 12, 6]],
  ['Negro', [2, 4, 0, 6, 3]],
]
function cellStyle(n: number): CSSProperties {
  const base: CSSProperties = { textAlign: 'center', padding: '6px 0', borderRadius: 8, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }
  if (n === 0) return { ...base, background: '#fef2f2', color: '#dc2626' }
  if (n < 5) return { ...base, background: '#fffbeb', color: '#b45309' }
  return { ...base, background: '#f0fdf4', color: '#15803d' }
}

export default function ModaLandingPage() {
  const url = `${siteUrl}/moda`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'MODA+ · Punto de venta para ropa', item: url },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        name: 'MODA+',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Windows, Android, Web',
        description: metaDescription,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'MXN', description: '15 días de prueba gratis, sin tarjeta' },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> MODA+ · Punto de venta para ropa</div>
            <h1>El punto de venta hecho para tu tienda de ropa</h1>
            <p>
              Controla tallas y colores, imprime etiquetas con código de barras y cuadra tu caja — en tu
              computadora o celular, aunque se caiga el internet. MODA+ es el POS pensado para boutiques y
              tiendas de moda en México.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={modaUrl}>Probar 15 días gratis</a>
              <Link className="btn btn-soft" href="#funciona">Ver cómo funciona</Link>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>15 días gratis</span>
              <span>Sin tarjeta</span>
              <span>Windows, Android y web</span>
            </div>
          </div>
          <div className="hero-visual">
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 20,
                padding: 22,
                boxShadow: '0 24px 60px -28px rgba(15,23,42,.35)',
                maxWidth: 460,
                width: '100%',
              }}
            >
              <div style={{ fontWeight: 700, color: '#0f172a' }}>Camisa Lino Oversize</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16, fontVariantNumeric: 'tabular-nums' }}>
                SKU-CAM-LIN-001 · $899
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '76px repeat(5,1fr)', gap: 6, fontSize: 13 }}>
                <span />
                {SIZES.map((s) => (
                  <span key={s} style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{s}</span>
                ))}
                {MATRIX.map(([color, row]) => (
                  <Fragment key={color}>
                    <span style={{ display: 'flex', alignItems: 'center', color: '#0f172a', fontWeight: 600 }}>{color}</span>
                    {row.map((n, i) => (
                      <span key={i} style={cellStyle(n)}>{n}</span>
                    ))}
                  </Fragment>
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748b' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: '#22c55e', display: 'inline-block' }} />
                Inventario por talla y color, en vivo
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="funciona">
          <div className="section-head">
            <span className="section-kicker">Hecho para ropa</span>
            <h2>Lo que tu tienda de ropa necesita</h2>
          </div>
          <div className="steps">
            {highlights.map((item) => (
              <article className="step" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Problema a solución</span>
            <h2>De la libreta al control real</h2>
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

        <section className="section faq-section" id="faq">
          <div className="section-head">
            <span className="section-kicker">FAQ</span>
            <h2>Preguntas frecuentes</h2>
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

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Explora MODA+</span>
            <h2>Más sobre el punto de venta para ropa</h2>
          </div>
          <div className="pain-grid">
            <Link className="post-card" href="/moda/giros">
              <span>Giros</span>
              <h2>Punto de venta por giro de ropa</h2>
              <p>Boutique, zapatería, lencería, uniformes, mercería y más, cada giro con su matriz de variantes.</p>
            </Link>
            <Link className="post-card" href="/moda/comparativa">
              <span>Comparativas</span>
              <h2>MODA+ vs. otros puntos de venta</h2>
              <p>Cómo se compara con SICAR, Loyverse, INTAC, Kyte y Vendty para una tienda de ropa.</p>
            </Link>
            <Link className="post-card" href="/moda/guias">
              <span>Guías</span>
              <h2>Guías para tu tienda de ropa</h2>
              <p>Costos, inventario por talla y color, corte de caja y etiquetas con código de barras.</p>
            </Link>
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MODA+</span>
          <h2>Empieza hoy con tu tienda de ropa</h2>
          <p>Crea tu cuenta en minutos, carga tus productos por talla y color y vende desde el primer día.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 15 días gratis</a>
            <Link className="btn btn-line" href="#faq">Ver preguntas frecuentes</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
