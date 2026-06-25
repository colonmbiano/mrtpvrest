// lib/seo.ts
// Helper único de metadata para que cada página tenga canonical, Open Graph y
// Twitter Cards COHERENTES entre sí. Antes, las subpáginas definían `openGraph`
// pero no `twitter`, así que Next.js heredaba el `twitter` del root layout
// (título e imagen de la home) y al compartir en X salía la tarjeta equivocada.
import type { Metadata } from 'next'
import { siteUrl } from '../app/_data/site'

// Imagen OG por defecto. Apunta al logo que SÍ existe en public/brand
// (mrtpvrest-logo.png no existe y daba 404 en la tarjeta).
const DEFAULT_OG = '/brand/mrtpvrest-logo-current.png'

type BuildMetadataOptions = {
  title: string
  description: string
  path: string // p.ej. "/funciones/asistente-de-voz" o "/"
  image?: string // imagen específica de la página (relativa o absoluta)
  ogType?: 'website' | 'article'
  publishedTime?: string // sólo para ogType 'article'
}

export function buildMetadata(opts: BuildMetadataOptions): Metadata {
  const url = opts.path === '/' ? siteUrl : `${siteUrl}${opts.path}`
  const image = opts.image ?? DEFAULT_OG

  const ogBase = {
    siteName: 'MRTPVREST',
    locale: 'es_MX',
    url,
    title: opts.title,
    description: opts.description,
    images: [{ url: image }],
  }

  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph:
      opts.ogType === 'article'
        ? { ...ogBase, type: 'article', publishedTime: opts.publishedTime }
        : { ...ogBase, type: 'website' },
    twitter: {
      card: 'summary_large_image',
      title: opts.title, // <-- ahora SIEMPRE coincide con la página
      description: opts.description,
      images: [image], // <-- ya no hereda el logo de la home
    },
  }
}
