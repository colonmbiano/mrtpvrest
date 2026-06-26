import type { Metadata } from 'next'
import Link from 'next/link'
import { siteUrl, modaUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

const slug = 'etiquetas-con-codigo-de-barras-para-ropa'
const title = 'Etiquetas con código de barras para ropa: guía práctica'
const metaTitle = 'Etiquetas con Código de Barras para Ropa | Guía MODA+'
const metaDescription =
  'Cómo poner etiquetas con código de barras a tu ropa: qué necesitas (software, impresora y lector), qué tipo de código usar y cómo cobrar escaneando.'
const datePublished = '2026-06-25'
const readingMinutes = 5
const url = `${siteUrl}/moda/${slug}`

const faqs: [string, string][] = [
  [
    '¿Qué necesito para etiquetar mi ropa con código de barras?',
    'Tres cosas: un software que genere las etiquetas con código de barras por variante, una impresora o etiquetadora para imprimirlas, y un lector para cobrar escaneando. MODA+ genera e imprime las etiquetas por ti.',
  ],
  [
    '¿Qué tipo de código de barras se usa en ropa?',
    'Para uso interno de tienda lo más común es CODE128, que codifica el identificador (SKU) de cada variante. Es el que genera MODA+. No necesitas registrar códigos GS1 para vender en tu propia tienda.',
  ],
  [
    '¿La etiqueta descuenta el inventario al cobrar?',
    'Sí, si el código apunta a la variante en tu sistema: al escanear, el punto de venta identifica la talla y color exactos y descuenta ese stock automáticamente.',
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

export default function ModaBarcodeLabelsGuidePage() {
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
            Teclear precios en la caja es lento y se presta a errores: cobrar el modelo equivocado, la talla que no era o
            un precio viejo. Las etiquetas con código de barras resuelven eso: escaneas la prenda y aparece la talla, el
            color y el precio correctos, y el inventario se descuenta solo.
          </p>
          <p>Esta guía te explica qué necesitas para etiquetar tu ropa con código de barras y empezar a cobrar escaneando.</p>

          <section>
            <h2>Por qué etiquetar tu ropa con código de barras</h2>
            <ul>
              <li><strong>Cobras más rápido</strong>: un escaneo en vez de buscar el producto a mano.</li>
              <li><strong>Menos errores</strong>: se cobra la variante exacta, no &quot;una parecida&quot;.</li>
              <li><strong>Inventario al día</strong>: cada venta descuenta el stock de esa talla y color.</li>
            </ul>
          </section>

          <section>
            <h2>Qué necesitas para empezar</h2>
            <p>El etiquetado con código de barras tiene tres piezas:</p>
            <ul>
              <li><strong>Software que genere las etiquetas</strong> por variante (con su talla, color, precio y código). MODA+ las genera por ti.</li>
              <li><strong>Una impresora o etiquetadora</strong> para imprimir las etiquetas (térmica de etiquetas o, para tickets, una impresora térmica de 80&nbsp;mm).</li>
              <li><strong>Un lector de código de barras</strong> para escanear al cobrar (también sirve la cámara en algunos equipos).</li>
            </ul>
          </section>

          <section>
            <h2>Qué código de barras usar</h2>
            <p>
              Para uso interno de tu tienda, el estándar más práctico es <strong>CODE128</strong>: codifica el
              identificador (SKU) de cada variante en una sola etiqueta. Es el que genera MODA+. No necesitas registrar
              códigos GS1 (esos son para vender a través de cadenas y mayoristas); para tu propia tienda, tu SKU es
              suficiente.
            </p>
          </section>

          <section>
            <h2>Qué poner en la etiqueta</h2>
            <p>Una buena etiqueta de ropa incluye:</p>
            <ul>
              <li>Nombre o modelo de la prenda.</li>
              <li>Talla y color (la variante exacta).</li>
              <li>Precio.</li>
              <li>El código de barras (CODE128) que apunta a esa variante.</li>
            </ul>
          </section>

          <section>
            <h2>Cómo cobrar escaneando</h2>
            <p>
              Con todo etiquetado, cobrar es escanear: el punto de venta reconoce la variante, la suma al ticket con su
              precio y descuenta el stock de esa talla y color. La fila avanza más rápido y al cierre tu inventario ya
              está actualizado, sin captura manual.
            </p>
          </section>

          <div className="post-related">
            <strong>Sigue leyendo</strong>
            <div className="post-related-links">
              <Link href="/moda">MODA+: punto de venta para tienda de ropa</Link>
              <Link href="/moda/boutique">Punto de venta para boutique</Link>
              <Link href="/moda/cuanto-cuesta-un-punto-de-venta-para-tienda-de-ropa">¿Cuánto cuesta un POS para ropa?</Link>
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
          <h2>Etiqueta y cobra escaneando</h2>
          <p>MODA+ genera tus etiquetas con código de barras por variante y descuenta el stock al cobrar. 15 días gratis, sin tarjeta.</p>
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
