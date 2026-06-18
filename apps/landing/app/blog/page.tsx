import type { Metadata } from 'next'
import Link from 'next/link'
import { posts } from '../_data/posts'
import { siteUrl } from '../_data/site'
import { SiteNav, SiteFooter } from '../_components/SiteChrome'

export const metadata: Metadata = {
  title: 'Blog para Restaurantes: Punto de Venta y Operación | MRTPVREST',
  description:
    'Guías prácticas para operar tu restaurante: cómo elegir un punto de venta, cuánto cuesta, qué es un KDS, reducir mermas y delivery propio vs plataformas.',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'Blog para Restaurantes | MRTPVREST',
    description: 'Guías prácticas sobre punto de venta y operación de restaurantes.',
    url: `${siteUrl}/blog`,
    type: 'website',
  },
}

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  '@id': `${siteUrl}/blog`,
  name: 'Blog MRTPVREST',
  inLanguage: 'es-MX',
  blogPost: posts.map((post) => ({
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.datePublished,
    url: `${siteUrl}/blog/${post.slug}`,
  })),
}

export default function BlogIndexPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> Blog · Recursos</div>
            <h1>Guías para operar mejor tu restaurante</h1>
            <p>
              Cómo elegir un punto de venta, cuánto cuesta, qué es un KDS, reducir mermas y más: contenido práctico
              para tomar mejores decisiones en tu negocio.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="pain-grid">
            {posts.map((post) => (
              <Link className="post-card" href={`/blog/${post.slug}`} key={post.slug}>
                <span>{post.readingMinutes} min de lectura</span>
                <h2>{post.title}</h2>
                <p>{post.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MRTPVREST</span>
          <h2>Pon en práctica lo que lees</h2>
          <p>Prueba el punto de venta para restaurantes MRTPVREST 14 días gratis y sin tarjeta.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/funciones">Ver funciones</Link>
            <Link className="btn btn-line" href="/#precios">Ver precios</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
