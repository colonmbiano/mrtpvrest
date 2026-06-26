import type { Metadata } from 'next'
import Link from 'next/link'
import { siteUrl, modaUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

const slug = 'como-controlar-inventario-de-una-tienda-de-ropa'
const title = 'Cómo controlar el inventario de una tienda de ropa'
const metaTitle = 'Cómo Controlar el Inventario de una Tienda de Ropa | MODA+'
const metaDescription =
  'Cómo controlar el inventario de una tienda de ropa por talla y color: organiza por SKU, usa código de barras, haz conteos y define mínimos de reposición.'
const datePublished = '2026-06-25'
const readingMinutes = 6
const url = `${siteUrl}/moda/${slug}`

const faqs: [string, string][] = [
  [
    '¿Cómo llevo el inventario por talla y color?',
    'Lo más práctico es manejar cada producto como una matriz de talla y color, con un SKU por variante. Así cada talla y color tiene su propio stock, precio y etiqueta, y sabes exactamente qué te queda de cada uno.',
  ],
  [
    '¿Necesito código de barras para controlar el inventario?',
    'No es obligatorio, pero ayuda mucho: con etiquetas y código de barras cobras y descuentas stock escaneando, sin teclear, y reduces errores de captura. MODA+ imprime etiquetas con código de barras (CODE128).',
  ],
  [
    '¿Cada cuánto debo hacer conteo físico?',
    'Depende del tamaño de la tienda, pero un conteo cíclico (por sección o categoría cada semana o mes) suele funcionar mejor que un solo conteo anual, porque detectas faltantes a tiempo.',
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

export default function ModaInventoryGuidePage() {
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
            El inventario es el corazón de una tienda de ropa: si no sabes qué tallas y colores te quedan, vendes de
            menos (porque no ofreces lo que sí tienes) y compras de más (porque repones a ciegas). Y a diferencia de
            otros negocios, en ropa un mismo modelo se multiplica en decenas de variantes.
          </p>
          <p>
            Esta guía te da un método práctico para controlar el inventario de tu tienda de ropa por talla y color, sin
            volverte loco con la libreta ni con un Excel que nadie actualiza.
          </p>

          <section>
            <h2>Por qué el inventario de ropa es distinto</h2>
            <p>
              Un solo modelo de playera puede existir en 5 tallas y 4 colores: eso son 20 variantes, cada una con su
              propia existencia. Tratar el modelo como &quot;un producto&quot; con una sola cantidad esconde justo lo que
              necesitas saber: de qué talla y color te estás quedando sin stock.
            </p>
            <p>Por eso, controlar ropa empieza por separar cada combinación talla × color como una unidad propia.</p>
          </section>

          <section>
            <h2>Organiza por matriz de talla y color (un SKU por variante)</h2>
            <p>
              La base de todo es dar de alta cada producto como una matriz de talla y color, donde cada celda es un SKU
              con su propio stock, precio y etiqueta. Así:
            </p>
            <ul>
              <li>Ves de un vistazo qué tallas y colores te quedan de cada modelo.</li>
              <li>Cada venta descuenta exactamente la variante correcta, no &quot;el modelo&quot; en general.</li>
              <li>Puedes poner precios distintos por variante si hace falta (por ejemplo tallas especiales).</li>
            </ul>
            <p>
              Herramientas hechas para ropa, como MODA+, generan esta matriz por ti en lugar de obligarte a capturar
              cada combinación a mano.
            </p>
          </section>

          <section>
            <h2>Usa etiquetas y código de barras</h2>
            <p>
              Imprime una etiqueta con código de barras por variante. Al cobrar escaneando, el sistema descuenta el
              stock exacto sin que nadie teclee, lo que elimina la mayor fuente de errores de inventario: la captura
              manual. Además acelera la fila y evita cobrar el modelo o la talla equivocada.
            </p>
          </section>

          <section>
            <h2>Haz conteos cíclicos y ajusta</h2>
            <p>
              El stock del sistema y el físico se separan con el tiempo (mermas, robos, devoluciones mal registradas).
              Para mantenerlos alineados:
            </p>
            <ul>
              <li>Haz conteos por sección o categoría de forma rotativa, no un único conteo anual.</li>
              <li>Registra el ajuste con su motivo (merma, robo, error) para entender por qué se descuadró.</li>
              <li>Revisa las variantes con más diferencia: ahí suele estar el problema real.</li>
            </ul>
          </section>

          <section>
            <h2>Define mínimos y reposición</h2>
            <p>
              Para cada variante que más rota, define un mínimo de stock. Cuando el sistema te avisa que una talla o
              color está por agotarse, repones a tiempo y no pierdes la venta por no tener &quot;justo esa&quot; talla.
              Con el historial de ventas por variante decides cuánto pedir, en lugar de comprar parejo.
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
          <h2>Controla tu inventario desde el primer día</h2>
          <p>Carga tus productos por talla y color, imprime etiquetas y deja que la caja descuente el stock por ti. 15 días gratis, sin tarjeta.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 15 días gratis</a>
            <Link className="btn btn-line" href="/moda">Ver MODA+</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
