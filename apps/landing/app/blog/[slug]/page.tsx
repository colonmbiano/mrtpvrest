import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { posts, getPost } from '../../_data/posts'
import { siteUrl, registerUrl } from '../../_data/site'
import { buildMetadata } from '../../../lib/seo'
import { SiteNav, SiteFooter } from '../../_components/SiteChrome'

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return buildMetadata({
    title: post.metaTitle,
    description: post.metaDescription,
    path: `/blog/${post.slug}`,
    ogType: 'article',
    publishedTime: post.datePublished,
  })
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  const url = `${siteUrl}/blog/${post.slug}`
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.metaDescription,
        datePublished: post.datePublished,
        dateModified: post.datePublished,
        inLanguage: 'es-MX',
        mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'MRTPVREST', url: siteUrl },
        publisher: {
          '@type': 'Organization',
          name: 'MRTPVREST',
          logo: { '@type': 'ImageObject', url: `${siteUrl}/brand/mrtpvrest-logo-current.png` },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: post.faqs.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  }

  const dateLabel = new Date(post.datePublished).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <SiteNav />
      <main>
        <section className="section">
          <div className="post-header">
            <span className="section-kicker">Blog · MRTPVREST</span>
            <h1>{post.title}</h1>
            <div className="post-meta">
              <span>{dateLabel}</span>
              <span>{post.readingMinutes} min de lectura</span>
            </div>
          </div>
        </section>

        <article className="section prose">
          {post.intro.map((paragraph, index) => (
            <p key={`intro-${index}`}>{paragraph}</p>
          ))}

          {post.sections.map((section) => (
            <section key={section.h2}>
              <h2>{section.h2}</h2>
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <div className="post-related">
            <strong>Sigue leyendo</strong>
            <div className="post-related-links">
              {post.related.map((link) => (
                <Link href={link.href} key={link.href}>{link.label}</Link>
              ))}
            </div>
          </div>
        </article>

        <section className="section faq-section" id="faq">
          <div className="section-head">
            <span className="section-kicker">FAQ</span>
            <h2>Preguntas frecuentes</h2>
          </div>
          <div className="faq-list">
            {post.faqs.map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <span className="section-kicker">MRTPVREST</span>
          <h2>El punto de venta para tu restaurante</h2>
          <p>Registra tu negocio, conecta caja y cocina y opera con datos desde el primer turno.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href={registerUrl}>Probar 6 meses gratis</a>
            <Link className="btn btn-line" href="/blog">Ver más guías</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
