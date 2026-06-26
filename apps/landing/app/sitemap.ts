import type { MetadataRoute } from 'next'
import { features } from './_data/features'
import { comparisons } from './_data/comparisons'
import { verticals } from './_data/verticals'
import { posts } from './_data/posts'
import { modaComparisons } from './_data/moda-comparisons'
import { modaVerticals } from './_data/moda-verticals'
import { modaGuides } from './_data/moda-guides'

const baseUrl = 'https://mrtpvrest.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/funciones`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/punto-de-venta`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/moda`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${baseUrl}/moda/giros`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/moda/comparativa`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/moda/guias`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ]

  const modaGuidePages: MetadataRoute.Sitemap = modaGuides.map((g) => ({
    url: `${baseUrl}/moda/${g.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const modaVerticalPages: MetadataRoute.Sitemap = modaVerticals.map((v) => ({
    url: `${baseUrl}/moda/${v.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const modaComparisonPages: MetadataRoute.Sitemap = modaComparisons.map((c) => ({
    url: `${baseUrl}/moda/comparativa/${c.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const featurePages: MetadataRoute.Sitemap = features.map((f) => ({
    url: `${baseUrl}/funciones/${f.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const comparisonPages: MetadataRoute.Sitemap = comparisons.map((c) => ({
    url: `${baseUrl}/comparativa/${c.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const verticalPages: MetadataRoute.Sitemap = verticals.map((v) => ({
    url: `${baseUrl}/punto-de-venta/${v.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const blogPages: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${baseUrl}/blog/${p.slug}`,
    lastModified: new Date(p.datePublished),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  return [
    ...staticPages,
    ...featurePages,
    ...comparisonPages,
    ...verticalPages,
    ...modaVerticalPages,
    ...modaComparisonPages,
    ...modaGuidePages,
    ...blogPages,
  ]
}
