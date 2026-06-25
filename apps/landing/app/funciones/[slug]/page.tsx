import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { features, getFeature } from '../../_data/features'
import { siteUrl, registerUrl } from '../../_data/site'
import { buildMetadata } from '../../../lib/seo'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

export function generateStaticParams() {
  return features.map((f) => ({ slug: f.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const feature = getFeature(slug)
  if (!feature) return {}
  return buildMetadata({
    title: feature.metaTitle,
    description: feature.metaDescription,
    path: `/funciones/${feature.slug}`,
    image: feature.image,
  })
}

export default async function FeaturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const feature = getFeature(slug)
  if (!feature) notFound()

  const url = `${siteUrl}/funciones/${feature.slug}`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Funciones', item: `${siteUrl}/funciones` },
          { '@type': 'ListItem', position: 3, name: feature.nav, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: feature.faqs.map(([question, answer]) => ({
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
            <div className="eyebrow"><span /> {feature.eyebrow}</div>
            <h1>{feature.h1}</h1>
            <p>{feature.intro}</p>
            <div className="hero-actions">
              <a className="btn btn-primary" href={registerUrl}>Probar 14 días gratis</a>
              <Link className="btn btn-soft" href="/funciones">Ver todas las funciones</Link>
            </div>
            <div className="trust-row" aria-label="Beneficios de confianza">
              <span>14 días gratis</span>
              <span>Sin tarjeta</span>
              <span>Soporte en español</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="logo-plate">
              <Image src={feature.image} alt={feature.h1} width={1536} height={672} priority sizes="(max-width: 900px) 100vw, 48vw" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Problema a solución</span>
            <h2>Lo que cambia en tu operación</h2>
          </div>
          <div className="pain-grid">
            {feature.pains.map(([title, bad, good]) => (
              <article className="pain-card" key={title}>
                <span className="pain-title">{title}</span>
                <p className="pain-bad">{bad}</p>
                <p className="pain-good">{good}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="section-kicker">Qué incluye</span>
            <h2>Pensado para restaurantes reales</h2>
          </div>
          <div className="steps">
            {feature.bullets.map((bullet) => (
              <article className="step" key={bullet.title}>
                <h3>{bullet.title}</h3>
                <p>{bullet.text}</p>
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
            {feature.faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MRTPVREST</span>
          <h2>Activa esta función en tu restaurante</h2>
          <p>Registra tu negocio, conecta tus pantallas y opera con datos desde el primer turno.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={registerUrl}>Registrar mi restaurante</a>
            <Link className="btn btn-line" href="/#precios">Ver precios</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
