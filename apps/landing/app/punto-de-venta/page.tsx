import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { verticals } from '../_data/verticals'
import { siteUrl, registerUrl } from '../_data/site'
import { buildMetadata } from '../../lib/seo'
import { SiteNav, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = buildMetadata({
  title: 'Punto de Venta por Tipo de Restaurante | MRTPVREST',
  description:
    'Punto de venta para cada giro: taquería, pizzería, cafetería, bar, comida rápida y marisquería. Encuentra el sistema hecho para tu tipo de restaurante.',
  path: '/punto-de-venta',
})

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
    { '@type': 'ListItem', position: 2, name: 'Punto de venta por giro', item: `${siteUrl}/punto-de-venta` },
  ],
}

export default function VerticalsHubPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Punto de venta por giro</div>
            <h1>Un punto de venta hecho para tu tipo de restaurante</h1>
            <p>
              Cada giro vende distinto: tacos por pieza, pizzas por mitad, cuentas de bar que se quedan abiertas o
              mariscos por kilo. MRTPVREST se adapta a la forma de operar de tu restaurante.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={registerUrl}>Probar 6 meses gratis</a>
              <Link className="btn btn-soft" href="/funciones">Ver funciones</Link>
            </div>
          </div>
        </section>

        <section className="section apps-section">
          <div className="apps-grid">
            {verticals.map((vertical) => (
              <Link className="app-card sage" href={`/punto-de-venta/${vertical.slug}`} key={vertical.slug}>
                <Image src={vertical.image} alt={`${vertical.nav}: ${vertical.metaDescription}`} width={1536} height={672} loading="lazy" sizes="(max-width: 900px) 100vw, 50vw" />
                <span>
                  <strong>{vertical.nav}</strong>
                  <small>{vertical.intro.slice(0, 92)}…</small>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MRTPVREST</span>
          <h2>¿No ves tu giro? También funciona para ti</h2>
          <p>MRTPVREST se adapta a cualquier restaurante. Pruébalo 6 meses gratis y configúralo a tu operación.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={registerUrl}>Registrar mi restaurante</a>
            <Link className="btn btn-line" href="/comparativa/parrot">Ver comparativas</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
