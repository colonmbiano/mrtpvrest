import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ferreteriaVerticals, getFerreteriaVertical } from '../../_data/ferreteria-verticals'
import { siteUrl, registerUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

// Misma estructura que /moda/[giro], pero bajo la marca madre: el CTA va al
// registro de mrtpvrest y el breadcrumb declara "punto de venta para ferretería".
// Colgar esto de /moda haría que el JSON-LD dijera "punto de venta para ropa",
// que es structured data en contra del propio SEO de la página.

export function generateStaticParams() {
  return ferreteriaVerticals.map((v) => ({ giro: v.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ giro: string }> }): Promise<Metadata> {
  const { giro } = await params
  const vertical = getFerreteriaVertical(giro)
  if (!vertical) return {}
  return {
    title: vertical.metaTitle,
    description: vertical.metaDescription,
    alternates: { canonical: `/ferreteria/${vertical.slug}` },
    openGraph: {
      title: vertical.metaTitle,
      description: vertical.metaDescription,
      url: `${siteUrl}/ferreteria/${vertical.slug}`,
      type: 'website',
    },
  }
}

export default async function FerreteriaVerticalPage({ params }: { params: Promise<{ giro: string }> }) {
  const { giro } = await params
  const vertical = getFerreteriaVertical(giro)
  if (!vertical) notFound()

  const url = `${siteUrl}/ferreteria/${vertical.slug}`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Punto de venta para ferretería', item: `${siteUrl}/ferreteria` },
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
              <a className="btn btn-primary" href={registerUrl}>Crear mi cuenta</a>
              <Link className="btn btn-soft" href="/ferreteria">Ver punto de venta para ferretería</Link>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>Sin tarjeta</span>
              <span>Windows, Android y web</span>
              <span>Funciona sin internet</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Hecho para tu giro</span>
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
            <h2>De la libreta al control real</h2>
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
          <span className="section-kicker">Punto de venta para ferretería</span>
          <h2>El punto de venta para tu {vertical.nav.toLowerCase()}</h2>
          <p>Crea tu cuenta en minutos, carga tus artículos con su medida y su código de barras, y vende desde el primer día.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={registerUrl}>Crear mi cuenta</a>
            <Link className="btn btn-line" href="/ferreteria#faq">Ver preguntas frecuentes</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
