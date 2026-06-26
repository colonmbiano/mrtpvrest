import type { Metadata } from 'next'
import Link from 'next/link'
import { siteUrl, modaUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

const slug = 'como-hacer-corte-de-caja-en-tu-tienda-de-ropa'
const title = 'Cómo hacer el corte de caja en tu tienda de ropa'
const metaTitle = 'Cómo Hacer el Corte de Caja en tu Tienda de Ropa | MODA+'
const metaDescription =
  'Cómo hacer el corte de caja en una tienda de ropa: abre turno con fondo, registra entradas y salidas, y cierra comparando el efectivo esperado vs. el contado.'
const datePublished = '2026-06-25'
const readingMinutes = 5
const url = `${siteUrl}/moda/${slug}`

const faqs: [string, string][] = [
  [
    '¿Qué es el corte de caja?',
    'Es el cierre del turno: comparas el efectivo que debería haber (fondo + ventas en efectivo + entradas − salidas) contra el que de verdad cuentas, y la diferencia te dice si cuadró o no.',
  ],
  [
    '¿Cada cuándo debo hacer el corte?',
    'Lo más sano es un corte por turno (por cajero o por jornada). Así, si algo no cuadra, sabes en qué turno pasó y con quién, en vez de descubrirlo días después.',
  ],
  [
    '¿Qué es un corte ciego?',
    'Es cuando el cajero cuenta el efectivo sin ver primero cuánto se espera. Evita que &quot;ajuste&quot; el conteo al número esperado y te da una diferencia más honesta.',
  ],
]

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BlogPosting',
      headline: title,
      description: metaDescription,
      datePublished,
      dateModified: datePublished,
      inLanguage: 'es-MX',
      mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'MODA+', url: `${siteUrl}/moda` },
      publisher: {
        '@type': 'Organization',
        name: 'MRTPVREST',
        logo: { '@type': 'ImageObject', url: `${siteUrl}/brand/mrtpvrest-logo.png` },
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'MODA+ · Punto de venta para ropa', item: `${siteUrl}/moda` },
        { '@type': 'ListItem', position: 3, name: title, item: url },
      ],
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

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: { canonical: `/moda/${slug}` },
  openGraph: {
    title: metaTitle,
    description: metaDescription,
    url,
    type: 'article',
    publishedTime: datePublished,
  },
}

export default function ModaCashCloseGuidePage() {
  const dateLabel = new Date(datePublished).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="section">
          <div className="post-header">
            <span className="section-kicker">Guía · MODA+</span>
            <h1>{title}</h1>
            <div className="post-meta">
              <span>{dateLabel}</span>
              <span>{readingMinutes} min de lectura</span>
            </div>
          </div>
        </section>

        <article className="section prose">
          <p>
            En una tienda de ropa entra y sale mucho efectivo, y al final del día la pregunta es siempre la misma:
            ¿cuadró la caja? El corte de caja es lo que convierte esa pregunta en un número claro, en vez de un &quot;creo
            que sí&quot;.
          </p>
          <p>
            Esta guía te explica, paso a paso, cómo hacer el corte de caja en tu tienda de ropa para que el cierre cuadre
            y, si no cuadra, sepas exactamente dónde buscar.
          </p>

          <section>
            <h2>Qué es el corte de caja y por qué importa</h2>
            <p>
              El corte de caja es el cierre del turno: comparas cuánto efectivo debería haber con cuánto hay de verdad.
              Si los dos números coinciden, cuadró. Si no, tienes una diferencia que investigar. Hacerlo por turno te
              permite detectar faltantes a tiempo y saber en qué jornada y con qué cajero ocurrió.
            </p>
          </section>

          <section>
            <h2>Antes de abrir: el fondo de caja</h2>
            <p>
              Empieza el turno con un fondo conocido (el cambio con el que abres). Anótalo: es el punto de partida del
              corte. Sin un fondo registrado, al cierre nunca vas a saber si la diferencia es por ventas o porque no
              sabías con cuánto abriste.
            </p>
          </section>

          <section>
            <h2>Durante el turno: registra todo movimiento</h2>
            <p>El efectivo no solo entra por ventas. Para que el corte cuadre, registra también:</p>
            <ul>
              <li><strong>Entradas</strong> distintas a ventas (por ejemplo, un ingreso de cambio).</li>
              <li><strong>Salidas y gastos</strong> pagados de la caja (un mandado, propinas, un proveedor).</li>
              <li><strong>El método de pago</strong> de cada venta: el efectivo cuenta para el corte; tarjeta y transferencia se concilian aparte.</li>
            </ul>
            <p>
              Un punto de venta como MODA+ registra estos movimientos por ti, así el efectivo esperado se calcula solo en
              lugar de sumar tickets a mano.
            </p>
          </section>

          <section>
            <h2>Al cerrar: esperado vs. contado</h2>
            <p>El cálculo del cierre es simple:</p>
            <ul>
              <li><strong>Efectivo esperado</strong> = fondo + ventas en efectivo + entradas − salidas.</li>
              <li><strong>Efectivo contado</strong> = lo que de verdad cuentas en el cajón.</li>
              <li><strong>Diferencia</strong> = contado − esperado (sobrante si es positivo, faltante si es negativo).</li>
            </ul>
            <p>Cuenta el efectivo por denominación para no equivocarte y deja registrado el resultado del turno.</p>
          </section>

          <section>
            <h2>Corte ciego: para no &quot;cuadrar&quot; a ojo</h2>
            <p>
              Si el cajero ve el efectivo esperado antes de contar, es fácil que, sin querer, ajuste el conteo a ese
              número. En un corte ciego cuenta primero y el sistema revela la diferencia después: obtienes una lectura
              más honesta de cómo va tu caja.
            </p>
          </section>

          <section>
            <h2>Errores comunes que descuadran la caja</h2>
            <ul>
              <li>No registrar el fondo con el que se abrió.</li>
              <li>Pagar gastos de la caja sin anotarlos.</li>
              <li>Mezclar el efectivo de ventas con dinero personal.</li>
              <li>Cobrar tarjeta o transferencia y contarlo como efectivo.</li>
            </ul>
          </section>

          <div className="post-related">
            <strong>Sigue leyendo</strong>
            <div className="post-related-links">
              <Link href="/moda">MODA+: punto de venta para tienda de ropa</Link>
              <Link href="/moda/boutique">Punto de venta para boutique</Link>
              <Link href="/moda/como-controlar-inventario-de-una-tienda-de-ropa">Cómo controlar tu inventario de ropa</Link>
            </div>
          </div>
        </article>

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

        <section className="final-cta">
          <span className="section-kicker">MODA+</span>
          <h2>Que tu caja cuadre sola</h2>
          <p>MODA+ calcula el efectivo esperado por turno y te muestra la diferencia al cerrar. 15 días gratis, sin tarjeta.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 15 días gratis</a>
            <Link className="btn btn-line" href="/moda/guias">Ver más guías</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
