import type { Metadata } from 'next'
import Link from 'next/link'
import { modaVerticals } from '../../_data/moda-verticals'
import { siteUrl, modaUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

const metaTitle = 'Punto de Venta por Giro de Tienda de Ropa | MODA+'
const metaDescription =
  'Punto de venta MODA+ por giro: boutique, zapatería, lencería, ropa infantil y deportiva. Inventario por talla y color, etiquetas y corte de caja.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: { canonical: '/moda/giros' },
  openGraph: {
    title: metaTitle,
    description: metaDescription,
    url: `${siteUrl}/moda/giros`,
    type: 'website',
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
    { '@type': 'ListItem', position: 2, name: 'MODA+ · Punto de venta para ropa', item: `${siteUrl}/moda` },
    { '@type': 'ListItem', position: 3, name: 'Giros', item: `${siteUrl}/moda/giros` },
  ],
}

export default function ModaVerticalsHubPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> MODA+ · Punto de venta por giro</div>
            <h1>Un punto de venta hecho para tu tipo de tienda de ropa</h1>
            <p>
              Boutique, zapatería, lencería, ropa infantil o deportiva: cada giro vende por talla, color, número o
              modelo. MODA+ maneja la matriz de variantes de tu producto, imprime etiquetas con código de barras y
              cuadra tu caja, en Windows, Android o web.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={modaUrl}>Probar 6 meses gratis</a>
              <Link className="btn btn-soft" href="/moda">Ver MODA+</Link>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="pain-grid">
            {modaVerticals.map((vertical) => (
              <Link className="post-card" href={`/moda/${vertical.slug}`} key={vertical.slug}>
                <span>Giro</span>
                <h2>{vertical.nav}</h2>
                <p>{vertical.intro.slice(0, 92)}…</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MODA+</span>
          <h2>¿No ves tu giro? También funciona para ti</h2>
          <p>Si vendes ropa o calzado por talla y color, MODA+ se adapta. Pruébalo 6 meses gratis y sin tarjeta.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 6 meses gratis</a>
            <Link className="btn btn-line" href="/moda/comparativa/sicar">Ver comparativas</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
