import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verticals, getVertical } from '../../_data/verticals'
import { siteUrl, registerUrl } from '../../_data/site'
import { buildMetadata } from '../../../lib/seo'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

export function generateStaticParams() {
  return verticals.map((v) => ({ giro: v.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ giro: string }> }): Promise<Metadata> {
  const { giro } = await params
  const vertical = getVertical(giro)
  if (!vertical) return {}
  return buildMetadata({
    title: vertical.metaTitle,
    description: vertical.metaDescription,
    path: `/punto-de-venta/${vertical.slug}`,
    image: vertical.image,
  })
}

export default async function VerticalPage({ params }: { params: Promise<{ giro: string }> }) {
  const { giro } = await params
  const vertical = getVertical(giro)
  if (!vertical) notFound()

  const url = `${siteUrl}/punto-de-venta/${vertical.slug}`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Punto de venta por giro', item: `${siteUrl}/punto-de-venta` },
          { '@type': 'ListItem', position: 3, name: vertical.nav, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: vertical.faqs.map(([question, answer]) => ({
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
            <div className="eyebrow"><span /> {vertical.eyebrow}</div>
            <h1>{vertical.h1}</h1>
            <p>{vertical.intro}</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={registerUrl}>Probar 6 meses gratis</a>
              <Link className="btn btn-soft" href="/punto-de-venta">Ver otros giros</Link>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>6 meses gratis</span>
              <span>Sin tarjeta</span>
              <span>Soporte en español</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="logo-plate">
              <Image src={vertical.image} alt={vertical.h1} width={1536} height={672} priority sizes="(max-width: 900px) 100vw, 48vw" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Pensado para tu giro</span>
            <h2>Lo que tu {vertical.nav.toLowerCase()} necesita</h2>
          </div>
          <div className="steps">
            {vertical.highlights.map((item) => (
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
            <h2>De la fricción diaria al control</h2>
          </div>
          <div className="pain-grid">
            {vertical.pains.map(([title, bad, good]) => (
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
            {vertical.faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MRTPVREST</span>
          <h2>El punto de venta para tu {vertical.nav.toLowerCase()}</h2>
          <p>Registra tu negocio, conecta caja y cocina y opera con datos desde el primer turno.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={registerUrl}>Registrar mi restaurante</a>
            <Link className="btn btn-line" href="/funciones">Ver funciones</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
