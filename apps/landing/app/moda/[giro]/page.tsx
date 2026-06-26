import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { modaVerticals, getModaVertical } from '../../_data/moda-verticals'
import { siteUrl, modaUrl } from '../../_data/site'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

export function generateStaticParams() {
  return modaVerticals.map((v) => ({ giro: v.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ giro: string }> }): Promise<Metadata> {
  const { giro } = await params
  const vertical = getModaVertical(giro)
  if (!vertical) return {}
  return {
    title: vertical.metaTitle,
    description: vertical.metaDescription,
    alternates: { canonical: `/moda/${vertical.slug}` },
    openGraph: {
      title: vertical.metaTitle,
      description: vertical.metaDescription,
      url: `${siteUrl}/moda/${vertical.slug}`,
      type: 'website',
    },
  }
}

export default async function ModaVerticalPage({ params }: { params: Promise<{ giro: string }> }) {
  const { giro } = await params
  const vertical = getModaVertical(giro)
  if (!vertical) notFound()

  const url = `${siteUrl}/moda/${vertical.slug}`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'MODA+ · Punto de venta para ropa', item: `${siteUrl}/moda` },
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
              <a className="btn btn-primary" href={modaUrl}>Probar 15 días gratis</a>
              <Link className="btn btn-soft" href="/moda">Ver MODA+</Link>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>15 días gratis</span>
              <span>Sin tarjeta</span>
              <span>Windows, Android y web</span>
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
          <span className="section-kicker">MODA+</span>
          <h2>El punto de venta para tu {vertical.nav.toLowerCase()}</h2>
          <p>Crea tu cuenta en minutos, carga tus productos por talla y color y vende desde el primer día.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 15 días gratis</a>
            <Link className="btn btn-line" href="/moda#faq">Ver preguntas frecuentes</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
