import type { Metadata } from 'next'
import Link from 'next/link'
import { modaGuides } from '../../_data/moda-guides'
import { siteUrl, modaUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

const metaTitle = 'Guías para tu Tienda de Ropa | MODA+'
const metaDescription =
  'Guías prácticas para tu tienda de ropa: cuánto cuesta un punto de venta, cómo controlar el inventario por talla y color, el corte de caja y las etiquetas con código de barras.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: { canonical: '/moda/guias' },
  openGraph: {
    title: metaTitle,
    description: metaDescription,
    url: `${siteUrl}/moda/guias`,
    type: 'website',
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'MODA+ · Punto de venta para ropa', item: `${siteUrl}/moda` },
        { '@type': 'ListItem', position: 3, name: 'Guías', item: `${siteUrl}/moda/guias` },
      ],
    },
    {
      '@type': 'Blog',
      '@id': `${siteUrl}/moda/guias`,
      name: 'Guías MODA+ para tiendas de ropa',
      inLanguage: 'es-MX',
      blogPost: modaGuides.map((guide) => ({
        '@type': 'BlogPosting',
        headline: guide.title,
        description: guide.excerpt,
        url: `${siteUrl}/moda/${guide.slug}`,
      })),
    },
  ],
}

export default function ModaGuidesHubPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> MODA+ · Guías para tiendas de ropa</div>
            <h1>Guías para abrir y operar mejor tu tienda de ropa</h1>
            <p>
              Cuánto cuesta un punto de venta, cómo controlar el inventario por talla y color, hacer el corte de caja y
              etiquetar con código de barras: contenido práctico para vender más ordenado.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={modaUrl}>Probar 15 días gratis</a>
              <Link className="btn btn-soft" href="/moda">Ver MODA+</Link>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="pain-grid">
            {modaGuides.map((guide) => (
              <Link className="post-card" href={`/moda/${guide.slug}`} key={guide.slug}>
                <span>Guía</span>
                <h2>{guide.title}</h2>
                <p>{guide.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MODA+</span>
          <h2>Pon en práctica lo que lees</h2>
          <p>Crea tu cuenta, carga tus productos por talla y color y vende desde el primer día. 15 días gratis, sin tarjeta.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 15 días gratis</a>
            <Link className="btn btn-line" href="/moda/giros">Ver giros</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
