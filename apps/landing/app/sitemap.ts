import type { MetadataRoute } from 'next'
import { features } from './_data/features'
import { comparisons } from './_data/comparisons'

const baseUrl = 'https://mrtpvrest.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/funciones`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
  ]

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

  return [...staticPages, ...featurePages, ...comparisonPages]
}
