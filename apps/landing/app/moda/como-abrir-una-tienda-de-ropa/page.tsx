import type { Metadata } from 'next'
import Link from 'next/link'
import { siteUrl, modaUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

const slug = 'como-abrir-una-tienda-de-ropa'
const title = 'Cómo abrir una tienda de ropa: guía y checklist'
const metaTitle = 'Cómo Abrir una Tienda de Ropa: Guía y Checklist | MODA+'
const metaDescription =
  'Cómo abrir una tienda de ropa paso a paso: define tu nicho, consigue proveedores, organiza el inventario por talla y color y elige tu punto de venta.'
const datePublished = '2026-06-25'
const readingMinutes = 7
const url = `${siteUrl}/moda/${slug}`

const faqs: [string, string][] = [
  [
    '¿Cuánto necesito para abrir una tienda de ropa?',
    'Varía mucho según el local, el inventario inicial y el giro. Lo importante es separar la inversión en mercancía, el local (renta y adecuación), el equipo de venta y un colchón para los primeros meses. Empezar enfocado en un nicho reduce el inventario inicial.',
  ],
  [
    '¿Qué necesito para llevar el control desde el día uno?',
    'Un inventario organizado por talla y color y un punto de venta que descuente el stock al vender. Así, desde la primera venta sabes qué te queda y cuánto vendes, sin libretas ni Excel que se desactualizan.',
  ],
  [
    '¿Necesito tienda física o puedo empezar en línea?',
    'Puedes empezar de cualquiera de las dos formas, o ambas. Lo que no cambia es la necesidad de controlar inventario y caja; un punto de venta que funcione en PC, celular y web te deja arrancar con lo que tengas.',
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

export default function ModaOpenStoreGuidePage() {
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
            Abrir una tienda de ropa es emocionante, pero las primeras decisiones —qué vender, a quién, y cómo llevar el
            control— marcan si el negocio crece ordenado o se complica. Esta guía te da una ruta práctica, paso a paso, y
            un checklist para arrancar.
          </p>
          <p>No es una receta única, pero sí el orden que evita los errores más comunes al empezar.</p>

          <section>
            <h2>1. Define tu nicho y tu cliente</h2>
            <p>
              &quot;Vender ropa&quot; es demasiado amplio. Elige un nicho (dama, caballero, infantil, deportiva, talla
              extra, calzado) y un cliente claro. Entre más enfocado, más fácil es comprar el surtido correcto, competir
              y que la gente te recuerde por algo.
            </p>
          </section>

          <section>
            <h2>2. Consigue proveedores y arma tu surtido inicial</h2>
            <p>
              Busca proveedores (mayoristas, fabricantes, importadores) y arma un surtido inicial acotado: pocos modelos,
              pero con sus tallas y colores completos. Es mejor tener bien surtidos unos cuantos modelos que muchos
              modelos incompletos.
            </p>
          </section>

          <section>
            <h2>3. Decide local, en línea o ambos</h2>
            <p>
              Puedes abrir con local físico, vender en línea y por redes, o combinar ambos. Sea cual sea, el control de
              inventario y de caja es el mismo reto; resuélvelo desde el inicio para no rehacerlo después.
            </p>
          </section>

          <section>
            <h2>4. Organiza tu inventario por talla y color</h2>
            <p>
              Aquí se gana o se pierde el control. Da de alta cada prenda como una matriz de talla y color, con un SKU por
              variante. Así sabes exactamente qué te queda de cada combinación y cada venta descuenta la variante
              correcta. (Lo vemos a fondo en la guía de inventario.)
            </p>
          </section>

          <section>
            <h2>5. Elige tu punto de venta (y qué debe hacer)</h2>
            <p>Tu punto de venta es la herramienta con la que vas a operar todos los días. Para ropa, asegúrate de que:</p>
            <ul>
              <li>Maneje variantes de talla y color de verdad (no listas planas).</li>
              <li>Imprima etiquetas y te deje cobrar escaneando código de barras.</li>
              <li>Cuadre la caja por turno (esperado vs. contado).</li>
              <li>Funcione en el equipo que tienes y sin depender del internet.</li>
            </ul>
            <p>MODA+ cubre justo eso, y puedes probarlo 6 meses sin tarjeta antes de comprometerte.</p>
          </section>

          <section>
            <h2>6. Define precios y margen</h2>
            <p>
              Calcula tu precio a partir del costo más el margen que necesitas para cubrir renta, sueldos y utilidad, no
              solo &quot;lo que cobran los demás&quot;. Revisa tu margen por producto y ajústalo con lo que de verdad
              rota.
            </p>
          </section>

          <section>
            <h2>Checklist rápido para abrir</h2>
            <ul>
              <li>Nicho y cliente definidos.</li>
              <li>Proveedores y surtido inicial (con tallas y colores completos).</li>
              <li>Local y/o canal en línea listos.</li>
              <li>Inventario por talla y color cargado.</li>
              <li>Punto de venta configurado, con etiquetas y código de barras.</li>
              <li>Precios y margen definidos.</li>
              <li>Caja con fondo y corte por turno.</li>
            </ul>
          </section>

          <div className="post-related">
            <strong>Sigue leyendo</strong>
            <div className="post-related-links">
              <Link href="/moda">MODA+: punto de venta para tienda de ropa</Link>
              <Link href="/moda/como-controlar-inventario-de-una-tienda-de-ropa">Cómo controlar tu inventario de ropa</Link>
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
          <h2>Arranca tu tienda con el control desde el día uno</h2>
          <p>Carga tus productos por talla y color, imprime etiquetas y cuadra tu caja con MODA+. 6 meses gratis, sin tarjeta.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 6 meses gratis</a>
            <Link className="btn btn-line" href="/moda/guias">Ver más guías</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
