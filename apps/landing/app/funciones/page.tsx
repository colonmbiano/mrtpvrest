import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { features } from '../_data/features'
import { siteUrl, registerUrl } from '../_data/site'
import { buildMetadata } from '../../lib/seo'
import { SiteNav, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = buildMetadata({
  title: 'Funciones del Punto de Venta para Restaurantes | MRTPVREST',
  description:
    'TPV, KDS de cocina, delivery, kiosko de autoservicio, pedidos QR y administración: todas las funciones del punto de venta para restaurantes MRTPVREST.',
  path: '/funciones',
})

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
    { '@type': 'ListItem', position: 2, name: 'Funciones', item: `${siteUrl}/funciones` },
  ],
}

export default function FuncionesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Ecosistema completo</div>
            <h1>Todas las funciones del punto de venta para restaurantes</h1>
            <p>
              Cada pantalla resuelve un punto de la operación —caja, cocina, reparto, autoservicio, clientes y
              administración— y todas comparten la misma verdad del restaurante en tiempo real.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={registerUrl}>Probar 14 días gratis</a>
              <Link className="btn btn-soft" href="/#precios">Ver precios</Link>
            </div>
          </div>
        </section>

        <section className="section apps-section">
          <div className="apps-grid">
            {features.map((feature) => (
              <Link className="app-card amber" href={`/funciones/${feature.slug}`} key={feature.slug}>
                <Image src={feature.image} alt={`${feature.nav}: ${feature.metaDescription}`} width={1536} height={672} loading="lazy" sizes="(max-width: 900px) 100vw, 50vw" />
                <span>
                  <strong>{feature.nav}</strong>
                  <small>{feature.intro.slice(0, 96)}…</small>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MRTPVREST</span>
          <h2>Una sola plataforma para todo tu restaurante</h2>
          <p>Registra tu negocio y conecta caja, cocina, delivery y reportes desde el primer turno.</p>
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
