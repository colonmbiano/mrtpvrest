import type { Metadata } from 'next'
import Link from 'next/link'
import { modaComparisons } from '../../_data/moda-comparisons'
import { siteUrl, modaUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

const metaTitle = 'MODA+ vs. Otros Puntos de Venta para Ropa | Comparativas'
const metaDescription =
  'Compara MODA+ con otros puntos de venta para tienda de ropa: SICAR, Loyverse, INTAC, Kyte y Vendty. Variantes por talla y color, etiquetas y corte de caja.'

export const metadata: Metadata = {
  title: metaTitle,
  description: metaDescription,
  alternates: { canonical: '/moda/comparativa' },
  openGraph: {
    title: metaTitle,
    description: metaDescription,
    url: `${siteUrl}/moda/comparativa`,
    type: 'website',
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
    { '@type': 'ListItem', position: 2, name: 'MODA+ · Punto de venta para ropa', item: `${siteUrl}/moda` },
    { '@type': 'ListItem', position: 3, name: 'Comparativas', item: `${siteUrl}/moda/comparativa` },
  ],
}

export default function ModaComparisonsHubPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> MODA+ · Comparativas</div>
            <h1>MODA+ frente a otros puntos de venta para ropa</h1>
            <p>
              Si estás evaluando software para tu tienda de ropa, compara antes de decidir. Aquí está en qué se enfoca
              MODA+ frente a otras opciones, y qué criterios neutrales revisar para elegir bien.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={modaUrl}>Probar 6 meses gratis</a>
              <Link className="btn btn-soft" href="/moda">Ver MODA+</Link>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="pain-grid">
            {modaComparisons.map((comparison) => (
              <Link className="post-card" href={`/moda/comparativa/${comparison.slug}`} key={comparison.slug}>
                <span>Alternativa</span>
                <h2>MODA+ vs. {comparison.competitor}</h2>
                <p>{comparison.whenItFits.slice(0, 96)}…</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MODA+</span>
          <h2>Compáralo con tu tienda real</h2>
          <p>La mejor forma de comparar es probar. Crea tu cuenta y carga tus productos por talla y color. 6 meses gratis, sin tarjeta.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 6 meses gratis</a>
            <Link className="btn btn-line" href="/moda/guias">Ver guías</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
