import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { modaComparisons, getModaComparison } from '../../../_data/moda-comparisons'
import { siteUrl, modaUrl } from '../../../_data/site'
import { SiteNav, SiteFooter } from '../../../_components/SiteChrome'

export function generateStaticParams() {
  return modaComparisons.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const comparison = getModaComparison(slug)
  if (!comparison) return {}
  return {
    title: comparison.metaTitle,
    description: comparison.metaDescription,
    alternates: { canonical: `/moda/comparativa/${comparison.slug}` },
    openGraph: {
      title: comparison.metaTitle,
      description: comparison.metaDescription,
      url: `${siteUrl}/moda/comparativa/${comparison.slug}`,
      type: 'website',
    },
  }
}

export default async function ModaComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const comparison = getModaComparison(slug)
  if (!comparison) notFound()

  const url = `${siteUrl}/moda/comparativa/${comparison.slug}`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'MODA+ · Punto de venta para ropa', item: `${siteUrl}/moda` },
          { '@type': 'ListItem', position: 3, name: `Alternativa a ${comparison.competitor}`, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: comparison.faqs.map(([question, answer]) => ({
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
            <div className="eyebrow"><span /> {comparison.eyebrow}</div>
            <h1>{comparison.h1}</h1>
            <p>{comparison.intro}</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={modaUrl}>Probar 6 meses gratis</a>
              <Link className="btn btn-soft" href="/moda">Ver MODA+</Link>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>6 meses gratis</span>
              <span>Sin tarjeta</span>
              <span>Windows, Android y web</span>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Contexto</span>
            <h2>Qué es {comparison.competitor}</h2>
            <p>{comparison.about}</p>
          </div>
          <div className="section-head">
            <span className="section-kicker">Dónde encaja MODA+</span>
            <h2>Cuándo elegir MODA+</h2>
            <p>{comparison.whenItFits}</p>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Por qué MODA+</span>
            <h2>Razones para considerarlo</h2>
          </div>
          <div className="pain-grid">
            {comparison.reasons.map((reason) => (
              <article className="pain-card" key={reason.title}>
                <span className="pain-title">{reason.title}</span>
                <p className="pain-good">{reason.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Cómo comparar</span>
            <h2>Qué evaluar antes de decidir</h2>
            <p>Criterios neutrales para comparar cualquier punto de venta para tienda de ropa, no solo estas dos opciones.</p>
          </div>
          <div className="steps">
            {comparison.criteria.map((item) => (
              <article className="step" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
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
            {comparison.faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MODA+</span>
          <h2>Compáralo con tu tienda real</h2>
          <p>Crea tu cuenta en minutos, carga tus productos por talla y color y decide con datos, no con folletos.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={modaUrl}>Probar 6 meses gratis</a>
            <Link className="btn btn-line" href="/moda">Ver MODA+</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
